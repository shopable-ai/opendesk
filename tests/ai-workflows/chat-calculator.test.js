import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_IDS,
  buildTrustedPreview,
  freezeTaskEnvelope,
  validateTaskEnvelope,
} from '../../examples/ai-workflows/chat-calculator/task-contract.js';
import {planTask} from '../../examples/ai-workflows/chat-calculator/planner.js';
import {createCalculatorAutomation} from '../../examples/ai-workflows/chat-calculator/calculator.js';
import {createTaskSession} from '../../examples/ai-workflows/chat-calculator/task-session.js';

function validSingle(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'task',
    task: TASK_IDS.PRESS_AND_READ,
    buttons: ['2', '5', '×', '4', '='],
    multiplier: '',
    message: '',
    ...overrides,
  };
}

function validTwo(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'task',
    task: TASK_IDS.TWO_STAGE,
    buttons: ['1', '2', '×', '3', '+', '4', '='],
    multiplier: '5',
    message: '',
    ...overrides,
  };
}

function abortError() {
  const error = new Error('canceled');
  error.name = 'AbortError';
  error.code = 'CANCELED';
  return error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

function displaySnapshot(values) {
  return {
    complete: true,
    truncated: false,
    root: {
      role: 'group',
      children: values.map((value) => ({role: 'staticText', value})),
    },
  };
}

function calculatorMock(options = {}) {
  const clicks = [];
  const progress = [];
  const controller = options.controller || null;
  let activeCalls = 0;
  const displayValues = [...(options.displayValues || ['100', '100'])];
  const target = {
    id: 'calc-window',
    pid: 42,
    title: 'Calculator',
    exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
    x: 100,
    y: 120,
    width: 232,
    height: 321,
  };

  const environment = {
    System: {getPlatformInfo: () => ({os: 'darwin'})},
    App: {launch: async () => ({bundleId: 'com.apple.calculator', pids: [42]})},
    window: {
      list: async () => [{...target}],
      getActiveWindow: async () => {
        activeCalls += 1;
        const moved = options.moveAfterActiveCall && activeCalls >= options.moveAfterActiveCall;
        return {...target, x: moved ? 360 : target.x, y: moved ? 240 : target.y};
      },
      bringToTop: async () => {},
    },
    Geometry: {
      pointOffset: (rect, x, y) => ({x: rect.x + x, y: rect.y + y}),
      rect: (rect) => ({x: rect.x, y: rect.y, width: rect.width, height: rect.height}),
      contains: (rect, point) => point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height,
    },
    mouse: {
      clickForPID: async (pid, x, y) => {
        clicks.push({pid, x, y});
        if (controller && options.abortAfterClick && clicks.length === options.abortAfterClick) controller.abort();
      },
    },
    Accessibility: {
      snapshot: async () => {
        const next = displayValues.length > 1 ? displayValues.shift() : displayValues[0];
        return Array.isArray(next) ? displaySnapshot(next) : displaySnapshot([next]);
      },
    },
    sleep: async () => {},
  };

  return {
    environment,
    clicks,
    progress,
    onProgress: async (event) => progress.push(event),
  };
}

test('task contract accepts both supported tasks and builds host-owned preview', () => {
  assert.equal(validateTaskEnvelope(validSingle()).task, TASK_IDS.PRESS_AND_READ);
  assert.equal(validateTaskEnvelope(validTwo()).task, TASK_IDS.TWO_STAGE);
  const preview = buildTrustedPreview(validTwo());
  assert.match(preview, /本次实际 firstResult/);
  assert.doesNotMatch(preview, /40/);
});

test('task contract rejects extra fields and action-bearing non-task branches', () => {
  assert.throws(() => validateTaskEnvelope({...validSingle(), command: 'rm -rf /'}), {code: 'UNKNOWN_FIELD'});
  assert.throws(() => validateTaskEnvelope({
    schemaVersion: 1,
    kind: 'unsupported',
    task: '',
    buttons: ['2', '+', '2', '='],
    multiplier: '',
    message: 'unsupported',
  }), {code: 'NON_TASK_ACTION'});
});

test('task contract rejects malformed expressions before desktop side effects', () => {
  assert.throws(() => validateTaskEnvelope(validSingle({buttons: ['+', '2', '=']})), {code: 'INVALID_EXPRESSION'});
  assert.throws(() => validateTaskEnvelope(validSingle({buttons: ['2', '+', '2', '=', '=']})), {code: 'INVALID_EQUALS'});
  assert.throws(() => validateTaskEnvelope(validSingle({buttons: ['2', '÷', '2', '=']})), {code: 'UNSUPPORTED_BUTTON'});
  assert.throws(() => validateTaskEnvelope(validSingle({buttons: [...'1234567890123', '+', '1', '=']})), {code: 'OPERAND_TOO_LONG'});
});

test('planner uses fixed Codex analysis profile and host revalidates result.data', async () => {
  let captured = null;
  const agent = {
    getCapabilities(options) {
      assert.deepEqual(options, {backend: 'codex', profile: 'codex-analysis'});
      return {supported: true, configured: true, executableFound: true};
    },
    async run(options) {
      captured = options;
      return {data: validTwo()};
    },
  };
  const planned = await planTask('先计算 12 乘 3 加 4，再把结果乘以 5', {agent});
  assert.equal(planned.task, TASK_IDS.TWO_STAGE);
  assert.equal(captured.backend, 'codex');
  assert.equal(captured.profile, 'codex-analysis');
  assert.equal(captured.output.type, 'json');
  assert.equal(captured.output.schema.additionalProperties, false);
  assert.equal(Object.prototype.hasOwnProperty.call(captured, 'args'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(captured, 'backendOptions'), false);

  const malicious = {
    ...agent,
    async run() { return {data: {...validSingle(), shell: 'open Calculator'}}; },
  };
  await assert.rejects(() => planTask('计算 25 乘 4', {agent: malicious}), {code: 'UNKNOWN_FIELD'});
});

test('twoStage re-enters the actual first display result instead of a fixed expected value', async () => {
  const mock = calculatorMock({displayValues: ['37', '37', '222', '222']});
  const automation = createCalculatorAutomation(mock.environment);
  const result = await automation.twoStage({
    buttons: ['1', '2', '×', '3', '+', '4', '='],
    multiplier: '6',
    onProgress: mock.onProgress,
  });
  assert.equal(result.firstResult, '37');
  assert.equal(result.finalResult, '222');
  assert.deepEqual(result.secondStageButtons, ['6', '×', '3', '7', '=']);
  const secondKeys = mock.progress
    .filter((event) => event.phase === 'click' && event.stage === 'second')
    .map((event) => event.key);
  assert.deepEqual(secondKeys.slice(-5), ['6', '×', '3', '7', '=']);
});

test('display ambiguity stops twoStage before any second-stage multiplication', async () => {
  const mock = calculatorMock({displayValues: [['37', '99']]});
  const automation = createCalculatorAutomation(mock.environment);
  await assert.rejects(() => automation.twoStage({
    buttons: ['2', '5', '×', '4', '='],
    multiplier: '6',
    onProgress: mock.onProgress,
  }), {code: 'DISPLAY_AMBIGUOUS'});
  assert.equal(mock.progress.some((event) => event.stage === 'second'), false);
});

test('each click recalculates screen coordinates from the current moved window', async () => {
  const mock = calculatorMock({displayValues: ['100', '100'], moveAfterActiveCall: 5});
  const automation = createCalculatorAutomation(mock.environment);
  await automation.pressAndRead({
    buttons: ['2', '5', '×', '4', '='],
    onProgress: mock.onProgress,
  });
  assert.ok(mock.clicks.some((click) => click.x < 360), 'expected clicks before the move');
  assert.ok(mock.clicks.some((click) => click.x > 360), 'expected clicks projected from the moved window');
});

test('abort after a submitted click prevents all later desktop actions', async () => {
  const controller = new AbortController();
  const mock = calculatorMock({controller, abortAfterClick: 1});
  const automation = createCalculatorAutomation(mock.environment);
  await assert.rejects(() => automation.pressAndRead({
    buttons: ['2', '5', '×', '4', '='],
    signal: controller.signal,
    onProgress: mock.onProgress,
  }), {code: 'CANCELED'});
  assert.equal(mock.clicks.length, 1);
});

test('task session invalidates edited confirmation and rejects stale execute', async () => {
  const states = [];
  const session = createTaskSession({
    plan: async () => validSingle(),
    preview: buildTrustedPreview,
    freeze: freezeTaskEnvelope,
    execute: async () => ({task: TASK_IDS.PRESS_AND_READ, result: '100'}),
    onState: async (state) => states.push(state),
  });
  const awaiting = await session.submit('计算 25 乘 4');
  assert.equal(awaiting.phase, 'awaitingConfirmation');
  await session.invalidateConfirmation();
  assert.equal(session.snapshot().phase, 'stopped');
  await assert.rejects(() => session.confirm(awaiting.taskId), {code: 'STALE_CONFIRMATION'});
});

test('task session allows only one execution for a confirmation', async () => {
  const gate = deferred();
  let executions = 0;
  const session = createTaskSession({
    plan: async () => validSingle(),
    preview: buildTrustedPreview,
    freeze: freezeTaskEnvelope,
    execute: async () => { executions += 1; return gate.promise; },
  });
  const awaiting = await session.submit('计算 25 乘 4');
  const first = session.confirm(awaiting.taskId);
  await assert.rejects(() => session.confirm(awaiting.taskId), {code: 'STALE_CONFIRMATION'});
  gate.resolve({task: TASK_IDS.PRESS_AND_READ, result: '100'});
  await first;
  assert.equal(executions, 1);
  assert.equal(session.snapshot().phase, 'completed');
});

test('late planner return after cancel cannot become confirmable', async () => {
  const gate = deferred();
  const session = createTaskSession({
    plan: async () => gate.promise,
    preview: buildTrustedPreview,
    freeze: freezeTaskEnvelope,
    execute: async () => ({task: TASK_IDS.PRESS_AND_READ, result: '100'}),
  });
  const submitting = session.submit('计算 25 乘 4');
  await Promise.resolve();
  assert.equal(session.snapshot().phase, 'planning');
  await session.cancel();
  assert.equal(session.snapshot().phase, 'stopping');
  gate.resolve(validSingle());
  await submitting;
  assert.equal(session.snapshot().phase, 'stopped');
  assert.equal(session.snapshot().envelope, null);
});

test('cancel during running publishes stopping then stopped and keeps session reusable', async () => {
  const phases = [];
  const session = createTaskSession({
    plan: async () => validSingle(),
    preview: buildTrustedPreview,
    freeze: freezeTaskEnvelope,
    execute: async (_envelope, context) => new Promise((_resolve, reject) => {
      if (context.signal.aborted) return reject(abortError());
      context.signal.addEventListener('abort', () => reject(abortError()), {once: true});
    }),
    onState: async (state) => phases.push(state.phase),
  });
  const awaiting = await session.submit('计算 25 乘 4');
  const running = session.confirm(awaiting.taskId);
  await Promise.resolve();
  await session.cancel();
  await running;
  assert.ok(phases.includes('stopping'));
  assert.equal(session.snapshot().phase, 'stopped');
  const next = await session.submit('再计算 25 乘 4');
  assert.equal(next.phase, 'awaitingConfirmation');
});
