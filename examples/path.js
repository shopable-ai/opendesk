// Run from the repository root:
// ./dist/opendesk -script examples/path.js -console-mode script
'use strict';

const report = {
  workdir: Execution.workdir,
  scriptPath: Execution.scriptPath,
  scriptDir: Execution.scriptDir,
  reportPath: path.resolve(Execution.artifactDir, 'path-example.json'),
  sourceFile: Execution.scriptPath === null ? null : path.basename(Execution.scriptPath),
};

if (File.cwd() !== Execution.workdir) throw new Error('File and path do not share Execution.workdir');
if (Execution.scriptPath === null || report.sourceFile !== 'path.js') throw new Error('file source metadata is unavailable');
File.write(report.reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
