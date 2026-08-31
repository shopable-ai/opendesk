(() => {
  RuntimeAPITest.test({
    name: 'clipboard and global helpers round trip Unicode and restore operator state',
    tier: 'live',
    covers: ['clipboard.copy', 'clipboard.paste', 'clipboard.clear', 'global.copyToClipboard', 'global.getClipboard'],
  }, async () => {
    const original = await clipboard.paste();
    const first = `clawdesk-剪贴板-${Date.now()}`;
    const second = `polyfill-✓-${Date.now()}`;
    try {
      await clipboard.copy(first);
      RuntimeAPITest.equal(await clipboard.paste(), first);
      await clipboard.clear();
      RuntimeAPITest.equal(await clipboard.paste(), ' ');
      await copyToClipboard(second);
      RuntimeAPITest.equal(await getClipboard(), second);
    } finally {
      await clipboard.copy(original);
    }
  });
})();
