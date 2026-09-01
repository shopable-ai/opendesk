/**
 * Calculator 多步骤公式示例（macOS）
 *
 * 正常操作步骤：
 *   1. 确认 Calculator 当前显示为 0。
 *   2. 点击 1、2，输入 12。
 *   3. 点击 +，再点击 7 和 =，得到 19。
 *   4. 点击 ×，再点击 3 和 =，得到 57。
 *   5. 点击 −，再点击 5 和 =，得到 52。
 *
 * 实际按钮顺序：1 → 2 → + → 7 → = → × → 3 → = → − → 5 → =
 * 公式：((12 + 7) × 3) − 5 = 52
 *
 * 默认直接运行只做安全自检，不移动鼠标、不点击：
 *   .runtime/bin/opendesk-js-runtime \
 *     -script examples/mac/calculator_mouse_pid_formula_chain.js
 *
 * 只有 `.runtime/config/macos-calculator-formula-chain-live.json` 存在、
 * execute=true、armed token 正确且配置仍在短时有效期内，才进入 live 模式。
 * live 模式还要求只读 AX watcher 持续原子更新 current-state.json。
 */

const CONFIG_PATH = '.runtime/config/macos-calculator-formula-chain-live.json';
const ARM_TOKEN = 'RUN_CALCULATOR_FORMULA_CHAIN_ONCE';
const RUN_ROOT = '.runtime/runs/macos-calculator-formula-chain';
const WINDOW_SIZE = { width: 232, height: 321 };

// 坐标都是相对于当前 Calculator 窗口左上角的已审查坐标。
const BUTTONS = {
  one:      { label: '1', relative: { x: 28,  y: 249 }, axLabels: ['1'] },
  two:      { label: '2', relative: { x: 86,  y: 249 }, axLabels: ['2'] },
  add:      { label: '+', relative: { x: 202, y: 249 }, axLabels: ['+', 'Add', '加'] },
  seven:    { label: '7', relative: { x: 28,  y: 153 }, axLabels: ['7'] },
  equals:   { label: '=', relative: { x: 202, y: 297 }, axLabels: ['=', 'Equals', '等于'] },
  multiply: { label: '×', relative: { x: 202, y: 153 }, axLabels: ['*', 'x', 'X', '×', 'Multiply', '乘'] },
  three:    { label: '3', relative: { x: 144, y: 249 }, axLabels: ['3'] },
  subtract: { label: '−', relative: { x: 202, y: 201 }, axLabels: ['-', '−', 'Subtract', '减'] },
  five:     { label: '5', relative: { x: 86,  y: 201 }, axLabels: ['5'] },
};

// 这一张表就是脚本会执行的正常操作流程。
const STEPS = [
  { number: 1,  action: '输入 1', target: 'one',      before: '0',  after: '1' },
  { number: 2,  action: '输入 2，组成 12', target: 'two', before: '1', after: '12' },
  { number: 3,  action: '选择加法', target: 'add',     before: '12', after: '12', verifyAt: 4 },
  { number: 4,  action: '输入第二个加数 7', target: 'seven', before: '12', after: '7', verifies: 3 },
  { number: 5,  action: '计算 12 + 7', target: 'equals', before: '7', after: '19' },
  { number: 6,  action: '选择乘法', target: 'multiply', before: '19', after: '19', verifyAt: 7 },
  { number: 7,  action: '输入乘数 3', target: 'three',   before: '19', after: '3', verifies: 6 },
  { number: 8,  action: '计算 19 × 3', target: 'equals', before: '3', after: '57' },
  { number: 9,  action: '选择减法', target: 'subtract', before: '57', after: '57', verifyAt: 10 },
  { number: 10, action: '输入减数 5', target: 'five',    before: '57', after: '5', verifies: 9 },
  { number: 11, action: '计算 57 − 5', target: 'equals', before: '5', after: '52' },
];

const EXPECTED_SEQUENCE = ['0', ...STEPS.map((step) => step.after)];

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
    formula: '((12 + 7) × 3) − 5 = 52',
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
  console.log('[calculator] self-test passed; no mouse action was performed');
  console.log(JSON.stringify({ reportPath, normalSteps: report.normalSteps }));
}

async function runFormula(config) {
  validateLiveConfig(config);
  File.ensureDir(config.runDir);
  refuseToOverwriteEvidence(config.runDir);

  const reportPath = `${config.runDir}/runtime-report.json`;
  const report = {
    ok: false,
    mode: 'live-formula-chain',
    formula: '((12 + 7) × 3) − 5 = 52',
    startedAt: new Date().toISOString(),
    expected: config.expected,
    stateSequence: ['0'],
    steps: [],
    screenshots: {},
    actions_executed: 0,
    misclicks: 0,
    automatic_retries: 0,
    supplemental_clicks: 0,
    error: null,
  };

  try {
    console.log('[calculator] live formula start: 1 → 2 → + → 7 → = → × → 3 → = → − → 5 → =');
    await validateRuntimePreflight(config);

    let lastSequence = 0;
    const initial = await waitForDisplay(config, '0', lastSequence, true);
    lastSequence = initial.sequence;
    report.initialState = compactState(initial, 'one');
    report.screenshots.pre = await takeCalculatorScreenshot(config, 'pre.png');
    await writeJSON(reportPath, report);

    // 一个 JS runtime、一个循环；每个动作都只调用一次并且必须 await。
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
        const before = await waitForDisplay(config, step.before, lastSequence, false, step.target);
        lastSequence = before.sequence;
        stepReport.beforeState = compactState(before, step.target);
        stepReport.actionStartedAtEpochMs = Date.now();

        await mouse.clickForPID(config.expected.processID, point.x, point.y);
        report.actions_executed += 1;

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
        await writeJSON(`${config.runDir}/${filePrefix}.json`, stepReport);
        await writeJSON(reportPath, report);

        if (step.verifyAt) {
          console.log(`[calculator] ${BUTTONS[step.target].label} will be verified by step ${step.verifyAt}`);
        }
        console.log(`[calculator] display: ${before.mainDisplayValue} → ${after.mainDisplayValue}`);
      } catch (error) {
        stepReport.error = errorText(error);
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
  } catch (error) {
    report.error = errorText(error);
    report.completedAt = new Date().toISOString();
    await writeJSON(reportPath, report);
    throw error;
  }

  await writeJSON(reportPath, report);
  console.log('[calculator] formula completed: ((12 + 7) × 3) − 5 = 52');
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

  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    const previous = index === 0 ? '0' : STEPS[index - 1].after;
    if (step.number !== index + 1 || step.before !== previous || !BUTTONS[step.target]) {
      fail('step plan is not continuous', step);
    }
    if (step.verifyAt && STEPS[step.verifyAt - 1].verifies !== step.number) {
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
      expected.bundleID !== 'com.apple.calculator' ||
      expected.bundlePath !== '/System/Applications/Calculator.app' ||
      !expected.window || !Number.isInteger(expected.window.windowID) || expected.window.windowID <= 0 ||
      !bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) ||
      bounds.width !== WINDOW_SIZE.width || bounds.height !== WINDOW_SIZE.height) {
    fail('Calculator identity or reviewed 232x321 window is invalid');
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

    // 对应该有可见变化的动作，短暂保留 before 值时继续只读等待。
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
      bundleID: 'com.apple.calculator',
      bundlePath: '/System/Applications/Calculator.app',
      window: {
        windowID: 'fresh Calculator window ID',
        bounds: { x: 'fresh x', y: 'fresh y', width: 232, height: 321 },
      },
    },
  };
}

function refuseToOverwriteEvidence(runDir) {
  const paths = [`${runDir}/runtime-report.json`, `${runDir}/pre.png`, `${runDir}/final.png`];
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
