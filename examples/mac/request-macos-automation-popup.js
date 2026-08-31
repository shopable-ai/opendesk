console.log('request macOS automation popup start');

await page.openMacOSPrivacySettings('automation');

const result = await page.requestMacAutomationPermission('System Events');
console.log('automation permission probe:', JSON.stringify(result, null, 2));

if (result.pendingUserConsent) {
  console.log('Automation popup should now be visible. Confirm it in macOS, then rerun this script.');
}

if (!result.ok) {
  console.log('If popup is still missing: run scripts/reset_macos_permissions.sh then rerun from OpenDesk.app');
}

console.log('Keep alive 12s to avoid window flashing...');
await page.waitFor(12000);

console.log('request macOS automation popup done');
