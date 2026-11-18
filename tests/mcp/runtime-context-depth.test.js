'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const input = process.env.OPENDESK_CONTEXT_HOST_BINARY;
test('host-bound Runtime contexts obey cwd and environment contracts', {
  skip: !input && 'set OPENDESK_CONTEXT_HOST_BINARY to the runtime-context test host', timeout: 30000,
}, async t => {
  const binary = fs.realpathSync(input);
  const base = path.join(root, '.runtime/tests/mcp-depth/context'); fs.mkdirSync(base, {recursive:true});
  const evidence = fs.mkdtempSync(path.join(base, 'run-'));
  t.diagnostic(`evidence: ${evidence}`);
  const recorder = new EvidenceRecorder(evidence, 'context');
  const hostCwd = path.join(evidence, 'host');
  const workdir = path.join(evidence, 'execution');
  const explicitDirectory = path.join(evidence, 'explicit');
  for (const dir of [hostCwd, workdir, explicitDirectory]) fs.mkdirSync(dir);
  const scriptPath = path.join(root, 'tests/runtime-api/mcp-context-depth.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  recorder.writeJSON('provenance.json', {binary, binarySha256: hash(fs.readFileSync(binary)), scriptSha256: hash(script), hostCwd, workdir});
  await t.test('real MCP command defaults to a different execution workdir', async () => {
    const client = new MCPStdioClient({binary, args: ['mcp', workdir], cwd: hostCwd, recorder,
      runName: 'context', stdoutPath:path.join(evidence,'stdout.ndjson'), stderrPath:path.join(evidence,'stderr.log'), timeoutMs:10000});
    try {
      await client.start();
      await client.request('initialize', {protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'context',version:'1'}});
      await client.notify('notifications/initialized');
      const call = async (name,args) => JSON.parse((await client.request('tools/call', {name,arguments:args})).content[0].text);
      const started = await call('tm_script_start', {script, input:{scenario:'command',explicitDirectory}, timeoutMs:5000});
      let status;
      for (let i=0;i<200;i++) {
        status = await call('tm_script_status',{executionId:started.executionId});
        if (['succeeded','failed','canceled','timed_out'].includes(status.status)) break;
        await delay(20);
      }
      recorder.writeJSON('command-status.json',status);
      const result = JSON.parse(fs.readFileSync(path.join(workdir,'context-result.json')));
      assert.deepEqual(result,{workdir,observed:workdir,explicit:explicitDirectory,hostDirectory:hostCwd});
      assert.equal(status.status,'succeeded',JSON.stringify(status));
    } finally {
      const exit = await client.close(); assert.equal(exit.code,0);
      assert.deepEqual(client.protocolViolations,[]);
    }
  });
  await t.test('formal Runtime JS rejects illegal fallback for present and absent keys', () => {
    const child = spawnSync(binary,['environment',workdir,scriptPath],{cwd:hostCwd,encoding:'utf8',timeout:10000});
    recorder.writeJSON('environment-process.json',{status:child.status,stdout:child.stdout,stderr:child.stderr,error:child.error?.message});
    const result = JSON.parse(fs.readFileSync(path.join(workdir,'environment-result.json')));
    assert.equal(result.length,3); assert(result.every(row=>row.rejected));
    assert.equal(child.status,0,child.stderr);
  });
});
