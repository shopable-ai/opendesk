// Test-only Calculator layout perturbation for scripts/test_ai_calculator_recipe.js.
// It uses the existing Window, Page, Vision, and Mouse Runtime APIs to select a
// real Calculator menu item, verifies the new bounds on the same identity, and
// leaves the window in that state so a fresh Workflow execution must recover it.

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

function roundedScreenRegion(region) {
  return { x: Math.round(region.x), y: Math.round(region.y), width: Math.max(1, Math.round(region.width)), height: Math.max(1, Math.round(region.height)) };
}

async function clickOCRMenuText(label, screenshotName, display) {
  const menuScope = Geometry.regionOffset(display, { left: 0, top: 0, width: display.width, height: label === '显示' ? 50 : 180 });
  const clip = roundedScreenRegion(menuScope);
  const imagePath = File.join(Execution.artifactDir, screenshotName);
  await page.screenshot({ clip, path: imagePath, returnType: 'path' });
  const ocr = await Vision.runOCR({ imagePath, provider: 'apple', lang: 'ch' });
  const matches = (ocr.lines || []).filter(line => String(line.text || '').includes(label));
  if (matches.length === 0) throw new Error(`Expected an OCR menu line for ${label}, found none`);
  const minY = Math.min(...matches.map(line => Number(line.bbox && line.bbox.y)));
  const topMatches = matches.filter(line => Math.abs(Number(line.bbox && line.bbox.y) - minY) <= 4);
  if (topMatches.length !== 1) throw new Error(`Expected one topmost OCR menu line for ${label}, found ${topMatches.length} of ${matches.length}`);
  const line = topMatches[0];
  const text = String(line.text);
  const start = text.indexOf(label);
  const charWidth = Number(line.bbox.width) / text.length;
  const point = {
    x: clip.x + Number(line.bbox.x) + charWidth * (start + label.length / 2),
    y: clip.y + Number(line.bbox.y) + Number(line.bbox.height) / 2,
  };
  if (![point.x, point.y].every(Number.isFinite)) throw new Error(`OCR menu point for ${label} is not finite`);
  await mouse.click(point.x, point.y);
  await page.waitForTimeout(220);
  return point;
}

async function selectCalculatorViewOption(label, display) {
  const optionIndex = { '标准型': 0, '科学型': 1 }[label];
  if (optionIndex === undefined) throw new Error(`Unsupported Calculator View option ${label}`);
  const menuPoint = await clickOCRMenuText('显示', 'calculator-view-menu-before.png', display);
  const openMenu = roundedScreenRegion(Geometry.regionOffset(display, { left: 0, top: 0, width: display.width, height: 180 }));
  await page.screenshot({ clip: openMenu, path: File.join(Execution.artifactDir, 'calculator-view-menu-open.png'), returnType: 'path' });
  const optionPoint = { x: menuPoint.x + 20, y: menuPoint.y + 27 + optionIndex * 23 };
  await mouse.click(optionPoint.x, optionPoint.y);
  await page.waitForTimeout(220);
}

async function main() {
  const document = {
    executionId: Execution.id,
    application: { bundleId: BUNDLE_ID, pid: 0, windowTitle: '' },
    resize: 'Vision.runOCR(top display menu ROI) -> mouse.click(显示/科学型)',
    beforeBounds: null,
    afterBounds: null,
    changed: false,
    passed: false,
  };
  const resultPath = File.join(Execution.artifactDir, 'calculator-layout-perturb.json');
  let switched = false;
  let target = null;

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
    target = matches[0];
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

    await keyboard.press('ESC');
    await page.waitForTimeout(120);
    const center = Geometry.center(target);
    const display = Screen.getDisplays().find(item => Geometry.contains(Geometry.rect(item), center));
    if (!display) throw new Error('Calculator window is not inside an identifiable display');
    await selectCalculatorViewOption('科学型', display);
    await page.waitForTimeout(250);
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
        `Calculator View->Scientific did not produce ${SCIENTIFIC_SIZE.width}x${SCIENTIFIC_SIZE.height}; observed ${after.width}x${after.height}`,
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
      throw new Error('Resized Calculator screenshot does not match perturbed bounds');
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
        const cleanupCenter = Geometry.center(target);
        const cleanupDisplay = Screen.getDisplays().find(item => Geometry.contains(Geometry.rect(item), cleanupCenter));
        if (!cleanupDisplay) throw new Error('Calculator cleanup display could not be identified');
        await selectCalculatorViewOption('标准型', cleanupDisplay);
        document.failureCleanup = 'select-basic-with-view-menu';
      } catch (cleanupError) {
        document.failureCleanupError = message(cleanupError);
      }
    }
    File.write(resultPath, JSON.stringify(document, null, 2) + '\n');
    throw error;
  }
}

main();
