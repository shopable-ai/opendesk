// Run from the repository root:
// ./dist/opendesk -script examples/events/global-shortcut.js -console-mode script
//
// On macOS configure the required permissions once with
// examples/events/global-shortcut-permission-setup.js. The registered shortcut
// is owned by this execution and is unregistered when the execution stops.

async function copyText() {
  await clipboard.copy('Hello from OpenDesk');
  console.log('copied');
}

globalShortcut.register('CommandOrControl+Shift+q', copyText);
console.log('Global shortcut registered: CommandOrControl+Shift+q');
