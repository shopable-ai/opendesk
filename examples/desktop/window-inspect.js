// From the repository root: ./opendesk -script examples/desktop/window-inspect.js -console-mode script
// Read-only window inventory. No focus/resize, window content, screenshots, titles or executable paths in output.
// Set OPENDESK_EXAMPLE_SHOW_TITLES=1 only to choose a disposable test target; titles may be sensitive.
'use strict';
const capabilities = window.getCapabilities();
if (!capabilities.capabilities || capabilities.capabilities['window.list']?.supported !== true) {
  throw new Error('Window inventory is not supported on this platform');
}
const rows = await window.list();
if (!Array.isArray(rows)) throw new Error('Window inventory returned an invalid list');
const showTitles = Execution.env.OPENDESK_EXAMPLE_SHOW_TITLES === '1';
const windows = rows.map(row => ({
  id: row.id, pid: row.pid, x: row.x, y: row.y, width: row.width, height: row.height,
  ...(showTitles ? { title: row.title } : {}),
}));
console.log('[WINDOW-INSPECT] ' + JSON.stringify({ platform: capabilities.platform, count: windows.length, windows }));
