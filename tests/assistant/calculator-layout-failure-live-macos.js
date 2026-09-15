'use strict';

// Explicit live negative acceptance for the product-owned Calculator capability.
// Run from repository root:
// OPENDESK_ASSISTANT_LIVE_CALCULATOR=authorized ./dist/opendesk -script tests/assistant/calculator-layout-failure-live-macos.js -console-mode script

const enabled = Execution.env.OPENDESK_ASSISTANT_LIVE_CALCULATOR === 'authorized';
const evidencePath = File.join(Execution.workdir, '.runtime', 'tests', 'assistant-p0.2', 'calculator-layout-failure-live.json');
const report = {status: enabled ? 'running' : 'skipped', original: null, rejected: null, error: null};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!enabled) {
  console.log('ASSISTANT_CALCULATOR_LAYOUT_FAILURE_LIVE=' + JSON.stringify(report));
} else {
  let original = null;
  let resized = null;
  let mouseDown = false;
  try {
    await App.launch({bundleId: 'com.apple.calculator'}, {activate: true, waitUntilReady: 'window', timeout: 10_000});
    original = await window.get({title: 'Calculator', exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator'});
    report.original = {x: original.x, y: original.y, width: original.width, height: original.height};
    // Current macOS window-size IPC can time out even after a successful
    // read.  The screenshot/WindowInfo preflight qualifies this exact
    // lower-left resize handle; perform one bounded, reversible drag rather
    // than retrying an uncertain window mutation.
    const originalHandle = {x: original.x + 1, y: original.y + original.height - 1};
    const resizedHandle = {x: originalHandle.x - 96, y: originalHandle.y + 80};
    await mouse.move(originalHandle.x, originalHandle.y);
    await mouse.down({button: 'left'});
    mouseDown = true;
    await mouse.move(resizedHandle.x, resizedHandle.y, {durationMs: 250, curve: 'linear'});
    await mouse.up({button: 'left'});
    mouseDown = false;
    resized = await window.get({title: 'Calculator', exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator'});
    assert(resized.width !== original.width || resized.height !== original.height,
      `Calculator lower-left resize did not change the qualified layout: ${JSON.stringify(resized)}`);

    const capabilityPath = File.join(Execution.workdir, 'apps', 'opendesk', 'capabilities', 'calculator.js');
    (0, eval)(File.read(capabilityPath) + '\n//# sourceURL=' + capabilityPath);
    let rejected = null;
    try {
      await OpenDeskCalculatorCapability.execute({
        schemaVersion: 1,
        kind: 'task',
        task: 'calculator.pressAndRead',
        buttons: ['2', '+', '2', '='],
        multiplier: '',
        message: 'live negative acceptance',
      });
    } catch (error) {
      rejected = {code: error && error.code, message: String(error && error.message || error)};
    }
    assert(rejected && rejected.code === 'UNSUPPORTED_CALCULATOR_LAYOUT', `expected safe layout rejection, got ${JSON.stringify(rejected)}`);
    report.rejected = rejected;
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = {name: error && error.name, code: error && error.code, message: String(error && error.message || error)};
    throw error;
  } finally {
    if (mouseDown) {
      try { await mouse.up({button: 'left'}); } catch (_) {}
    }
    if (original && resized) {
      try {
        const currentHandle = {x: resized.x + 1, y: resized.y + resized.height - 1};
        const originalHandle = {x: original.x + 1, y: original.y + original.height - 1};
        await mouse.move(currentHandle.x, currentHandle.y);
        await mouse.down({button: 'left'});
        mouseDown = true;
        await mouse.move(originalHandle.x, originalHandle.y, {durationMs: 250, curve: 'linear'});
        await mouse.up({button: 'left'});
        mouseDown = false;
        const restored = await window.get({title: 'Calculator', exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator'});
        assert(restored.width === original.width && restored.height === original.height,
          `Calculator layout was not restored: ${JSON.stringify(restored)}`);
      } catch (restoreError) {
        if (!report.error) report.error = {name: restoreError && restoreError.name, code: restoreError && restoreError.code, message: String(restoreError && restoreError.message || restoreError)};
      }
    }
    await File.writeJSON(evidencePath, report, {spaces: 2, createDirs: true});
    console.log('ASSISTANT_CALCULATOR_LAYOUT_FAILURE_LIVE=' + JSON.stringify(report));
  }
}
