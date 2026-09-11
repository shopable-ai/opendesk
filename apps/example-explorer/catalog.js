(function installOpenDeskExampleCatalog(global) {
  'use strict';

  function normalizeSlash(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  function isExampleJavaScript(name) {
    const value = String(name || '');
    return value.length > 3
      && value.toLowerCase().endsWith('.js')
      && !value.startsWith('.');
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
      const relative = normalizeSlash(absolute).startsWith(prefix)
        ? normalizeSlash(absolute).slice(prefix.length)
        : normalizeSlash(name);
      output.push({
        relativePath: relative,
        absolutePath: absolute,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
      });
    }
  }

  function deriveCategory(relativePath) {
    const parts = normalizeSlash(relativePath).split('/');
    if (parts.length > 1) {
      const first = parts[0];
      return first.replace(/[-_]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    }
    return 'General';
  }

  function deriveTitle(relativePath) {
    const parts = normalizeSlash(relativePath).split('/');
    const name = parts[parts.length - 1].replace(/\.js$/i, '');
    return name.replace(/[-_.]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function normalizeEntry(discovered, metadata) {
    const meta = metadata && typeof metadata === 'object' ? metadata : null;
    const registered = !!meta;
    const runPolicy = registered && typeof meta.runPolicy === 'string' ? meta.runPolicy : 'unregistered';
    return {
      relativePath: discovered.relativePath,
      absolutePath: discovered.absolutePath,
      size: discovered.size,
      modifiedAt: discovered.modifiedAt,
      registered,
      title: registered && meta.title ? String(meta.title) : deriveTitle(discovered.relativePath),
      description: registered && meta.description ? String(meta.description) : 'Discovered JavaScript example; metadata has not been reviewed yet.',
      category: registered && meta.category ? String(meta.category) : deriveCategory(discovered.relativePath),
      level: registered && meta.level ? String(meta.level) : 'unregistered',
      runPolicy,
      docs: registered && meta.docs ? String(meta.docs) : '',
      platforms: registered && Array.isArray(meta.platforms) ? meta.platforms.map(String) : [],
      prerequisites: registered && Array.isArray(meta.prerequisites) ? meta.prerequisites.map(String) : [],
      expected: registered && meta.expected ? String(meta.expected) : '',
      tags: registered && Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      runnable: runPolicy === 'safe',
    };
  }

  function scan(options) {
    const file = options.file;
    const examplesRoot = options.examplesRoot;
    const catalogPath = options.catalogPath;
    const rootStat = file.stat(examplesRoot);
    if (!rootStat || rootStat.type !== 'directory') {
      throw new Error('examples root is not available: ' + examplesRoot);
    }

    const catalog = readCatalog(file, catalogPath);
    const discovered = [];
    walkJavaScript(file, examplesRoot, examplesRoot, discovered);
    const seen = new Set();
    const entries = discovered.map(item => {
      seen.add(item.relativePath);
      return normalizeEntry(item, catalog.entries[item.relativePath]);
    });

    const missing = [];
    for (const path of Object.keys(catalog.entries).sort()) {
      if (!seen.has(path)) missing.push({relativePath: path, metadata: catalog.entries[path]});
    }

    entries.sort((left, right) => {
      if (left.registered !== right.registered) return left.registered ? -1 : 1;
      const byCategory = left.category.localeCompare(right.category);
      if (byCategory) return byCategory;
      return left.title.localeCompare(right.title);
    });

    return {entries, missing, catalog};
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
        if (stat.type === 'directory') {
          walk(absolute);
        } else if (stat.type === 'file' && (isExampleJavaScript(name) || name === 'catalog.json')) {
          rows.push(normalizeSlash(absolute) + '|' + String(stat.size) + '|' + String(stat.modifiedAt));
        }
      }
    }
    walk(examplesRoot);
    return rows.join('\n');
  }

  global.OpenDeskExampleCatalog = {scan, signature};
})(globalThis);
