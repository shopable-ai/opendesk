// From the repository root, refresh once with: make build
// Then run: ./dist/opendesk -script examples/global-shortcut.js -console-mode script
// On macOS press Command+Shift+9; Ctrl-C stops the script and unregisters it.
//
// The registered shortcut is a Runtime resource, so the execution stays alive
// without a busy loop. Stop the process normally (for example Ctrl-C) to
// trigger automatic unregister/cleanup.

async function copyText() {
  await clipboard.copy('Hello from OpenDesk');
  console.log('copied');
}

globalShortcut.register('CommandOrControl+Shift+9', copyText);
console.log('Global shortcut registered: CommandOrControl+Shift+9');
