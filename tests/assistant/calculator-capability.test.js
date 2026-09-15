import assert from 'node:assert/strict';
import test from 'node:test';

await import('../../apps/opendesk/capabilities/calculator.js');

const Calculator = globalThis.OpenDeskCalculatorCapability;

function calculatorEnvironment(displayValues, options = {}) {
  const clicks = [];
  const target = {
    id: 'calculator-window',
    pid: 4242,
    title: 'Calculator',
    exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
    x: 120,
    y: 140,
    width: options.width || 232,
    height: options.height || 321,
  };
  let read = 0;
  const environment = {
    System: {getPlatformInfo: () => ({os: 'darwin'})},
    App: {launch: async () => ({bundleId: 'com.apple.calculator'})},
    window: {
      list: async () => [{...target}],
      getActiveWindow: async () => ({...target}),
      bringToTop: async () => {},
    },
    Geometry: {
      pointOffset: (rect, x, y) => ({x: rect.x + x, y: rect.y + y}),
      rect: rect => ({x: rect.x, y: rect.y, width: rect.width, height: rect.height}),
      contains: (rect, point) => point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height,
    },
    mouse: {
      clickForPID: async (pid, x, y) => {
        clicks.push({pid, x, y});
        if (options.abortController && clicks.length === options.abortAfterClick) options.abortController.abort();
      },
    },
    Accessibility: {
      snapshot: async () => ({
        complete: true,
        truncated: false,
        root: {role: 'group', children: [{role: 'staticText', value: displayValues[Math.min(read++, displayValues.length - 1)]}]},
      }),
    },
    sleep: async () => {},
  };
  return {environment, clicks};
}

test('product Calculator capability takes its second-stage digits from a first result actually read from UI', async () => {
  const fixture = calculatorEnvironment(['110', '110', '660', '660']);
  const automation = Calculator.create(fixture.environment);
  const progress = [];
  const result = await automation.twoStage({
    buttons: ['2', '5', '×', '4', '+', '1', '0', '='],
    multiplier: '6',
    onProgress: async event => progress.push(event),
  });
  assert.equal(result.firstResult, '110');
  assert.equal(result.finalResult, '660');
  assert.deepEqual(result.secondStageButtons, ['6', '×', '1', '1', '0', '=']);
  assert.deepEqual(progress.filter(event => event.phase === 'click' && event.stage === 'second').map(event => event.key).slice(-6), ['6', '×', '1', '1', '0', '=']);
});

test('product Calculator capability refuses a non-qualified layout before any mouse action', async () => {
  const fixture = calculatorEnvironment(['0'], {width: 360, height: 480});
  const automation = Calculator.create(fixture.environment);
  await assert.rejects(() => automation.pressAndRead({buttons: ['2', '+', '2', '=']}), {code: 'UNSUPPORTED_CALCULATOR_LAYOUT'});
  assert.equal(fixture.clicks.length, 0);
});

test('product Calculator capability checks cancellation after each submitted click before another desktop action', async () => {
  const controller = new AbortController();
  const fixture = calculatorEnvironment(['110'], {abortController: controller, abortAfterClick: 1});
  const automation = Calculator.create(fixture.environment);
  await assert.rejects(() => automation.pressAndRead({
    buttons: ['2', '5', '×', '4', '+', '1', '0', '='],
    signal: controller.signal,
  }), {code: 'CANCELED'});
  assert.equal(fixture.clicks.length, 1);
});
