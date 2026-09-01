// Run from the repository root after `make build`:
// ./dist/opendesk -script examples/global-shortcut-permission-setup.js -console-mode script
//
// This is a first-run / settings action, not a prerequisite to run on every
// application launch. It preflights both macOS permissions, opens only the
// missing privacy pages, and skips all request/navigation work when both are
// already granted.

async function main() {
  const result = await page.requestPermissions({
    section: 'globalShortcut',
    openSettings: true,
    strict: false,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.log('Allow the missing Accessibility/Input Monitoring permission, then restart OpenDesk and run the shortcut example again.');
    return;
  }

  console.log(result.skipped
    ? 'Global shortcut permissions are already ready; no System Settings window was opened.'
    : 'Global shortcut permissions are ready.');
}

main().catch((error) => {
  console.error('GLOBAL_SHORTCUT_PERMISSION_SETUP_FAILED', error && error.stack ? error.stack : error);
});
