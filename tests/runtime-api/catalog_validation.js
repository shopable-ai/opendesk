// JavaScript-only catalog and source-of-truth validation. It compares the
// active Runtime surface with the maintained catalog, docs-user-api index and
// TypeScript declarations before coverage can be reported as passing.

globalThis.RuntimeAPICatalogValidation = (() => {
  const root = File.cwd();
  const publicObjectNames = () => Object.keys(RuntimeAPIObjects).filter((name) => name !== 'global');
  const reservedGlobals = new Set([
    'page____Inject', 'browser____Inject', 'context____Inject', 'Execution',
    'global', 'globalThis', 'module', 'exports', 'require',
    '_', 'moment', 'cheerio', 'queryString', 'querystring',
    'Automation', 'RuntimeAPITest', 'RuntimeAPICatalogValidation', 'RuntimeAPICrypto',
    'browserLegacy', 'browserUpgraded', 'contextLegacy', 'contextUpgraded',
    'pageLegacy', 'pageUpgraded',
  ]);

  function fingerprint(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
  }

  function runtimeSurface() {
    const objects = {};
    for (const name of publicObjectNames()) {
      const definition = RuntimeAPIObjects[name];
      const value = globalThis[name];
      if (definition.optional && (value === undefined || value === null)) {
        objects[name] = { optionalAbsent: true, methods: [] };
        continue;
      }
      objects[name] = {
        optionalAbsent: false,
        methods: Object.keys(value || {}).filter((key) => typeof value[key] === 'function').sort(),
      };
    }
    const globals = RuntimeAPIObjects.global.methods.filter((method) => typeof globalThis[method] === 'function').sort();
    const unknownObjects = Object.keys(globalThis)
      .filter((name) => !reservedGlobals.has(name) && !publicObjectNames().includes(name) && !RuntimeAPIObjects.global.methods.includes(name))
      .filter((name) => {
        const value = globalThis[name];
        return value && (typeof value === 'object' || typeof value === 'function')
          && Object.keys(value).some((key) => typeof value[key] === 'function');
      })
      .sort();
    return { objects, globals, unknownObjects };
  }

  function documentedFamilies() {
    const index = JSON.parse(File.read(File.join(root, 'docs-user-api', 'runtime-api.ai.json')));
    const families = new Set();
    for (const item of index.globals || []) {
      const name = String(item.name || '');
      if (name === 'notify' || name === 'Promise/timers/sleep') families.add('global');
      else if (name === 'browser/context/upgraded facades') {
        families.add('browser');
        families.add('context');
      } else if (name) {
        families.add(name);
      }
    }
    return { index, families };
  }

  function typeContains(entry) {
    const source = File.read(File.join(root, entry.source.types));
    const method = entry.id.slice(entry.id.indexOf('.') + 1);
    if (entry.family === 'global') return source.includes('function ' + method + '(');
    return source.includes('var ' + entry.family)
      && new RegExp('\\b' + method + '\\s*(?:<[^>]*>)?\\s*\\(').test(source);
  }

  function validateCatalog(options = {}) {
    const catalog = options.catalog || RuntimeAPIManifest;
    const actual = options.actual || runtimeSurface();
    const errors = [];
    const ids = catalog.map((entry) => entry.id);
    const idSet = new Set(ids);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) errors.push('duplicate catalog IDs: ' + Array.from(new Set(duplicateIds)).join(','));
    for (const entry of catalog) {
      for (const key of ['id', 'family', 'source', 'status', 'platforms', 'requiredVerificationTiers', 'riskClassification', 'evidenceRequirements']) {
        if (entry[key] === undefined || entry[key] === null || entry[key] === '') errors.push('catalog entry ' + entry.id + ' lacks ' + key);
      }
      const tiers = entry.requiredVerificationTiers || [];
      if (!tiers.includes('contract')) errors.push('catalog entry ' + entry.id + ' lacks contract tier');
      if (tiers.length === 1 && typeof entry.contractOnlyReason !== 'string') errors.push('contract-only entry lacks risk reason: ' + entry.id);
    }
    for (const [family, definition] of Object.entries(RuntimeAPIObjects)) {
      for (const method of definition.methods) {
        const id = family + '.' + method;
        if (!idSet.has(id)) errors.push('catalog missing Runtime method: ' + id);
      }
    }
    for (const entry of catalog) {
      const definition = RuntimeAPIObjects[entry.family];
      if (!definition || !definition.methods.includes(entry.id.slice(entry.id.indexOf('.') + 1))) errors.push('catalog contains unknown ID: ' + entry.id);
    }
    for (const family of publicObjectNames()) {
      const actualFamily = actual.objects[family];
      const definition = RuntimeAPIObjects[family];
      if (actualFamily.optionalAbsent) continue;
      for (const method of actualFamily.methods) {
        if (!idSet.has(family + '.' + method)) errors.push('Runtime added public method without catalog: ' + family + '.' + method);
      }
      for (const method of definition.methods) {
        if (!actualFamily.methods.includes(method)) errors.push('catalog method missing from Runtime: ' + family + '.' + method);
      }
    }
    for (const method of actual.globals) {
      if (!idSet.has('global.' + method)) errors.push('Runtime added public global without catalog: global.' + method);
    }
    for (const method of RuntimeAPIObjects.global.methods) {
      if (!actual.globals.includes(method)) errors.push('catalog global missing from Runtime: global.' + method);
    }
    if (actual.unknownObjects.length) errors.push('Runtime added unknown public object(s): ' + actual.unknownObjects.join(','));

    const documented = documentedFamilies();
    for (const family of Object.keys(RuntimeAPIObjects)) {
      if (!documented.families.has(family)) errors.push('docs-user-api object drift: missing ' + family);
    }
    for (const entry of catalog) {
      if (!File.exists(File.join(root, entry.source.docs))) errors.push('catalog docs route missing: ' + entry.source.docs);
      if (!File.exists(File.join(root, entry.source.types))) errors.push('catalog types route missing: ' + entry.source.types);
      if (!typeContains(entry)) errors.push('types declaration drift: missing ' + entry.id + ' in ' + entry.source.types);
    }
    for (const item of documented.index.globals || []) {
      for (const method of item.keyMethods || []) {
        const family = item.name;
        if (family && !family.includes('/') && !idSet.has(family + '.' + method)) errors.push('docs keyMethod missing from catalog: ' + family + '.' + method);
      }
    }
    return { ok: errors.length === 0, errors, actual, catalog, catalogFingerprint: fingerprint(catalog.slice().sort((a, b) => a.id.localeCompare(b.id))) };
  }

  function writeSnapshot(validation) {
    const snapshot = {
      schemaVersion: '1.0.0',
      catalogVersion: RuntimeAPICatalog.catalogVersion,
      runId: RuntimeAPITest.context.runId,
      catalogFingerprint: validation.catalogFingerprint,
      entries: validation.catalog,
      runtimeSurface: validation.actual,
    };
    const output = File.join(RuntimeAPITest.context.runDir, 'catalog.snapshot.json');
    RuntimeAPITest.writeJSON(output, snapshot);
    return { path: output, ...snapshot };
  }

  function assertValid(options) {
    const result = validateCatalog(options);
    if (!result.ok) throw new Error('Runtime API catalog drift: ' + result.errors.join(' | '));
    return result;
  }

  function validateTestIds(catalog, tests) {
    const ids = new Set(catalog.map((entry) => entry.id));
    const unknown = tests.flatMap((test) => test.covers || []).filter((id) => !ids.has(id));
    return { ok: unknown.length === 0, unknown: Array.from(new Set(unknown)) };
  }

  return { fingerprint, runtimeSurface, validateCatalog, writeSnapshot, assertValid, validateTestIds };
})();
