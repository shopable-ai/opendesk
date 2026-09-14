// Run from the repository root:
// OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 ./opendesk -script examples/clipboard/file.js -console-mode script
//
// Writes test-clip.txt to the system clipboard for one manual paste. It does
// not open another app, paste automatically, restore, clear, or send anything.

'use strict';

if (Execution.env.OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE !== '1') {
  throw new Error('This example overwrites the clipboard; set OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 explicitly');
}

const filePath = File.join(File.cwd(), 'examples', 'clipboard', 'test-clip.txt');
if (!File.isFile(filePath)) throw new Error(`Missing clipboard fixture: ${filePath}`);

const writeResult = clipboard.write({ files: [filePath] });
const readResult = clipboard.read({ formats: ['files'] });
if (!Array.isArray(readResult.files)
    || readResult.files.length !== 1
    || readResult.files[0] !== filePath) {
  throw new Error('Clipboard file read-back mismatch');
}

console.log(JSON.stringify({
  ok: true,
  filePath,
  formats: writeResult.formats,
  changeCount: writeResult.changeCount,
}));
