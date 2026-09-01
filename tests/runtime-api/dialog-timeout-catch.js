// Run with `-ui -timeout 1`. The host closes the window, Dialog rejects with
// DIALOG_TIMEOUT on the owner EventLoop, then the overall execution records
// its normal timed_out terminal status.
(async () => {
  let error;
  try {
    await Dialog.alert({
      title: 'Dialog timeout rejection smoke',
      message: 'Do not acknowledge this dialog; wait for the execution timeout.',
    });
  } catch (caught) {
    error = caught;
  }
  if (!error || error.code !== 'DIALOG_TIMEOUT' || error.operation !== 'Dialog.alert') {
    throw new Error('execution timeout did not deliver DIALOG_TIMEOUT');
  }
  console.log(JSON.stringify({ dialogTimeout: 'rejected', code: error.code }));
})();
