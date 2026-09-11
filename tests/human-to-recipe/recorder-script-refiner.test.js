'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const generatorPath = path.join(
  repoRoot, 'workflows', 'human-to-recipe', 'skills', 'recorder-script-refiner',
  'scripts', 'generate-refinement.js',
);
const {inspectBundle} = require(path.join(
  repoRoot, 'workflows', 'human-to-recipe', 'skills', 'recorder-script-refiner',
  'scripts', 'inspect-recorder-bundle.js',
));
const {validateRefinement} = require(path.join(
  repoRoot, 'workflows', 'human-to-recipe', 'skills', 'recorder-script-refiner',
  'scripts', 'validate-refinement.js',
));
const {
  buildRefinement,
  chooseOutputPair,
  generateRefinement,
  semanticGuardDescriptor,
} = require(path.join(
  repoRoot, 'workflows', 'human-to-recipe', 'skills', 'recorder-script-refiner',
  'scripts', 'generate-refinement.js',
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
  const rawEvents = [
    {formatVersion: 'opendesk.recorder.raw-event/v2', eventId: 'e000000000001', sequence: '1',
      libraryEvent: 'MOUSE_PRESSED', nativeTime: '1000000000', nativeUnit: 'nanoseconds'},
    {formatVersion: 'opendesk.recorder.raw-event/v2', eventId: 'e000000000002', sequence: '2',
      libraryEvent: 'MOUSE_RELEASED', nativeTime: '1010000000', nativeUnit: 'nanoseconds'},
    {formatVersion: 'opendesk.recorder.raw-event/v2', eventId: 'e000000000003', sequence: '3',
      libraryEvent: 'MOUSE_CLICKED', nativeTime: '1010000000', nativeUnit: 'nanoseconds'},
  ];
  const rawBytes = Buffer.from(rawEvents.map(event => JSON.stringify(event)).join('\n') + '\n');
  fs.writeFileSync(rawPath, rawBytes);

  const actionsPath = path.join(recordingDir, 'actions.json');
  writeJSON(actionsPath, {
    formatVersion: 'opendesk.recorder.actions/v2',
    recordingId,
    revision: 1,
    readiness: 'ready',
    raw: {file: 'raw/events.ndjson', sha256: hash(rawBytes), bytes: rawBytes.length},
    environment: {platform: 'darwin', coordinateSpace: 'screen-logical'},
    actions: [{
      id: 'a0001', kind: 'click', strategy: 'mouse.click',
      source: {
        eventIds: rawEvents.map(event => event.eventId),
        basis: 'libuiohook CLICKED associated with PRESSED and RELEASED',
      },
      timing: {
        sequenceStart: '1', sequenceEnd: '3', nativeStart: '1000000000',
        nativeEnd: '1010000000', nativeUnit: 'nanoseconds',
      },
      position: {
        x: 1, y: 2, space: 'screen-logical', displayRef: 'display-fixture', verified: true,
        display: {
          anchor: 'top-left', offsetX: 1, offsetY: 2, xRatio: 0.01, yRatio: 0.02,
          space: 'display-logical', verified: true,
        },
      },
      target: {
        kind: 'display', resolution: 'display-id+hardware-id', semanticStatus: 'not-applicable',
        display: {
          id: 'display-fixture', hardwareId: 'hardware-fixture', x: 0, y: 0,
          width: 100, height: 100,
        },
      },
      args: {button: 'left', clickCount: 1},
      review: {required: false, status: 'not-required'},
    }],
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
    timing: {minimumDelayMs: 500, maximumDelayMs: 30000, speedMultiplier: 1},
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

function createRefinementFixture() {
  const fixture = createFixture();
  const sourceBytes = Buffer.from(
    'System.getPlatformInfo();\n' +
    'async function sourceWindowCalls() { try { await window.get({title: "fixture"}); } catch (_) {} await window.get({title: "fixture"}); await window.getActiveWindow(); }\n' +
    'Screen.getDisplays();\n' +
    'const fixturePoint = Geometry.pointOffset({x: 0, y: 0, width: 100, height: 100}, 1, 2);\n' +
    'Geometry.contains(Geometry.rect({x: 0, y: 0, width: 100, height: 100}), fixturePoint);\n' +
    'await mouse.clickPoint({x: 1, y: 2, coordinateSpace: "screen"}, {button: "left", clickCount: 1});\n',
  );
  fs.writeFileSync(fixture.scriptPath, sourceBytes);

  writeJSON(fixture.candidatePath, {
    ...fixture.candidate,
    script: {...fixture.candidate.script, sha256: hash(sourceBytes)},
    mappings: [{actionId: 'a0001', line: 6}],
  });
  const generated = generateRefinement(fixture.relativeScript, {repoRoot});
  const refinedPath = path.resolve(repoRoot, generated.refinedFile.slice(2));
  const reportPath = path.resolve(repoRoot, generated.reportFile.slice(2));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return {
    ...fixture,
    refinedPath,
    reportPath,
    relativeRefined: './' + path.relative(repoRoot, refinedPath).split(path.sep).join('/'),
    relativeReport: './' + path.relative(repoRoot, reportPath).split(path.sep).join('/'),
    report,
  };
}

test('generator CLI creates and internally validates one exclusive output pair', () => {
  const fixture = createFixture();
  try {
    const sourceBytes = Buffer.from(
      'System.getPlatformInfo();\n' +
      'async function sourceWindowCalls() { try { await window.get({title: "fixture"}); } catch (_) {} await window.get({title: "fixture"}); await window.getActiveWindow(); }\n' +
      'Screen.getDisplays();\n' +
      'const fixturePoint = Geometry.pointOffset({x: 0, y: 0, width: 100, height: 100}, 1, 2);\n' +
      'Geometry.contains(Geometry.rect({x: 0, y: 0, width: 100, height: 100}), fixturePoint);\n' +
      'await mouse.clickPoint({x: 1, y: 2, coordinateSpace: "screen"}, {button: "left", clickCount: 1});\n',
    );
    fs.writeFileSync(fixture.scriptPath, sourceBytes);
    writeJSON(fixture.candidatePath, {
      ...fixture.candidate,
      script: {...fixture.candidate.script, sha256: hash(sourceBytes)},
      mappings: [{actionId: 'a0001', line: 6}],
    });
    const run = childProcess.spawnSync(process.execPath, [generatorPath, fixture.relativeScript], {
      cwd: repoRoot, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.valid, true);
    assert.equal(result.staticValidation, true);
    assert.equal(result.version, 1);
    assert.equal(fs.existsSync(path.resolve(repoRoot, result.refinedFile.slice(2))), true);
    assert.equal(fs.existsSync(path.resolve(repoRoot, result.reportFile.slice(2))), true);
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('refinement validator proves static mapping, API, effects, timing, and status', () => {
  const fixture = createRefinementFixture();
  try {
    const result = validateRefinement(
      fixture.relativeScript, fixture.relativeRefined, fixture.relativeReport, {repoRoot},
    );
    assert.equal(result.valid, true);
    assert.equal(result.actionCount, 1);
    assert.deepEqual(result.inputSideEffects.source, {'mouse.clickPoint': 1});
    assert.deepEqual(result.inputSideEffects.refined, {'mouse.clickPoint': 1});
    assert.equal(fixture.report.formatVersion, 'opendesk.recorder.refinement/v5');
    assert.equal(fixture.report.generation.compiler, 'opendesk.recorder.actions-first-refiner/v4');
    assert.deepEqual(
      fixture.report.staticAnalysis.quality.recordedDisplayGeometryGuardActionIds,
      ['a0001'],
    );
    assert.equal(fixture.report.staticAnalysis.quality.targetScopeRelaxationUsed, false);
    const refined = fs.readFileSync(fixture.refinedPath, 'utf8');
    assert.match(refined,
      /String\(row\.id \|\| ""\) === target\.id && \(!target\.hardwareId \|\| String\(row\.hardwareId \|\| ""\) === target\.hardwareId\)/);
    assert.match(refined,
      /__refinerRequireRecordedDisplayGeometry\(__refinerResolveDisplay\(action\.target\), action\.recordedDisplay, action\.actionId\)/);
    assert.doesNotMatch(refined, /idMatches|hardwareMatches/);
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('actions-first compiler ignores source code as a generation template', () => {
  const fixture = createFixture();
  try {
    const sourceBytes = Buffer.from(
      'await mouse.clickPoint({x: 91, y: 92, coordinateSpace: "screen"}, {button: "right", clickCount: 9});\n',
    );
    fs.writeFileSync(fixture.scriptPath, sourceBytes);
    writeJSON(fixture.candidatePath, {
      ...fixture.candidate,
      script: {...fixture.candidate.script, sha256: hash(sourceBytes)},
    });
    const output = {
      version: 7,
      refinedPath: path.join(path.dirname(fixture.scriptPath), 'basic.refined.v7.recipe.js'),
      reportPath: path.join(path.dirname(fixture.scriptPath), 'basic.refinement.v7.json'),
    };
    const built = buildRefinement(fixture.relativeScript, {repoRoot, output});
    assert.match(built.compiled.source, /"button":"left","clickCount":1/);
    assert.doesNotMatch(built.compiled.source, /"clickCount":9/);
    assert.equal(built.report.generation.sourceTemplateUsed, false);
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('verified Accessibility evidence is a first-class runtime identity contract', () => {
  const fixture = createFixture();
  try {
    const actions = JSON.parse(fs.readFileSync(fixture.actionsPath, 'utf8'));
    const action = actions.actions[0];
    action.position.window = {
      anchor: 'top-left', offsetX: 84, offsetY: 251,
      xRatio: 84 / 232, yRatio: 251 / 321,
      space: 'window-logical', verified: true,
    };
    action.target = {
      kind: 'window', resolution: 'application-identity+window-title', semanticStatus: 'verified',
      window: {
        id: 'window-fixture', title: 'Fixture',
        application: {
          identityKind: 'executable-path', identityValue: '/Applications/Fixture.app/Fixture',
        },
        bounds: {x: 100, y: 200, width: 232, height: 321},
      },
      element: {
        source: 'accessibility', resolution: 'point-hit', role: 'button', nativeRole: 'AXButton',
        name: '2', identifier: 'button.two', enabled: true, nativeActions: ['AXPress'],
        bounds: {x: 156, y: 424, width: 59, height: 49},
        point: {offsetX: 28, offsetY: 27, xRatio: 28 / 59, yRatio: 27 / 49},
        hit: {
          role: 'button', nativeRole: 'AXButton', name: '2', identifier: 'button.two',
          enabled: true, nativeActions: ['AXPress'],
          bounds: {x: 156, y: 424, width: 59, height: 49},
        },
        ancestors: [],
      },
    };
    writeJSON(fixture.actionsPath, actions);
    const actionsBytes = fs.readFileSync(fixture.actionsPath);
    const sourceBytes = Buffer.from(
      'System.getPlatformInfo();\n' +
      'async function sourceWindowCalls() { await window.get({title: "Fixture"}); await window.getActiveWindow(); }\n' +
      'const fixturePoint = Geometry.pointOffset({x: 0, y: 0, width: 232, height: 321}, 84, 251);\n' +
      'Geometry.contains(Geometry.rect({x: 0, y: 0, width: 232, height: 321}), fixturePoint);\n' +
      'await mouse.clickPoint({x: 84, y: 251, coordinateSpace: "screen"}, {button: "left", clickCount: 1});\n',
    );
    fs.writeFileSync(fixture.scriptPath, sourceBytes);
    writeJSON(fixture.candidatePath, {
      ...fixture.candidate,
      actions: {...fixture.candidate.actions, sha256: hash(actionsBytes)},
      script: {...fixture.candidate.script, sha256: hash(sourceBytes)},
      mappings: [{actionId: 'a0001', line: 5}],
    });
    const output = {
      version: 7,
      refinedPath: path.join(path.dirname(fixture.scriptPath), 'basic.refined.v7.recipe.js'),
      reportPath: path.join(path.dirname(fixture.scriptPath), 'basic.refinement.v7.json'),
    };
    const built = buildRefinement(fixture.relativeScript, {repoRoot, output});
    assert.match(built.compiled.source,
      /__refinerClickVerifiedWindowAction\(\{\n  actionId: "a0001",/);
    assert.match(built.compiled.source,
      /"selector":\{"role":"button","name":"2","identifier":"button\.two"\}/);
    assert.match(built.compiled.source,
      /"expected":\{"role":"button","name":"2","identifier":"button\.two","nativeRole":"AXButton","enabled":true,"nativeActions":\["AXPress"\],"publicActions":\["invoke"\]\}/);
    assert.match(built.compiled.source, /recordedWindow: \{"width":232,"height":321\}/);
    assert.doesNotMatch(built.compiled.source,
      /nativeBounds|mouse\.clickForPID|window\.get\(identity\)/);
    assert.match(built.compiled.source,
      /Number\(active\.x\) === Number\(expected\.x\).*Number\(active\.height\) === Number\(expected\.height\)/);
    assert.doesNotMatch(built.compiled.source,
      /Number\(active\.pid\) === Number\(expected\.pid\)/);
    assert.deepEqual(built.report.staticAnalysis.quality.semanticIdentityDescriptorActionIds, ['a0001']);
    assert.deepEqual(built.report.staticAnalysis.quality.recordedWindowGeometryGuardActionIds, ['a0001']);
    assert.deepEqual(built.report.staticAnalysis.quality.activeWindowGuardBeforeInputActionIds, ['a0001']);
    assert.deepEqual(
      built.report.staticAnalysis.quality.activeWindowSnapshotGeometryGuardActionIds,
      ['a0001'],
    );
    assert.equal(built.report.staticAnalysis.quality.structuredReadableActionDescriptors, true);
    assert.equal(built.report.staticAnalysis.quality.actionIdErrorContext, true);
    assert.deepEqual(built.report.staticAnalysis.quality.semanticIdentityRuntimeFields, [
      'role', 'name', 'identifier', 'nativeRole', 'enabled', 'nativeActions', 'publicActions',
    ]);
    assert.deepEqual(built.report.staticAnalysis.quality.nativeActionMappingActionIds, ['a0001']);
    fs.writeFileSync(output.refinedPath, built.refinedBytes);
    fs.writeFileSync(output.reportPath, built.reportBytes);
    assert.equal(validateRefinement(
      fixture.relativeScript,
      './' + path.relative(repoRoot, output.refinedPath).split(path.sep).join('/'),
      './' + path.relative(repoRoot, output.reportPath).split(path.sep).join('/'),
      {repoRoot},
    ).valid, true);
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('verified click evidence stays conservative unless its exact identity contract is complete', () => {
  const base = {
    id: 'a0001', kind: 'click',
    target: {
      kind: 'window', semanticStatus: 'verified',
      element: {
        source: 'accessibility', role: 'button', nativeRole: 'AXButton',
        name: 'Save', identifier: 'save-button', enabled: true, nativeActions: ['AXPress'],
      },
    },
  };
  assert.deepEqual(semanticGuardDescriptor(base), {
    selector: {role: 'button', name: 'Save', identifier: 'save-button'},
    expected: {
      role: 'button', name: 'Save', identifier: 'save-button', nativeRole: 'AXButton',
      enabled: true, nativeActions: ['AXPress'], publicActions: ['invoke'],
    },
  });
  assert.equal(semanticGuardDescriptor({
    ...base,
    target: {...base.target, element: {...base.target.element, identifier: ''}},
  }), null);
  assert.equal(semanticGuardDescriptor({
    ...base,
    target: {...base.target, element: {...base.target.element, nativeActions: ['AXShowMenu']}},
  }), null);
});

test('output selection checks paired occupancy without reading old contents', () => {
  const fixture = createFixture();
  try {
    const directory = path.dirname(fixture.scriptPath);
    fs.writeFileSync(path.join(directory, 'basic.refined.recipe.js'), 'forbidden-old-content');
    fs.writeFileSync(path.join(directory, 'basic.refinement.v2.json'), 'forbidden-old-content');
    const output = chooseOutputPair(fixture.scriptPath);
    assert.equal(output.version, 3);
    assert.equal(path.basename(output.refinedPath), 'basic.refined.v3.recipe.js');
    assert.equal(path.basename(output.reportPath), 'basic.refinement.v3.json');
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});

test('refinement validator rejects any divergence from actions-first compilation', () => {
  const fixture = createRefinementFixture();
  try {
    const refinedBytes = Buffer.from(
      fs.readFileSync(fixture.refinedPath, 'utf8') +
      'await mouse.clickPoint({x: 3, y: 4, coordinateSpace: "screen"}, {button: "left", clickCount: 1});\n',
    );
    fs.writeFileSync(fixture.refinedPath, refinedBytes);
    fixture.report.refined.sha256 = hash(refinedBytes);
    writeJSON(fixture.reportPath, fixture.report);
    assert.throws(
      () => validateRefinement(
        fixture.relativeScript, fixture.relativeRefined, fixture.relativeReport, {repoRoot},
      ),
      error => error && error.code === 'ACTIONS_FIRST_COMPILER_MISMATCH',
    );
  } finally {
    fs.rmSync(fixture.recordingDir, {recursive: true, force: true});
  }
});
