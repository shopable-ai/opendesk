// From the repository root, refresh once with: make build
// Then run: ./dist/opendesk -script examples/global-shortcut.js -console-mode script
// On macOS press Command+Shift+9; Ctrl-C stops the script and unregisters it.
// Before first configuration only, run
// ./dist/opendesk -script examples/global-shortcut-permission-setup.js -console-mode script
// It calls page.requestPermissions({ section: 'globalShortcut', openSettings: true,
// strict: false }). That call skips Settings when already authorized; pass
// forceOpenSettings: true only from an explicit "reopen settings" action.
// register() itself never opens a permissions prompt and does not need Screen
// Recording or Automation. See docs/api/global-shortcut.md for boundaries.
//
// The registered shortcut is a Runtime resource, so the execution stays alive
// without a busy loop. Stop the process normally (for example Ctrl-C) to
// trigger automatic unregister/cleanup. Starting this same file again asks the
// previous direct OpenDesk run to stop, then takes over the shortcut.

async function copyText() {
  await clipboard.copy('Hello from OpenDesk');
  console.log('copied');
}

globalShortcut.register('CommandOrControl+Shift+q', copyText);
console.log('Global shortcut registered: CommandOrControl+Shift+q');
