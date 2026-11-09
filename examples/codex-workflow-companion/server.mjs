#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Store } from './core/store.mjs';
import { Workflow } from './core/engine.mjs';
import { dispatch, validateDeepLink } from './core/adapters.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'examples/codex-workflow-companion');
const stateDir = process.env.OD_CWF_STATE_DIR || path.join(root, '.runtime/tests/codex-workflow-companion');
const store = new Store(stateDir);
const workflow = new Workflow(store, { mode: process.env.OD_CWF_MODE || 'simulate', reviewPolicy: process.env.OD_CWF_REVIEW || 'manual' });
const secret = randomBytes(32).toString('hex');
const uiToken = randomBytes(32).toString('hex');
let base = '';
// Guard an asynchronously dispatched reservation from concurrent HTTP mutations.
// The durable 'reserved' state remains the crash-recovery boundary.
const dispatchInFlight = new Set();
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(body)); };
const safeError = err => ({ ok:false, error: /^[A-Z_]{3,64}$/.test(err.message || '') ? err.message : 'UNEXPECTED_FAILURE' });
async function afterMutation() {
  // Only the owner can issue this side effect. Each reservation is persisted BEFORE dispatch.
  const next = workflow.pending();
  if (!next || next.dispatch !== 'reserved' || dispatchInFlight.has(next.attemptId)) return;
  dispatchInFlight.add(next.attemptId);
  try {
    const result = await dispatch(next, workflow.s.mode, {
      runtimeDir: stateDir, appServer: { onTurnCompleted: status => workflow.hostedEvent(next.attemptId, status) }, profileFile: path.join(stateDir,'profile.json'),
      openDeskBinary: process.env.OD_CWF_OPENDESK_BINARY,
    });
    workflow.dispatchResult({ attemptId: next.attemptId, ...result });
  } catch (error) {
    // Post-reservation failure may have produced external actions: never retry automatically.
    workflow.dispatchResult({ attemptId: next.attemptId, status: error.dispatchPossiblySent ? 'unknown' : 'blocked' });
  } finally {
    dispatchInFlight.delete(next.attemptId);
  }
}
function operator(action, body) {
  switch (action) {
    case 'start': return workflow.start();
    case 'pause': return workflow.pause();
    case 'resume': return workflow.resume();
    case 'approve': return workflow.approve(body.attemptId, body.evidence);
    case 'reconcile': return workflow.reconcile(body.attemptId, body.outcome, body.evidence);
    case 'retry_failed': return workflow.retryFailed(body.attemptId, body.evidence);
    case 'simulate': {
      if (workflow.s.mode !== 'simulate') throw Error('SIMULATION_ONLY');
      const p = workflow.pending(); if (!p || p.dispatch !== 'prepared') throw Error('NOT_PREPARED');
      const nonce = workflow.s.active.nonce;
      const common = { workflowId:p.workflowId, taskId:p.taskId, taskVersion:p.taskVersion, attemptId:p.attemptId, nonce };
      const { taskVersion: _taskVersion, ...hookIdentity } = common;
      const event = { protocol:'od.codex-workflow.v1', kind:'prompt', ...hookIdentity, sessionId:'sim-'+p.attemptId, turnId:'sim-turn-'+p.attemptId };
      workflow.hook(event, 'sim-prompt-' + p.attemptId);
      workflow.claim({ ...common, eventId:'sim-claim-'+p.attemptId });
      workflow.progress({ ...common, eventId:'sim-progress-'+p.attemptId, percent:100, message:'模拟任务已运行；非真实 Codex 回执' });
      workflow.submit({ ...common, eventId:'sim-submit-'+p.attemptId, result:workflow.s.tasks.find(t=>t.id===p.taskId).expected, evidence:'simulation-only' });
      workflow.hook({ ...event, kind:'stop', nonce:undefined, stopHookActive:false }, 'sim-stop-' + p.attemptId);
      return { simulated: true };
    }
    default: throw Error('UNKNOWN_ACTION');
  }
}
function callMcp(name, args) {
  switch (name) {
    case 'workflow_status': return workflow.mcpState();
    case 'task_claim': return workflow.claim(args);
    case 'task_progress': return workflow.progress(args);
    case 'task_submit': return workflow.submit(args);
    case 'task_error': return workflow.error(args);
    default: throw Error('UNKNOWN_MCP_TOOL');
  }
}
async function readBody(req) {
  const parts=[]; let length=0;
  for await (const part of req) { length+=part.length; if (length>32_768) throw Error('REQUEST_TOO_LARGE'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, base || 'http://127.0.0.1');
  try {
    if (url.pathname === '/' && req.method === 'GET') {
      const page = path.join(appRoot,'preview/index.html');
      if (!fs.existsSync(page)) return json(res,503,{ error:'PREVIEW_NOT_BUILT', instruction:'npm --prefix examples/codex-workflow-companion run build' });
      const html = fs.readFileSync(page,'utf8').replaceAll('__CWF_AUTH_VALUE__', uiToken);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
      return res.end(html);
    }
    if (url.pathname === '/api/state' && req.method === 'GET') {
      if (req.headers['x-od-cwf-ui'] !== uiToken && req.headers.authorization !== 'Bearer '+secret) return json(res,403,{ok:false});
      return json(res,200,{ok:true, state:workflow.publicState()});
    }
    if (req.method !== 'POST' || !['/api/operator','/api/mcp','/api/hook'].includes(url.pathname)) return json(res,404,{ok:false});
    const internal = req.headers.authorization === 'Bearer '+secret;
    const ui = req.headers['x-od-cwf-ui'] === uiToken && req.headers.origin === base;
    if (!internal && !(url.pathname === '/api/operator' && ui)) return json(res,403,{ok:false});
    const body = await readBody(req);
    let result;
    if (url.pathname === '/api/operator') {
      if (!body || !['start','pause','resume','approve','reconcile','retry_failed','simulate'].includes(body.action)) throw Error('UNKNOWN_ACTION');
      result = operator(body.action, body);
    } else if (url.pathname === '/api/mcp') {
      if (!body || typeof body.name !== 'string') throw Error('UNKNOWN_MCP_TOOL');
      result = callMcp(body.name, body.arguments || {});
    } else {
      if (req.headers['x-opendesk-source'] !== 'codex-workflow-companion') return json(res,403,{ok:false});
      result = workflow.hook(body, req.headers['x-opendesk-delivery-id']);
    }
    await afterMutation();
    return json(res,200,{ok:true,result,state:workflow.publicState()});
  } catch (error) { return json(res,400,safeError(error)); }
});
server.listen(0,'127.0.0.1',()=>{
  base = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(path.join(stateDir,'endpoint.json'), JSON.stringify({ protocol:'od.codex-workflow.v1', url:base,
    headers:{Authorization:'Bearer '+secret} },null,2),{mode:0o600});
  fs.chmodSync(path.join(stateDir,'endpoint.json'),0o600);
  console.log('CWF_READY '+JSON.stringify({url:base,mode:workflow.s.mode,stateDir}));
});
const shutdown=()=>{server.close();store.close();process.exit(0);};
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
