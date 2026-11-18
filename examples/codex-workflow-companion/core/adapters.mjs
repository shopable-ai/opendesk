import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const attemptPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const nativeActive = new Set();
const digest = text => createHash('sha256').update(text).digest('hex');

function nativeDirectory(runtimeDir) {
  const st = fs.lstatSync(runtimeDir);
  if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o077)) throw Error('NATIVE_DIR_UNSAFE');
  return fs.realpathSync(runtimeDir);
}

function privateRead(file, maxBytes) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o077) || st.nlink !== 1 || st.size > maxBytes) throw Error('NATIVE_FILE_UNSAFE');
    const buffer = Buffer.alloc(maxBytes + 1);
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (size > maxBytes) throw Error('NATIVE_FILE_TOO_LARGE');
    return buffer.subarray(0, size).toString('utf8');
  } finally { fs.closeSync(fd); }
}

// Complete private inode, then exclusive atomic publication; never replace a receipt.
function publishNativeExit(dir, attemptId, commandHash, spawnError) {
  const temp = path.join(dir, '.native-exit-' + randomUUID());
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ schemaVersion: 1, attemptId, commandHash, state: 'closed', spawnError }));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.linkSync(temp, path.join(dir, 'native-exit-' + attemptId + '.json'));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.unlinkSync(temp);
  }
}

/** Exit evidence only, never submission evidence. Missing/untrusted evidence fails closed. */
export function nativeExecutionStopped(runtimeDir, attemptId) {
  try {
    if (typeof attemptId !== 'string' || !attemptPattern.test(attemptId)) return false;
    const dir = nativeDirectory(runtimeDir);
    if (nativeActive.has(path.join(dir, attemptId))) return false;
    const receipt = JSON.parse(privateRead(path.join(dir, 'native-exit-' + attemptId + '.json'), 512));
    if (!receipt || Object.keys(receipt).sort().join(',') !== 'attemptId,commandHash,schemaVersion,spawnError,state' ||
        receipt.schemaVersion !== 1 || receipt.attemptId !== attemptId || receipt.state !== 'closed' ||
        typeof receipt.spawnError !== 'boolean' || !/^[a-f0-9]{64}$/.test(receipt.commandHash)) return false;
    const command = privateRead(path.join(dir, 'native-command-' + attemptId + '.json'), 1_048_576);
    return JSON.parse(command)?.attemptId === attemptId && digest(command) === receipt.commandHash;
  } catch { return false; }
}

export function validateDeepLink(url) {
  const u = new URL(url);
  if (u.protocol !== 'codex:' || u.hostname !== 'threads' || u.pathname !== '/new' ||
      [...u.searchParams.keys()].some(k => k !== 'prompt') || !u.searchParams.get('prompt')) throw Error('INVALID_CODEX_LINK');
  return url;
}

/** App Server owns an independent Codex execution. It does NOT synchronize to the desktop UI. */
export async function appServerTurn(prompt, { codex = 'codex', spawnFn = spawn, timeoutMs = 12000, onTurnCompleted = () => {} } = {}) {
  const p = spawnFn(codex, ['app-server'], { stdio: ['pipe','pipe','pipe'], env: process.env });
  const pending = new Map(); let sequence = 0; let buffer = ''; let ready = false; let finished = false; let acceptedTurnId = null; const earlyCompletions = new Map();
  const rejectAll = error => { for (const { reject } of pending.values()) reject(error); pending.clear(); };
  const onData = chunk => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 1_048_576) { rejectAll(Error('APP_SERVER_LINE_TOO_LONG')); p.kill(); return; }
    let pos;
    while ((pos = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const item = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) item.reject(Error('APP_SERVER_RPC_ERROR'));
        else item.resolve(msg.result);
      }
      if (msg.method === 'turn/completed') {
        const id = msg.params?.turn?.id, status = msg.params?.turn?.status || 'unknown';
        if (id === acceptedTurnId) onTurnCompleted(status);
        else if (typeof id === 'string' && earlyCompletions.size < 8) earlyCompletions.set(id, status);
      }
    }
  };
  p.stdout.on('data', onData);
  p.stderr.resume(); // Do not deadlock a verbose App Server child.
  p.stdin.on('error', rejectAll);
  p.on('error', rejectAll);
  p.on('exit', () => { finished = true; rejectAll(Error('APP_SERVER_EXITED')); });
  function rpc(method, params) {
    if (finished) return Promise.reject(Error('APP_SERVER_EXITED'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error('APP_SERVER_TIMEOUT')); }, timeoutMs);
      pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: err => { clearTimeout(timer); reject(err); } });
      p.stdin.write(JSON.stringify({ method, id, params }) + '\n');
    });
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'opendesk_cwf', title: 'OpenDesk Workflow Companion', version: '0.1.0' } });
    p.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    ready = true;
    const thread = await rpc('thread/start', {});
    const threadId = thread?.thread?.id;
    if (typeof threadId !== 'string' || !threadId) throw Error('APP_SERVER_THREAD_UNCONFIRMED');
    const turn = await rpc('turn/start', { threadId, input: [{ type:'text', text:prompt }] });
    if (typeof turn?.turn?.id !== 'string' || !turn.turn.id) throw Error('APP_SERVER_TURN_UNCONFIRMED');
    acceptedTurnId = turn.turn.id;
    if (earlyCompletions.has(acceptedTurnId)) onTurnCompleted(earlyCompletions.get(acceptedTurnId));
    earlyCompletions.clear();
    return { threadId, turnId: acceptedTurnId, process: p };
  } catch (error) {
    p.kill();
    // Once initialize/thread/start succeeded, a timeout might conceal a successful submission.
    error.dispatchPossiblySent = ready;
    throw error;
  }
}

export async function dispatch(pending, mode, options = {}) {
  if (mode === 'simulate') return { status: 'prepared' };
  if (mode === 'deeplink') { validateDeepLink(pending.deepLink); return { status: 'draft' }; }
  if (mode === 'app-server') {
    const res = await appServerTurn(pending.prompt, options.appServer || {});
    return { status: 'hosted', threadId: res.threadId };
  }
  if (mode === 'native') {
    const profileFile = options.profileFile;
    if (!profileFile || !fs.existsSync(profileFile)) return { status: 'blocked' };
    const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
    if (profile.confirmed !== true || profile.app?.bundleId !== 'com.openai.codex' ||
        !['composer','submit','newThreadIndicator'].every(k => profile[k] &&
          !JSON.stringify(profile[k]).includes('REPLACE_'))) return { status: 'blocked' };
    if ((options.platform || process.platform) !== 'darwin') return { status: 'blocked' };
    // This is a single-shot native side-effect. Reserve before spawn. Never replay on timeout.
    if (typeof pending.attemptId !== 'string' || !attemptPattern.test(pending.attemptId)) throw Error('NATIVE_ATTEMPT_INVALID');
    const attemptId = pending.attemptId;
    const dir = nativeDirectory(options.runtimeDir);
    const commandPath = path.join(dir, 'native-command-' + attemptId + '.json');
    const command = JSON.stringify({ ...pending, profileFile: path.resolve(profileFile) });
    if (Buffer.byteLength(command) > 1_048_576) throw Error('NATIVE_COMMAND_TOO_LARGE');
    fs.writeFileSync(commandPath, command, { mode: 0o600, flag: 'wx' });
    const key = path.join(dir, attemptId);
    nativeActive.add(key);
    // A thrown spawn leaves no receipt: uncertainty must never authorize retry.
    let child;
    try {
      child = (options.spawnFn || spawn)(options.openDeskBinary || './dist/opendesk', ['-script', 'examples/codex-workflow-companion/desktop/dispatch.js', '-console-mode', 'script'], {
        stdio:'ignore', detached:false,
        env: { ...process.env, OD_CWF_STATE_DIR: dir, OD_CWF_NATIVE_ATTEMPT_ID: attemptId },
      });
    } catch (error) {
      // The command is already published. Keep the owner's reconciliation on
      // the unknown path, which requires stopped evidence before a new attempt.
      error.dispatchPossiblySent = true;
      throw error;
    }
    let spawnError = false;
    child.on('error', () => { spawnError = true; });
    child.once('close', () => {
      try { publishNativeExit(dir, attemptId, digest(command), spawnError); }
      catch { /* No trustworthy receipt means reconciliation remains blocked. */ }
      finally { nativeActive.delete(key); }
    });
    return { status: 'unknown' }; // hook receipt + operator reconciliation required
  }
  throw Error('UNSUPPORTED_DISPATCH_MODE');
}
