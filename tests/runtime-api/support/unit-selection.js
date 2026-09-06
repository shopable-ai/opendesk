// Pure selection over the existing manifest. No API calls, file discovery or globals.
(function createUnitSelection() {
'use strict';
function parse(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('OPENDESK_RUNTIME_API_UNIT_FILTER is required, e.g. file,path');
  }
  const ids = value.split(',').map((item) => item.trim().toLowerCase());
  if (ids.some((id) => !/^[a-z][a-z0-9-]*$/.test(id))) {
    throw new Error('unit filter must contain comma-separated file IDs, not paths or wildcards');
  }
  return Object.freeze([...new Set(ids)]);
}
function select(files, value) {
  const requested = parse(value);
  if (!Array.isArray(files) || files.length === 0) throw new Error('unit manifest is empty');
  const byId = new Map();
  for (const file of files) {
    if (typeof file !== 'string') throw new Error('unit manifest paths must be strings');
    const match = /^tests\/runtime-api\/(?:unit\/)?([a-z][a-z0-9-]*)(?:\.test)?\.js$/.exec(file);
    if (!match) throw new Error(`invalid unit manifest path: ${file}`);
    const id = match[1];
    if (byId.has(id)) throw new Error(`duplicate unit manifest ID: ${id}`);
    byId.set(id, file);
  }
  const unknown = requested.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`unknown unit filter: ${unknown.join(', ')}; available: ${[...byId.keys()].join(', ')}`);
  const wanted = new Set(requested);
  const selected = [...byId].filter(([id]) => wanted.has(id));
  return Object.freeze({
    scope: 'selected-unit-files',
    fullCatalog: false,
    ids: Object.freeze(selected.map(([id]) => id)),
    files: Object.freeze(selected.map(([, file]) => file)),
    availableCount: files.length,
  });
}
return Object.freeze({ parse, select });
})
