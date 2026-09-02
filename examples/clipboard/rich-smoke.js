// Run from the repository root:
// go run ./cmd/opendesk -script examples/clipboard/rich-smoke.js -console-mode script

const evidenceDirectory = '.runtime/tests/platform-primitives/task-005-clipboard';
const evidencePath = File.join(evidenceDirectory, 'rich-smoke.json');
const fixturePath = File.join(File.cwd(), evidenceDirectory, 'fixture.txt');
const expectedText = `opendesk-rich-clipboard-${Date.now()}`;
const expectedHTML = `<strong>${expectedText}</strong>`;
const expectedRTFBase64 = 'e1xydGYxXGFuc2kgT3BlbkRlc2sgcmljaCBjbGlwYm9hcmR9';
const expectedPNGBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const expectedFormats = ['text/plain', 'text/html', 'text/rtf', 'image/png', 'files'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function restorationPayload(snapshot) {
  const payload = {};
  if (snapshot.text !== undefined) payload.text = snapshot.text;
  if (snapshot.html !== undefined) payload.html = snapshot.html;
  if (snapshot.rtfBase64 !== undefined) payload.rtfBase64 = snapshot.rtfBase64;
  if (snapshot.pngBase64 !== undefined) payload.pngBase64 = snapshot.pngBase64;
  if (snapshot.files !== undefined) payload.files = snapshot.files;
  return payload;
}

const capabilities = clipboard.getCapabilities();
assert(capabilities.rich, 'rich clipboard is not supported on this platform');
assert(capabilities.watcher.api === 'Events.on', 'clipboard watcher must reuse Events');
assert(capabilities.watcher.contentIncluded === false, 'clipboard watcher must omit content');

// The snapshot is kept in memory only. Never log it or write it to Evidence.
const original = clipboard.read();
assert(
  original.unsupportedNativeFormats.length === 0,
  `refusing to mutate clipboard because native formats cannot be restored losslessly: ${JSON.stringify(original.unsupportedNativeFormats)}`,
);

File.ensureDir(evidenceDirectory);
File.write(fixturePath, 'fixture');

let mutated = false;
let ownedChangeCount = null;
const restoration = { completed: false, skippedBecauseClipboardChanged: false };
let evidence;
try {
  const pendingChange = Events.once('clipboard.changed', { timeout: 5000 });
  await sleep(500); // Let the polling watcher establish its baseline.
  mutated = true;
  const writeResult = clipboard.write({
    text: expectedText,
    html: expectedHTML,
    rtfBase64: expectedRTFBase64,
    pngBase64: expectedPNGBase64,
    files: [fixturePath],
  });
  ownedChangeCount = writeResult.changeCount;
  const changeEvent = await pendingChange;
  const readback = clipboard.read();

  assert(JSON.stringify(writeResult.formats) === JSON.stringify(expectedFormats), 'write format verification failed');
  assert(JSON.stringify(readback.formats) === JSON.stringify(expectedFormats), 'read format verification failed');
  assert(readback.text === expectedText, 'plain-text readback failed');
  assert(readback.html === expectedHTML, 'HTML readback failed');
  assert(readback.rtfBase64 === expectedRTFBase64, 'RTF readback failed');
  assert(readback.pngBase64 === expectedPNGBase64, 'PNG readback failed');
  assert(readback.files.length === 1 && readback.files[0] === fixturePath, 'file-list readback failed');
  assert(changeEvent.type === 'clipboard.changed', 'clipboard change event was not observed');
  assert(changeEvent.data.contentIncluded === false, 'clipboard event exposed content');

  clipboard.clear();
  assert(clipboard.getFormats().length === 0, 'clear left a supported representation');
  assert(clipboard.paste() === '', 'clear did not produce an empty text read');
  ownedChangeCount = clipboard.read({ formats: [] }).changeCount;

  evidence = {
    schemaVersion: 1,
    task: 'TASK-005-rich-clipboard',
    platform: System.getPlatformInfo(),
    backend: capabilities.backend,
    formats: readback.formats,
    writeChangeCount: writeResult.changeCount,
    readChangeCount: readback.changeCount,
    representations: {
      textBytes: expectedText.length,
      htmlBytes: expectedHTML.length,
      rtfBase64Bytes: expectedRTFBase64.length,
      pngBase64Bytes: expectedPNGBase64.length,
      fileCount: readback.files.length,
    },
    event: {
      type: changeEvent.type,
      backend: changeEvent.backend,
      changeCount: changeEvent.data.changeCount,
      contentIncluded: changeEvent.data.contentIncluded,
    },
    clear: { formats: 0, pasteBytes: 0 },
    restoration,
    clipboardContentRecorded: false,
    filePathsRecorded: false,
  };
} finally {
  if (mutated) {
    const current = clipboard.read({ formats: [] });
    if (current.changeCount === ownedChangeCount) {
      const payload = restorationPayload(original);
      if (Object.keys(payload).length === 0) clipboard.clear();
      else clipboard.write(payload);
      restoration.completed = true;
    } else {
      restoration.skippedBecauseClipboardChanged = true;
    }
  }
  if (File.exists(fixturePath)) File.remove(fixturePath);
}

File.write(evidencePath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ok: true, evidencePath, formats: evidence.formats, restoration: evidence.restoration }));
