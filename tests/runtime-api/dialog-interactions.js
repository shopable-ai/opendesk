// Manual/native smoke entrypoint. Run this file with -ui and a native host;
// use the normal macOS controls (or the repository's PID-scoped public JS
// controller) to complete each step. Use only non-sensitive prompt input here;
// the following alert intentionally presents the exact string or null result.
(async () => {
  await alert({ title: 'Dialog alert smoke', message: 'Acknowledge this alert', okText: 'OK' });
  const accepted = await confirm({ title: 'Dialog confirm smoke', message: 'Choose an action', confirmText: 'Continue', cancelText: 'Cancel' });
  const value = await prompt({ title: 'Dialog prompt smoke', message: 'Enter a short value', placeholder: 'value', maxLength: 64 });
  await Dialog.alert({
    title: 'Dialog prompt smoke result',
    message: value === null ? 'Prompt result: null (canceled).' : `Prompt result: ${value}`,
  });
  console.log(JSON.stringify({ dialogInteraction: { accepted, promptValue: value } }));
})();
