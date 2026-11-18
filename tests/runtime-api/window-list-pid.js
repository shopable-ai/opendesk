// Public native bridge regression. Run ONLY when desktop enumeration is authorized.
// From repository root, with a known visible fixture PID after rebuilding:
// OPENDESK_WINDOW_LIST_TEST_PID=<pid> ./dist/opendesk -script tests/runtime-api/window-list-pid.js -console-mode script
// Reads only: no activation, input, launch, or full-desktop window.list().
'use strict';
const check = (value, message) => { if (!value) throw new Error(message); };
const pid = Number(Execution.env.OPENDESK_WINDOW_LIST_TEST_PID);
check(Number.isInteger(pid) && pid > 0 && pid <= 4294967295,
  'Set OPENDESK_WINDOW_LIST_TEST_PID to a known visible fixture PID');
for (const invalidPID of [0, -1, 1.5, '1', NaN, Infinity, 4294967296]) {
  let error;
  try { window.list({pid: invalidPID}); } catch (cause) { error = cause; }
  check(error && error.code === 'INVALID_ARGUMENT' && error.operation === 'window.list',
    'Invalid PID must fail before native enumeration');
}
// A backend error must fail this regression, never count as a successful [].
// macOS has no live process at this PID. Other platforms still exercise the
// documented list+PID filter fallback (and may explicitly report unsupported).
const absent = window.list({pid: 2147483647});
check(Array.isArray(absent) && absent.length === 0, 'Known absent PID must return []');
const rows = window.list({pid});
check(Array.isArray(rows) && rows.length > 0, 'Fixture PID must have visible windows');
for (const row of rows) {
  check(row.pid === pid && row.processId === pid, 'PID scope or normalized aliases lost');
  check(typeof row.id === 'string' && typeof row.title === 'string', 'Snapshot identity/title missing');
  check(['x', 'y', 'width', 'height', 'handle'].every(key => typeof row[key] === 'number'),
    'Native snapshot fields missing');
}
const first = rows[0];
const titled = window.list({pid, title: first.title});
check(titled.length > 0 && titled.every(row => row.pid === pid && row.title === first.title),
  'PID + exact title must compose in JS');
console.log('PASS window.list PID public native bridge: ' + rows.length + ' fixture windows');
