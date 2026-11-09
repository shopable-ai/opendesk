import { randomUUID } from 'node:crypto';

const taskSeed = [
  { id: 'A', title: '准备输入与检查清单', dependsOn: [], expected: 'OK-A', prompt: '检查演示输入，仅提交 OK-A。' },
  { id: 'B', title: '按检查清单执行', dependsOn: ['A'], expected: 'OK-B', prompt: '基于已验收 A 执行演示 B，仅提交 OK-B。' },
  { id: 'C', title: '验证与交接', dependsOn: ['B'], expected: 'OK-C', prompt: '验证已验收 A/B 并完成交接，仅提交 OK-C。' },
];
const key = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
function requireFields(obj, fields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(x => !fields.includes(x))) throw Error('INVALID_FIELDS');
}
function eq(actual, expected) { if (actual !== expected) throw Error('IDENTITY_MISMATCH'); }
function makeState(mode, reviewPolicy) {
  return { schemaVersion: 1, workflowId: randomUUID(), revision: 0, mode, reviewPolicy,
    paused: true, active: null, tasks: taskSeed.map(t => ({ ...t, version: 1, status: 'queued', attempts: 0 })), history: [], seen: {} };
}
export function makePrompt(s, task, active) {
  // Marker is an attempt-scoped capability delivered through the chosen dispatch mode.
  return `OD-CWF/v1 run=${s.workflowId} task=${task.id} attempt=${active.attemptId} claim=${active.nonce}\n` +
    `${task.prompt}\n通过 MCP 工具绑定任务、反馈进度并提交结果。Hook Stop 不代表验收通过。`;
}
export function deepLink(prompt) { return 'codex://threads/new?prompt=' + encodeURIComponent(prompt); }

export class Workflow {
  constructor(store, { mode = 'simulate', reviewPolicy = 'manual' } = {}) {
    if (!['simulate', 'deeplink', 'native', 'app-server'].includes(mode)) throw Error('INVALID_MODE');
    if (!['manual', 'exact-demo'].includes(reviewPolicy)) throw Error('INVALID_REVIEW_POLICY');
    this.store = store;
    this.s = store.load() || makeState(mode, reviewPolicy);
    if (this.s.reviewPolicy === 'exact-demo' && this.s.mode !== 'simulate') throw Error('DEMO_REVIEW_ONLY');
    if (this.s.active?.dispatch === 'reserved') {
      this.s.active.dispatch = 'unknown'; this.s.paused = true;
      this.#record('RECOVERED_UNCERTAIN_DISPATCH');
    }
    this.store.save(this.s);
  }
  #record(type, extra = {}) {
    this.s.history.push({ at: new Date().toISOString(), type, taskId: this.s.active?.taskId ?? null, ...extra });
    if (this.s.history.length > 300) this.s.history.shift();
  }
  #save() { this.s.revision++; this.store.save(this.s); }
  #active(args) {
    const a = this.s.active;
    if (!a) throw Error('NO_ACTIVE_ATTEMPT');
    if (!args || typeof args !== 'object') throw Error('INVALID_ARGUMENTS');
    eq(args.workflowId, this.s.workflowId); eq(args.taskId, a.taskId); eq(args.attemptId, a.attemptId);
    const task = this.s.tasks.find(t => t.id === a.taskId);
    eq(args.taskVersion, task.version);
    return { a, task };
  }
  #unique(id, payload) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_:-]{1,150}$/.test(id)) throw Error('EVENT_ID_INVALID');
    const fingerprint = JSON.stringify(payload);
    if (Object.hasOwn(this.s.seen, id)) {
      if (this.s.seen[id] !== fingerprint) throw Error('EVENT_ID_CONFLICT');
      return false;
    }
    if (Object.keys(this.s.seen).length >= 1000) throw Error('DEDUP_CAPACITY_REACHED');
    this.s.seen[id] = fingerprint;
    return true;
  }
  #reserveNext() {
    if (this.s.paused || this.s.active) return null;
    const next = this.s.tasks.find(t => t.status === 'queued' && t.dependsOn.every(d => this.s.tasks.find(x => x.id === d)?.status === 'accepted'));
    if (!next) return null;
    next.status = 'reserved'; next.attempts++;
    this.s.active = { taskId: next.id, attemptId: randomUUID(), nonce: randomUUID(), dispatch: 'reserved',
      progress: 0, claimed: false, sessionId: null, turnId: null, stopObserved: false,
      result: null, error: null, threadId: null };
    this.#record('ATTEMPT_RESERVED', { attemptId: this.s.active.attemptId });
    this.#save();
    return this.pending();
  }
  pending() {
    if (!this.s.active) return null;
    const t = this.s.tasks.find(x => x.id === this.s.active.taskId);
    return { workflowId: this.s.workflowId, taskId: t.id, taskVersion: t.version,
      attemptId: this.s.active.attemptId, prompt: makePrompt(this.s, t, this.s.active),
      deepLink: deepLink(makePrompt(this.s, t, this.s.active)), dispatch: this.s.active.dispatch };
  }
  start() { if (this.s.active || this.s.tasks.every(t => t.status === 'accepted')) throw Error('ALREADY_STARTED_OR_FINISHED'); this.s.paused = false; this.#record('WORKFLOW_STARTED'); this.#save(); return this.#reserveNext(); }
  pause() { if (!this.s.paused) { this.s.paused = true; this.#record('PAUSED'); this.#save(); } return this.publicState(); }
  resume() { if (this.s.paused) { this.s.paused = false; this.#record('RESUMED'); this.#save(); } return this.#reserveNext(); }
  dispatchResult({ attemptId, status, threadId = null }) {
    const a = this.s.active;
    if (!a || a.attemptId !== attemptId || a.dispatch !== 'reserved') throw Error('DISPATCH_NOT_RESERVED');
    if (!['prepared', 'draft', 'hosted', 'unknown', 'blocked'].includes(status)) throw Error('DISPATCH_RESULT_INVALID');
    a.dispatch = status; a.threadId = typeof threadId === 'string' && threadId.length < 200 ? threadId : null;
    if (status === 'unknown' || status === 'blocked') this.s.paused = true;
    this.#record('DISPATCH_' + status.toUpperCase()); this.#save();
  }
  hook(event, deliveryId) {
    requireFields(event, ['protocol','kind','workflowId','taskId','attemptId','nonce','sessionId','turnId','stopHookActive']);
    if (event.protocol !== 'od.codex-workflow.v1' || !['prompt','stop'].includes(event.kind) ||
        !key(deliveryId) || typeof event.sessionId !== 'string' || !event.sessionId || event.sessionId.length > 200 ||
        typeof event.turnId !== 'string' || !event.turnId || event.turnId.length > 200) throw Error('HOOK_INVALID');
    const { a } = this.#active({ ...event, taskVersion: this.s.tasks.find(t => t.id === event.taskId)?.version });
    if (event.kind === 'prompt') {
      eq(event.nonce, a.nonce);
      if (a.sessionId && (a.sessionId !== event.sessionId || a.turnId !== event.turnId)) throw Error('HOOK_REBIND_DENIED');
    } else {
      if (event.stopHookActive !== false) throw Error('STOP_NOT_FINAL');
      if (!a.sessionId || a.sessionId !== event.sessionId || a.turnId !== event.turnId) throw Error('UNBOUND_STOP');
    }
    if (!this.#unique('hook:' + deliveryId, event)) return { duplicate: true };
    if (event.kind === 'prompt') { a.sessionId = event.sessionId; a.turnId = event.turnId; if (a.dispatch === 'unknown') this.s.paused = true; this.s.tasks.find(t => t.id === a.taskId).status = 'running'; this.#record('CODEX_PROMPT_OBSERVED'); }
    else { a.stopObserved = true; this.#record('CODEX_STOP_OBSERVED_NOT_VERIFIED'); }
    this.#save(); this.#maybeFinish(); return { accepted: true };
  }
  claim(x) {
    requireFields(x, ['workflowId','taskId','taskVersion','attemptId','nonce','eventId']);
    const { a } = this.#active(x); eq(x.nonce, a.nonce);
    if (!a.sessionId) throw Error('HOOK_PROMPT_REQUIRED');
    if (!this.#unique('mcp:' + x.eventId, x)) return { duplicate: true };
    a.claimed = true; this.#record('MCP_CLAIMED'); this.#save(); return { accepted: true };
  }
  progress(x) {
    requireFields(x, ['workflowId','taskId','taskVersion','attemptId','nonce','eventId','percent','message']);
    const { a } = this.#active(x); eq(x.nonce, a.nonce);
    if (!a.claimed || a.result !== null) throw Error('NOT_CLAIMED_OR_ALREADY_SUBMITTED');
    if (!Number.isInteger(x.percent) || x.percent < 0 || x.percent > 100 || typeof x.message !== 'string' || x.message.length > 500) throw Error('PROGRESS_INVALID');
    if (!this.#unique('mcp:' + x.eventId, x)) return { duplicate: true };
    a.progress = x.percent; this.#record('MCP_PROGRESS', { percent: x.percent, message: x.message }); this.#save(); return { accepted: true };
  }
  submit(x) {
    requireFields(x, ['workflowId','taskId','taskVersion','attemptId','nonce','eventId','result','evidence']);
    const { a } = this.#active(x); eq(x.nonce, a.nonce);
    if (!a.claimed || a.result !== null) throw Error('NOT_CLAIMED_OR_ALREADY_SUBMITTED');
    if (typeof x.result !== 'string' || !x.result.trim() || x.result.length > 2000 || typeof x.evidence !== 'string' || x.evidence.length > 2000) throw Error('RESULT_INVALID');
    if (!this.#unique('mcp:' + x.eventId, x)) return { duplicate: true };
    a.result = { text: x.result, evidence: x.evidence }; this.s.tasks.find(t => t.id === a.taskId).status = 'review'; this.#record('MCP_RESULT_SUBMITTED_NOT_ACCEPTED'); this.#save();
    this.#maybeFinish(); return { accepted: true };
  }
  error(x) {
    requireFields(x, ['workflowId','taskId','taskVersion','attemptId','nonce','eventId','code']);
    const { a } = this.#active(x); eq(x.nonce, a.nonce);
    if (!a.claimed || !key(x.code)) throw Error('ERROR_INVALID');
    if (!this.#unique('mcp:' + x.eventId, x)) return { duplicate: true };
    a.error = x.code; this.s.paused = true; this.s.tasks.find(t => t.id === a.taskId).status = 'blocked'; this.#record('MCP_ERROR', { code: x.code }); this.#save(); return { accepted: true };
  }
  hostedEvent(attemptId, status) {
    const a=this.s.active;
    if (!a || a.attemptId!==attemptId || !['reserved','hosted'].includes(a.dispatch)) return false;
    if (!['completed','failed','interrupted'].includes(status)) status='unknown';
    a.hostedTurnStatus=status;
    if (status!=='completed') { this.s.paused=true; a.error='HOSTED_TURN_'+status.toUpperCase(); }
    this.#record('APP_SERVER_TURN_'+status.toUpperCase()+'_NOT_DESKTOP_EVIDENCE'); this.#save();return true;
  }
  retryFailed(attemptId, evidence) {
    const a=this.s.active;
    if (!a || a.attemptId!==attemptId || !a.error || !a.stopObserved) throw Error('RETRY_NOT_SAFE');
    if (typeof evidence!=='string' || evidence.trim().length<12 || evidence.length>500) throw Error('RETRY_REVIEW_REQUIRED');
    this.s.paused=true;this.#record('OPERATOR_APPROVED_RETRY_AFTER_STOP',{evidence});
    this.s.tasks.find(t=>t.id===a.taskId).status='queued';this.s.active=null;this.#save();return this.publicState();
  }
  #maybeFinish() {
    const a = this.s.active;
    if (a?.claimed && a.stopObserved && a.result && !a.error && this.s.mode === 'simulate' && this.s.reviewPolicy === 'exact-demo') {
      const t = this.s.tasks.find(t => t.id === a.taskId);
      if (a.result.text === t.expected) this.approve(a.attemptId, 'exact-demo:' + t.expected);
    }
  }
  approve(attemptId, evidence) {
    const a = this.s.active;
    if (!a || a.attemptId !== attemptId) throw Error('ATTEMPT_MISMATCH');
    if (!a.claimed || !a.stopObserved || !a.result || a.error) throw Error('REVIEW_NOT_READY');
    if (typeof evidence !== 'string' || evidence.trim().length < 4 || evidence.length > 500) throw Error('REVIEW_EVIDENCE_REQUIRED');
    const task = this.s.tasks.find(t => t.id === a.taskId);
    task.status = 'accepted'; this.#record('HUMAN_OR_EXACT_REVIEW_ACCEPTED', { evidence }); this.s.active = null; this.#save();
    return this.#reserveNext();
  }
  reconcile(attemptId, outcome, evidence) {
    const a = this.s.active;
    if (!a || a.attemptId !== attemptId || !['unknown','blocked'].includes(a.dispatch)) throw Error('NO_UNCERTAIN_DISPATCH');
    if (!['not_sent','sent'].includes(outcome) || typeof evidence !== 'string' || evidence.trim().length < 12 || evidence.length > 500) throw Error('RECONCILE_EVIDENCE_REQUIRED');
    this.s.paused = true;
    this.#record('OPERATOR_RECONCILED', { outcome, evidence });
    if (outcome === 'not_sent') {
      const task = this.s.tasks.find(t => t.id === a.taskId); task.status = 'queued'; this.s.active = null;
    } else { a.dispatch = 'prepared'; }
    this.#save(); return this.publicState();
  }
  mcpState() {
    const s = this.publicState();
    if (s.pending) s.pending = { workflowId:s.pending.workflowId, taskId:s.pending.taskId, taskVersion:s.pending.taskVersion, attemptId:s.pending.attemptId, dispatch:s.pending.dispatch };
    return s;
  }
  publicState() {
    const { seen, ...rest } = this.s;
    const active = this.s.active ? { ...this.s.active, nonce: undefined } : null;
    return structuredClone({ ...rest, active, pending: this.pending(), history: this.s.history.slice(-40) });
  }
}
