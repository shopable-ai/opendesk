'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {EvidenceRecorder} = require('../mcp/tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const host = process.env.OPENDESK_AGENT_CWD_HOST_BINARY;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";

test('Agent checks the physical cwd for both adapters without a model provider', {
  skip: !host && 'set OPENDESK_AGENT_CWD_HOST_BINARY to the agent-cwd Runner test host', timeout: 45000,
}, async t => {
  const base = path.join(root, '.runtime/tests/mcp-depth/agent-cwd');
  fs.mkdirSync(base, {recursive: true});
  const directory = fs.mkdtempSync(path.join(base, 'run-'));
  t.diagnostic('evidence: ' + directory);
  const recorder = new EvidenceRecorder(directory, 'agent-cwd');
  const workdir = path.join(directory, 'workdir');
  const allowed = path.join(workdir, 'allowed');
  const inside = path.join(allowed, 'child');
  const outside = path.join(workdir, 'allowed-sibling');
  const artifacts = path.join(directory, 'artifacts');
  const fixtureBin = path.join(directory, 'fixtures');
  const home = path.join(directory, 'home');
  for (const target of [inside, outside, artifacts, fixtureBin, home]) fs.mkdirSync(target, {recursive: true});
  const aliases = {
    escape: path.join(allowed, 'escape'), inside: path.join(allowed, 'alias'),
    enter: path.join(workdir, 'enter'), root: path.join(workdir, 'root-alias'),
    dangling: path.join(allowed, 'dangling'), loop: path.join(allowed, 'loop'),
  };
  fs.symlinkSync(outside, aliases.escape);
  fs.symlinkSync(inside, aliases.inside);
  fs.symlinkSync(inside, aliases.enter);
  fs.symlinkSync(allowed, aliases.root);
  fs.symlinkSync(path.join(allowed, 'missing'), aliases.dangling);
  fs.symlinkSync(aliases.loop, aliases.loop);
  const regularFile = path.join(allowed, 'file.txt');
  fs.writeFileSync(regularFile, 'not a directory');
  const real = target => fs.realpathSync(target);
  assert.equal(real(aliases.escape), real(outside));
  assert.equal(real(aliases.enter), real(inside));
  const profiles = {};
  const cases = [];
  const sources = {};
  for (const backend of ['codex', 'claude-code']) {
    const source = path.join(__dirname, 'fixture', backend === 'codex' ? 'agent-codex.sh' : 'agent-claude.sh');
    const copy = path.join(fixtureBin, backend + '.sh');
    const fixture = fs.readFileSync(source);
    fs.writeFileSync(copy, fixture, {mode: 0o700});
    sources[source] = hash(fixture);
    assert.equal(hash(fs.readFileSync(copy)), sources[source]);
    const add = (label, options = {}) => {
      const name = backend + '-' + label;
      const trace = path.join(fixtureBin, name + '.cwd');
      const executable = path.join(fixtureBin, name + '.sh');
      const wrapper = '#!/bin/sh\nset -eu\n/bin/pwd -P > ' + quote(trace)
        + '\nprintf \'%s\\n\' "$@" > ' + quote(trace + '.args') + '\nexec ' + quote(copy) + ' "$@"\n';
      fs.writeFileSync(executable, wrapper, {mode: 0o700});
      sources[executable] = hash(wrapper);
      profiles[name] = {backend, executable, auth: {mode: 'saved'}, policy: 'analysis',
        allowedCwd: options.allowedCwd || allowed, ...(options.profileCwd ? {cwd: options.profileCwd} : {})};
      const record = {name, backend, trace, ...options};
      if (!options.expectedCode && !options.defaultCwd) record.realCwd = real(options.cwd || options.profileCwd);
      cases.push(record);
    };
    const denied = {expectedCode: 'CWD_OUTSIDE_ALLOWED_SCOPE'};
    add('explicit-child', {cwd: inside});
    add('root-equality', {cwd: allowed});
    add('inside-alias', {cwd: aliases.inside});
    add('outside-alias-in', {cwd: aliases.enter});
    add('prefix-sibling', {cwd: outside, ...denied});
    add('symlink-escape', {cwd: aliases.escape, ...denied});
    add('profile-escape', {profileCwd: aliases.escape, ...denied});
    add('default-outside', denied);
    add('default-inside', {allowedCwd: directory, defaultCwd: true});
    add('profile-inside', {profileCwd: inside});
    add('allowed-root-alias', {allowedCwd: aliases.root, cwd: inside});
    add('missing-cwd', {cwd: path.join(allowed, 'missing'), ...denied});
    add('dangling-cwd', {cwd: aliases.dangling, ...denied});
    add('loop-cwd', {cwd: aliases.loop, ...denied});
    add('missing-root', {allowedCwd: path.join(allowed, 'missing'), ...denied});
    add('file-root', {allowedCwd: regularFile, ...denied});
    add('file-cwd', {cwd: regularFile, ...denied});
    add('pre-abort', {cwd: aliases.loop, preAbort: true, expectedCode: 'CANCELED'});
    add('recovery', {cwd: inside});
  }
  fs.writeFileSync(path.join(directory, 'profiles.json'), JSON.stringify({schemaVersion: 1, profiles}));
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify({cases}));
  const binary = fs.realpathSync(host);
  const script = path.join(__dirname, 'agent-cwd-runtime.js');
  for (const file of [script, __filename, path.join(__dirname, 'tools/agent-cwd/main.go'),
    path.join(root, 'polyfills/008-ai-runtime.js'), path.join(root, 'automation/file.go'), path.join(root, 'automation/command.go')]) {
    sources[file] = hash(fs.readFileSync(file));
  }
  recorder.writeJSON('provenance.json', {binary, binarySha256: hash(fs.readFileSync(binary)), sources,
    mechanism: 'execution.Runner synthetic host, no MCP environment extension',
    oracle: 'Node fs.realpathSync and fixture /bin/pwd -P',
    childEnvironment: 'Runner only receives OPENDESK_AGENT_CONFIG; no HOME, PATH, credentials or provider config forwarded'});
  const child = spawnSync(binary, [directory, script], {
    cwd: root, env: {HOME: home, TMPDIR: directory}, encoding: 'utf8', timeout: 35000, maxBuffer: 4 * 1024 * 1024,
  });
  recorder.writeJSON('host-process.json', {status: child.status, signal: child.signal, stdout: child.stdout,
    stderr: child.stderr, error: child.error && child.error.message});
  const rows = JSON.parse(fs.readFileSync(path.join(artifacts, 'agent-cwd-results.json')));
  assert.equal(rows.length, cases.length);
  const callIds = new Set();
  for (let i = 0; i < cases.length; i++) {
    const fixture = cases[i];
    const row = rows[i];
    await t.test(fixture.name, () => {
      assert.equal(row.name, fixture.name);
      assert.equal(row.passed, true, JSON.stringify(row));
      assert.equal(row.code, fixture.expectedCode || null);
      assert.deepEqual(row.invocationChildren, []);
      if (fixture.expectedCode) {
        assert.equal(fs.existsSync(fixture.trace), false, 'denied request launched CLI');
      } else {
        assert.equal(fs.readFileSync(fixture.trace, 'utf8').trim(), row.actualCwd);
        assert.equal(callIds.has(row.callId), false, 'invocation callId reused');
        callIds.add(row.callId);
        assert.equal(fs.existsSync(row.invocation), false);
        if (fixture.defaultCwd) {
          assert.equal(row.actualCwd, path.join(real(artifacts), 'agent', row.callId));
        } else {
          assert.equal(row.actualCwd, real(fixture.cwd || fixture.profileCwd));
          if (fixture.backend === 'codex') {
            const args = fs.readFileSync(fixture.trace + '.args', 'utf8').trim().split('\n');
            const finalFile = args[args.indexOf('--output-last-message') + 1];
            assert.equal(path.dirname(finalFile), row.invocation, 'final message lost invocation isolation');
          }
        }
      }
    });
  }
  recorder.writeJSON('summary.json', {status: rows.every(row => row.passed) && child.status === 0 ? 'passed' : 'failed',
    cases: rows.length, passed: rows.filter(row => row.passed).length, fixtureOnly: true, liveBackend: false});
  assert.equal(child.status, 0, child.stderr);
});
