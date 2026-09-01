// Run from the repository root after `make build`:
// ./dist/opendesk -script examples/global-shortcut-permission-setup.js -console-mode script
//
// This is a first-run / settings action, not a prerequisite to run on every
// application launch. It opens the two macOS privacy pages used by
// globalShortcut and asks macOS for Accessibility consent. Input Monitoring
// still requires the user to toggle the same OpenDesk host in System Settings.

async function main() {
  const result = await page.requestPermissions({
    section: 'globalShortcut',
    openSettings: true,
    strict: false,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.permissions.capabilities.accessibility.granted) {
    console.log('Allow OpenDesk in Accessibility, then restart OpenDesk and run the shortcut example again.');
    return;
  }

  console.log('Accessibility is ready. In the opened Input Monitoring page, allow the same OpenDesk host, then restart OpenDesk.');
}

main().catch((error) => {
  console.error('GLOBAL_SHORTCUT_PERMISSION_SETUP_FAILED', error && error.stack ? error.stack : error);
});
