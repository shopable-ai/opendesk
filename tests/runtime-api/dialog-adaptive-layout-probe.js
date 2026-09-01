// Public-JavaScript probe for the native Dialog host's content-driven height.
// The messages deliberately contain no explicit newline: the real macOS
// WebKit surface must wrap them, grow the AppKit window, preserve both AX
// actions, and keep the prompt focused for the separate PID-scoped controller.

async function main() {
  const confirmMessage = 'This native confirmation message is deliberately long enough to wrap across several visual lines. Every word must remain visible while the action row stays compact, right aligned, and separated from the content by the reviewed spacing.';
  const confirmed = await Dialog.confirm({
    title: 'Dialog adaptive long confirm',
    message: confirmMessage,
    confirmText: 'Continue',
    cancelText: 'Cancel',
  });
  if (confirmed !== true) throw new Error('adaptive long confirm did not resolve true');

  const promptMessage = 'This prompt also uses a naturally wrapping message so the native window must grow before it gives keyboard focus to the input field. The full message, focused field, and both actions must remain visible together.';
  const value = await Dialog.prompt({
    title: 'Dialog adaptive long prompt',
    message: promptMessage,
    placeholder: 'Adaptive layout value',
    confirmText: 'Save',
    cancelText: 'Cancel',
    maxLength: 64,
  });
  if (value !== 'adaptive-layout-focus') {
    throw new Error('adaptive long prompt lost initial input focus or returned the wrong value');
  }
  console.log(JSON.stringify({
    dialogAdaptiveLayout: 'passed',
    confirmMessageLength: confirmMessage.length,
    promptMessageLength: promptMessage.length,
    promptValue: value,
  }));
}

await main();
