'use strict';

// Explicit live acceptance for the product-owned Calculator capability.
// Run from repository root:
// OPENDESK_ASSISTANT_LIVE_CALCULATOR=authorized ./dist/opendesk -script tests/assistant/calculator-live-macos.js -console-mode script

const enabled = Execution.env.OPENDESK_ASSISTANT_LIVE_CALCULATOR === 'authorized';
const evidencePath = File.join(Execution.workdir, '.runtime', 'tests', 'assistant-p0.2', 'calculator-live.json');
const report = {status: enabled ? 'running' : 'skipped', single: null, twoStage: null, progress: [], error: null};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!enabled) {
  console.log('ASSISTANT_CALCULATOR_LIVE=' + JSON.stringify(report));
} else {
  try {
    const capabilityPath = File.join(Execution.workdir, 'apps', 'opendesk', 'capabilities', 'calculator.js');
    (0, eval)(File.read(capabilityPath) + '\n//# sourceURL=' + capabilityPath);
    assert(globalThis.OpenDeskCalculatorCapability, 'product Calculator capability did not load');

    const single = await OpenDeskCalculatorCapability.execute({
      schemaVersion: 1,
      kind: 'task',
      task: 'calculator.pressAndRead',
      buttons: ['2', '5', '×', '4', '+', '1', '0', '='],
      multiplier: '',
      message: 'live acceptance',
    }, {
      onProgress: async event => report.progress.push({run: 'single', ...event}),
    });
    assert(single && single.result === '110', `Calculator UI read ${JSON.stringify(single && single.result)}, expected 110`);
    report.single = single;

    const twoStage = await OpenDeskCalculatorCapability.execute({
      schemaVersion: 1,
      kind: 'task',
      task: 'calculator.twoStage',
      buttons: ['2', '5', '×', '4', '+', '1', '0', '='],
      multiplier: '6',
      message: 'live acceptance',
    }, {
      onProgress: async event => report.progress.push({run: 'twoStage', ...event}),
    });
    assert(twoStage && twoStage.firstResult === '110', `first Calculator UI read was ${JSON.stringify(twoStage && twoStage.firstResult)}, expected 110`);
    assert(twoStage && twoStage.finalResult === '660', `final Calculator UI read was ${JSON.stringify(twoStage && twoStage.finalResult)}, expected 660`);
    assert(JSON.stringify(twoStage.secondStageButtons) === JSON.stringify(['6', '×', '1', '1', '0', '=']),
      `second stage did not bind actual firstResult: ${JSON.stringify(twoStage && twoStage.secondStageButtons)}`);
    report.twoStage = twoStage;
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = {name: error && error.name, code: error && error.code, message: String(error && error.message || error)};
    throw error;
  } finally {
    await File.writeJSON(evidencePath, report, {spaces: 2, createDirs: true});
    console.log('ASSISTANT_CALCULATOR_LIVE=' + JSON.stringify({
      status: report.status,
      single: report.single,
      twoStage: report.twoStage,
      error: report.error,
    }));
  }
}
