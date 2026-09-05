'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(File.cwd() === Execution.workdir, 'File.cwd and Execution.workdir differ');
assert(path.resolve('shared') === path.join(Execution.workdir, 'shared'), 'path.resolve does not use Execution.workdir');
assert(Execution.scriptPath === null || path.isAbsolute(Execution.scriptPath), 'scriptPath must be null or absolute');
assert((Execution.scriptPath === null) === (Execution.scriptDir === null), 'scriptPath/scriptDir nullability differs');
const trustedScriptPath = Execution.scriptPath;
try { Execution.source = 'file:/forged/by-script.js'; } catch (_) {}
assert(Execution.scriptPath === trustedScriptPath, 'source mutation changed trusted scriptPath');
if (Execution.scriptPath !== null) {
  assert(path.dirname(Execution.scriptPath) === Execution.scriptDir, 'scriptDir does not match dirname(scriptPath)');
  assert(path.basename(Execution.scriptPath) === 'path.js', 'scriptPath does not identify the executed file');
}

const report = {
  ok: true,
  workdir: Execution.workdir,
  resolved: path.resolve('shared'),
  scriptPath: Execution.scriptPath,
  scriptDir: Execution.scriptDir,
  source: Execution.source,
};
File.write(path.join(Execution.artifactDir, 'path-acceptance.json'), JSON.stringify(report, null, 2));
console.log('[PATH-ACCEPTANCE] ' + JSON.stringify(report));
