// Fault-injection smoke: run with -ui, then terminate only the native host
// process spawned by this test. The public JavaScript Promise must reject and
// the execution must drain all async resources.
(async () => {
  let error;
  try {
    await Dialog.alert({ title: 'Dialog host crash smoke', message: 'The native host will be terminated by the test harness.' });
  } catch (caught) {
    error = caught;
  }
  if (!error || error.code !== 'DIALOG_HOST_FAILURE' || error.operation !== 'Dialog.alert') {
    throw new Error('Dialog host crash did not reject with DIALOG_HOST_FAILURE');
  }
  console.log(JSON.stringify({ dialogHostCrash: 'passed', code: error.code }));
})();
