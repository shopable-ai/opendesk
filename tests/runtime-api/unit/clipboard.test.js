(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('clipboard');

  test({
    name: 'clipboard exposes rich-format capability metadata without reading content',
    tier: 'unit',
    covers: ['clipboard.getCapabilities', 'clipboard.getFormats'],
  }, async () => {
    const capabilities = clipboard.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'backend must be explicit');
    equal(capabilities.maxPayloadBytes, 16777216, 'aggregate payload limit');
    equal(capabilities.limits.maxPayloadBytes, 16777216, 'structured aggregate payload limit');
    equal(capabilities.limits.maxTextBytes, 4194304, 'text representation limit');
    equal(capabilities.limits.maxFiles, 256, 'file-count limit');
    equal(capabilities.limits.maxPathBytes, 4096, 'file-path limit');
    equal(capabilities.watcher.api, 'Events.on', 'clipboard watcher must reuse Events');
    equal(capabilities.watcher.event, 'clipboard.changed', 'clipboard watcher event');
    equal(capabilities.watcher.contentIncluded, false, 'watcher must not expose clipboard content');
    if (capabilities.rich) {
      const formats = clipboard.getFormats();
      assert(Array.isArray(formats), 'getFormats must return an array');
      for (const format of formats) {
        assert(['text/plain', 'text/html', 'text/rtf', 'image/png', 'files'].includes(format), 'unknown canonical format');
      }
      const metadata = clipboard.read({ formats: [] });
      assert(Array.isArray(metadata.formats), 'metadata-only read must list available formats');
      for (const key of ['text', 'html', 'rtfBase64', 'pngBase64', 'files']) {
        assert(metadata[key] === undefined, `metadata-only read exposed ${key}`);
      }
    } else {
      await expectThrow(() => clipboard.getFormats(), 'NOT_SUPPORTED');
    }
  });

  test({
    name: 'clipboard rejects invalid rich reads and writes before changing operator state',
    tier: 'unit',
    covers: ['clipboard.read', 'clipboard.write'],
  }, async () => {
    await expectThrow(() => clipboard.read({ formats: ['application/json'] }), 'UNSUPPORTED_FORMAT');
    await expectThrow(() => clipboard.read({ maxBytes: 0 }), 'INVALID_ARGUMENT');
    await expectThrow(() => clipboard.write({}), 'INVALID_ARGUMENT');
    await expectThrow(() => clipboard.write({ text: 'x', unknown: true }), 'INVALID_ARGUMENT');
    await expectThrow(() => clipboard.write({ rtfBase64: 'e1xydGYxXGFuc2kgdGVzdH0=\n' }), 'INVALID_ARGUMENT');
  });
})();
