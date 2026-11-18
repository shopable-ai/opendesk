import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { dispatch, nativeExecutionStopped } from '../../examples/codex-workflow-companion/core/adapters.mjs';

const source = fs.readFileSync(new URL('../../examples/codex-workflow-companion/desktop/dispatch.js', import.meta.url), 'utf8');
const root = new URL('../../.runtime/tests/codex-workflow-companion/native-dispatch/', import.meta.url);

function setup(t) {
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root.pathname, 'fixture-'));
  fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profileFile = path.join(dir, 'profile.json');
  fs.writeFileSync(profileFile, JSON.stringify({ confirmed: true, app: { bundleId: 'com.openai.codex' },
    composer: { role: 'textField', identifier: 'composer' }, submit: { role: 'button', identifier: 'submit' },
    newThreadIndicator: { role: 'heading', identifier: 'new-thread' } }));
  const children = [];
  const options = { runtimeDir: dir, profileFile, platform: 'darwin', spawnFn: (binary, args, opts) => {
    const child = new EventEmitter();
    children.push({ child, binary, args, opts });
    return child;
  } };
  const pending = () => ({ attemptId: randomUUID(), prompt: 'OD-CWF/v1 run=synthetic\nno desktop input' });
  return { dir, options, children, pending };
}

// Execute only the dispatch boundary in a VM. App.isRunning stops before any UI;
// no OpenDesk child, window, keyboard or UI implementation is provided.
async function readAsChild(env, observe = () => {}) {
  return vm.runInNewContext('(async () => {\n' + source + '\n})()', {
    System: { getEnv: name => env[name] },
    File: {
      readJSON: async file => { observe(file); return JSON.parse(fs.readFileSync(file, 'utf8')); },
      writeNew: (file, text) => fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }),
    },
    App: { isRunning: () => { throw Error('FAKE_STOP_BEFORE_UI'); } },
  });
}

test('delayed old child reads its immutable attempt, with explicit environment and selected profile', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending(), b = pending();
  assert.deepEqual(await dispatch(a, 'native', options), { status: 'unknown' });
  const commandFile = path.join(dir, 'native-command-' + a.attemptId + '.json');
  const original = fs.readFileSync(commandFile, 'utf8');
  await dispatch(b, 'native', options);
  await assert.rejects(dispatch({ ...a, prompt: 'replacement' }, 'native', options), { code: 'EEXIST' });
  assert.equal(children.length, 2);
  assert.equal(fs.readFileSync(commandFile, 'utf8'), original);
  assert.equal(fs.statSync(commandFile).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(dir, 'native-command.json')), false);
  const env = children[0].opts.env;
  assert.equal(env.OD_CWF_STATE_DIR, fs.realpathSync(dir));
  assert.equal(env.OD_CWF_NATIVE_ATTEMPT_ID, a.attemptId);
  const reads = [];
  await assert.rejects(readAsChild(env, file => reads.push(file)), /FAKE_STOP_BEFORE_UI/);
  assert.equal(reads[0], commandFile);
  assert.equal(reads[1], options.profileFile);
  assert.equal(fs.existsSync(path.join(dir, 'native-' + b.attemptId + '.json')), false);
  await assert.rejects(readAsChild(env), { code: 'EEXIST' });
  children.forEach(({ child }) => child.emit('close', 0, null));
});

test('only close permits stopped evidence; error or exit alone cannot release a live attempt', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending();
  await dispatch(a, 'native', options);
  const child = children[0].child;
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  child.emit('error', Error('synthetic kill/launch failure'));
  child.emit('exit', 1, null);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  child.emit('close', 1, null);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), true);
  assert.equal(nativeExecutionStopped(dir, randomUUID()), false);
  const file = path.join(dir, 'native-exit-' + a.attemptId + '.json');
  const saved = fs.readFileSync(file, 'utf8');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(Buffer.byteLength(saved) <= 512);
  assert.equal(JSON.parse(saved).spawnError, true);
  child.emit('close', 0, null);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  // Receipt is persisted evidence, independent of a module's in-memory child map.
  const fresh = await import('../../examples/codex-workflow-companion/core/adapters.mjs?receipt-reader');
  assert.equal(fresh.nativeExecutionStopped(dir, a.attemptId), true);
});

test('wrong or missing expected attempt stops before reservation or desktop access', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending(), b = pending();
  await dispatch(a, 'native', options);
  fs.writeFileSync(path.join(dir, 'native-command-' + b.attemptId + '.json'), JSON.stringify(a));
  const env = { ...children[0].opts.env, OD_CWF_NATIVE_ATTEMPT_ID: b.attemptId };
  await assert.rejects(readAsChild(env), /COMMAND_INVALID/);
  assert.equal(fs.existsSync(path.join(dir, 'native-' + a.attemptId + '.json')), false);
  for (const id of ['', '../escape', 'a'.repeat(36)]) {
    let reads = 0;
    await assert.rejects(readAsChild({ ...env, OD_CWF_NATIVE_ATTEMPT_ID: id }, () => reads++), /COMMAND_INVALID/);
    assert.equal(reads, 0);
    assert.equal(nativeExecutionStopped(dir, id), false);
  }
  children[0].child.emit('close', 0, null);
});

test('untrusted, mismatched, oversized or modified receipt/command fails closed', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending(), b = pending();
  await dispatch(a, 'native', options);
  await dispatch(b, 'native', options);
  children[0].child.emit('close', 0, null);
  const file = path.join(dir, 'native-exit-' + a.attemptId + '.json');
  const original = fs.readFileSync(file, 'utf8');
  const bFile = path.join(dir, 'native-exit-' + b.attemptId + '.json');
  fs.writeFileSync(bFile, original, { mode: 0o600 });
  assert.equal(nativeExecutionStopped(dir, b.attemptId), false, 'active attempt never bypassed');
  children[1].child.emit('close', 0, null);
  assert.equal(fs.readFileSync(bFile, 'utf8'), original, 'close cannot overwrite an existing receipt');
  assert.equal(nativeExecutionStopped(dir, b.attemptId), false, 'other attempt receipt rejected');
  for (const text of ['{', ' '.repeat(513), JSON.stringify({ ...JSON.parse(original), extra: true }),
    JSON.stringify({ ...JSON.parse(original), state: 'exit' }),
    JSON.stringify({ ...JSON.parse(original), commandHash: '0'.repeat(64) })]) {
    fs.writeFileSync(file, text);
    assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  }
  fs.writeFileSync(file, original);
  fs.chmodSync(file, 0o644);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  fs.chmodSync(file, 0o600);
  fs.renameSync(file, file + '.saved');
  fs.symlinkSync(file + '.saved', file);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  fs.unlinkSync(file);
  fs.linkSync(file + '.saved', file);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  fs.unlinkSync(file + '.saved');
  assert.equal(nativeExecutionStopped(dir, a.attemptId), true);
  fs.appendFileSync(path.join(dir, 'native-command-' + a.attemptId + '.json'), ' ');
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
});

test('receipt publication failure and synchronous spawn failure remain unknown without retry', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending();
  await dispatch(a, 'native', options);
  fs.mkdirSync(path.join(dir, 'native-exit-' + a.attemptId + '.json'));
  children[0].child.emit('close', 0, null);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  const b = pending();
  await assert.rejects(dispatch(b, 'native', { ...options, spawnFn: () => { throw Error('SPAWN_FAILED'); } }),
    error => error.message === 'SPAWN_FAILED' && error.dispatchPossiblySent === true,
    'the owner must keep a published command uncertain rather than allowing blocked/not_sent retry');
  assert.equal(nativeExecutionStopped(dir, b.attemptId), false);
  await assert.rejects(dispatch(b, 'native', options), { code: 'EEXIST' });
  assert.equal(children.length, 1);
  assert.equal(fs.readdirSync(dir).some(name => name.startsWith('.native-exit-')), false);
});

test('matching on-disk receipt cannot bypass an active child; close uses captured attempt identity', async t => {
  const { dir, options, children, pending } = setup(t);
  const a = pending();
  const attemptId = a.attemptId;
  await dispatch(a, 'native', options);
  const command = fs.readFileSync(path.join(dir, 'native-command-' + attemptId + '.json'));
  const file = path.join(dir, 'native-exit-' + attemptId + '.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, attemptId,
    commandHash: createHash('sha256').update(command).digest('hex'), state: 'closed', spawnError: false }), { mode: 0o600 });
  assert.equal(nativeExecutionStopped(dir, attemptId), false);
  fs.unlinkSync(file);
  a.attemptId = randomUUID();
  children[0].child.emit('close', 0, null);
  assert.equal(nativeExecutionStopped(dir, attemptId), true);
  assert.equal(nativeExecutionStopped(dir, a.attemptId), false);
  fs.chmodSync(dir, 0o755);
  assert.equal(nativeExecutionStopped(dir, attemptId), false);
  fs.chmodSync(dir, 0o700);
  const alias = path.join(dir, 'alias');
  fs.symlinkSync(dir, alias);
  assert.equal(nativeExecutionStopped(alias, attemptId), false);
  const commandFile = path.join(dir, 'native-command-' + attemptId + '.json');
  fs.chmodSync(commandFile, 0o644);
  assert.equal(nativeExecutionStopped(dir, attemptId), false);
});
