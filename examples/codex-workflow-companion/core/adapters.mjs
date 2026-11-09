import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function validateDeepLink(url) {
  const u = new URL(url);
  if (u.protocol !== 'codex:' || u.hostname !== 'threads' || u.pathname !== '/new' ||
      [...u.searchParams.keys()].some(k => k !== 'prompt') || !u.searchParams.get('prompt')) throw Error('INVALID_CODEX_LINK');
  return url;
}

/** App Server owns an independent Codex execution. It does NOT synchronize to the desktop UI. */
export async function appServerTurn(prompt, { codex = 'codex', spawnFn = spawn, timeoutMs = 12000, onTurnCompleted = () => {} } = {}) {
  const p = spawnFn(codex, ['app-server'], { stdio: ['pipe','pipe','pipe'], env: process.env });
  const pending = new Map(); let sequence = 0; let buffer = ''; let ready = false; let finished = false;
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
      if (msg.method === 'turn/completed') onTurnCompleted(msg.params?.turn?.status || 'unknown');
    }
  };
  p.stdout.on('data', onData);
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
    if (!turn?.turn?.id) throw Error('APP_SERVER_TURN_UNCONFIRMED');
    return { threadId, turnId: turn.turn.id, process: p };
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
    if (process.platform !== 'darwin') return { status: 'blocked' };
    // This is a single-shot native side-effect. Reserve before spawn. Never replay on timeout.
    const commandPath = path.join(options.runtimeDir, 'native-command.json');
    fs.writeFileSync(commandPath, JSON.stringify({ ...pending, profileFile }), { mode: 0o600, flag: 'w' });
    const child = spawn(options.openDeskBinary || './dist/opendesk', ['-script', 'examples/codex-workflow-companion/desktop/dispatch.js', '-console-mode', 'script'], { stdio:'ignore', detached:false });
    child.on('error', () => {});
    return { status: 'unknown' }; // hook receipt + operator reconciliation required
  }
  throw Error('UNSUPPORTED_DISPATCH_MODE');
}
