'use strict';
// Read one actual console JSON object before optional trailing log metadata.
// This only parses data; it makes no execution, business or Gate decision.
const MAX_LINE_BYTES = 256 * 1024;
function jsonObjects(line) {
  if (typeof line !== 'string' || Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('LOG_LINE_LIMIT');
  const objects = [];
  for (let start = line.indexOf('{'); start >= 0; start = line.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { if (--depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) break;
    const fragment = line.slice(start, end);
    try { objects.push({ start, end, fragment, value: JSON.parse(fragment) }); }
    catch { /* Preserve caller's raw line; malformed fragments are not events. */ }
    start = end - 1;
  }
  return objects;
}
function structuredEvents(text) {
  return text.split(/\r?\n/).flatMap((line, i) => jsonObjects(line)
    .filter(object => typeof object.value?.kind === 'string')
    .map(object => ({ sourceLine: i + 1, ...object })));
}
module.exports = { jsonObjects, structuredEvents };
