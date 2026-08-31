const shared = {};
const common = File.read('tests/locateanything/scripts/common.js');
if (!common) {
  throw new Error('missing common runtime: tests/locateanything/scripts/common.js');
}
new Function('shared', common)(shared);

await shared.runStaticStage({
  stageId: 'stage_04_boundary_stress',
  manifestPath: 'tests/locateanything/manifests/stage_04_boundary_cases.json',
  outputSubdir: 'stage_04_boundary_stress',
  summaryPath: '.runtime/tests/locateanything/stage_04_boundary_stress/summary.json',
  reportPath: '.runtime/tests/locateanything/reports/STAGE_04_BOUNDARY_STRESS_REPORT.md'
});
