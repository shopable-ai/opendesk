(function installOpenDeskExampleCatalog(global) {
  'use strict';

  function normalizeSlash(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  function isExampleJavaScript(name) {
    const value = String(name || '');
    return value.length > 3 && value.toLowerCase().endsWith('.js') && !value.startsWith('.');
  }

  function readCatalog(file, catalogPath) {
    const info = file.stat(catalogPath);
    if (!info) return {schemaVersion: 1, entries: {}};
    if (info.type !== 'file') throw new Error('examples/catalog.json is not a regular file');
    const parsed = JSON.parse(String(file.read(catalogPath)));
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      throw new Error('examples/catalog.json must contain schemaVersion=1 and an entries object');
    }
    return parsed;
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
    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const runPolicy = typeof meta.runPolicy === 'string' ? meta.runPolicy : 'manual';
    return {
      relativePath: discovered.relativePath,
      absolutePath: discovered.absolutePath,
      size: discovered.size,
      modifiedAt: discovered.modifiedAt,
      registered: true,
      title: meta.title ? String(meta.title) : discovered.relativePath,
      description: meta.description ? String(meta.description) : '',
      category: meta.category ? String(meta.category) : 'Other',
      level: meta.level ? String(meta.level) : 'intermediate',
      runPolicy,
      aliases: Array.isArray(meta.aliases) ? meta.aliases.map(normalizeSlash) : [],
      docs: meta.docs ? String(meta.docs) : '',
      platforms: Array.isArray(meta.platforms) ? meta.platforms.map(String) : [],
      prerequisites: Array.isArray(meta.prerequisites) ? meta.prerequisites.map(String) : [],
      expected: meta.expected ? String(meta.expected) : '',
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      runnable: runPolicy === 'safe',
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
      if (metadata && Array.isArray(metadata.aliases)) {
        for (const alias of metadata.aliases) aliases.add(normalizeSlash(alias));
      }
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
