// Native Dialog await example.
// From the repository's built `dist/` directory, run one command:
// `./opendesk -ui -script ../examples/dialog.js -console-mode script`.
// Dialog methods return Promises and never accept onConfirm/onCancel callbacks.

const confirmOptions = {
  title: 'Confirm action',
  message: 'Continue to the short prompt?',
  confirmText: 'Continue',
  cancelText: 'Cancel',
  defaultAction: 'cancel',
};

const promptOptions = {
  title: 'Label',
  message: 'Enter a non-sensitive label for this run.',
  placeholder: 'Example label',
  confirmText: 'Show value',
  cancelText: 'Cancel',
  maxLength: 80,
};

async function showNonBlockingAlert() {
  const timeline = ['before-call'];
  console.log('Dialog timeline:', timeline.join(' -> '));

  const pending = Dialog.alert({
    title: 'OpenDesk',
    message: 'The EventLoop continues while this native alert is open.',
    level: 'success',
    okText: 'Continue',
  });
  timeline.push('returned-promise');
  console.log('Dialog timeline:', timeline.join(' -> '));

  await Promise.resolve();
  timeline.push('event-loop-continuation');
  console.log('Dialog timeline:', timeline.join(' -> '));

  await pending;
  timeline.push('alert-settled');
  console.log('Dialog timeline:', timeline.join(' -> '));
}

async function main() {
  await showNonBlockingAlert();

  const shouldContinue = await Dialog.confirm(confirmOptions);
  if (!shouldContinue) {
    await Dialog.alert({
      title: 'Confirm result',
      message: 'Confirm result: false (the user canceled).',
      level: 'warning',
    });
    return;
  }

  const value = await Dialog.prompt(promptOptions);
  // This example intentionally echoes only a non-sensitive value. Never echo a secret.
  await Dialog.alert({
    title: 'Prompt result',
    message: value === null
      ? 'Prompt result: null (the user canceled).'
      : `Prompt result: ${value}`,
    level: value === null ? 'warning' : 'success',
    okText: 'Done',
  });
}

try {
  await main();
} catch (error) {
  console.error(error.code || 'DIALOG_ERROR', error.message || String(error));
  throw error;
} finally {
  console.log('await Dialog flow finished');
}
