// Native keyboard smoke. The host-owned normal window must retain focus so
// public keyboard events reach its controls; no mock or HTML event is used.
(async () => {
  const confirmation = Dialog.confirm({
    title: 'Dialog confirm Esc smoke', message: 'Esc must choose cancel.',
    confirmText: 'Continue', cancelText: 'Cancel',
  });
  await sleep(500);
  await keyboard.press('ESC');
  if (await confirmation !== false) throw new Error('confirm Esc did not return false');

  const value = Dialog.prompt({
    title: 'Dialog prompt Esc smoke', message: 'Esc must return null.',
    placeholder: 'value',
  });
  await sleep(500);
  await keyboard.press('ESC');
  if (await value !== null) throw new Error('prompt Esc did not return null');
  console.log(JSON.stringify({ dialogEsc: 'passed' }));
})();
