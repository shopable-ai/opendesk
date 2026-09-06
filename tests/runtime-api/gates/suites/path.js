// path: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, BINARY, fail, readJSON, executeProcess, runJS, verifyZeroCleanup } = context;

async function pathContext() {
  await runJS('path', File.join(ROOT_DIR, 'tests', 'runtime-api', 'path.js'), 3, 120);
  await verifyZeroCleanup('path');

  const source = File.join(ROOT_DIR, 'tests', 'runtime-api', 'acceptance', 'path.js');
  const workdirs = [File.join(RUN_DIR, 'path-workdir-a'), File.join(RUN_DIR, 'path-workdir-b')];
  const reports = [];
  for (let index = 0; index < workdirs.length; index += 1) {
    const workdir = workdirs[index];
    const logDir = File.join(RUN_DIR, 'runtime-logs', `path-workdir-${index + 1}`);
    File.ensureDir(workdir);
    const result = await executeProcess(`path-workdir-${index + 1}`, BINARY, [
      '-script', source, '-console-mode', 'script', '-log-dir', logDir,
    ], { cwd: workdir, deadlineSeconds: 120 });
    if (result.exitCode !== 0) fail(`path WorkDir ${index + 1} failed with status ${result.exitCode}`);
    const reportPath = File.join(logDir, 'path-acceptance.json');
    if (!File.isFile(reportPath)) fail(`path WorkDir report is missing: ${reportPath}`);
    const report = await readJSON(reportPath);
    if (report.ok !== true || report.workdir !== workdir || report.scriptPath !== source) {
      fail(`path WorkDir report is invalid: ${JSON.stringify(report)}`);
    }
    reports.push(report);
  }
  if (reports[0].workdir === reports[1].workdir || reports[0].resolved === reports[1].resolved) {
    fail('path did not preserve independent Execution WorkDirs');
  }

  const inlineLogDir = File.join(RUN_DIR, 'runtime-logs', 'path-inline');
  const inline = await executeProcess('path-inline', BINARY, [
    '-script-text', File.read(source), '-console-mode', 'script', '-log-dir', inlineLogDir,
  ], { cwd: workdirs[0], deadlineSeconds: 120 });
  if (inline.exitCode !== 0) fail(`path inline source failed with status ${inline.exitCode}`);
  const inlineReport = await readJSON(File.join(inlineLogDir, 'path-acceptance.json'));
  if (inlineReport.scriptPath !== null || inlineReport.scriptDir !== null || inlineReport.source !== 'inline') {
    fail(`inline source metadata is invalid: ${JSON.stringify(inlineReport)}`);
  }
  console.log(`[RUNTIME-API-PATH] workdirs=${workdirs.join(',')} inline=null`);
}

return Object.freeze({ pathContext });
})
