import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { Client } from './client.mjs';
import { ROOT, SOURCE, STATE, SOCKET, EVIDENCE } from './config.mjs';
import { CoreError } from './protocol.mjs';

function absentPid(pid) {
  if (!Number.isInteger(pid) || pid < 1) throw new CoreError('BROKER_OWNER_INVALID');
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw new CoreError('BROKER_OWNER_UNVERIFIED'); }
}
async function probeSocket(socketPath) {
  const socket = net.createConnection(socketPath);
  try {
    return await new Promise(resolve => {
      const deadline = setTimeout(() => resolve('UNKNOWN'), 1000);
      socket.once('connect', () => { clearTimeout(deadline); resolve('LISTENING'); });
      socket.once('error', error => { clearTimeout(deadline); resolve(error.code); });
    });
  } finally { socket.destroy(); }
}
export async function recoverStaleBroker({stateDirectory = STATE, socketPath = SOCKET} = {}) {
  if (!fs.existsSync(socketPath)) return {recovered: false, reason: 'NO_SOCKET'};
  const stat = fs.lstatSync(socketPath);
  if (!stat.isSocket() || stat.uid !== process.getuid()) throw new CoreError('SOCKET_OWNER_UNVERIFIED');
  const metadataPath = path.join(stateDirectory, 'broker.json');
  let bytes, metadata;
  try { bytes = fs.readFileSync(metadataPath); metadata = JSON.parse(bytes); }
  catch { throw new CoreError('BROKER_OWNER_METADATA_MISSING'); }
  if (fs.lstatSync(metadataPath).isSymbolicLink() || fs.statSync(metadataPath).uid !== process.getuid()) {
    throw new CoreError('BROKER_OWNER_UNVERIFIED');
  }
  if (!/^[0-9a-f-]{36}$/.test(metadata.session ?? '') ||
      !metadata.evidenceDirectory?.startsWith(path.join(EVIDENCE, 'broker-')) ||
      !metadata.evidenceDirectory.endsWith(metadata.session.slice(0, 8))) throw new CoreError('BROKER_OWNER_INVALID');
  let legacyMatch = false;
  if (metadata.source !== SOURCE) {
    try {
      const known = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'current-state.json'))).brokerPrepared;
      legacyMatch = known?.pid === metadata.pid && known?.session === metadata.session &&
        known?.evidenceDirectory === metadata.evidenceDirectory && stateDirectory === STATE && socketPath === SOCKET;
    } catch {}
    if (!legacyMatch) throw new CoreError('BROKER_SOURCE_UNVERIFIED');
  }
  if (!absentPid(metadata.pid)) throw new CoreError('BROKER_PROCESS_EXISTS');
  const socketProbe = await probeSocket(socketPath);
  if (!['ECONNREFUSED', 'ENOENT'].includes(socketProbe)) throw new CoreError('SOCKET_STILL_ACTIVE_OR_UNKNOWN');
  const currentStat = fs.lstatSync(socketPath);
  if (!absentPid(metadata.pid) || currentStat.ino !== stat.ino || currentStat.dev !== stat.dev ||
      !fs.readFileSync(metadataPath).equals(bytes)) throw new CoreError('BROKER_OWNER_CHANGED');
  const directory = path.join(EVIDENCE, `recovery-${Date.now()}`);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const proof = {pid: metadata.pid, session: metadata.session, pidState: 'ABSENT', socketProbe,
    socketPath, socketOwnerUid: stat.uid, source: metadata.source ?? null, legacyMatch,
    evidenceDirectory: metadata.evidenceDirectory, removedFiles: [socketPath, metadataPath]};
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(proof, null, 2), {mode: 0o600});
  fs.writeFileSync(path.join(directory, 'broker.json'), bytes, {mode: 0o600});
  fs.unlinkSync(socketPath); fs.unlinkSync(metadataPath);
  return {recovered: true, proof: path.join(directory, 'proof.json'), ...proof};
}
export async function startBackgroundBroker() {
  if (fs.existsSync(SOCKET)) throw new CoreError('STOP_OR_RECOVER_BROKER_FIRST');
  const directory = path.join(EVIDENCE, `background-${Date.now()}`);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const logPath = path.join(directory, 'broker.log'), log = fs.openSync(logPath, 'ax', 0o600);
  const child = spawn(process.execPath, [path.join(SOURCE, 'cli.mjs'), 'start'], {
    cwd: ROOT, detached: true, stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  let spawnError;
  child.on('error', error => { spawnError = error.code; }); child.unref();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null) throw new CoreError('BROKER_BACKGROUND_START_FAILED');
    const client = new Client();
    try {
      await client.connect(); const response = await client.request('status');
      if (response.result?.brokerPid !== child.pid) throw new CoreError('BROKER_OWNERSHIP_MISMATCH');
      return {broker: 'background-started', logPath, ...response.result,
        scope: 'Broker startup only; connected=false is not a Live Browser PASS'};
    } catch (error) {
      if (error.code === 'BROKER_OWNERSHIP_MISMATCH') throw error;
    } finally { client.close(); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // The only process signalled here is the child spawned by this invocation.
  child.kill('SIGTERM');
  throw new CoreError('BROKER_BACKGROUND_START_TIMEOUT');
}
export async function stopOwnedBroker() {
  const metadata = JSON.parse(fs.readFileSync(path.join(STATE, 'broker.json')));
  if (metadata.source !== SOURCE) throw new CoreError('BROKER_SOURCE_UNVERIFIED');
  const client = await new Client().connect();
  try {
    const response = await client.request('status');
    if (response.result?.brokerPid !== metadata.pid || response.result.brokerSession !== metadata.session ||
        response.result.evidenceDirectory !== metadata.evidenceDirectory) throw new CoreError('BROKER_OWNERSHIP_MISMATCH');
    const command = execFileSync('/bin/ps', ['-p', String(metadata.pid), '-o', 'command='], {encoding: 'utf8'}).trim();
    const accepted = [`${process.execPath} ${path.join(SOURCE, 'cli.mjs')} start`, 'node lab/browser-automation-core/cli.mjs start'];
    if (!accepted.includes(command)) throw new CoreError('BROKER_COMMAND_UNVERIFIED');
    process.kill(metadata.pid, 'SIGTERM');
  } finally { client.close(); }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (absentPid(metadata.pid) && !fs.existsSync(SOCKET)) return {stoppedPid: metadata.pid, brokerSession: metadata.session};
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new CoreError('BROKER_STOP_TIMEOUT');
}

export async function stopOwnedFixture() {
  const file = path.join(STATE, 'fixture-public.json');
  if (!fs.existsSync(file)) return {fixture: 'absent'};
  const bytes = fs.readFileSync(file), fixture = JSON.parse(bytes);
  if (fixture.sourceDirectory !== SOURCE || !Number.isInteger(fixture.pid)) throw new CoreError('FIXTURE_OWNER_UNVERIFIED');
  if (!absentPid(fixture.pid)) {
    const command = execFileSync('/bin/ps', ['-p', String(fixture.pid), '-o', 'command='], {encoding: 'utf8'}).trim();
    const accepted = [`${process.execPath} ${path.join(SOURCE, 'cli.mjs')} fixture`, 'node lab/browser-automation-core/cli.mjs fixture'];
    if (!accepted.includes(command)) throw new CoreError('FIXTURE_COMMAND_UNVERIFIED');
    const cwd = execFileSync('/usr/sbin/lsof', ['-a', '-p', String(fixture.pid), '-d', 'cwd', '-Fn'], {encoding: 'utf8'}).trim().split('\n');
    if (!cwd.includes(`n${ROOT}`)) throw new CoreError('FIXTURE_CWD_UNVERIFIED');
    const url = new URL(fixture.origin);
    if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new CoreError('FIXTURE_ORIGIN_UNVERIFIED');
    const listener = execFileSync('/usr/sbin/lsof', ['-n', '-P', '-a', '-p', String(fixture.pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], {encoding: 'utf8'});
    if (!listener.split('\n').includes(`n127.0.0.1:${url.port}`)) throw new CoreError('FIXTURE_LISTENER_UNVERIFIED');
    if (!fs.readFileSync(file).equals(bytes)) throw new CoreError('FIXTURE_OWNER_CHANGED');
    process.kill(fixture.pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (!absentPid(fixture.pid) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    if (!absentPid(fixture.pid)) throw new CoreError('FIXTURE_STOP_TIMEOUT');
  }
  for (const name of ['fixture-public.json', 'fixture-verifier.json', 'golden-latest.json']) {
    const pointer = path.join(STATE, name); if (fs.existsSync(pointer)) fs.unlinkSync(pointer);
  }
  return {stoppedPid: fixture.pid, fixtureInstance: fixture.instance, sourceDirectory: SOURCE, preservedEvidence: true};
}
