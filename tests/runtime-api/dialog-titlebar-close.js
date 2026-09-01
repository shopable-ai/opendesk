// Run with -ui, then use a PID-scoped public JS controller to AXPress the
// native titlebar close control. Confirm must resolve false.
const accepted = await Dialog.confirm({
  title: 'Dialog titlebar close smoke',
  message: 'Close this native window through its titlebar control.',
  confirmText: 'Continue',
  cancelText: 'Cancel',
});
if (accepted !== false) throw new Error('titlebar close did not return false');
console.log(JSON.stringify({ dialogTitlebarClose: 'passed' }));
