// OD-CODEX-HOOK-DEMO -- OpenDesk local trusted -script entry only.
// From repository root: ./dist/opendesk -script examples/workflows/codex-hook-demo/main.js -console-mode script
// This file intentionally does not change the generic OpenDesk Runtime.

const DEMO = 'OD-CODEX-HOOK-DEMO';
const BASE = './.runtime/tests/codex-hook-demo';
const STATE_FILE = BASE + '/state.json';
const ENDPOINT_FILE = BASE + '/endpoint.json';
const PROFILE_FILE = BASE + '/profile.json';
const SOURCE = 'codex-hook-demo';
let hook;

function promptFor(role, runId) {
  return `${DEMO} ${role} ${runId}\n请只输出以下一行，不要调用工具、不要添加其他字符：\n${DEMO} DONE ${role} ${runId}`;
}
function validIdentity(event) {
  return event && event.protocol === 'od.codex-hook-demo.v1' &&
    (event.kind === 'prompt' || event.kind === 'stop') &&
    (event.role === 'A' || event.role === 'B') &&
    typeof event.sessionId === 'string' && event.sessionId.length > 0 && event.sessionId.length <= 200 &&
    typeof event.turnId === 'string' && event.turnId.length > 0 && event.turnId.length <= 200 &&
    typeof event.runId === 'string' && /^[a-f0-9]{32}$/.test(event.runId);
}
const EXPECTED_ERRORS = new Set([
  'PROFILE_NOT_CONFIRMED', 'CODEX_NOT_RUNNING', 'CODEX_NOT_FOREGROUND',
  'NEW_THREAD_MARKER_ALREADY_PRESENT', 'CODEX_WINDOW_CHANGED', 'NEW_THREAD_NOT_PROVEN',
  'COMPOSER_NOT_EMPTY', 'PREVIOUS_COMPOSER_NOT_EMPTY', 'B_INPUT_NOT_VERIFIED', 'SUBMIT_NOT_FOUND',
  'CODEX_LOST_FOCUS', 'COMPOSER_CHANGED_BEFORE_SUBMIT',
]);
function redactError(err) {
  const code = err && err.code;
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;
  const message = err && err.message;
  return EXPECTED_ERRORS.has(message) ? message : 'UNCLASSIFIED_RUNTIME_ERROR';
}
function selectorsValid(profile) {
  const semantic = (s, role) => s && typeof s === 'object' && !Array.isArray(s) &&
    s.role === role &&
    (typeof s.identifier === 'string' && s.identifier.length > 0 && !s.identifier.startsWith('REPLACE_') ||
     typeof s.name === 'string' && s.name.length > 0 && !s.name.startsWith('REPLACE_')) &&
    Object.keys(s).every((k) => ['role', 'name', 'identifier'].includes(k));
  return profile && profile.confirmed === true &&
    profile.app && profile.app.bundleId === 'com.openai.codex' &&
    semantic(profile.composer, 'textField') && semantic(profile.submit, 'button') &&
    (semantic(profile.newThreadIndicator, 'staticText') || semantic(profile.newThreadIndicator, 'heading'));
}

if (File.exists(STATE_FILE)) {
  // A previously accepted event might already have caused input. No auto resume or rerun.
  throw new Error('PAUSED_EXISTING_STATE: inspect ' + STATE_FILE + ' before manually creating a fresh run');
}
const uuid = await Command.run('/usr/bin/uuidgen', [], { timeout: 2000, emitOutput: false });
const runId = uuid.stdout.trim().toLowerCase().replace(/-/g, '');
if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('UUID_UNAVAILABLE');
File.ensureDir(BASE);
// The run directory holds an ephemeral bearer token; never make it world-readable.
await Command.run('/bin/chmod', ['700', BASE], { timeout: 2000, emitOutput: false });
const state = {
  protocol: 'od.codex-hook-demo.v1', runId, phase: 'WAIT_A_PROMPT',
  a: null, b: null, bSubmitAttempted: false, desktopActions: 0, events: [], failure: null,
};
async function save(code, info) {
  state.events.push({ at: new Date().toISOString(), code, ...(info || {}) });
  await File.writeJSON(STATE_FILE, state);
  console.log('OD_CODEX_DEMO_EVENT=' + JSON.stringify({ runId, phase: state.phase, code, ...(info || {}) }));
}
await save('RUN_INITIALIZED');

async function safeStop(code, error, actionPossible) {
  // A real B prompt or B completion may race a slow/failed desktop tap return.
  // Never demote an independently proven B submission or completion.
  if (state.phase === 'WAIT_B_STOP' || state.phase === 'DONE') {
    await save('B_DESKTOP_RECEIPT_UNCERTAIN', { detail: redactError(error) });
    return;
  }
  state.phase = actionPossible ? 'PAUSED_UNKNOWN' : 'BLOCKED';
  state.failure = { code, detail: redactError(error), actionPossible: !!actionPossible };
  await save(code, { actionPossible: !!actionPossible });
  // Keep the listener for a possible late B prompt/stop only if a submit could have happened.
  if (!actionPossible && hook) hook.close();
}

async function submitB() {
  let actionPossible = false;
  try {
    const profile = await File.readJSON(PROFILE_FILE, { defaultValue: null });
    if (!selectorsValid(profile)) throw new Error('PROFILE_NOT_CONFIRMED');
    if (!App.isRunning({ bundleId: 'com.openai.codex' })) throw new Error('CODEX_NOT_RUNNING');
    const win = await window.get({ app: { bundleId: 'com.openai.codex' } });
    const focused = await window.getActiveWindow();
    if (win.id !== focused.id || win.pid !== focused.pid) throw new Error('CODEX_NOT_FOREGROUND');

    // Require a real, unique new-thread marker that is absent on A's current page.
    // A sidebar 'New thread' button is NOT a valid marker (always visible).
    const prior = UI.within(win);
    if (await prior.locator(profile.composer).getValue({ timeout: 3000 }) !== '') {
      throw new Error('PREVIOUS_COMPOSER_NOT_EMPTY');
    }
    if (await prior.locator(profile.newThreadIndicator).find({ timeout: 3000 }) !== null) {
      throw new Error('NEW_THREAD_MARKER_ALREADY_PRESENT');
    }
    state.phase = 'B_DESKTOP_ACTION_UNKNOWN';
    await save('B_NEW_THREAD_RESERVED', { windowId: win.id, pid: win.pid });
    actionPossible = true;
    state.desktopActions += 1;
    await keyboard.combination('Meta', 'N');

    // Never assume Cmd+N actually created a new conversation. Require a fresh, empty composer.
    const freshWin = await window.current(win);
    if (freshWin.id !== win.id || freshWin.pid !== win.pid || !freshWin.isForeground) {
      throw new Error('CODEX_WINDOW_CHANGED');
    }
    const scope = UI.within(freshWin);
    const newView = scope.locator(profile.newThreadIndicator);
    await newView.waitFor({ state: 'exists', timeout: 5000 }); // Observe only; never press Cmd+N again.
    if (await newView.find({ timeout: 3000 }) === null) {
      throw new Error('NEW_THREAD_NOT_PROVEN');
    }
    const composer = scope.locator(profile.composer);
    const existing = await composer.getValue({ timeout: 3000 });
    if (existing !== '') throw new Error('COMPOSER_NOT_EMPTY');
    const bPrompt = promptFor('B', runId);
    const write = await composer.setValue(bPrompt, { timeout: 3000 });
    if (write.verified !== true || await composer.getValue({ timeout: 3000 }) !== bPrompt) {
      throw new Error('B_INPUT_NOT_VERIFIED');
    }
    const submit = scope.locator(profile.submit);
    if (await submit.find({ timeout: 3000 }) === null) throw new Error('SUBMIT_NOT_FOUND');
    if ((await window.current(freshWin)).isForeground !== true) throw new Error('CODEX_LOST_FOCUS');
    if (await composer.getValue({ timeout: 3000 }) !== bPrompt) {
      throw new Error('COMPOSER_CHANGED_BEFORE_SUBMIT');
    }

    // Persist before the irreversible click; timeout or crash means UNKNOWN, never click again.
    state.phase = 'B_SUBMIT_UNKNOWN';
    state.bSubmitAttempted = true;
    await save('B_SUBMIT_RESERVED');
    state.desktopActions += 1;
    await submit.tap({ timeout: 3000 });
    await save('B_SUBMIT_ACTION_RETURNED'); // NOT proof that the prompt reached Codex.
    // B UserPromptSubmit + B Stop are the independent postconditions.
  } catch (err) {
    await safeStop('B_DESKTOP_BLOCKED_OR_UNKNOWN', err, actionPossible);
  }
}

function response(status, code, extra) {
  return { status, body: { ok: status < 400, code, ...(extra || {}) } };
}
function same(bound, event) {
  return bound && bound.sessionId === event.sessionId && bound.turnId === event.turnId;
}

hook = Webhook.listen('codex-hook-handoff-demo', async (request) => {
  const event = request.body;
  if (request.source !== SOURCE || !validIdentity(event) || event.runId !== runId) {
    return response(403, 'OUT_OF_SCOPE');
  }
  const eventInfo = { role: event.role, kind: event.kind, sessionId: event.sessionId, turnId: event.turnId };
  if (event.role === 'A') {
    if (event.kind === 'prompt' && state.phase === 'WAIT_A_PROMPT') {
      state.a = { sessionId: event.sessionId, turnId: event.turnId };
      state.phase = 'WAIT_A_STOP';
      await save('A_BOUND', eventInfo);
      return response(202, 'A_BOUND');
    }
    if (same(state.a, event) && event.kind === 'prompt') return response(200, 'DUPLICATE_A_PROMPT');
    if (same(state.a, event) && event.kind === 'stop' && state.phase === 'WAIT_A_STOP') {
      if (event.stopHookActive !== false || event.completed !== true) return response(409, 'NOT_FINAL_STOP');
      state.phase = 'B_DISPATCH_RESERVED';
      await save('A_STOP_ACCEPTED', eventInfo);
      setTimeout(() => {
        submitB().catch((err) => {
          console.log('OD_CODEX_DEMO_FATAL=' + redactError(err));
          hook.close(); // State write failure is terminal; never retry the desktop action.
        });
      }, 250); // Don't hold the Stop HTTP response open for UI work.
      return response(202, 'B_QUEUED');
    }
    if (same(state.a, event) && event.kind === 'stop' && state.phase !== 'WAIT_A_STOP') {
      return response(200, 'DUPLICATE_A_STOP');
    }
    return response(409, 'A_IDENTITY_OR_ORDER_MISMATCH');
  }
  // B must be created by OpenDesk; no arbitrary B event can start another task.
  if (event.kind === 'prompt' && state.bSubmitAttempted &&
      (state.phase === 'B_SUBMIT_UNKNOWN' || state.phase === 'PAUSED_UNKNOWN')) {
    if (event.sessionId === state.a.sessionId) return response(409, 'B_NOT_NEW_CODEX_SESSION');
    state.b = { sessionId: event.sessionId, turnId: event.turnId };
    state.phase = 'WAIT_B_STOP';
    await save('B_PROMPT_SUBMITTED', eventInfo);
    return response(202, 'B_BOUND');
  }
  if (same(state.b, event) && event.kind === 'prompt') return response(200, 'DUPLICATE_B_PROMPT');
  if (same(state.b, event) && event.kind === 'stop' && state.phase === 'WAIT_B_STOP') {
    if (event.stopHookActive !== false || event.completed !== true) return response(409, 'NOT_FINAL_STOP');
    state.phase = 'DONE';
    await save('B_STOP_ACCEPTED', eventInfo);
    hook.close();
    return response(200, 'RUN_DONE');
  }
  return response(409, 'B_IDENTITY_OR_ORDER_MISMATCH');
}, { handlerTimeoutMs: 3000, maxQueuedRequests: 8, maxQueuedBytes: 4096, maxRequestBytes: 4096,
  dedupeWindowMs: 60000, maxDedupeEntries: 32 });

await File.writeJSON(ENDPOINT_FILE, {
  protocol: 'od.codex-hook-demo.v1', runId, url: hook.url, headers: hook.requestHeaders(),
});
await Command.run('/bin/chmod', ['600', ENDPOINT_FILE], { timeout: 2000, emitOutput: false });
console.log('OD_CODEX_DEMO_READY=' + JSON.stringify({ runId, aPrompt: promptFor('A', runId),
  stateFile: STATE_FILE, endpointFile: ENDPOINT_FILE, note: 'Use the official Codex app; never publish endpoint credentials.' }));
