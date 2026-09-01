// Run with -ui and a native host. A PID-scoped public JS controller must
// acknowledge the first alert after the second call proves DIALOG_BUSY.
(async () => {
  const first = Dialog.alert({
    title: 'Dialog busy smoke',
    message: 'Keep this alert open while the second call is rejected.',
    okText: 'Acknowledge',
  });
  await sleep(250);
  let error;
  try {
    await Dialog.confirm({ message: 'This must not open.' });
  } catch (caught) {
    error = caught;
  }
  if (!error || error.code !== 'DIALOG_BUSY' || error.operation !== 'Dialog.confirm') {
    throw new Error('concurrent Dialog did not reject with DIALOG_BUSY');
  }
  await first;
  console.log(JSON.stringify({ dialogBusy: 'passed' }));
})();
