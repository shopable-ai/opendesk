'use strict';

// Host transport faults, not Runtime API tests. Only this test's trusted
// checkout adapter is changed; the real checkout is never fault-injected.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const harness = String.raw`
'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Every controlled process expires on its own even if a regression defeats
// host cleanup. Historical PIDs are observations, never kill authority.
setTimeout(() => process.exit(70), 20000).unref();
const storedMode = fs.readFileSync(path.join(__dirname, 'fault-mode'), 'utf8');
const isGit = path.basename(process.argv[1]) === 'git';
const mode = isGit ? storedMode.replace(/^provenance-/, '') : storedMode.startsWith('provenance-') ? 'normal' : storedMode;
fs.appendFileSync(path.join(__dirname, 'children.ndjson'), JSON.stringify({pid: process.pid, mode: storedMode}) + '\n');
if (mode.includes('inherited-')) {
  const stream = mode.endsWith('stdout') ? 1 : 2;
  const stdio = ['ignore', 'ignore', 'ignore'];
  stdio[stream] = 'inherit';
  const child = require('node:child_process').spawn(process.execPath,
    ['-e', 'setTimeout(() => {}, 15000)'], {stdio});
  fs.appendFileSync(path.join(__dirname, 'children.ndjson'), JSON.stringify({pid: child.pid, mode: storedMode, descendant: true}) + '\n');
  child.unref();
  if (mode.startsWith('timeout-')) setInterval(() => {}, 1000);
  else {
    if (mode.startsWith('stdout-limit-')) fs.writeSync(1, 'x'.repeat(768 * 1024 + 1));
    else if (mode.startsWith('stderr-limit-')) fs.writeSync(2, 'x'.repeat(16 * 1024 + 1));
    else fs.writeSync(1, isGit ? 'a'.repeat(40) : '{}');
    process.exit(0);
  }
} else
switch (mode) {
  case 'null': process.stdout.write('null'); break;
  case 'array': process.stdout.write('[]'); break;
  case 'string': process.stdout.write('"contract"'); break;
  case 'number': process.stdout.write('42'); break;
  case 'boolean': process.stdout.write('true'); break;
  case 'invalid-json': process.stdout.write('{"output":"INCOMPLETE_CONTRACT"'); break;
  case 'nonzero':
    process.stdout.write('{"output":"INCOMPLETE_CONTRACT"}');
    process.stderr.write('CONTROLLED_READER_FAILURE'); process.exitCode = 23; break;
  case 'timeout': setInterval(() => {}, 1000); break;
  case 'closed-output-timeout':
    fs.closeSync(1); fs.closeSync(2); setInterval(() => {}, 1000); break;
  case 'stdout-limit':
    fs.writeSync(1, JSON.stringify({output: 'INCOMPLETE_CONTRACT' + 'x'.repeat(768 * 1024)})); break;
  case 'stderr-limit':
    fs.writeSync(2, 'x'.repeat(16 * 1024 + 1));
    process.stdout.write('{"output":"INCOMPLETE_CONTRACT"}'); break;
  case 'output-limit': fs.writeSync(1, 'a'.repeat(257)); break;
  default:
    if (isGit) fs.writeSync(1, 'a'.repeat(40));
    else process.stdout.write(JSON.stringify(require('./canonical-adapter.js').query(JSON.parse(fs.readFileSync(0, 'utf8')))));
}
`;

async function reaped(pid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await delay(20);
  }
  assert.fail(`owned documentation child ${pid} was not reaped`);
}

for (const mode of ['null', 'array', 'string', 'number', 'boolean', 'invalid-json',
  'nonzero', 'timeout', 'stdout-limit', 'stderr-limit', 'inherited-stdout', 'inherited-stderr',
  'timeout-inherited-stderr', 'stdout-limit-inherited-stderr', 'stderr-limit-inherited-stdout',
  'provenance-inherited-stdout', 'provenance-timeout-inherited-stderr', 'provenance-output-limit',
  'node-start', 'closed-output-timeout']) {
  test(`documentation subprocess ${mode} rejects whole response and recovers over real stdio`, {
    skip: !binaryInput ? 'set OPENDESK_MCP_BINARY to a current MCP binary' :
      mode.startsWith('provenance-') || mode.includes('inherited-') || mode === 'node-start' ?
        !['darwin', 'linux'].includes(process.platform) && 'owned descendant cleanup needs a platform implementation; Unix fixture only' : false,
    timeout: 35_000,
  }, async t => {
    const base = path.join(root, '.runtime/tests/mcp-completeness/docs-faults');
    fs.mkdirSync(base, {recursive: true});
    const evidence = fs.mkdtempSync(path.join(base, `${mode}-`));
    t.diagnostic(`evidence: ${evidence}`);
    const checkout = path.join(evidence, 'checkout');
    fs.mkdirSync(path.join(checkout, 'scripts'), {recursive: true});
    for (const rel of ['docs/api', 'types']) fs.cpSync(path.join(root, rel), path.join(checkout, rel), {recursive: true});
    for (const name of ['api-docs.js', 'api-docs-map.js']) {
      fs.copyFileSync(path.join(root, 'scripts', name), path.join(checkout, 'scripts', name));
    }
    fs.copyFileSync(path.join(root, 'scripts/api-docs-mcp.js'), path.join(checkout, 'scripts/canonical-adapter.js'));
    fs.writeFileSync(path.join(checkout, 'scripts/api-docs-mcp.js'), harness);
    const {verifyPacket} = require(path.join(checkout, 'scripts/api-docs.js'));
    const modePath = path.join(checkout, 'scripts/fault-mode');
    const childrenPath = path.join(checkout, 'scripts/children.ndjson');
    fs.writeFileSync(modePath, mode);
    const provenance = mode.startsWith('provenance-');
    if (provenance) fs.writeFileSync(path.join(checkout, 'scripts/git'), `#!${process.execPath}\n${harness}`, {mode: 0o700});
    const nodeAlias = path.join(checkout, 'scripts/node');
    if (mode === 'node-start') fs.symlinkSync(process.execPath, nodeAlias);
    const binary = fs.realpathSync(binaryInput);
    const recorder = new EvidenceRecorder(evidence, 'api-docs-faults');
    recorder.writeJSON('inputs.json', {mode, binary, binarySha256: hash(fs.readFileSync(binary)),
      checkout, harnessSha256: hash(harness), startedAt: new Date().toISOString()});
    const client = new MCPStdioClient({binary, args: [`--api-docs-root=${checkout}`], cwd: evidence,
      recorder, runName: mode, timeoutMs: 20_000,
      stdoutPath: path.join(evidence, 'stdout.ndjson'), stderrPath: path.join(evidence, 'stderr.log')});
    try {
      // Scope the trusted Git shim to this newly spawned MCP process only.
      const originalPath = process.env.PATH;
      try {
        if (provenance || mode === 'node-start') process.env.PATH = `${path.join(checkout, 'scripts')}${path.delimiter}${originalPath || ''}`;
        await client.start();
      } finally {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
      }
      await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'docs-faults', version: '1'}});
      await client.notify('notifications/initialized');
      if (mode === 'node-start') fs.unlinkSync(nodeAlias);
      const started = Date.now();
      const response = client.request('tools/call', provenance ? {name: 'tm_runtime_capabilities', arguments: {}} :
        {name: 'tm_api_read', arguments: {doc: 'file', selector: 'File.readJSON'}});
      response.catch(() => {}); // A failed ownership observation still closes the client.
      const waitingForEOF = mode === 'inherited-stdout' || mode === 'inherited-stderr' || mode === 'provenance-inherited-stdout';
      let ownership;
      if (waitingForEOF) {
        for (let attempt = 0; attempt < 40; attempt++) {
          await delay(20);
          if (!fs.existsSync(childrenPath)) continue;
          const first = JSON.parse(fs.readFileSync(childrenPath, 'utf8').trim().split('\n')[0]);
          try {
            const observation = execFileSync('/bin/ps', ['-o', 'pid=,ppid=,pgid=,stat=', '-p', String(first.pid)], {encoding: 'utf8'}).trim();
            const [pid, ppid, pgid, state] = observation.split(/\s+/);
            ownership = {pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), state};
            if (state?.startsWith('Z')) break;
          } catch { break; }
        }
        recorder.writeJSON('ownership-before-timeout.json', ownership || null);
      }
      const failure = await response;
      const elapsedMs = Date.now() - started;
      recorder.writeJSON('failure.json', {failure, elapsedMs});
      assert.equal(failure.content.length, 1);
      if (provenance) {
        assert.notEqual(failure.isError, true);
        const value = JSON.parse(failure.content[0].text);
        assert.equal(value.documentation.provenance.checkoutRevision, '', 'failed Git must not publish a revision');
        assert.equal(value.documentation.provenance.runtimeMatchVerified, false);
      } else {
        assert.equal(failure.isError, true, `reader ${mode} must return a tool error; see failure.json`);
        assert.match(failure.content[0].text, /invalid API documentation response|API documentation unavailable/);
      }
      assert(!failure.content[0].text.includes('INCOMPLETE_CONTRACT'));
      if (mode === 'timeout' || mode === 'closed-output-timeout') assert(elapsedMs >= 9900 && elapsedMs < 15_000, `deadline: ${elapsedMs}`);
      if (mode.includes('inherited-')) {
        const timedOut = mode.includes('timeout-');
        const deadline = provenance ? 2000 : 10_000;
        assert(elapsedMs < (timedOut || waitingForEOF ? deadline + 2000 : 2000), `inherited pipe deadline: ${elapsedMs}`);
        if (timedOut) assert(elapsedMs >= deadline - 100, `reader ended before deadline: ${elapsedMs}`);
      }
      if (waitingForEOF) {
        assert(ownership?.state.startsWith('Z'), 'leader must remain unreaped while inherited pipe is held');
        assert.equal(ownership.ppid, client.child.pid);
        assert.equal(ownership.pgid, ownership.pid, 'only the new documentation process group is owned');
      }
      const children = fs.existsSync(childrenPath) ? fs.readFileSync(childrenPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
      assert.equal(children.length, mode === 'node-start' ? 0 : mode.includes('inherited-') ? 2 : 1);
      for (const child of children) {
        assert.equal(child.mode, mode);
        await reaped(child.pid);
      }
      assert.deepEqual(await client.request('ping'), {});
      if (mode === 'node-start') fs.symlinkSync(process.execPath, nodeAlias);
      fs.writeFileSync(modePath, 'normal');
      for (const [name, args] of [['tm_api_catalog', {}], ['tm_api_read', {doc: 'file', selector: 'File.readJSON', withTypes: true}]]) {
        const response = await client.request('tools/call', {name, arguments: args});
        assert.notEqual(response.isError, true, `${name} did not recover`);
        const value = JSON.parse(response.content[0].text);
        assert.equal(value.ok, true);
        if (provenance) assert.equal(value.provenance.checkoutRevision, 'a'.repeat(40), 'Git provenance did not recover');
        if (name === 'tm_api_read') {
          const originalPath = process.env.PATH;
          try {
            // Packet reconstruction must observe the same controlled Git
            // revision as the MCP reader, not the real checkout outside it.
            if (provenance) process.env.PATH = `${path.join(checkout, 'scripts')}${path.delimiter}${originalPath || ''}`;
            assert.equal(verifyPacket(checkout, value.output, value.report).ok, true);
          } finally {
            if (originalPath === undefined) delete process.env.PATH;
            else process.env.PATH = originalPath;
          }
        }
        recorder.writeJSON(`recovery-${name}.json`, value);
      }
    } finally {
      const exit = await client.close();
      const children = fs.existsSync(childrenPath) ? fs.readFileSync(childrenPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
      const cleanupErrors = [];
      for (const child of children) {
        try { await reaped(child.pid); }
        catch (error) {
          cleanupErrors.push(error.message);
        }
      }
      recorder.writeJSON('cleanup.json', {exit, children, cleanupErrors, protocolViolations: client.protocolViolations});
      assert.deepEqual(cleanupErrors, []);
      assert.deepEqual(client.protocolViolations, []);
      assert.deepEqual(exit, {code: 0, signal: null});
      const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').trim().split('\n').map(JSON.parse);
      assert(!events.some(row => ['shutdown_timeout', 'process_terminate'].includes(row.event)));
    }
  });
}
