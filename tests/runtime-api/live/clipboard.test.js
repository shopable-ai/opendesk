(() => {
  const { assert, equal } = RuntimeAPITest;
  RuntimeAPITest.test({
    name: 'clipboard text, rich formats, true clear, and global helpers restore operator state',
    tier: 'live',
    covers: [
      'clipboard.copy', 'clipboard.paste', 'clipboard.clear', 'clipboard.read', 'clipboard.write',
      'clipboard.getFormats', 'clipboard.getCapabilities', 'global.copyToClipboard', 'global.getClipboard',
    ],
  }, async () => {
    const original = clipboard.read();
    assert(original.unsupportedNativeFormats.length === 0, 'cannot losslessly restore private native clipboard formats');
    const originalPayload = {};
    for (const key of ['text', 'html', 'rtfBase64', 'pngBase64', 'files']) {
      if (original[key] !== undefined) originalPayload[key] = original[key];
    }
    const first = `opendesk-剪贴板-${Date.now()}`;
    const second = `polyfill-✓-${Date.now()}`;
    const html = `<strong>${first}</strong>`;
    const rtfBase64 = 'e1xydGYxXGFuc2kgT3BlbkRlc2sgcmljaCBjbGlwYm9hcmR9';
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const fixturePath = File.join(RuntimeAPITest.context.runDir, 'clipboard-live-fixture.txt');
    File.write(fixturePath, 'fixture');
    try {
      await clipboard.copy(first);
      equal(await clipboard.paste(), first);
      clipboard.write({ text: first, html, rtfBase64, pngBase64, files: [fixturePath] });
      const rich = clipboard.read();
      equal(rich.text, first);
      equal(rich.html, html);
      equal(rich.rtfBase64, rtfBase64);
      equal(rich.pngBase64, pngBase64);
      equal(rich.files.length, 1);
      equal(rich.files[0], fixturePath);
      equal(clipboard.getFormats().length, 5);
      equal(clipboard.getCapabilities().watcher.api, 'Events.on');
      await clipboard.clear();
      equal(clipboard.getFormats().length, 0);
      equal(await clipboard.paste(), '');
      await copyToClipboard(second);
      equal(await getClipboard(), second);
    } finally {
      if (Object.keys(originalPayload).length === 0) clipboard.clear();
      else clipboard.write(originalPayload);
      if (File.exists(fixturePath)) File.remove(fixturePath);
    }
  });
})();
