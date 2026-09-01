// Native Enter/input smoke driven through the public keyboard API. The result
// is checked exactly but the value itself is never printed into runtime logs.
(async () => {
  const defaultCancel = Dialog.confirm({
    title: 'Dialog default-action smoke', message: 'Enter must honor cancel.',
    confirmText: 'Continue', cancelText: 'Cancel', defaultAction: 'cancel',
  });
  await sleep(500);
  await keyboard.press('ENTER');
  if (await defaultCancel !== false) throw new Error('Enter ignored defaultAction: cancel');

  const value = Dialog.prompt({
    title: 'Dialog prompt Enter smoke', message: 'Enter the fixed test value.',
    placeholder: 'Task name', maxLength: 64,
  });
  await sleep(500);
  await keyboard.type('dialog-smoke-value');
  await keyboard.press('ENTER');
  if (await value !== 'dialog-smoke-value') throw new Error('prompt Enter value mismatch');
  console.log(JSON.stringify({ dialogEnter: 'passed' }));
})();
