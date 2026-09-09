// Explicit human/live acceptance entry. It never runs during ordinary gates.
// Record phase, from the repository root (replace the expected subset):
// OPENDESK_RECORDER_LIVE_CONFIRM=authorized-non-sensitive-fixture \
// OPENDESK_RECORDER_LIVE_EXPECTED_KINDS=click,text \
// ./dist/opendesk -allow-recorder-capture -script tests/human-to-recipe/recorder-live.js -console-mode script
//
// F8 starts, F9 pauses/resumes, F10 stops/builds/generates, and F12 aborts.
// After separately running the generated basic.recipe.js through its normal
// command, compare fixture-owned state in a third invocation:
// OPENDESK_RECORDER_LIVE_MODE=verify \
// OPENDESK_RECORDER_LIVE_STATE_FILE=.runtime/tests/human-to-recipe/actual-state.json \
// OPENDESK_RECORDER_LIVE_EXPECTED_STATE_FILE=.runtime/tests/human-to-recipe/expected-state.json \
// ./dist/opendesk -script tests/human-to-recipe/recorder-live.js -console-mode script
'use strict';

const outputRoot = File.join(Execution.workdir, '.runtime', 'tests', 'human-to-recipe');
File.ensureDir(outputRoot);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

if (Execution.env.OPENDESK_RECORDER_LIVE_MODE === 'verify') {
  const actualFile = Execution.env.OPENDESK_RECORDER_LIVE_STATE_FILE;
  const expectedFile = Execution.env.OPENDESK_RECORDER_LIVE_EXPECTED_STATE_FILE;
  if (!actualFile || !expectedFile) throw new Error('verify mode requires actual and expected fixture state files');
  const actual = JSON.parse(File.read(actualFile));
  const expected = JSON.parse(File.read(expectedFile));
  if (stable(actual) !== stable(expected)) {
    throw new Error(`fixture state mismatch: expected=${stable(expected)} actual=${stable(actual)}`);
  }
  const resultFile = File.join(outputRoot, `verify-${Date.now()}.json`);
  File.write(resultFile, JSON.stringify({phase: 'post-replay-independent-verification', platform: System.getPlatformInfo().os, actualFile, expectedFile, passed: true}, null, 2) + '\n');
  console.log('[Recorder live] independently verified fixture state:', resultFile);
} else {
  if (Execution.env.OPENDESK_RECORDER_LIVE_CONFIRM !== 'authorized-non-sensitive-fixture') {
    throw new Error('live recording is disabled; set OPENDESK_RECORDER_LIVE_CONFIRM only for an authorized non-sensitive fixture');
  }
  const expectedKinds = String(Execution.env.OPENDESK_RECORDER_LIVE_EXPECTED_KINDS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (expectedKinds.length === 0 || expectedKinds.some((kind) => kind !== 'click' && kind !== 'text')) {
    throw new Error('set OPENDESK_RECORDER_LIVE_EXPECTED_KINDS to the exact expected click,text subset');
  }
  const capabilities = Recorder.getCapabilities();
  if (!capabilities.capture.available) throw new Error(`capture unavailable: ${JSON.stringify(capabilities.capture)}`);

  let session = null;
  let transition = Promise.resolve();
  const serialize = (task) => {
    transition = transition.then(task, task).catch((error) => {
      console.error('[Recorder live] failed:', error && error.code, error && error.message || String(error));
      globalShortcut.unregisterAll();
    });
  };
  globalShortcut.register('F8', () => serialize(async () => {
    if (session) throw new Error('the live fixture session already started');
    const active = await window.getActiveWindow();
    if (!active || !Number.isInteger(Number(active.pid)) || !String(active.title || '')) throw new Error('focus the authorized fixture before F8');
    session = await Recorder.start({
      within: {processId: Number(active.pid), title: String(active.title)},
      captureKeyboard: expectedKinds.includes('text'),
      ...(expectedKinds.includes('text') ? {keyboardContent: 'non-sensitive-test'} : {}),
      evidence: 'none',
      controlKeycodes: [0x42, 0x43, 0x44, 0x58], // F8, F9, F10, F12
    });
    console.log('[Recorder live] recording fixture; F9 pauses/resumes, F10 stops/builds/generates.');
  }));
  globalShortcut.register('F9', () => serialize(async () => {
    if (!session) throw new Error('press F8 before F9');
    const state = session.status().captureState;
    if (state === 'recording') {
      await session.pause();
      console.log('[Recorder live] paused; native listener remains active. Press F9 to resume.');
    } else if (state === 'paused') {
      await session.resume();
      console.log('[Recorder live] resumed.');
    } else {
      throw new Error(`cannot toggle pause from captureState=${state}`);
    }
  }));
  globalShortcut.register('F10', () => serialize(async () => {
    if (!session) throw new Error('press F8 before F10');
    const saved = await session.stop();
    const built = await Recorder.buildActions(saved.recordingDir);
    const actions = JSON.parse(File.read(built.actionsFile));
    const actualKinds = actions.actions.map((action) => action.kind);
    if (built.readiness !== 'ready' || stable(actualKinds) !== stable(expectedKinds)) {
      throw new Error(`recorded actions mismatch: expected=${stable(expectedKinds)} actual=${stable(actualKinds)} issues=${stable(built.issues)}`);
    }
    const generated = await Recorder.generateScript(built.actionsFile);
    const resultFile = File.join(outputRoot, `record-${Date.now()}.json`);
    File.write(resultFile, JSON.stringify({phase: 'human-recorded-generated-not-replayed', platform: System.getPlatformInfo().os, saved, built, generated, expectedKinds, passed: true}, null, 2) + '\n');
    console.log('[Recorder live] human recording saved and basic candidate generated but not replayed:', resultFile);
    console.log('[Recorder live] run this separately only after resetting the fixture:', generated.scriptFile);
    globalShortcut.unregisterAll();
  }));
  globalShortcut.register('F12', () => serialize(async () => {
    if (session) await session.stop();
    console.log('[Recorder live] stopped without actions, generation, or replay.');
    globalShortcut.unregisterAll();
  }));
  console.log('[Recorder live] focus the authorized fixture and press F8 to start; F9 pauses/resumes; F10 stops/builds/generates; F12 aborts.');
}
