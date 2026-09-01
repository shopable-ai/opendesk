(async () => {
  const capabilities = Dialog.getCapabilities();
  if (capabilities.enabled || capabilities.activationSource !== 'disabled') {
    throw new Error('no-ui unexpectedly enabled Dialog');
  }
  let error;
  try { await Dialog.alert({ message: 'must not display' }); } catch (caught) { error = caught; }
  if (!error || error.code !== 'DIALOG_DISABLED' || error.capability !== 'ui') {
    throw new Error('no-ui did not reject with DIALOG_DISABLED');
  }
  console.log(JSON.stringify({ dialogNoUI: 'passed', code: error.code }));
})();
