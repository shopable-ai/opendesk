// From the repository root:
// OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 ./opendesk -script examples/clipboard/text.js -console-mode script
// Replaces ALL current clipboard formats with fixed demo text. Does not restore or clear it, and never auto-pastes.
// Use a disposable clipboard; original content is never read or logged. Expected: [CLIPBOARD-EXAMPLE] passed.
'use strict';
if (Execution.env.OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE !== '1') {
  throw new Error('This example overwrites the clipboard; set OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 explicitly');
}
const text = 'OpenDesk clipboard example';
clipboard.copy(text);
const actual = clipboard.paste();
if (actual !== text) throw new Error('Clipboard example: read-back mismatch (content omitted)');
console.log('[CLIPBOARD-EXAMPLE] passed; demo text remains on clipboard, original formats were not restored');
