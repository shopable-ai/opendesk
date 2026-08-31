const shared = {};
const common = File.read('tests/locateanything/scripts/common.js');
if (!common) {
  throw new Error('missing common runtime: tests/locateanything/scripts/common.js');
}
new Function('shared', common)(shared);

await shared.runStaticStage({
  stageId: 'stage_02_model_only',
  manifestPath: 'tests/locateanything/manifests/stage_02_model_cases.json',
  outputSubdir: 'stage_02_model_only',
  summaryPath: '.runtime/tests/locateanything/stage_02_model_only/summary.json',
  reportPath: '.runtime/tests/locateanything/reports/STAGE_02_MODEL_ONLY_REPORT.md'
});
