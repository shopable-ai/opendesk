// Dependency-free conformance framework for the embedded OpenDesk JavaScript runtime.
// Every machine result is scoped to one shell-created runId and persisted below
// .runtime/tests/runtime-api/<runId>/ by the JavaScript runtime itself.

globalThis.RuntimeAPITest = (() => {
  const tests = [];
  const context = globalThis.OPENDESK_RUNTIME_API_CONTEXT || {
    schemaVersion: '1.0.0',
    runId: 'direct-' + Date.now(),
    runDir: File.join(File.cwd(), '.runtime', 'runtime-api', 'direct-' + Date.now()),
    binary: { path: '', sha256: '', buildSource: 'direct-runtime' },
    startedAt: new Date().toISOString(),
  };

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed');
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'values differ') + ': expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
    }
  }

  async function expectThrow(fn, messagePart) {
    let caught = null;
    try {
      await fn();
    } catch (error) {
      caught = error;
    }
    assert(caught, 'expected an error containing ' + JSON.stringify(messagePart));
    const message = String(caught && caught.message ? caught.message : caught);
    assert(message.includes(messagePart), 'unexpected error: ' + message);
  }

  function path(...parts) {
    return File.join(...parts);
  }

  function resultPath(name) {
    return path(context.runDir, 'results', name + '.json');
  }

  function writeJSON(filePath, value) {
    File.ensureDir(File.join(filePath, '..'));
    File.write(filePath, JSON.stringify(value, null, 2));
  }

  function readJSON(filePath) {
    return JSON.parse(File.read(filePath));
  }

  function exists(filePath) {
    return File.exists(filePath);
  }

  function gateEnvelope(gate, payload) {
    return {
      schemaVersion: '1.0.0',
      runId: context.runId,
      gate,
      startedAt: payload.startedAt || context.startedAt,
      finishedAt: new Date().toISOString(),
      runtime: context.binary,
      status: payload.status,
      ...payload,
    };
  }

  function writeGate(gate, payload) {
    const envelope = gateEnvelope(gate, payload);
    writeJSON(resultPath(gate), envelope);
    return envelope;
  }

  function test(spec, fn) {
    assert(spec && typeof spec.name === 'string' && spec.name, 'test name is required');
    assert(Array.isArray(spec.covers) && spec.covers.length > 0, 'test ' + spec.name + ' must declare covers');
    assert(['unit', 'live', 'composition', 'custom-ui', 'quality'].includes(spec.tier), 'test ' + spec.name + ' has invalid tier');
    assert(spec.verification === undefined || ['behavior', 'contract'].includes(spec.verification), 'test ' + spec.name + ' has invalid verification');
    assert(typeof fn === 'function', 'test ' + spec.name + ' requires a function');
    tests.push({ ...spec, verification: spec.verification || 'behavior', fn });
  }

  function contractObject(objectName) {
    const definition = RuntimeAPIObjects[objectName];
    assert(definition, 'unknown contract object ' + objectName);
    for (const method of definition.methods) {
      test({
        name: objectName + '.' + method + ' is exposed by the JavaScript runtime',
        tier: 'unit',
        verification: 'contract',
        covers: [objectName + '.' + method],
      }, async () => {
        const object = globalThis[objectName];
        if (definition.optional && (object === undefined || object === null)) return;
        if (method === 'constructor') {
          assert(typeof object === 'function', 'missing runtime constructor ' + objectName);
          return;
        }
        assert(object && (typeof object === 'object' || typeof object === 'function'), 'missing runtime object ' + objectName);
        assert(typeof object[method] === 'function', 'missing runtime function ' + objectName + '.' + method);
      });
    }
    for (const property of definition.properties || []) {
      test({
        name: objectName + '.' + property + ' is exposed by the JavaScript runtime',
        tier: 'unit',
        verification: 'contract',
        covers: [objectName + '.' + property],
      }, async () => {
        const object = globalThis[objectName];
        if (definition.optional && (object === undefined || object === null)) return;
        assert(object && (typeof object === 'object' || typeof object === 'function'), 'missing runtime object ' + objectName);
        assert(property in object, 'missing runtime property ' + objectName + '.' + property);
      });
    }
  }

  function contractGlobals() {
    for (const method of RuntimeAPIObjects.global.methods) {
      test({
        name: 'global.' + method + ' is exposed by the JavaScript runtime',
        tier: 'unit',
        verification: 'contract',
        covers: ['global.' + method],
      }, async () => assert(typeof globalThis[method] === 'function', 'missing global function ' + method));
    }
  }

  function load(relativePath) {
    const sourcePath = File.join(File.cwd(), relativePath);
    const source = File.read(sourcePath);
    assert(typeof source === 'string' && source.length > 0, 'empty test file: ' + relativePath);
    return (0, eval)(source + '\n//# sourceURL=' + sourcePath);
  }

  async function withGlobal(name, replacement, fn) {
    const original = globalThis[name];
    globalThis[name] = replacement;
    try {
      return await fn();
    } finally {
      globalThis[name] = original;
    }
  }

  function gateForLabel(label) {
    if (label === 'RUNTIME-API-CONTRACT') return 'contract';
    if (label === 'RUNTIME-API-UNIT') return 'unit';
    if (label === 'RUNTIME-API-SMOKE') return 'smoke';
    if (label === 'RUNTIME-API-ENVIRONMENT') return 'environment';
    if (label === 'RUNTIME-API-PATH') return 'path';
    if (label === 'RUNTIME-API-LIVE') return 'live';
    if (label === 'RUNTIME-API-CUSTOM-UI') return 'custom-ui';
    if (label === 'RUNTIME-API-CUSTOM-UI-BEHAVIOR') return 'custom-ui-behavior';
    if (label === 'RUNTIME-API-QUALITY') return 'quality';
    return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  async function run(label) {
    const result = { label, passed: 0, failed: 0, tests: [], startedAt: new Date().toISOString() };
    for (const item of tests) {
      const started = Date.now();
      console.log('[' + label + ' START] ' + item.name);
      try {
        await item.fn();
        result.passed += 1;
        result.tests.push({ name: item.name, tier: item.tier, verification: item.verification, covers: item.covers, status: 'passed', durationMs: Date.now() - started });
        console.log('[' + label + ' PASS] ' + item.name);
      } catch (error) {
        const message = String(error && error.stack ? error.stack : error);
        result.failed += 1;
        result.tests.push({ name: item.name, tier: item.tier, verification: item.verification, covers: item.covers, status: 'failed', durationMs: Date.now() - started, error: message });
        console.error('[' + label + ' FAIL] ' + item.name + ': ' + message);
      }
    }
    result.finishedAt = new Date().toISOString();
    result.status = result.failed === 0 ? 'passed' : 'failed';
    console.log('[' + label + ' RESULT] ' + JSON.stringify(result));
    const gate = gateForLabel(label);
    if (gate === 'live') result.liveSession = globalThis.RuntimeLiveSession || null;
    writeGate(gate, result);
    if (gate === 'live') {
      const composition = result.tests.filter((item) => item.tier === 'composition');
      writeGate('composition', {
        status: composition.length > 0 && composition.every((item) => item.status === 'passed') ? 'passed' : 'failed',
        tests: composition,
        passed: composition.filter((item) => item.status === 'passed').length,
        failed: composition.filter((item) => item.status === 'failed').length,
        evidence: globalThis.RuntimeLiveEvidence || null,
      });
    }
    if (result.failed > 0) throw new Error(label + ' failed: ' + result.failed + '/' + tests.length);
    return result;
  }

  return {
    assert, equal, expectThrow, test, contractObject, contractGlobals, load, withGlobal, run,
    tests, context, path, resultPath, writeJSON, readJSON, exists, writeGate, gateEnvelope,
  };
})();
