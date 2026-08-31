/**
 * Calculator 多步骤公式 Playbook runner（macOS）。
 *
 * 唯一动作计划位于同目录 PLAYBOOK.md 的严格 JSON contract；本文件只用
 * JSON.parse 读取它，绝不执行 Markdown。默认运行只做无点击自检。
 */

const PLAYBOOK_PATH = 'examples/mac/calculator_mouse_pid_formula_chain/PLAYBOOK.md';
const CONFIG_PATH = '.runtime/config/macos-calculator-formula-chain-live.json';
const ARM_TOKEN = 'RUN_CALCULATOR_FORMULA_CHAIN_ONCE';
const RUN_ROOT = '.runtime/runs/macos-calculator-formula-chain';

// 正常 STEPS 与主循环优先可见；按钮、状态与坐标均由 Playbook contract 提供。
const PLAYBOOK = readPlaybookContract();
const BUTTONS = PLAYBOOK.buttons;
const STEPS = PLAYBOOK.steps;
const EXPECTED_SEQUENCE = [PLAYBOOK.initialDisplay, ...STEPS.map((step) => step.after)];

async function main() {
  validatePlanAndAPIs();

  const config = readOptionalJSON(CONFIG_PATH);
  if (!config || config.execute !== true) {
    await runSelfTest(config);
    return;
  }

  await runFormula(config);
}

async function runSelfTest(config) {
  const runDir = `${RUN_ROOT}/selftest-${Date.now()}`;
  File.ensureDir(runDir);

  const report = {
    ok: true,
    mode: 'self-test-no-click',
    playbookPath: PLAYBOOK_PATH,
    playbookSchemaVersion: PLAYBOOK.schemaVersion,
    formula: PLAYBOOK.formula,
    normalSteps: STEPS.map((step) => ({
      step: step.number,
      operation: step.action,
      button: BUTTONS[step.target].label,
      before: step.before,
      after: step.after,
    })),
    expectedSequence: EXPECTED_SEQUENCE,
    liveConfigPresent: Boolean(config),
    actions_executed: 0,
    misclicks: 0,
    automatic_retries: 0,
    supplemental_clicks: 0,
    pointerMoved: false,
    desktopMutated: false,
    liveConfigExample: makeSafeConfigExample(),
    timestamp: new Date().toISOString(),
  };

  const reportPath = `${runDir}/selftest.json`;
  await writeJSON(reportPath, report);
  console.log('[calculator] Playbook self-test passed; no mouse action was performed');
  console.log(JSON.stringify({ reportPath, normalSteps: report.normalSteps }));
}

async function runFormula(config) {
  validateLiveConfig(config);
  File.ensureDir(config.runDir);
  refuseToOverwriteEvidence(config.runDir);

  const reportPath = `${config.runDir}/runtime-report.json`;
  const trace = [];
  const report = {
    ok: false,
    mode: 'live-formula-chain',
    playbookPath: PLAYBOOK_PATH,
    playbookSchemaVersion: PLAYBOOK.schemaVersion,
    formula: PLAYBOOK.formula,
    startedAt: new Date().toISOString(),
    expected: config.expected,
    stateSequence: [PLAYBOOK.initialDisplay],
    steps: [],
    screenshots: {},
    tracePath: `${config.runDir}/trace.ndjson`,
    actions_executed: 0,
    misclicks: 0,
    automatic_retries: 0,
    supplemental_clicks: 0,
    error: null,
  };

  try {
    console.log(`[calculator] live Playbook start: ${STEPS.map((step) => BUTTONS[step.target].label).join(' → ')}`);
    await recordTrace(config.runDir, trace, { type: 'live-start', expectedSequence: EXPECTED_SEQUENCE });
    await validateRuntimePreflight(config);
    await recordTrace(config.runDir, trace, { type: 'runtime-preflight-passed' });

    let lastSequence = 0;
    const initial = await waitForDisplay(config, PLAYBOOK.initialDisplay, lastSequence, true);
    lastSequence = initial.sequence;
    report.initialState = compactState(initial, STEPS[0].target);
    report.screenshots.pre = await takeCalculatorScreenshot(config, 'pre.png');
    await recordTrace(config.runDir, trace, { type: 'initial-state-verified', state: report.initialState });
    await writeJSON(reportPath, report);

    // 一个 JS runtime、一个主循环。每一 Step 只有下面这一处、一次 await AXPress 调用。
    for (const step of STEPS) {
      console.log(`[calculator] step ${step.number}/${STEPS.length}: ${step.action}`);
      const point = screenPoint(config.expected.window.bounds, step.target);
      const filePrefix = `step-${String(step.number).padStart(2, '0')}-${step.target}`;
      const stepReport = {
        number: step.number,
        operation: step.action,
        button: BUTTONS[step.target].label,
        expectedBefore: step.before,
        expectedAfter: step.after,
        operatorEffectVerifiedAtStep: step.verifyAt || null,
        verifiesOperatorAtStep: step.verifies || null,
        processID: config.expected.processID,
        windowID: config.expected.window.windowID,
        windowBounds: config.expected.window.bounds,
        relativePoint: BUTTONS[step.target].relative,
        screenPoint: point,
        actionStartedAtEpochMs: null,
        beforeState: null,
        afterState: null,
        ok: false,
        error: null,
      };
      report.steps.push(stepReport);

      try {
        // 每步动作前先读到一个新鲜、经完整 AX hit 校验的状态。
        const before = await waitForDisplay(config, step.before, lastSequence, false, step.target);
        lastSequence = before.sequence;
        stepReport.beforeState = compactState(before, step.target);
        stepReport.actionStartedAtEpochMs = Date.now();
        await recordTrace(config.runDir, trace, {
          type: 'action-started',
          step: step.number,
          target: step.target,
          point,
          actionStartedAtEpochMs: stepReport.actionStartedAtEpochMs,
        });

        await mouse.clickForPID(config.expected.processID, point.x, point.y);
        report.actions_executed += 1;

        // 动作后只接受 timestamp 严格晚于 action start 的 watcher 状态。
        const after = await waitForActionResult(
          config,
          step,
          lastSequence,
          stepReport.actionStartedAtEpochMs,
          report,
        );
        lastSequence = after.sequence;
        stepReport.afterState = compactState(after, step.target);
        stepReport.ok = true;
        report.stateSequence.push(after.mainDisplayValue);
        report.screenshots[filePrefix] = await takeCalculatorScreenshot(config, `${filePrefix}.png`);
        await recordTrace(config.runDir, trace, {
          type: 'action-verified',
          step: step.number,
          target: step.target,
          afterState: stepReport.afterState,
        });
        await writeJSON(`${config.runDir}/${filePrefix}.json`, stepReport);
        await writeJSON(reportPath, report);

        if (step.verifyAt) {
          console.log(`[calculator] ${BUTTONS[step.target].label} will be verified by step ${step.verifyAt}`);
        }
        console.log(`[calculator] display: ${before.mainDisplayValue} → ${after.mainDisplayValue}`);
      } catch (error) {
        stepReport.error = errorText(error);
        await recordTrace(config.runDir, trace, {
          type: 'step-failed',
          step: step.number,
          target: step.target,
          error: stepReport.error,
        });
        await writeJSON(`${config.runDir}/${filePrefix}.json`, stepReport);
        await writeJSON(reportPath, report);
        throw error;
      }
    }

    const finalState = await waitForDisplay(config, '52', lastSequence);
    report.finalState = compactState(finalState, 'equals');
    report.finalDisplay = finalState.mainDisplayValue;
    report.screenshots.final = await takeCalculatorScreenshot(config, 'final.png');
    report.completedAt = new Date().toISOString();
    report.ok = report.actions_executed === STEPS.length &&
      report.misclicks === 0 &&
      report.automatic_retries === 0 &&
      report.supplemental_clicks === 0 &&
      JSON.stringify(report.stateSequence) === JSON.stringify(EXPECTED_SEQUENCE) &&
      report.finalDisplay === '52';

    if (!report.ok) fail('final acceptance check failed', report);
    await recordTrace(config.runDir, trace, { type: 'acceptance-passed', finalDisplay: report.finalDisplay });
  } catch (error) {
    report.error = errorText(error);
    report.completedAt = new Date().toISOString();
    await recordTrace(config.runDir, trace, { type: 'run-failed', error: report.error });
    await writeJSON(reportPath, report);
    throw error;
  }

  await writeJSON(reportPath, report);
  console.log(`[calculator] formula completed: ${PLAYBOOK.formula}`);
  console.log(JSON.stringify({
    ok: report.ok,
    stateSequence: report.stateSequence,
    actions_executed: report.actions_executed,
    misclicks: report.misclicks,
    automatic_retries: report.automatic_retries,
    supplemental_clicks: report.supplemental_clicks,
    reportPath,
  }));
}

// All helpers and guards follow the normal flow above.
function readPlaybookContract() {
  if (typeof File !== 'object' || typeof File.read !== 'function') {
    fail('File.read is required to load the Playbook contract');
  }

  const markdown = File.read(PLAYBOOK_PATH);
  const match = String(markdown).match(/<!-- PLAYBOOK_CONTRACT\r?\n([\s\S]*?)\r?\n-->/);
  if (!match) fail('PLAYBOOK_CONTRACT marker is missing', PLAYBOOK_PATH);

  let playbook;
  try {
    playbook = JSON.parse(match[1]);
  } catch (error) {
    fail('PLAYBOOK_CONTRACT is not valid JSON', errorText(error));
  }
  validateStaticPlaybook(playbook);
  return playbook;
}

function validatePlanAndAPIs() {
  if (typeof mouse.clickForPID !== 'function' ||
      !page.mouse || typeof page.mouse.clickForPID !== 'function' ||
      typeof page.screenshot !== 'function' ||
      typeof page.waitForTimeout !== 'function' ||
      typeof page.checkPermissions !== 'function' ||
      typeof window.getActiveWindow !== 'function' ||
      typeof File.read !== 'function' || typeof File.write !== 'function') {
    fail('required runtime API is missing');
  }

  if ((12 + 7) * 3 - 5 !== 52 || EXPECTED_SEQUENCE[EXPECTED_SEQUENCE.length - 1] !== '52') {
    fail('formula plan is invalid');
  }
}

function validateStaticPlaybook(playbook) {
  const app = playbook && playbook.app;
  if (!playbook || playbook.schemaVersion !== 1 ||
      playbook.formula !== '((12 + 7) × 3) − 5 = 52' ||
      playbook.initialDisplay !== '0' || !app ||
      app.bundleID !== 'com.apple.calculator' ||
      app.bundlePath !== '/System/Applications/Calculator.app' ||
      !app.window || app.window.width !== 232 || app.window.height !== 321 ||
      !playbook.buttons || !Array.isArray(playbook.steps) || playbook.steps.length !== 11) {
    fail('Playbook contract has an unexpected Calculator shape', playbook);
  }

  for (let index = 0; index < playbook.steps.length; index += 1) {
    const step = playbook.steps[index];
    const button = playbook.buttons[step && step.target];
    const previous = index === 0 ? playbook.initialDisplay : playbook.steps[index - 1].after;
    if (!step || step.number !== index + 1 || typeof step.action !== 'string' ||
        step.before !== previous || typeof step.after !== 'string' || !button ||
        typeof button.label !== 'string' || !button.relative ||
        !Number.isFinite(button.relative.x) || !Number.isFinite(button.relative.y) ||
        !Array.isArray(button.axLabels) || button.axLabels.length === 0) {
      fail('Playbook steps or buttons are invalid', step);
    }
    if (step.verifyAt && (!Number.isInteger(step.verifyAt) || step.verifyAt <= step.number ||
        !playbook.steps[step.verifyAt - 1] || playbook.steps[step.verifyAt - 1].verifies !== step.number)) {
      fail('operator verification pair is invalid', step);
    }
  }
}

function validateLiveConfig(config) {
  const now = Date.now();
  if (config.schemaVersion !== 1 || config.execute !== true || config.armed !== ARM_TOKEN) {
    fail('live config is not explicitly armed');
  }
  if (!Number.isFinite(config.createdAtEpochMs) || !Number.isFinite(config.expiresAtEpochMs) ||
      now - config.createdAtEpochMs > 120000 || config.createdAtEpochMs > now + 1000 ||
      config.expiresAtEpochMs <= now || config.expiresAtEpochMs - config.createdAtEpochMs > 300000) {
    fail('live config is stale or has an invalid validity window');
  }
  if (typeof config.runDir !== 'string' || !config.runDir.startsWith(`${RUN_ROOT}/run-`) ||
      config.runDir.includes('..') || config.statePath !== `${config.runDir}/current-state.json`) {
    fail('live output paths are invalid');
  }

  const expected = config.expected;
  const bounds = expected && expected.window && expected.window.bounds;
  if (!expected || !Number.isInteger(expected.processID) || expected.processID <= 0 ||
      expected.bundleID !== PLAYBOOK.app.bundleID || expected.bundlePath !== PLAYBOOK.app.bundlePath ||
      !expected.window || !Number.isInteger(expected.window.windowID) || expected.window.windowID <= 0 ||
      !bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) ||
      bounds.width !== PLAYBOOK.app.window.width || bounds.height !== PLAYBOOK.app.window.height) {
    fail('Calculator identity or reviewed window is invalid');
  }
}

async function validateRuntimePreflight(config) {
  const permissions = await page.checkPermissions({
    capabilities: ['screenCapture', 'accessibility'],
  });
  const capabilities = permissions && permissions.permissions && permissions.permissions.capabilities;
  if (!permissions || permissions.ok !== true || !capabilities ||
      !capabilities.screenCapture || capabilities.screenCapture.granted !== true ||
      !capabilities.accessibility || capabilities.accessibility.granted !== true) {
    fail('screenCapture and accessibility permissions are required', permissions);
  }

  const active = await window.getActiveWindow();
  const pid = Number(active && (active.pid || active.processID || active.processId || 0));
  if (!active || pid !== config.expected.processID ||
      active.exePath !== config.expected.bundlePath ||
      !sameBounds(active, config.expected.window.bounds)) {
    fail('configured Calculator window is not the active window', active);
  }
}

async function waitForDisplay(config, expectedDisplay, afterSequence, requireFrontmost = false, target = 'one') {
  const started = Date.now();
  let lastState = null;

  while (Date.now() - started <= 1500) {
    const state = readWatcherState(config);
    lastState = state;
    if (state.sequence > afterSequence && Date.now() - state.timestampEpochMs <= 750) {
      validateState(state, config, requireFrontmost);
      if (state.mainDisplayValue === null) {
        await page.waitForTimeout(25);
        continue;
      }
      if (state.mainDisplayValue !== expectedDisplay) {
        fail(`expected display ${expectedDisplay}`, compactState(state, target));
      }
      return state;
    }
    await page.waitForTimeout(25);
  }

  fail(`timed out waiting for display ${expectedDisplay}`, lastState);
}

async function waitForActionResult(config, step, afterSequence, actionStartedAtEpochMs, report) {
  const started = Date.now();
  let lastState = null;

  while (Date.now() - started <= 1500) {
    const state = readWatcherState(config);
    lastState = state;
    if (state.sequence <= afterSequence || state.timestampEpochMs <= actionStartedAtEpochMs) {
      await page.waitForTimeout(25);
      continue;
    }

    validateState(state, config, false);
    const display = state.mainDisplayValue;
    if (display === step.after) return state;
    if (display === step.before && step.after !== step.before) {
      await page.waitForTimeout(25);
      continue;
    }

    report.misclicks += 1;
    fail(`unexpected display after step ${step.number}`, compactState(state, step.target));
  }

  fail(`timed out after step ${step.number}; expected ${step.after}`, lastState);
}

function validateState(state, config, requireFrontmost) {
  const expected = config.expected;
  const now = Date.now();
  if (!state || state.schemaVersion !== 1 || !Number.isFinite(state.sequence) ||
      !Number.isFinite(state.timestampEpochMs) || state.timestampEpochMs > now + 1000 ||
      now - state.timestampEpochMs > 750) {
    fail('watcher state is malformed or stale', state);
  }
  if (!state.permissions || state.permissions.screenCapture !== true ||
      state.permissions.accessibility !== true) {
    fail('required permissions changed', state.permissions);
  }

  const app = state.application;
  if (!app || app.available !== true || app.terminated !== false ||
      app.pid !== expected.processID || app.bundleID !== expected.bundleID ||
      app.bundlePath !== expected.bundlePath) {
    fail('Calculator PID, bundle ID, or path changed', app);
  }
  if (!Array.isArray(state.windows) || state.windows.length !== 1) {
    fail('expected exactly one Calculator window', state.windows);
  }

  const currentWindow = state.windows[0];
  if (currentWindow.windowID !== expected.window.windowID ||
      currentWindow.ownerPID !== expected.processID ||
      !sameBounds(currentWindow.bounds, expected.window.bounds)) {
    fail('Calculator window number or bounds changed', currentWindow);
  }
  if (!Array.isArray(state.displays) || state.displays.length === 0) {
    fail('no active displays reported');
  }

  for (const target of new Set(STEPS.map((step) => step.target))) {
    const point = screenPoint(currentWindow.bounds, target);
    if (!inside(point, currentWindow.bounds) ||
        !state.displays.some((display) => display && inside(point, display.bounds))) {
      fail(`${target} point is outside the window or active displays`, point);
    }
    validateHit(state.hits && state.hits[target], target, expected, point);
  }

  if (requireFrontmost) {
    const frontmost = state.frontmost;
    if (!frontmost || frontmost.pid !== expected.processID ||
        frontmost.bundleID !== expected.bundleID || frontmost.bundlePath !== expected.bundlePath ||
        app.active !== true) {
      fail('Calculator is not frontmost at preflight', frontmost);
    }
  }
}

function validateHit(hit, target, expected, point) {
  const accepted = BUTTONS[target].axLabels;
  const labels = [String(hit && hit.title || '').trim(), String(hit && hit.description || '').trim()];
  if (!hit || hit.error !== 0 || hit.pidError !== 0 || hit.pid !== expected.processID ||
      hit.role !== 'AXButton' || hit.supportsAXPress !== true ||
      !Array.isArray(hit.actions) || !hit.actions.includes('AXPress') ||
      !labels.some((label) => accepted.includes(label)) ||
      Number(hit.x) !== point.x || Number(hit.y) !== point.y) {
    fail(`AX hit validation failed for ${target}`, hit);
  }
}

function makeSafeConfigExample() {
  const runDir = `${RUN_ROOT}/run-YYYYMMDDHHMMSS`;
  return {
    schemaVersion: 1,
    execute: false,
    armed: '',
    createdAtEpochMs: 'fresh Date.now() value',
    expiresAtEpochMs: 'createdAtEpochMs + at most 300000',
    runDir,
    statePath: `${runDir}/current-state.json`,
    expected: {
      processID: 'fresh Calculator PID',
      bundleID: PLAYBOOK.app.bundleID,
      bundlePath: PLAYBOOK.app.bundlePath,
      window: {
        windowID: 'fresh Calculator window ID',
        bounds: { x: 'fresh x', y: 'fresh y', width: PLAYBOOK.app.window.width, height: PLAYBOOK.app.window.height },
      },
    },
  };
}

function refuseToOverwriteEvidence(runDir) {
  const paths = [`${runDir}/runtime-report.json`, `${runDir}/trace.ndjson`, `${runDir}/pre.png`, `${runDir}/final.png`];
  for (const step of STEPS) {
    const prefix = `step-${String(step.number).padStart(2, '0')}-${step.target}`;
    paths.push(`${runDir}/${prefix}.json`, `${runDir}/${prefix}.png`);
  }
  const existing = paths.filter((path) => File.exists(path));
  if (existing.length > 0) fail('refusing to overwrite existing evidence', existing);
}

function readWatcherState(config) {
  const state = readOptionalJSON(config.statePath);
  if (!state) fail('watcher state file is missing', config.statePath);
  return state;
}

function readOptionalJSON(path) {
  if (!File.exists(path)) return null;
  try {
    return JSON.parse(File.read(path));
  } catch (error) {
    fail(`invalid JSON: ${path}`, errorText(error));
  }
}

function screenPoint(bounds, target) {
  const relative = BUTTONS[target].relative;
  return { x: bounds.x + relative.x, y: bounds.y + relative.y };
}

function inside(point, bounds) {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width &&
    point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

function sameBounds(actual, expected) {
  return Boolean(actual) && ['x', 'y', 'width', 'height'].every(
    (key) => Number(actual[key]) === Number(expected[key]),
  );
}

function compactState(state, target) {
  return {
    sequence: state.sequence,
    timestamp: state.timestamp,
    timestampEpochMs: state.timestampEpochMs,
    mainDisplayValue: state.mainDisplayValue,
    application: state.application,
    frontmost: state.frontmost,
    window: state.windows && state.windows[0],
    targetHit: state.hits && state.hits[target],
  };
}

async function takeCalculatorScreenshot(config, fileName) {
  return page.screenshot({
    clip: config.expected.window.bounds,
    path: `${config.runDir}/${fileName}`,
    returnType: 'object',
  });
}

async function recordTrace(runDir, trace, event) {
  trace.push({ timestamp: new Date().toISOString(), ...event });
  await File.write(`${runDir}/trace.ndjson`, `${trace.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

async function writeJSON(path, value) {
  await File.write(path, JSON.stringify(value, null, 2));
}

function errorText(error) {
  return String(error && (error.stack || error.message) || error);
}

function fail(message, details) {
  const suffix = details === undefined ? '' : `: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

await main();
