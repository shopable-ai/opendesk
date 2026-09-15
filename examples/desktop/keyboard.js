// From the repository root (prepare a disposable text editor window, then use its exact title and PID):
// OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 ./opendesk -script examples/desktop/keyboard.js -console-mode script
// Sends ONE fixed line to the explicitly selected target after focusing and verifying it. Does not click, press Enter, submit or send a shortcut.
// Window identity does not prove an editable control; click a disposable text field yourself first.
'use strict';
const createGuard = (0, eval)(File.read(File.join(File.cwd(), 'examples/desktop/support/target-window.js')));
const guard = createGuard();
const target = await guard.select();
await guard.focus(target);
await guard.focused(target);
await keyboard.type('Hello from OpenDesk');
// Check again to detect a focus change, but do not pretend the preceding OS input can be rolled back.
await guard.focused(target);
console.log('[KEYBOARD-EXAMPLE] input dispatched; manually verify the text field (content not programmatically verified)');
