// Fresh-process observer for AppKit metadata cached by NSRunningApplication.
'use strict';
const pid = Number(Execution.env.OPENDESK_PRESENTATION_OBSERVER_PID || 0);
if (!Number.isInteger(pid) || pid <= 0) throw new Error('observer requires its own test host PID');
console.log('WINDOW_POLICY=' + JSON.stringify(App.list().find(item => item.pid === pid)));
