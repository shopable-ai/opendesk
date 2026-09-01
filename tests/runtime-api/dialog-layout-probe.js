// Real prompt used by the macOS evidence harness. While it is visible, the
// harness records a WindowServer screenshot and AX button state; its public
// PID-scoped JavaScript controller then AXPresses Save.

async function main() {
  const result = Dialog.prompt({
    title: 'OpenDesk',
    message: 'Enter a label for this compact native prompt.',
    placeholder: 'Label',
    defaultValue: 'layout-probe',
    confirmText: 'Save',
    cancelText: 'Cancel',
    maxLength: 64,
  });
  if (await result !== 'layout-probe') throw new Error('native prompt did not retain focus');
  console.log(JSON.stringify({ dialogLayoutProbe: 'passed' }));
}

await main();
