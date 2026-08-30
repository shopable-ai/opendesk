console.log('request macOS permissions flow start');

const result = await page.requestMacPermissions({
  openSettings: true,
  section: 'all',
});

console.log('permission request result:', JSON.stringify(result, null, 2));

if (result.pendingUserConsent || (result.probes && result.probes.automationProbe && result.probes.automationProbe.pendingUserConsent)) {
  console.log('Automation popup should now be visible. Confirm it in macOS, then rerun this script.');
}

if (!result.ok && !result.pendingUserConsent) {
  console.log('Please enable permissions in System Settings and rerun this script.');
}

console.log('Keep alive 12s for manual confirmation...');
await page.waitFor(12000);

console.log('request macOS permissions flow done');
