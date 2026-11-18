import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(root, '.runtime/tests/codex-workflow-companion/mac-acceptance');
const bearerA = `Bearer ${'a'.repeat(64)}`;
const bearerB = `Bearer ${'b'.repeat(64)}`;

async function setup(t) {
  fs.mkdirSync(evidence, { recursive: true });
  const dir = fs.mkdtempSync(path.join(evidence, 'mcp-reconnect-'));
  fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const endpointPath = path.join(dir, 'endpoint.json');
  const publish = (url, authorization = bearerA) => {
    const endpoint = { protocol: 'od.codex-workflow.v1', url, headers: { Authorization: authorization } };
    const next = path.join(dir, 'endpoint.next');
    fs.writeFileSync(next, JSON.stringify(endpoint), { mode: 0o600 });
    fs.renameSync(next, endpointPath);
    return endpoint;
  };
  const owner = async (label, authorization, handle) => {
    const requests = [];
    const server = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      requests.push({ name: body.name, arguments: body.arguments, authenticated: req.headers.authorization === authorization });
      if (req.url !== '/api/mcp' || req.method !== 'POST' || req.headers.authorization !== authorization) {
        res.writeHead(403).end('{}');
        return;
      }
      if (handle && await handle(body, req, res)) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { owner: label, state: 'available' } }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const stop = async () => {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    };
    t.after(stop);
    return { url: `http://127.0.0.1:${server.address().port}`, requests, stop };
  };
  const connect = async () => {
    const child = spawn(process.execPath, ['examples/codex-workflow-companion/mcp/server.mjs'], {
      cwd: root, env: { ...process.env, OD_CWF_STATE_DIR: dir }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const pending = new Map();
    let id = 0, stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      const reply = JSON.parse(line);
      pending.get(reply.id)?.resolve(reply);
    });
    child.on('exit', () => {
      for (const item of pending.values()) item.reject(Error('MCP_EXIT'));
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
      lines.close();
      assert.equal(stderr, '', 'bridge diagnostics must not expose endpoint secrets');
      for (const secret of [bearerA, bearerB, bearerA.slice(7), bearerB.slice(7)]) {
        assert.equal((stdout + stderr).includes(secret), false, 'bearer must stay out of stdio');
      }
    });
    const rpc = async (method, params = {}) => {
      const requestId = ++id;
      let timer;
      try {
        const reply = new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject });
          timer = setTimeout(() => reject(Error('MCP_TIMEOUT')), 5000);
        });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
        return await reply;
      } finally { clearTimeout(timer); pending.delete(requestId); }
    };
    await rpc('initialize');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return { child, rpc, call: (name = 'workflow_status', args = {}) => rpc('tools/call', { name, arguments: args }) };
  };
  return { dir, endpointPath, publish, owner, connect };
}

function success(reply, owner) {
  assert.equal(reply.result.isError, false);
  assert.deepEqual(JSON.parse(reply.result.content[0].text), { owner, state: 'available' });
}

function unavailable(reply) {
  assert.deepEqual(reply.result, { isError: true, content: [{ type: 'text', text: 'WORKFLOW_BRIDGE_UNAVAILABLE' }] });
}

test('same stdio MCP child follows owner port and bearer rotation without replaying a lost mutator', { timeout: 15000 }, async t => {
  const s = await setup(t);
  const b = await s.owner('B', bearerB);
  const a = await s.owner('A', bearerA, async (body, req, res) => {
    if (body.name === 'workflow_status') return false;
    // The mutation was applied, but the response and old owner are lost.
    s.publish(b.url, bearerB);
    res.destroy();
    return true;
  });
  s.publish(a.url);
  const m = await s.connect(), pid = m.child.pid;
  success(await m.call(), 'A');
  const args = { eventId: 'applied-on-A-response-lost' };
  unavailable(await m.call('task_submit', args));
  await a.stop();
  success(await m.call(), 'B');
  success(await m.call('task_progress', { eventId: 'explicit-new-call' }), 'B');
  assert.deepEqual(a.requests.map(r => r.name), ['workflow_status', 'task_submit']);
  assert.deepEqual(b.requests.map(r => r.name), ['workflow_status', 'task_progress']);
  assert.deepEqual(a.requests[1].arguments, args);
  assert.ok([...a.requests, ...b.requests].every(r => r.authenticated));
  assert.equal(m.child.pid, pid);
  assert.equal(m.child.exitCode, null);
});

test('each call rejects unsafe endpoint files and invalid URLs without sending or leaking bearer', { timeout: 20000 }, async t => {
  const s = await setup(t);
  const a = await s.owner('A', bearerA);
  const valid = s.publish(a.url);
  const m = await s.connect();
  success(await m.call(), 'A');
  const target = path.join(s.dir, 'private-target.json');
  fs.writeFileSync(target, JSON.stringify(valid), { mode: 0o600 });
  const cases = [
    ['public file', () => fs.chmodSync(s.endpointPath, 0o644)],
    ['public directory', () => fs.chmodSync(s.dir, 0o755)],
    ['symlink', () => { fs.unlinkSync(s.endpointPath); fs.symlinkSync(target, s.endpointPath); }],
    ['directory', () => { fs.unlinkSync(s.endpointPath); fs.mkdirSync(s.endpointPath); }],
    ['hard link', () => { fs.unlinkSync(s.endpointPath); fs.linkSync(target, s.endpointPath); }],
    ['missing', () => fs.unlinkSync(s.endpointPath)],
    ['invalid JSON', () => fs.writeFileSync(s.endpointPath, '{' + bearerA)],
    ...[
      null,
      { ...valid, protocol: 'other' },
      { ...valid, headers: { Authorization: 'Bearer invalid' } },
      { ...valid, url: 42 },
      { ...valid, headers: null },
      ...['https://127.0.0.1:1234', 'http://localhost:1234', 'http://127.0.0.1',
        'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.1:1234',
        `${a.url}/other`, `${a.url}/?query=1`, `${a.url}/#fragment`,
        `${a.url}/?`, `${a.url}/#`, a.url.replace('http://', `http://${bearerA.slice(7)}@`),
      ].map(url => ({ ...valid, url })),
    ].map((value, index) => [`invalid endpoint ${index}`, () => fs.writeFileSync(s.endpointPath, JSON.stringify(value))]),
  ];
  if (process.getuid?.() === 0) cases.push(['foreign owner', () => fs.chownSync(s.endpointPath, 65534, 65534)]);
  for (const [label, corrupt] of cases) {
    corrupt();
    const count = a.requests.length;
    unavailable(await m.call('task_claim', { eventId: label }));
    assert.equal(a.requests.length, count, label + ' must not contact owner');
    if (fs.existsSync(s.endpointPath) && fs.lstatSync(s.endpointPath).isDirectory()) fs.rmdirSync(s.endpointPath);
    fs.chmodSync(s.dir, 0o700);
    s.publish(a.url);
    success(await m.call(), 'A');
  }
  assert.ok(a.requests.every(r => r.name === 'workflow_status'));
});

test('stdio child started between owners survives a missing endpoint and recovers on publication', { timeout: 10000 }, async t => {
  const s = await setup(t);
  const m = await s.connect();
  unavailable(await m.call());
  const b = await s.owner('B', bearerB);
  s.publish(b.url + '/', bearerB);
  success(await m.call(), 'B');
  assert.equal(b.requests.length, 1);
  assert.equal(b.requests[0].authenticated, true);
});

test('redirecting owner cannot replay a mutator or forward credentials to another owner', { timeout: 10000 }, async t => {
  const s = await setup(t);
  const b = await s.owner('B', bearerA);
  const a = await s.owner('A', bearerA, async (body, req, res) => {
    res.writeHead(307, { Location: b.url + '/api/mcp' }).end();
    return true;
  });
  s.publish(a.url);
  const m = await s.connect();
  unavailable(await m.call('task_submit', { eventId: 'no-redirect' }));
  assert.equal(a.requests.length, 1);
  assert.equal(b.requests.length, 0);
  s.publish(b.url);
  success(await m.call(), 'B');
});
