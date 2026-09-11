(function installOpenDeskExampleCatalog(global) {
  'use strict';

  const SCHEMA_VERSION = 2;
  const RUN_POLICIES = new Set(['safe', 'manual']);
  const LAUNCH_KINDS = new Set(['script', 'ai-run']);
  const CONSOLE_MODES = new Set(['normal', 'full', 'script', 'meta', 'summary', 'quiet', 'agent']);
  const PLATFORMS = new Set(['darwin', 'linux', 'windows']);
  const LEVELS = new Set(['beginner', 'intermediate', 'advanced']);

  function normalizeSlash(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  function normalizePlatform(value) {
    const platform = String(value || '').trim().toLowerCase();
    return platform || '';
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

  function validateString(value, label, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || (required && !value.trim())) {
      throw new Error(label + ' must be a non-empty string');
    }
    if ([...value].some(character => character.charCodeAt(0) < 0x20)) {
      throw new Error(label + ' must not contain control characters');
    }
    return value;
  }

  function validateStringArray(value, label) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error(label + ' must be an array');
    return value.map((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`${label}[${index}] must be a non-empty string`);
      }
      if ([...item].some(character => character.charCodeAt(0) < 0x20)) {
        throw new Error(`${label}[${index}] must not contain control characters`);
      }
      return item.trim();
    });
  }

  function validatePlatformArray(value, label) {
    const platforms = validateStringArray(value, label).map(item => item.trim().toLowerCase());
    if (!platforms.length) throw new Error(label + ' must contain at least one platform');
    for (const platform of platforms) {
      if (!PLATFORMS.has(platform)) throw new Error(`${label} contains unsupported platform: ${platform}`);
    }
    if (new Set(platforms).size !== platforms.length) throw new Error(label + ' contains duplicate platforms');
    return platforms;
  }

  function validateLaunch(relativePath, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${relativePath}.launch must be an object`);
    }
    const kind = validateString(value.kind, `${relativePath}.launch.kind`, true).trim();
    if (!LAUNCH_KINDS.has(kind)) {
      throw new Error(`${relativePath}.launch.kind must be "script" or "ai-run"`);
    }
    if (value.ui !== undefined && typeof value.ui !== 'boolean') {
      throw new Error(`${relativePath}.launch.ui must be a boolean`);
    }
    const ui = value.ui === true;
    if (kind === 'ai-run' && ui) {
      throw new Error(`${relativePath}.launch.ui is not supported for ai-run`);
    }
    const consoleMode = value.consoleMode == null ? 'script' : validateString(value.consoleMode, `${relativePath}.launch.consoleMode`, true).trim();
    if (kind === 'script' && !CONSOLE_MODES.has(consoleMode)) {
      throw new Error(`${relativePath}.launch.consoleMode is not a supported console mode`);
    }
    if (kind === 'ai-run' && value.consoleMode != null) {
      throw new Error(`${relativePath}.launch.consoleMode is only valid for script`);
    }
    const input = value.input == null ? 'none' : validateString(value.input, `${relativePath}.launch.input`, true).trim();
    if (!['none', 'required'].includes(input)) {
      throw new Error(`${relativePath}.launch.input must be "none" or "required"`);
    }
    if (input === 'required' && kind !== 'ai-run') {
      throw new Error(`${relativePath}.launch.input is only valid for ai-run`);
    }
    return {kind, ui, consoleMode: kind === 'script' ? consoleMode : null, input};
  }

  function validateMetadata(relativePath, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('catalog metadata must be an object: ' + relativePath);
    }
    const title = validateString(value.title, `${relativePath}.title`, true).trim();
    const category = validateString(value.category, `${relativePath}.category`, true).trim();
    const level = validateString(value.level, `${relativePath}.level`, true).trim();
    if (!LEVELS.has(level)) throw new Error(`${relativePath}.level must be beginner, intermediate, or advanced`);
    const description = validateString(value.description, `${relativePath}.description`, true);
    const docs = validateString(value.docs, `${relativePath}.docs`);
    const expected = validateString(value.expected, `${relativePath}.expected`);
    const runPolicy = validateString(value.runPolicy, `${relativePath}.runPolicy`, true).trim();
    if (!RUN_POLICIES.has(runPolicy)) {
      throw new Error(`${relativePath}.runPolicy must be "safe" or "manual"`);
    }
    const legacyNames = validateStringArray(value.legacyNames, `${relativePath}.legacyNames`)
      .map(name => name.trim());
    const legacyNameSet = new Set(legacyNames);
    if (legacyNameSet.size !== legacyNames.length) throw new Error('duplicate legacy name in catalog entry: ' + relativePath);
    if (legacyNameSet.has(relativePath)) throw new Error('legacy name duplicates its canonical path: ' + relativePath);

    const requiredEnv = validateStringArray(value.requiredEnv, `${relativePath}.requiredEnv`);
    for (const variable of requiredEnv) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
        throw new Error(`${relativePath}.requiredEnv contains an invalid environment variable name: ${variable}`);
      }
    }
    if (new Set(requiredEnv).size !== requiredEnv.length) {
      throw new Error(`${relativePath}.requiredEnv contains duplicate variables`);
    }

    return {
      title,
      description,
      category,
      level,
      runPolicy,
      legacyNames,
      docs,
      platforms: validatePlatformArray(value.platforms, `${relativePath}.platforms`),
      prerequisites: validateStringArray(value.prerequisites, `${relativePath}.prerequisites`),
      requiredEnv,
      expected,
      tags: validateStringArray(value.tags, `${relativePath}.tags`),
      launch: validateLaunch(relativePath, value.launch),
    };
  }

  function validateCatalog(parsed) {
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      throw new Error(`examples/catalog.json must contain schemaVersion=${SCHEMA_VERSION} and an entries object`);
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
    const legacyNameOwner = new Map();
    for (const [relativePath, metadata] of Object.entries(entries)) {
      for (const legacyName of metadata.legacyNames) {
        if (canonical.has(legacyName)) {
          throw new Error(`catalog legacy name ${legacyName} conflicts with a canonical path`);
        }
        const previous = legacyNameOwner.get(legacyName);
        if (previous) {
          throw new Error(`catalog legacy name ${legacyName} is owned by both ${previous} and ${relativePath}`);
        }
        legacyNameOwner.set(legacyName, relativePath);
      }
    }

    return {schemaVersion: SCHEMA_VERSION, entries};
  }

  function readCatalog(file, catalogPath) {
    const info = file.stat(catalogPath);
    if (!info) return {schemaVersion: SCHEMA_VERSION, entries: {}};
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

  function normalizeEntry(discovered, metadata, currentPlatform) {
    const platformSupported = !currentPlatform || metadata.platforms.includes(currentPlatform);
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
      legacyNames: metadata.legacyNames.slice(),
      docs: metadata.docs,
      platforms: metadata.platforms.slice(),
      prerequisites: metadata.prerequisites.slice(),
      requiredEnv: metadata.requiredEnv.slice(),
      expected: metadata.expected,
      tags: metadata.tags.slice(),
      launch: Object.assign({}, metadata.launch),
      platformSupported,
      runnable: metadata.runPolicy === 'safe' && platformSupported,
    };
  }

  function scan(options) {
    options = options || {};
    const file = options.file;
    const examplesRoot = options.examplesRoot;
    const catalogPath = options.catalogPath;
    const rootStat = file.stat(examplesRoot);
    if (!rootStat || rootStat.type !== 'directory') throw new Error('examples root is not available: ' + examplesRoot);

    const catalog = readCatalog(file, catalogPath);
    const discovered = [];
    walkJavaScript(file, examplesRoot, examplesRoot, discovered);
    const byPath = new Map(discovered.map(item => [item.relativePath, item]));
    const legacyNames = new Set();
    const entries = [];
    const missing = [];

    for (const relativePath of Object.keys(catalog.entries).sort()) {
      const metadata = catalog.entries[relativePath];
      for (const name of metadata.legacyNames) legacyNames.add(name);
      const item = byPath.get(relativePath);
      if (!item) {
        missing.push({relativePath, metadata});
        continue;
      }
      entries.push(normalizeEntry(item, metadata, normalizePlatform(options.currentPlatform)));
    }

    const canonical = new Set(Object.keys(catalog.entries));
    const unregistered = discovered.filter(item => !canonical.has(item.relativePath) && !legacyNames.has(item.relativePath));

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
