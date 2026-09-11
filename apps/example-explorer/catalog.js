(function installOpenDeskExampleCatalog(global) {
  'use strict';

  const RUN_POLICIES = new Set(['safe', 'manual']);

  function normalizeSlash(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  function isExampleJavaScript(name) {
    const value = String(name || '');
    return value.length > 3 && value.toLowerCase().endsWith('.js') && !value.startsWith('.');
  }

  function validateRelativeJavaScriptPath(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(label + ' must be a non-empty string');
    }
    const path = normalizeSlash(value.trim());
    if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) {
      throw new Error(label + ' must be relative to examples/');
    }
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) {
      throw new Error(label + ' contains an invalid path segment: ' + path);
    }
    if (!isExampleJavaScript(parts[parts.length - 1])) {
      throw new Error(label + ' must point to a JavaScript file: ' + path);
    }
    return path;
  }

  function validateOptionalString(value, label) {
    if (value == null) return '';
    if (typeof value !== 'string') throw new Error(label + ' must be a string');
    return value;
  }

  function validateStringArray(value, label) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error(label + ' must be an array');
    return value.map((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`${label}[${index}] must be a non-empty string`);
      }
      return item;
    });
  }

  function validateMetadata(relativePath, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('catalog metadata must be an object: ' + relativePath);
    }
    const title = validateOptionalString(value.title, `${relativePath}.title`).trim();
    const category = validateOptionalString(value.category, `${relativePath}.category`).trim();
    const level = validateOptionalString(value.level, `${relativePath}.level`).trim();
    const description = validateOptionalString(value.description, `${relativePath}.description`);
    const docs = validateOptionalString(value.docs, `${relativePath}.docs`);
    const expected = validateOptionalString(value.expected, `${relativePath}.expected`);
    const runPolicy = value.runPolicy == null ? 'manual' : String(value.runPolicy);
    if (!RUN_POLICIES.has(runPolicy)) {
      throw new Error(`${relativePath}.runPolicy must be "safe" or "manual"`);
    }
    const aliases = validateStringArray(value.aliases, `${relativePath}.aliases`)
      .map((alias, index) => validateRelativeJavaScriptPath(alias, `${relativePath}.aliases[${index}]`));
    const aliasSet = new Set(aliases);
    if (aliasSet.size !== aliases.length) throw new Error('duplicate alias in catalog entry: ' + relativePath);
    if (aliasSet.has(relativePath)) throw new Error('catalog alias duplicates its canonical path: ' + relativePath);

    return {
      title: title || relativePath,
      description,
      category: category || 'Other',
      level: level || 'intermediate',
      runPolicy,
      aliases,
      docs,
      platforms: validateStringArray(value.platforms, `${relativePath}.platforms`),
      prerequisites: validateStringArray(value.prerequisites, `${relativePath}.prerequisites`),
      expected,
      tags: validateStringArray(value.tags, `${relativePath}.tags`),
    };
  }

  function validateCatalog(parsed) {
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      throw new Error('examples/catalog.json must contain schemaVersion=1 and an entries object');
    }

    const entries = {};
    for (const [rawPath, rawMetadata] of Object.entries(parsed.entries)) {
      const relativePath = validateRelativeJavaScriptPath(rawPath, 'catalog entry path');
      if (Object.prototype.hasOwnProperty.call(entries, relativePath)) {
        throw new Error('duplicate canonical catalog path: ' + relativePath);
      }
      entries[relativePath] = validateMetadata(relativePath, rawMetadata);
    }

    const canonical = new Set(Object.keys(entries));
    const aliasOwner = new Map();
    for (const [relativePath, metadata] of Object.entries(entries)) {
      for (const alias of metadata.aliases) {
        if (canonical.has(alias)) {
          throw new Error(`catalog alias ${alias} conflicts with a canonical path`);
        }
        const previous = aliasOwner.get(alias);
        if (previous) {
          throw new Error(`catalog alias ${alias} is owned by both ${previous} and ${relativePath}`);
        }
        aliasOwner.set(alias, relativePath);
      }
    }

    return {schemaVersion: 1, entries};
  }

  function readCatalog(file, catalogPath) {
    const info = file.stat(catalogPath);
    if (!info) return {schemaVersion: 1, entries: {}};
    if (info.type !== 'file') throw new Error('examples/catalog.json is not a regular file');
    return validateCatalog(JSON.parse(String(file.read(catalogPath))));
  }

  function walkJavaScript(file, root, dir, output) {
    const names = file.listDir(dir).slice().sort((a, b) => String(a).localeCompare(String(b)));
    for (const name of names) {
      if (!name || String(name).startsWith('.')) continue;
      const absolute = file.join(dir, name);
      const stat = file.stat(absolute);
      if (!stat) continue;
      if (stat.type === 'directory') {
        walkJavaScript(file, root, absolute, output);
        continue;
      }
      if (stat.type !== 'file' || !isExampleJavaScript(name)) continue;
      const prefix = normalizeSlash(root).replace(/\/$/, '') + '/';
      const normalized = normalizeSlash(absolute);
      const relative = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalizeSlash(name);
      output.push({relativePath: relative, absolutePath: absolute, size: stat.size, modifiedAt: stat.modifiedAt});
    }
  }

  function normalizeEntry(discovered, metadata) {
    return {
      relativePath: discovered.relativePath,
      absolutePath: discovered.absolutePath,
      size: discovered.size,
      modifiedAt: discovered.modifiedAt,
      registered: true,
      title: metadata.title,
      description: metadata.description,
      category: metadata.category,
      level: metadata.level,
      runPolicy: metadata.runPolicy,
      aliases: metadata.aliases.slice(),
      docs: metadata.docs,
      platforms: metadata.platforms.slice(),
      prerequisites: metadata.prerequisites.slice(),
      expected: metadata.expected,
      tags: metadata.tags.slice(),
      runnable: metadata.runPolicy === 'safe',
    };
  }

  function scan(options) {
    const file = options.file;
    const examplesRoot = options.examplesRoot;
    const catalogPath = options.catalogPath;
    const rootStat = file.stat(examplesRoot);
    if (!rootStat || rootStat.type !== 'directory') throw new Error('examples root is not available: ' + examplesRoot);

    const catalog = readCatalog(file, catalogPath);
    const discovered = [];
    walkJavaScript(file, examplesRoot, examplesRoot, discovered);
    const byPath = new Map(discovered.map(item => [item.relativePath, item]));
    const aliases = new Set();
    const entries = [];
    const missing = [];

    for (const relativePath of Object.keys(catalog.entries).sort()) {
      const metadata = catalog.entries[relativePath];
      for (const alias of metadata.aliases) aliases.add(alias);
      const item = byPath.get(relativePath);
      if (!item) {
        missing.push({relativePath, metadata});
        continue;
      }
      entries.push(normalizeEntry(item, metadata));
    }

    const canonical = new Set(Object.keys(catalog.entries));
    const unregistered = discovered.filter(item => !canonical.has(item.relativePath) && !aliases.has(item.relativePath));

    entries.sort((left, right) => {
      const byCategory = left.category.localeCompare(right.category);
      if (byCategory) return byCategory;
      return left.title.localeCompare(right.title);
    });

    return {entries, missing, unregistered, catalog};
  }

  function signature(file, examplesRoot) {
    const rows = [];
    function walk(dir) {
      const names = file.listDir(dir).slice().sort((a, b) => String(a).localeCompare(String(b)));
      for (const name of names) {
        if (!name || String(name).startsWith('.')) continue;
        const absolute = file.join(dir, name);
        const stat = file.stat(absolute);
        if (!stat) continue;
        if (stat.type === 'directory') walk(absolute);
        else if (stat.type === 'file' && (isExampleJavaScript(name) || name === 'catalog.json')) {
          rows.push(normalizeSlash(absolute) + '|' + String(stat.size) + '|' + String(stat.modifiedAt));
        }
      }
    }
    walk(examplesRoot);
    return rows.join('\n');
  }

  global.OpenDeskExampleCatalog = {scan, signature};
})(globalThis);
