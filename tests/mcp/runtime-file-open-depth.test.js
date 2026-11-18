'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {setTimeout:delay} = require('node:timers/promises');
const {MCPStdioClient,EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname,'../..');
test('real MCP rejects unconnected FIFO before blocking or truncating', {
  skip: !process.env.OPENDESK_MCP_BINARY || !['darwin','linux'].includes(process.platform), timeout:20000,
}, async t => {
  const base = path.join(root,'.runtime/tests/mcp-depth/file-open'); fs.mkdirSync(base,{recursive:true});
  const cwd = fs.mkdtempSync(path.join(base,'run-')); t.diagnostic(`evidence: ${cwd}`);
  const fifo = path.join(cwd,'unconnected.fifo');
  assert.equal(spawnSync('mkfifo',[fifo],{encoding:'utf8'}).status,0);
  const binary = fs.realpathSync(process.env.OPENDESK_MCP_BINARY);
  const script = fs.readFileSync(path.join(root,'tests/runtime-api/mcp-file-open-depth.js'),'utf8');
  const recorder = new EvidenceRecorder(cwd,'file-open');
  const hash = value=>crypto.createHash('sha256').update(value).digest('hex');
  recorder.writeJSON('provenance.json',{binary,binarySha256:hash(fs.readFileSync(binary)),scriptSha256:hash(script)});
  const client = new MCPStdioClient({binary,args:['--allow-script-execution'],cwd,recorder,runName:'file-open',
    stdoutPath:path.join(cwd,'stdout.ndjson'),stderrPath:path.join(cwd,'stderr.log'),timeoutMs:5000});
  let status;
  try {
    await client.start(); await client.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'file-open',version:'1'}});
    await client.notify('notifications/initialized');
    const call = async (name,args)=>JSON.parse((await client.request('tools/call',{name,arguments:args})).content[0].text);
    const started = await call('tm_script_start',{script,input:{fifo},timeoutMs:1000});
    const deadline = Date.now()+2500;
    while(Date.now()<deadline){
      status = await call('tm_script_status',{executionId:started.executionId});
      if(['succeeded','failed','canceled','timed_out'].includes(status.status))break;
      await delay(20);
    }
    recorder.writeJSON('result.json',status);
    assert.equal(status.status,'succeeded','FIFO must be rejected before the execution deadline');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd,'fifo-result.json'))),['r','w','a'].map(mode=>({mode,rejected:true})));
    assert.equal(fs.readFileSync(path.join(cwd,'regular-open.txt'),'utf8'),'new-tail');
    assert.equal(fs.lstatSync(fifo).isFIFO(),true);
    assert.equal(fs.existsSync(path.join(cwd,'never-copy')),false);
  } finally {
    // Old implementations can be stuck in a blocking open. Release only this
    // task's FIFO so a failing red regression still exits without killing it.
    const peer = fs.openSync(fifo,fs.constants.O_RDWR|fs.constants.O_NONBLOCK);
    try { const exit = await client.close(); assert.equal(exit.code,0); }
    finally { fs.closeSync(peer); }
    assert.deepEqual(client.protocolViolations,[]);
  }
});
