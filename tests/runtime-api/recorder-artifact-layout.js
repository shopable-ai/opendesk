'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const controllerPath = File.join(
  Execution.workdir,
  'apps', 'opendesk', 'recorder', 'controller-core.js',
);
(0, eval)(File.read(controllerPath) + '\n//# sourceURL=' + controllerPath);

assert(globalThis.OpenDeskSimpleRecordingConsole, 'Recorder controller API was not installed');
assert(
  typeof OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt === 'function',
  'buildAgentRefinementPrompt must be available',
);

const workdir = String(Execution.workdir).replace(/\\/g, '/').replace(/\/+$/, '');
const recording = '.runtime/recordings/rec-layout-contract-test';
const flatScript = `${workdir}/${recording}/flow.js`;
const legacyScript = `${workdir}/${recording}/generated/flow.js`;

const flatPrompt = OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt({
  execution: {workdir},
  generated: {scriptFile: flatScript, mode: 'basic'},
});
assert(flatPrompt.includes(`./${recording}/flow.js`), 'flat recording-root script path must be accepted');
assert(!flatPrompt.includes('/generated/'), 'new prompt must not reintroduce generated/');

const legacyPrompt = OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt({
  execution: {workdir},
  generated: {scriptFile: legacyScript, mode: 'basic'},
});
assert(legacyPrompt.includes(`./${recording}/generated/flow.js`), 'legacy generated/ path must remain readable');

const managerSource = File.read(File.join(Execution.workdir, 'pkg', 'recorder', 'manager.go'));
const storeSource = File.read(File.join(Execution.workdir, 'pkg', 'recorder', 'store.go'));
const compilerSource = File.read(File.join(Execution.workdir, 'pkg', 'recorder', 'compiler.go'));

assert(managerSource.includes('dir + "/events.ndjson"'), 'manifest rawTrace must point to recording-root events.ndjson');
assert(managerSource.includes('dir + "/flow.js"'), 'manifest generatedJS must point to recording-root flow.js');
assert(!managerSource.includes('dir + "/generated/flow.js"'), 'manifest must not publish generated/flow.js for new recordings');
assert(storeSource.includes('filepath.Join(dir, "events.ndjson")'), 'new event trace must be written at recording root');
assert(storeSource.includes('filepath.Join(dir, "raw", "events.ndjson")'), 'legacy raw/events.ndjson fallback must remain');
assert(!storeSource.includes('filepath.Join(dir, "generated")'), 'PrepareSession must not create generated/');
assert(!storeSource.includes('filepath.Join(dir, "raw"),'), 'PrepareSession must not create raw/');
assert(compilerSource.includes('ArtifactPath(sessionID, "flow.js")'), 'compiler must write flow.js at recording root');
assert(!compilerSource.includes('ArtifactPath(sessionID, "generated/flow.js")'), 'compiler must not write generated/flow.js');

equal(
  `${recording}/flow.js`,
  '.runtime/recordings/rec-layout-contract-test/flow.js',
  'flat layout contract fixture',
);

console.log('RECORDER_ARTIFACT_LAYOUT_OK');
