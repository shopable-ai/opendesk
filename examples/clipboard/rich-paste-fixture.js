// Run from the repository root:
// ./opendesk -script examples/clipboard/rich-paste-fixture.js -console-mode script
//
// Writes text + HTML to the system clipboard. It intentionally does not paste,
// restore, or clear anything: paste into the target application yourself.

const marker = `OPENDESK-RICH-PASTE-${Date.now()}`;
const text = `${marker}\nBold + italic HTML paste probe`;
const html = `<p><strong>${marker}</strong></p><p><strong>Bold</strong> + <em>italic</em> HTML paste probe</p>`;
const receipt = clipboard.write({ text, html });
const formats = clipboard.getFormats();
if (!formats.includes('text/plain') || !formats.includes('text/html')) {
  throw new Error('Clipboard did not retain both text/plain and text/html');
}
console.log(JSON.stringify({ ok: true, marker, formats, changeCount: receipt.changeCount }));
