// Native Dialog Promise-chain example.
// From the repository root, run one command:
// `./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script`.
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

function showPromptResult(value) {
  // This example intentionally echoes only a non-sensitive value. Never echo a secret.
  return Dialog.alert({
    title: 'Prompt result',
    message: value === null
      ? 'Prompt result: null (the user canceled).'
      : `Prompt result: ${value}`,
    level: value === null ? 'warning' : 'success',
    okText: 'Done',
  });
}

function continueAfterConfirm(shouldContinue) {
  if (!shouldContinue) {
    return Dialog.alert({
      title: 'Confirm result',
      message: 'Confirm result: false (the user canceled).',
      level: 'warning',
    });
  }
  return Dialog.prompt(promptOptions)
    .then(value => showPromptResult(value));
}

function showNonBlockingAlert() {
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

  return Promise.resolve()
    .then(() => {
      timeline.push('event-loop-continuation');
      console.log('Dialog timeline:', timeline.join(' -> '));
    })
    .then(() => pending)
    .then(() => {
      timeline.push('alert-settled');
      console.log('Dialog timeline:', timeline.join(' -> '));
    });
}

const flow = showNonBlockingAlert()
  .then(() => Dialog.confirm(confirmOptions))
  .then(shouldContinue => continueAfterConfirm(shouldContinue))
  .catch(error => {
    console.error(error.code || 'DIALOG_ERROR', error.message || String(error));
    throw error;
  })
  .finally(() => console.log('Promise-chain Dialog flow finished'));

// Top-level await lets the Runtime observe completion of the full user Promise.
await flow;
