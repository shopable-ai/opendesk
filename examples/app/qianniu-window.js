// From the repository root: ./opendesk -script examples/app/qianniu-window.js -console-mode script
// Windows-only Qianniu inventory by default. Does not read conversation contents or change windows.
// To explicitly set topmost: configure exact WINDOW_TITLE/PID, ALLOW_WINDOW_CHANGE=1 and OPENDESK_EXAMPLE_QIANNIU_TOPMOST=on|off.
// Setting topmost has no public read-back API here: the result requires visual confirmation, not a claimed restoration.
'use strict';
if (System.getPlatformInfo().os !== 'windows') throw new Error('This Qianniu example targets AliWorkbench.exe on Windows');
const createGuard = (0, eval)(File.read(File.join(File.cwd(), 'examples/desktop/support/target-window.js')));
const guard = createGuard();
guard.requireCapability('window.list');
const isQianniu = info => String(info.exeName || '').toLowerCase() === 'aliworkbench.exe';
const mode = Execution.env.OPENDESK_EXAMPLE_QIANNIU_TOPMOST;
if (mode === undefined) {
  const rows = (await window.list()).filter(isQianniu);
  const showTitles = Execution.env.OPENDESK_EXAMPLE_SHOW_TITLES === '1';
  console.log('[QIANNIU-WINDOWS] ' + JSON.stringify(rows.map(row => ({ id: row.id, pid: row.pid, ...(showTitles ? { title: row.title } : {}) }))));
} else {
  if (!['on', 'off'].includes(mode)) throw new Error('QIANNIU_TOPMOST must be on or off');
  if (Execution.env.OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE !== '1') throw new Error('Qianniu topmost needs explicit ALLOW_WINDOW_CHANGE=1');
  guard.requireCapability('window.alwaysOnTop');
  const target = await guard.select();
  const info = await guard.current(target);
  if (!isQianniu(info)) throw new Error('Selected target is not AliWorkbench.exe');
  await window.setAlwaysOnTop(target.title, mode === 'on');
  await guard.current(target);
  console.log('[QIANNIU-WINDOWS] topmost request completed; visually verify (prior state not restored)');
}
