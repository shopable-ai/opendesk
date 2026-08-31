console.log('automation permission wizard start');
console.log('Step 1/4: opening macOS Automation settings page...');

const settings = await page.openMacOSPrivacySettings('automation');
console.log('settings:', JSON.stringify(settings, null, 2));

console.log('Step 2/4: triggering Automation permission request repeatedly...');
console.log('Please keep System Settings foreground and watch for popup.');

const probe = await page.requestMacAutomationPermission('System Events');
console.log('probe:', JSON.stringify(probe, null, 2));

const granted = !!probe.ok;
if (probe.pendingUserConsent) {
  console.log('Popup should now be visible. Approve it before the final check.');
}

console.log('Step 3/4: keep process alive for manual action (90s)...');
for (let i = 0; i < 3; i++) {
  await page.waitFor(30000);
}

console.log('Step 4/4: final permission flow check...');
const flow = await page.requestMacPermissions({
  openSettings: false,
  section: 'automation',
});
console.log('final flow:', JSON.stringify(flow, null, 2));

if (!granted && !flow.ok) {
  console.log('Automation permission still missing. Run scripts/reset_macos_permissions.sh and retry via OpenDesk.app.');
}

console.log('automation permission wizard done');
