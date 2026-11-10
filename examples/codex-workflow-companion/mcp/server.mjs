#!/usr/bin/env node
// Dependency-free MCP stdio JSON-RPC server. No model-supplied URL or auth path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = process.env.OD_CWF_STATE_DIR || path.join(root,'.runtime/tests/codex-workflow-companion');
const endpointPath = path.join(dir,'endpoint.json');
const st = fs.lstatSync(endpointPath);
if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) throw Error('ENDPOINT_PERMISSIONS');
const endpoint = JSON.parse(fs.readFileSync(endpointPath,'utf8'));
const url = new URL(endpoint.url);
if (endpoint.protocol !== 'od.codex-workflow.v1' || url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || url.pathname !== '/' || url.search ||
    !/^Bearer [0-9a-f]{64}$/.test(endpoint.headers?.Authorization)) throw Error('ENDPOINT_INVALID');
const identity = { type:'object', additionalProperties:false, required:['workflowId','taskId','taskVersion','attemptId','nonce','eventId'],
  properties:{workflowId:{type:'string'},taskId:{type:'string'},taskVersion:{type:'integer'},attemptId:{type:'string'},nonce:{type:'string'},eventId:{type:'string'}} };
const extend = (extra, required) => ({ ...identity, required:[...identity.required,...required], properties:{...identity.properties,...extra} });
const tools = [
  { name:'workflow_status', description:'Read active task and audit history; this cannot trigger execution.', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'task_claim', description:'Claim only the current attempt using its prompt-scoped nonce after Hook has bound its turn.',inputSchema:identity },
  { name:'task_progress', description:'Report bounded progress for the claimed active attempt.',inputSchema:extend({ percent:{type:'integer',minimum:0,maximum:100},message:{type:'string',maxLength:500}},['percent','message']) },
  { name:'task_submit', description:'Submit result for review. This never approves a task.',inputSchema:extend({result:{type:'string',maxLength:2000},evidence:{type:'string',maxLength:2000}},['result','evidence']) },
  { name:'task_error', description:'Report error and pause future scheduling.',inputSchema:extend({code:{type:'string'}},['code']) },
];
let initialized = false;
const write = msg => process.stdout.write(JSON.stringify(msg) + '\n');
async function forward(name,args) {
  const result = await fetch(endpoint.url+'/api/mcp',{method:'POST',headers:{Authorization:endpoint.headers.Authorization,'Content-Type':'application/json'},
    body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(2500)});
  return result.json();
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
  let req;
  try { if(line.length>32768)throw Error('LINE_TOO_LARGE');req=JSON.parse(line); } catch { return write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}}); }
  if(req.method==='notifications/initialized'){initialized=true;return;}
  if(req.id===undefined)return;
  const reply=payload=>write({jsonrpc:'2.0',id:req.id,...payload});
  if(req.jsonrpc!=='2.0')return reply({error:{code:-32600,message:'Invalid request'}});
  try {
    if(req.method==='initialize')return reply({result:{protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'opendesk-codex-workflow-companion',version:'0.1.0'}}});
    if(!initialized) return reply({error:{code:-32002,message:'Not initialized'}});
    if(req.method==='ping')return reply({result:{}});
    if(req.method==='tools/list')return reply({result:{tools}});
    if(req.method==='tools/call'){
      const {name,arguments:args={}}=req.params||{};
      if(!tools.some(t=>t.name===name))return reply({error:{code:-32602,message:'Unknown tool'}});
      const res=await forward(name,args);
      return reply({result:{isError:res.ok!==true,content:[{type:'text',text:JSON.stringify(res.ok?res.result:res.error)}]}});
    }
    return reply({error:{code:-32601,message:'Method not found'}});
  }catch{return reply({result:{isError:true,content:[{type:'text',text:'WORKFLOW_BRIDGE_UNAVAILABLE'}]}});}
});
