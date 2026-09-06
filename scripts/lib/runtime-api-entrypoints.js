// Host-side helpers used by the existing architecture audit, never by an OpenDesk recipe.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = 'tests/runtime-api/single';
const guide = 'tests/runtime-api/single/README.md';
const listStart = '<!-- runtime-api-single:start -->';
const listEnd = '<!-- runtime-api-single:end -->';

function entriesFor(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('single-entry unit manifest is empty');
  const ids = new Set();
  return files.map(source => {
    const match = typeof source === 'string' && /^tests\/runtime-api\/(?:unit\/)?([a-z][a-z0-9-]*)(?:\.test)?\.js$/.exec(source);
    if (!match) throw new Error(`invalid single-entry unit path: ${source}`);
    const id = match[1];
    if (ids.has(id)) throw new Error(`duplicate single-entry ID: ${id}`);
    ids.add(id);
    return { id, source, entry: `${directory}/${id}.js` };
  });
}

function entrySource(id) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('invalid fixed entry ID');
  return `// Run from the repository root: ./dist/opendesk -script ${directory}/${id}.js -console-mode script
// Thin fixed-scope entry. Assertions remain in the existing Runtime unit manifest.
'use strict';
const runSelected = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/run-selected.js')));
if (typeof runSelected !== 'function') throw new Error('Runtime API selected runner must be a function');
await runSelected('${id}');
`;
}

// Keep the existing helper export for its audit consumers; render a list, not a table.
function documentationTable(files) {
  const rows = entriesFor(files).map(({ id, entry }) =>
    `- \`${id}\`：\`./dist/opendesk -script ${entry} -console-mode script\``);
  return [listStart, ...rows, listEnd].join('\n');
}

// Pure content checks are also usable against a pinned remote file inventory.
function inspectEntries(files, read, list) {
  const errors = [];
  let entries;
  try { entries = entriesFor(files); }
  catch (error) { return { errors: [error.message], entries: [] }; }
  function required(file) {
    try {
      const text = read(file);
      if (typeof text !== 'string' || !text.trim()) throw new Error('empty or non-text file');
      return text.replace(/\r\n/g, '\n');
    } catch (error) { errors.push(`single-entry required file unavailable: ${file}: ${error.message}`); return null; }
  }
  for (const { id, source, entry } of entries) {
    required(source);
    const content = required(entry);
    if (content !== null && content !== entrySource(id)) errors.push(`single entry must only delegate its fixed ID: ${entry}`);
  }
  for (const file of ['tests/runtime-api/support/run-selected.js', 'tests/runtime-api/support/unit-selection.js']) required(file);
  try {
    const expected = new Set(entries.map(({ entry }) => path.posix.basename(entry)));
    for (const item of list(directory)) {
      if (item.endsWith('.js') && !expected.has(item)) errors.push(`single entry is not registered in unit manifest: ${item}`);
    }
  } catch (error) { errors.push(`single-entry directory unavailable: ${error.message}`); }
  const document = required(guide);
  if (document !== null) {
    const start = document.indexOf(listStart), end = document.indexOf(listEnd);
    if (start < 0 || end < start || document.indexOf(listStart, start + 1) >= 0 || document.indexOf(listEnd, end + 1) >= 0
      || document.slice(start, end + listEnd.length) !== documentationTable(files)) {
      errors.push('single-entry documentation list differs from the unit manifest');
    }
  }
  return { errors, entries, guide, scope: 'registered-unit-entrypoints' };
}

function auditRuntimeSingleEntries(root) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  try {
    const context = {};
    vm.runInNewContext(read('tests/runtime-api/manifest.js'), context, { filename: 'tests/runtime-api/manifest.js', timeout: 1000 });
    const files = context.RuntimeAPITestFiles && context.RuntimeAPITestFiles.unit;
    const report = inspectEntries(files, read, dir => fs.readdirSync(path.join(root, dir)));
    const index = read('docs/api/examples/README.md');
    if (!index.includes('(single-tests.md)')) report.errors.push('examples index must link to the example guide');
    if (/；检查：\s*\[[^\]]+\]\([^)]*\/unit\/[^)]+\.test\.js\)/.test(index)) {
      report.errors.push('examples index labels a framework-dependent unit file as a direct check');
    }
    for (const old of ['examples/api-quickstart.js', 'examples/environment.js', 'examples/path.js', 'examples/file-json.js', 'examples/sqlite/smoke.test.js']) {
      if (index.includes(old)) report.errors.push(`examples index must use the canonical path instead of ${old}`);
    }
    return report;
  } catch (error) {
    return { errors: [`single-entry audit could not read its manifest or index: ${error.message}`], entries: [], guide };
  }
}
module.exports = { directory, guide, entriesFor, entrySource, documentationTable, inspectEntries, auditRuntimeSingleEntries };
