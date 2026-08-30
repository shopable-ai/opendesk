console.log('automation permission check start');

const raw = await page.requestMacAutomationPermission('System Events');

let state = 'denied_or_failed';
if (raw && raw.os && raw.os !== 'darwin') {
  state = 'unsupported';
} else if (raw && raw.ok) {
  state = 'granted';
} else if (raw && raw.pendingUserConsent) {
  state = 'pending_user_consent';
}

const summary = {
  ok: !!(raw && raw.ok),
  state,
  targetApp: raw && raw.targetApp ? raw.targetApp : 'System Events',
  triggered: !!(raw && raw.triggered),
  pendingUserConsent: !!(raw && raw.pendingUserConsent),
  next: raw && raw.next ? raw.next : null,
  error: raw && raw.error ? raw.error : null,
  hostHint: raw && raw.hostHint ? raw.hostHint : null,
  raw,
};

console.log('automation permission check result:', JSON.stringify(summary, null, 2));

if (summary.state === 'pending_user_consent') {
  console.log('Automation popup should now be visible. Confirm it in macOS, then rerun this script.');
  console.log('Keep alive 12s for manual confirmation...');
  await page.waitFor(12000);
}

console.log('automation permission check done');
