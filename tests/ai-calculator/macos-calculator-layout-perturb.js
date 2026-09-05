// Test-only Calculator layout perturbation for scripts/test_ai_calculator_recipe.sh.
// It uses the existing JavaScript Runtime to select Scientific mode (Command+2),
// verifies a real bounds change on the same PID/window identity, and leaves the
// window in that state so a fresh recipe execution must recover Basic mode.

const BUNDLE_ID = 'com.apple.calculator';
const BASIC_SIZE = Object.freeze({ width: 232, height: 321, tolerance: 2 });
const SCIENTIFIC_SIZE = Object.freeze({ width: 574, height: 321, tolerance: 2 });

function message(error) {
  return String(error && error.message ? error.message : error);
}

function bounds(windowInfo) {
  return {
    x: Number(windowInfo.x),
    y: Number(windowInfo.y),
    width: Number(windowInfo.width),
    height: Number(windowInfo.height),
  };
}

function near(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function pressCalculatorModeShortcut(key) {
  await keyboard.down('Meta');
  try {
    await keyboard.press(key);
  } finally {
    await keyboard.up('Meta');
  }
  await page.waitForTimeout(500);
}

async function main() {
  const document = {
    executionId: Execution.id,
    application: { bundleId: BUNDLE_ID, pid: 0, windowTitle: '' },
    shortcut: 'Meta+2',
    beforeBounds: null,
    afterBounds: null,
    changed: false,
    passed: false,
  };
  const resultPath = File.join(Execution.artifactDir, 'calculator-layout-perturb.json');
  let switched = false;

  try {
    await page.ensurePermissions({
      capabilities: ['screenCapture', 'accessibility'],
      openSettings: false,
    });
    const app = await App.launch(
      { bundleId: BUNDLE_ID },
      { waitUntilReady: 'window', timeout: 15000 },
    );
    const pids = new Set(app.pids.map(Number));
    const matches = (await window.list()).filter(item => pids.has(Number(item.pid)));
    if (matches.length !== 1) {
      throw new Error(`Calculator layout perturbation expected one PID-group window, found ${matches.length}`);
    }
    const target = matches[0];
    document.application.pid = Number(target.pid);
    document.application.windowTitle = String(target.title || '');
    document.beforeBounds = bounds(target);
    if (
      !near(target.width, BASIC_SIZE.width, BASIC_SIZE.tolerance)
      || !near(target.height, BASIC_SIZE.height, BASIC_SIZE.tolerance)
    ) {
      throw new Error(`Calculator must start this perturbation in verified Basic ${BASIC_SIZE.width}x${BASIC_SIZE.height}`);
    }

    await window.focus(target.title);
    await page.waitForTimeout(250);
    const active = await window.getActiveWindow();
    if (!active || Number(active.pid) !== Number(target.pid) || String(active.id) !== String(target.id)) {
      throw new Error('Calculator was not the verified active PID/window before layout perturbation');
    }

    await pressCalculatorModeShortcut('2');
    switched = true;
    const afterMatches = (await window.list()).filter(item => pids.has(Number(item.pid)));
    if (afterMatches.length !== 1) {
      throw new Error(`Calculator window became ambiguous after layout perturbation: ${afterMatches.length}`);
    }
    const after = afterMatches[0];
    document.afterBounds = bounds(after);
    if (Number(after.pid) !== Number(target.pid) || String(after.id) !== String(target.id)) {
      throw new Error('Calculator PID/window lifecycle identity changed during layout perturbation');
    }
    if (
      !near(after.width, SCIENTIFIC_SIZE.width, SCIENTIFIC_SIZE.tolerance)
      || !near(after.height, SCIENTIFIC_SIZE.height, SCIENTIFIC_SIZE.tolerance)
    ) {
      throw new Error(
        `Command+2 did not produce the verified Scientific ${SCIENTIFIC_SIZE.width}x${SCIENTIFIC_SIZE.height} layout; observed ${after.width}x${after.height}`,
      );
    }
    document.changed = after.width !== target.width || after.height !== target.height;
    if (!document.changed) throw new Error('Calculator layout perturbation did not change window bounds');

    const screenshot = await page.screenshot({
      clip: document.afterBounds,
      path: File.join(Execution.artifactDir, 'calculator-window-scientific.png'),
      returnType: 'object',
    });
    if (!screenshot || Number(screenshot.width) !== Math.round(after.width) || Number(screenshot.height) !== Math.round(after.height)) {
      throw new Error('Scientific Calculator screenshot does not match perturbed bounds');
    }
    document.screenshot = screenshot.path;
    document.passed = true;
    File.write(resultPath, JSON.stringify(document, null, 2) + '\n');
    console.log(JSON.stringify({
      executionId: Execution.id,
      artifactDir: Execution.artifactDir,
      beforeBounds: document.beforeBounds,
      afterBounds: document.afterBounds,
      passed: true,
    }));
    return document;
  } catch (error) {
    document.error = message(error);
    if (switched) {
      try {
        await pressCalculatorModeShortcut('1');
        document.failureCleanup = 'select-basic-with-command-1';
      } catch (cleanupError) {
        document.failureCleanupError = message(cleanupError);
      }
    }
    File.write(resultPath, JSON.stringify(document, null, 2) + '\n');
    throw error;
  }
}

main();
