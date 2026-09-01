// Run with `-ui -timeout 1`. The execution deadline must close this native
// alert, return a timed_out execution result, and leave no runtime resources.
await Dialog.alert({
  title: 'Dialog timeout smoke',
  message: 'Do not acknowledge this dialog; the execution timeout closes it.',
  okText: 'Acknowledge',
});
