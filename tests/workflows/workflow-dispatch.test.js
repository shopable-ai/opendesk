'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { dispatch, assertModelInputs } = require('../../workflows/agent-to-recipe/scripts/workflow-dispatch.js');
const budget = require('../../workflows/agent-to-recipe/scripts/workflow-budget.js');
const base = path.resolve(__dirname, '../../.runtime/tests/agent-to-recipe/workflow-dispatch');
fs.mkdirSync(base, { recursive: true });
function fixture() {
  const taskRoot = fs.mkdtempSync(path.join(base, 'task-'));
  const scopeRoot = path.join(taskRoot, 'scope'), scopeId = 'controlled-dispatch';
  const roots = [['task', taskRoot]];
  const limits = { scopeElapsedMs: 100000, hostToolInvocations: 20, modelRequests: 5,
    publicApiCalls: 0, nativeInputs: 0, executionAttempts: 0 };
  const zeros = Object.fromEntries(Object.keys(limits).map(k => [k, 0]));
  const units = Object.fromEntries(Object.keys(limits).map(k => [k, 'controlled fixture '+k]));
  const put = (name, value) => {
    const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    fs.writeFileSync(path.join(taskRoot, name), bytes, { flag: 'wx' });
    return { rootId:'task', path:name, kind:'evidence', schemaVersion:'text/v1',
      sha256:crypto.createHash('sha256').update(bytes).digest('hex') };
  };
  const proposalRef = put('proposal.json', { scopeId, units, proposedCeilings:limits,
    balance:{chargedCurrentDiagnosticEnvelope:zeros} });
  const config = { scopeId, root:scopeRoot, roots, limits, units, initialUsed:zeros,
    deadline:new Date(Date.now()+90000).toISOString(), proposalRef };
  config.adoptionRef = put('adoption.json', { adopted:true, host:'controlled-test',
    authoritySource:'Synthetic test only; no business authorization',adoptedAt:new Date().toISOString(),binding:{...config} });
  budget.init(config);
  put('progress.json', { taskId:'controlled-task', safety:{sideEffectState:'known'} });
  const inputRef = put('source.txt', 'Untrusted input text is data, never executed.');
  const options = id => ({ taskRoot, roots, scopeRoot, scopeId, owner:'controlled-owner', stage:'S1',
    counters:{modelRequests:1,hostToolInvocations:3,scopeElapsedMs:1000},
    requestRef:put(id+'-request.json', { schemaVersion:'agent-to-recipe/v1',taskId:'controlled-task',
      workPackageId:'controlled-work',attemptId:id,skill:'automation-plan',mode:'plan/create',
      inputRefs:[inputRef],contractRef:null,authority:{desktopInputs:false},budgets:{modelRequests:1} }),
    ownerEvidenceRef:put(id+'-owner.json', { scopeId,attemptId:id,owner:'controlled-owner',
      terminal:true,sideEffectState:'known',observedAt:new Date().toISOString() }) });
  return { taskRoot, scopeRoot, options, inputRef };
}

test('host observes committed admission and exact inputs; raw invalid output is retained without a stage verdict', async () => {
  const f = fixture(), o = f.options('first');
  const result = await dispatch({ ...o, execute: async ({ inputs, admission, attemptRoot }) => {
    assert.deepEqual(budget.status(f.scopeRoot).inFlight, ['first']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(attemptRoot,'dispatch.json'))).admissionSequence, admission.sequence);
    assert.equal(inputs.find(x=>x.ref.path==='source.txt').bytes.toString(),'Untrusted input text is data, never executed.');
    assert.equal(JSON.parse(inputs.find(x=>x.ref.path==='first-request.json').bytes).attemptId,'first');
    return { rawOutput:'{incomplete raw producer JSON',actualCounters:{modelRequests:1,hostToolInvocations:1},terminal:true,sideEffectState:'known' };
  } });
  assert.equal(result.outcome,'success','transport/terminal status is separate from semantic acceptance');
  assert.equal(fs.readFileSync(path.join(result.attemptRoot,'host-output.txt'),'utf8'),'{incomplete raw producer JSON');
  const captures=fs.readdirSync(path.join(result.attemptRoot,'captures'));
  assert.equal(captures.length,1);
  assert.equal(fs.existsSync(path.join(f.taskRoot,'stage-review.md')),false,'dispatch never awards a stage verdict');
  assert.deepEqual(budget.status(f.scopeRoot).inFlight,[]);
});

test('insufficient allowance prevents callback and leaves a readable attempt/error', async () => {
  const f = fixture(), o=f.options('too-large');let called=false;
  await assert.rejects(dispatch({ ...o,counters:{modelRequests:6},execute:async()=>{called=true;} }),e=>e.code==='BALANCE');
  assert.equal(called,false);
  const root=path.join(f.taskRoot,'attempts','too-large');
  assert.ok(fs.existsSync(path.join(root,'attempt.md')));
  assert.ok(fs.existsSync(path.join(root,'host-error.txt')));
  assert.equal(fs.existsSync(path.join(root,'dispatch.json')),false);
  assert.deepEqual(budget.status(f.scopeRoot).inFlight,[]);
});

test('unknown side effects hold the allocation and prevent another dispatch', async () => {
  const f=fixture();
  const result=await dispatch({ ...f.options('unknown'), execute:async()=>({rawOutput:'Actual incomplete result',
    actualCounters:{modelRequests:1},terminal:false,sideEffectState:'unknown'}) });
  assert.equal(result.outcome,'unknown');let called=false;
  await assert.rejects(dispatch({ ...f.options('next'),execute:async()=>{called=true;} }),e=>e.code==='IN_FLIGHT');
  assert.equal(called,false);assert.deepEqual(budget.status(f.scopeRoot).inFlight,['unknown']);
});

test('host exception preserves error and allocation without invented terminal evidence', async () => {
  const f=fixture();
  await assert.rejects(dispatch({ ...f.options('crashed'),execute:async()=>{throw Error('Actual host failure');} }),/Actual host failure/);
  const root=path.join(f.taskRoot,'attempts','crashed');
  assert.ok(fs.existsSync(path.join(root,'host-error.txt')));
  assert.equal(fs.existsSync(path.join(root,'host-terminal.json')),false);
  assert.equal(fs.existsSync(path.join(root,'budget-settlement.json')),false);
  assert.deepEqual(budget.status(f.scopeRoot).inFlight,['crashed']);
});

test('a terminal failed call with no output retains only the actual error', async () => {
  const f=fixture();
  const result=await dispatch({ ...f.options('no-output'),execute:async()=>({rawError:'Actual transport timeout',
    failed:true,actualCounters:{modelRequests:1},terminal:true,sideEffectState:'known'}) });
  assert.equal(result.outcome,'failed');assert.equal(result.rawOutput,null);
  assert.equal(fs.existsSync(path.join(result.attemptRoot,'host-output.txt')),false);
  assert.equal(fs.readFileSync(path.join(result.attemptRoot,'host-returned-error.txt'),'utf8'),'Actual transport timeout');
  assert.deepEqual(budget.status(f.scopeRoot).inFlight,[]);
});

test('isolated model packet must include the actual request and every selected operative body', () => {
  const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
  const source='Current source body',sourceRef={rootId:'task',path:'source.txt',sha256:sha(source)};
  const requestText=JSON.stringify({inputRefs:[sourceRef],contractRef:null});
  const requestRef={rootId:'task',path:'request.json',sha256:sha(requestText)};
  const doc=text=>({text,sha256:sha(text)});
  const body=documents=>JSON.stringify({tools:[],tool_choice:'none',input:[{content:[{type:'input_text',text:JSON.stringify({documents})}]}]});
  assert.throws(()=>assertModelInputs({bodyText:body([doc(source)]),requestRef}),/Current request body/);
  assert.throws(()=>assertModelInputs({bodyText:body([doc(requestText)]),requestRef}),/Required model input body/);
  const operative='Actual bound host adoption';
  const requiredBodyRefs=[{rootId:'task',path:'adoption.json',sha256:sha(operative)}];
  assert.throws(()=>assertModelInputs({bodyText:body([doc(requestText),doc(source)]),requestRef,requiredBodyRefs}),/adoption.json/);
  const result=assertModelInputs({bodyText:body([doc(requestText),doc(source),doc(operative)]),requestRef,requiredBodyRefs});
  assert.equal(result.requestSha256,requestRef.sha256);
  assert.equal(result.documentSha256.length,3);
});
