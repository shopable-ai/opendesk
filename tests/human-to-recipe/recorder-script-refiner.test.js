'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const {inspectBundle} = require(path.join(
  repoRoot, 'workflows', 'human-to-recipe', 'skills', 'recorder-script-refiner',
  'scripts', 'inspect-recorder-bundle.js',
));

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeJSON(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function createFixture() {
  const recordingId = `rec-script-refiner-test-${process.pid}-${Date.now()}`;
  const recordingDir = path.join(repoRoot, '.runtime', 'recordings', recordingId);
  const generatedDir = path.join(recordingDir, 'generated');
  const rawDir = path.join(recordingDir, 'raw');
  fs.mkdirSync(generatedDir, {recursive: true});
  fs.mkdirSync(rawDir, {recursive: true});

  const rawPath = path.join(rawDir, 'events.ndjson');
  const rawBytes = Buffer.from('{"eventId":"e000000000001"}\n');
  fs.writeFileSync(rawPath, rawBytes);

  const actionsPath = path.join(recordingDir, 'actions.json');
  writeJSON(actionsPath, {
    formatVersion: 'opendesk.recorder.actions/v2',
    recordingId,
    revision: 1,
    readiness: 'ready',
    raw: {file: 'raw/events.ndjson', sha256: hash(rawBytes), bytes: rawBytes.length},
    actions: [{id: 'a0001', kind: 'click'}],
  });
  const actionsBytes = fs.readFileSync(actionsPath);

  const scriptPath = path.join(generatedDir, 'basic.recipe.js');
  const scriptBytes = Buffer.from("console.log('fixture');\n");
  fs.writeFileSync(scriptPath, scriptBytes);

  const candidatePath = path.join(generatedDir, 'basic.candidate.json');
  const candidate = {
    formatVersion: 'opendesk.recorder.basic-candidate/v3',
    recordingId,
    mode: 'basic',
    actions: {
      file: `/old-computer/Users/example/clawdesk/.runtime/recordings/${recordingId}/actions.json`,
      sha256: hash(actionsBytes),
      revision: 1,
    },
    script: {
      file: `C:\\old-computer\\clawdesk\\.runtime\\recordings\\${recordingId}\\generated\\basic.recipe.js`,
      sha256: hash(scriptBytes),
    },
    mappings: [{actionId: 'a0001', line: 1}],
  };
  writeJSON(candidatePath, candidate);

  writeJSON(path.join(recordingDir, 'manifest.json'), {
    formatVersion: 'opendesk.recorder.recording/v2',
    recordingId,
    storage: {
      state: 'saved', file: 'manifest.json', rawFile: 'raw/events.ndjson',
      rawSha256: hash(rawBytes), rawBytes: rawBytes.length,
    },
  });

  return {
    recordingDir, scriptPath, actionsPath, candidatePath, candidate,
    relativeScript: './' + path.relative(repoRoot, scriptPath).split(path.sep).join('/'),
    scriptBytes, actionsBytes, rawBytes,
  };
}

test('inspector safely relocates a package and validates its full lineage', () => {
  const fixture = createFixture();
  try {
    const result = inspectBundle(fixture.relativeScript, {repoRoot});
    assert.equal(result.valid, true);
    assert.equal(result.script.file, fixture.relativeScript);
    assert.match(result.actions.file, /^\.\/\.runtime\/recordings\/rec-[^/]+\/actions\.json$/);
    assert.deepEqual(result.actions.actionIds, ['a0001']);
    assert.equal(result.raw.bytes, fixture.rawBytes.length);

    fs.writeFileSync(fixture.scriptPath, Buffer.from('// drift\n'));
    assert.throws(
      () => inspectBundle(fixture.relativeScript, {repoRoot}),
      error => error && error.code === 'SCRIPT_HASH_MISMATCH',
    );
    fs.writeFileSync(fixture.scriptPath, fixture.scriptBytes);

    fs.writeFileSync(fixture.actionsPath, Buffer.from('{}\n'));
    assert.throws(
      () => inspectBundle(fixture.relativeScript, {repoRoot}),
      error => error && error.code === 'ACTIONS_HASH_MISMATCH',
    );
    fs.writeFileSync(fixture.actionsPath, fixture.actionsBytes);

    writeJSON(fixture.candidatePath, {...fixture.candidate, mappings: []});
    assert.throws(
      () => inspectBundle(fixture.relativeScript, {repoRoot}),
      error => error && error.code === 'ACTION_MAPPING_MISMATCH',
    );
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('inspector rejects paths outside the current Recorder package boundary', () => {
  assert.throws(
    () => inspectBundle('/tmp/basic.recipe.js', {repoRoot}),
    error => error && error.code === 'PATH_OUTSIDE_REPOSITORY',
  );
  assert.throws(
    () => inspectBundle('./.runtime/recordings/rec-safe/generated/../../secret.js', {repoRoot}),
    error => error && error.code === 'INVALID_SCRIPT_PATH',
  );
  assert.throws(
    () => inspectBundle('./.runtime/recordings/rec-safe/generated/bad`name.js', {repoRoot}),
    error => error && error.code === 'INVALID_ARGUMENT',
  );
});

test('inspector rejects a generated directory reached through a symbolic link', () => {
  const fixture = createFixture();
  const generatedDir = path.dirname(fixture.scriptPath);
  const realGeneratedDir = path.join(fixture.recordingDir, 'generated-real');
  try {
    fs.renameSync(generatedDir, realGeneratedDir);
    fs.symlinkSync('generated-real', generatedDir, 'dir');
    assert.throws(
      () => inspectBundle(fixture.relativeScript, {repoRoot}),
      error => error && error.code === 'INVALID_DIRECTORY',
    );
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});
