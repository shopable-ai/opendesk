// Native Dialog async/await example. Run with Custom UI enabled.
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
}

await showNonBlockingAlert();
const shouldContinue = await Dialog.confirm(confirmOptions);
if (!shouldContinue) {
  await Dialog.alert({title: 'Confirm result', message: 'Confirm result: false (the user canceled).', level: 'warning'});
} else {
  const value = await Dialog.prompt(promptOptions);
  await Dialog.alert({
    title: 'Prompt result',
    message: value === null ? 'Prompt result: null (the user canceled).' : `Prompt result: ${value}`,
    level: value === null ? 'warning' : 'success',
    okText: 'Done',
  });
}
console.log('await Dialog flow finished');
