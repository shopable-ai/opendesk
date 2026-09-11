// Native Dialog Promise-chain example. Run with Custom UI enabled.
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
  return Dialog.alert({
    title: 'Prompt result',
    message: value === null ? 'Prompt result: null (the user canceled).' : `Prompt result: ${value}`,
    level: value === null ? 'warning' : 'success',
    okText: 'Done',
  });
}

const flow = Dialog.alert({
  title: 'OpenDesk',
  message: 'The EventLoop continues while this native alert is open.',
  level: 'success',
  okText: 'Continue',
}).then(() => Dialog.confirm(confirmOptions))
  .then(shouldContinue => {
    if (!shouldContinue) {
      return Dialog.alert({title: 'Confirm result', message: 'Confirm result: false (the user canceled).', level: 'warning'});
    }
    return Dialog.prompt(promptOptions).then(showPromptResult);
  })
  .finally(() => console.log('Promise-chain Dialog flow finished'));

await flow;
