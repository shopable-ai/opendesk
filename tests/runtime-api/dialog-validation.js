// Run with an explicitly enabled Custom UI host. Every call below is rejected
// before a native window is created, so this is deterministic and safe for CI.
async function main() {
  const invalid = [
    () => Dialog.alert({ message: '' }),
    () => Dialog.alert({ message: 'x', level: 'unknown' }),
    () => Dialog.alert({ message: 'x', html: '<script>throw new Error()</script>' }),
    () => Dialog.alert(Object.create({ message: 'x', html: '<script>' })),
    () => Dialog.confirm({ message: 'x', defaultAction: 'later' }),
    () => Dialog.confirm({ message: 'x', onConfirm() {} }),
    () => Dialog.prompt({ message: 'x', onCancel() {} }),
    () => Dialog.prompt({ message: 'x', maxLength: NaN }),
    () => Dialog.prompt({ message: 'x', maxLength: 16385 }),
    () => Dialog.prompt({ message: 'x', secure: 'true' }),
  ];
  for (const invoke of invalid) {
    let error;
    try { await invoke(); } catch (caught) { error = caught; }
    if (!error || error.code !== 'DIALOG_INVALID_OPTIONS') {
      throw new Error('expected DIALOG_INVALID_OPTIONS');
    }
  }
  const capabilities = Dialog.getCapabilities();
  if (!capabilities.enabled || !capabilities.available || capabilities.maxConcurrent !== 1) {
    throw new Error('enabled Dialog capability report is invalid');
  }
  console.log(JSON.stringify({ dialogValidation: 'passed' }));
}

await main();
