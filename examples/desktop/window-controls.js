// From the repository root, with an exact test-window title and PID:
// OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 ./opendesk -script examples/desktop/window-controls.js -console-mode script
// Nudges a normal, non-maximized/non-fullscreen test window by 20 points, verifies bounds, then restores bounds.
// Does not minimize, maximize, close, kill, focus or change always-on-top state. Bounds restoration is not full UI restoration.
'use strict';
if (Execution.env.OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE !== '1') throw new Error('Set OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 for a disposable normal window');
const createGuard = (0, eval)(File.read(File.join(File.cwd(), 'examples/desktop/support/target-window.js')));
const guard = createGuard();
guard.requireCapability('window.setBounds');
guard.requireCapability('window.getBounds');
const target = await guard.select();
const initial = await guard.current(target);
const saved = { x: initial.x, y: initial.y, width: initial.width, height: initial.height };
if (![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite) || saved.width <= 0 || saved.height <= 0) {
  throw new Error('Window example requires valid initial bounds');
}
const desired = { ...saved, x: saved.x + 20 };
const near = (actual, expected) => Object.keys(expected).every(key => Number.isFinite(actual[key]) && Math.abs(actual[key] - expected[key]) <= 2);
async function waitBounds(expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const info = await guard.current(target);
    if (near(info, expected)) return;
    await page.waitForTimeout(50);
  }
  throw new Error('Window example: bounds verification timed out');
}
let attempted = false;
let primary = null;
let restoration = null;
let restoreState = 'not-attempted';
try {
  await guard.current(target);
  attempted = true; // Restore even if the backend changes bounds and then throws.
  await window.setWindowBounds(target.title, desired.x, desired.y, desired.width, desired.height);
  await waitBounds(desired);
} catch (error) { primary = error; }
finally {
  if (attempted) {
    try {
      const now = await guard.current(target);
      if (!near(now, saved)) {
        // Do not overwrite an independently moved/recreated window with a stale snapshot.
        if (!near(now, desired)) throw new Error('Bounds changed independently; automatic restore refused');
        await window.setWindowBounds(target.title, saved.x, saved.y, saved.width, saved.height);
        await waitBounds(saved);
      }
      restoreState = 'verified';
    } catch (error) { restoration = error; restoreState = 'failed; inspect the window manually'; }
  }
}
if (primary || restoration) {
  const failure = new Error('Window example failed; operation=' + (primary ? 'failed' : 'completed') + ', boundsRestore=' + restoreState);
  failure.operationError = primary;
  failure.restoreError = restoration;
  throw failure;
}
console.log('[WINDOW-CONTROLS] passed; requested and original bounds verified');
