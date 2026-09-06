// Formal entry remains scripts/test_runtime_apis.js. This file only loads and
// dispatches suites; API assertions, process plumbing and mode routing are separate.
'use strict';

const MODE = String(Execution.env.OPENDESK_RUNTIME_API_MODE || 'smoke');
const gateRoot = File.join(Execution.workdir, 'tests', 'runtime-api', 'gates');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function loadFactory(relative) {
  const file = File.join(gateRoot, relative);
  if (!File.isFile(file)) throw new Error(`Runtime API module is missing: ${file}`);
  const source = File.read(file);
  if (typeof source !== 'string' || !source.trim()) throw new Error(`Runtime API module is empty: ${file}`);
  const factory = (0, eval)(source + '\n//# sourceURL=' + file);
  if (typeof factory !== 'function') throw new Error(`Runtime API module must return a factory: ${file}`);
  return factory;
}

let runtime = null;
try {
  const registry = loadFactory('registry.js')();
  if (!own(registry.modes, MODE)) throw new Error(`unknown Runtime API mode ${JSON.stringify(MODE)}; expected one of ${Object.keys(registry.modes).join(', ')}`);
  const filter = Execution.env.OPENDESK_RUNTIME_API_UNIT_FILTER;
  if (filter !== undefined && MODE !== 'unit-selected') {
    throw new Error('OPENDESK_RUNTIME_API_UNIT_FILTER requires mode=unit-selected; omit it for full gates');
  }
  if (MODE === 'unit-selected') loadFactory('../support/unit-selection.js')().parse(filter);
  // Fail before building or creating evidence when a registered module is missing.
  for (const definition of Object.values(registry.modules)) {
    if (!File.isFile(File.join(gateRoot, definition.file))) throw new Error(`Runtime API suite is missing: ${definition.file}`);
  }
  runtime = loadFactory('runtime-context.js')({ mode: MODE });
  await runtime.initialize();
  const suites = new Map();
  const context = Object.freeze({ ...runtime, invoke });
  async function invoke(entry, ...args) {
    if (!own(registry.owners, entry)) throw new Error(`unknown Runtime API suite entry: ${entry}`);
    const owner = registry.owners[entry];
    if (!suites.has(owner)) {
      const definition = registry.modules[owner];
      const suite = loadFactory(definition.file)(context);
      for (const name of definition.exports) {
        if (!suite || !own(suite, name) || typeof suite[name] !== 'function') throw new Error(`missing suite export: ${owner}.${name}`);
      }
      suites.set(owner, suite);
    }
    return suites.get(owner)[entry](...args);
  }
  await invoke(registry.modes[MODE]);
  console.log(`[RUNTIME-API PASS] mode=${MODE} evidence=${runtime.RUN_DIR}`);
} catch (error) {
  console.error(`[RUNTIME-API FAIL] mode=${MODE} evidence=${runtime && runtime.RUN_DIR || '<not-created>'}`);
  console.error(error && error.stack ? error.stack : String(error));
  throw error;
}
