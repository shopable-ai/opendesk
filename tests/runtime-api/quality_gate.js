(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');
RuntimeAPITest.load('tests/runtime-api/acceptance.js');

const assessment = RuntimeAPIAcceptance.acceptance();
const summary = RuntimeAPIAcceptance.writeSummary(assessment);
const quality = RuntimeAPITest.writeGate('quality', {
  status: assessment.ok && summary.status === 'passed' ? 'passed' : 'failed',
  score: assessment.ok && summary.status === 'passed' ? 100 : 0,
  threshold: 100,
  summaryPath: File.join(RuntimeAPITest.context.runDir, 'summary.json'),
  errors: assessment.errors,
});
console.log('[RUNTIME-API-QUALITY RESULT] ' + JSON.stringify(quality));
if (quality.status !== 'passed') throw new Error('Runtime API acceptance failed: ' + assessment.errors.join(' | '));
