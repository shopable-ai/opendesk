// Run from the repository root:
// ./dist/opendesk -allow-recorder-capture -script examples/human-to-recipe/record.js -console-mode script
//
// F8 starts against the currently active window. F9 is a UI-level pause/resume
// toggle backed by the explicit session.pause() and session.resume() APIs. F10
// stops and builds actions, F11 generates basic JS, and F12 finishes without
// generation. Nothing here automatically replays the generated candidate.
'use strict';

const capabilities = Recorder.getCapabilities();
console.log('[Recorder] capabilities:', JSON.stringify(capabilities));
if (!capabilities.capture.available) {
  throw new Error(`Recorder capture is unavailable: ${JSON.stringify(capabilities.capture)}`);
}
if (typeof globalShortcut !== 'object') {
  throw new Error('This example requires the normal globalShortcut control entrypoint');
}

const captureKeyboard = Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1';
let session = null;
let saved = null;
let actions = null;
let transition = Promise.resolve();

function serialize(task) {
  transition = transition.then(task, task).catch((error) => {
    console.error('[Recorder] operation failed:', error && error.code, error && error.message || String(error));
  });
}

async function startRecording() {
  if (session && ['starting', 'recording', 'paused', 'stopping'].includes(session.status().captureState)) {
    console.log('[Recorder] a session is already active:', JSON.stringify(session.status()));
    return;
  }
  const active = await window.getActiveWindow();
  if (!active || !Number.isInteger(Number(active.pid)) || !String(active.title || '')) {
    throw new Error('The active target window could not be identified');
  }
  console.log('[Recorder] initial window context:', JSON.stringify({processId: Number(active.pid), title: String(active.title)}));
  session = await Recorder.start({
    within: {processId: Number(active.pid), title: String(active.title)},
    captureKeyboard,
    ...(captureKeyboard ? {keyboardContent: 'non-sensitive-test'} : {}),
    evidence: 'target-semantics',
    controlKeycodes: [0x42, 0x43, 0x44, 0x57, 0x58], // F8 through F12
  });
  saved = null;
  actions = null;
  console.log('[Recorder] recording desktop input; window/application switches are allowed. Keep the full sequence non-sensitive. Press F9 to pause or F10 to stop.');
  console.log('[Recorder] status:', JSON.stringify(session.status()));
}

async function togglePause() {
  if (!session) {
    console.log('[Recorder] no session has started; press F8 first.');
    return;
  }
  const state = session.status().captureState;
  if (state === 'recording') {
    const result = await session.pause();
    console.log('[Recorder] paused:', JSON.stringify(result));
    console.log('[Recorder] the native listener remains leased; press F9 from any intended window to resume.');
    return;
  }
  if (state === 'paused') {
    const result = await session.resume();
    console.log('[Recorder] resumed:', JSON.stringify(result));
    return;
  }
  console.log(`[Recorder] pause/resume is unavailable while captureState=${state}`);
}

async function stopAndBuild() {
  if (!session) {
    console.log('[Recorder] no session has started; press F8 first.');
    return;
  }
  console.log('[Recorder] stopping and draining accepted events...');
  saved = await session.stop();
  console.log('[Recorder] saved:', JSON.stringify(saved));
  actions = await Recorder.buildActions(saved.recordingDir);
  console.log('[Recorder] actions:', JSON.stringify(actions));
  if (actions.readiness === 'ready' || actions.readiness === 'needs-review') {
    console.log(actions.readiness === 'ready'
      ? '[Recorder] press F11 to generate basic JS, or F12 to finish without generation.'
      : '[Recorder] action-local problems were omitted; press F11 to generate a runnable partial candidate, or F12 to finish.');
  } else {
    console.log('[Recorder] generation is not eligible; inspect issues, then press F12.');
  }
}

async function generateAndFinish() {
  if (!actions) {
    console.log('[Recorder] no actions file is ready; press F10 first.');
    return;
  }
  if (actions.readiness !== 'ready' && actions.readiness !== 'needs-review') {
    console.log('[Recorder] package-integrity failure blocks generation:', JSON.stringify(actions.issues));
    return;
  }
  const generated = await Recorder.generateScript(actions.actionsFile);
  console.log('[Recorder] generated candidate (not run):', JSON.stringify(generated));
  globalShortcut.unregisterAll();
}

async function finishWithoutGeneration() {
  if (session && !saved) await stopAndBuild();
  console.log('[Recorder] finished without replay. Saved files remain under .runtime/recordings/.');
  globalShortcut.unregisterAll();
}

globalShortcut.register('F8', () => serialize(startRecording));
globalShortcut.register('F9', () => serialize(togglePause));
globalShortcut.register('F10', () => serialize(stopAndBuild));
globalShortcut.register('F11', () => serialize(generateAndFinish));
globalShortcut.register('F12', () => serialize(finishWithoutGeneration));

console.log('[Recorder] ready. Focus the authorized test target, then press F8.');
console.log(`[Recorder] keyboard capture: ${captureKeyboard ? 'enabled for explicit non-sensitive test input' : 'disabled (default)'}`);
