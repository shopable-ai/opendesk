// Standalone macOS smoke. It deliberately avoids the Safari fixture so the
// global-key path can prove behavior while a different native application is
// foreground. The companion darwin runner uses a separate System Events
// process: same-process synthetic input is intentionally not treated as a
// system-global source by macOS.

const token = `OPENDESK_GLOBAL_SHORTCUT_OK_${Date.now()}`;
const evidencePath = `${Execution.artifactDir}/global-shortcut-smoke.json`;
let callbackCount = 0;
let foreground = null;
let registeredBeforeCleanup = false;

try {
  globalShortcut.register('CommandOrControl+Shift+9', async () => {
    callbackCount += 1;
    await clipboard.copy(token);
  });
  if (!globalShortcut.isRegistered('CmdOrCtrl+Shift+9')) {
    throw new Error('global shortcut is not registered');
  }

  await page.openApp('TextEdit');
  await page.waitFor(250);
  foreground = await window.getActiveWindow();
  const textEditForeground = foreground && (
    String(foreground.exeName || '') === 'TextEdit'
    || String(foreground.exePath || '').includes('/TextEdit.app/')
  );
  if (!textEditForeground) {
    throw new Error(`TextEdit is not foreground before trigger: ${JSON.stringify(foreground)}`);
  }

  console.log('GLOBAL_SHORTCUT_EXTERNAL_TRIGGER_READY');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && callbackCount !== 1) await page.waitFor(40);
  if (callbackCount !== 1) throw new Error(`global shortcut callback count=${callbackCount}`);
  const actual = await clipboard.paste();
  if (actual !== token) throw new Error(`global shortcut clipboard mismatch: ${JSON.stringify(actual)}`);

  registeredBeforeCleanup = globalShortcut.isRegistered('CommandOrControl+Shift+9');
} finally {
  globalShortcut.unregister('CommandOrControl+Shift+9');
  globalShortcut.unregisterAll();
}

const cleanupVerified = !globalShortcut.isRegistered('CommandOrControl+Shift+9');
if (!cleanupVerified) {
  throw new Error('global shortcut remains registered after cleanup');
}
await File.write(evidencePath, JSON.stringify({
  token,
  callbackCount,
  foreground,
  trigger: 'separate System Events process',
  registeredBeforeCleanup,
  cleanupVerified,
  verifiedAt: new Date().toISOString(),
}, null, 2));
console.log(`GLOBAL_SHORTCUT_SMOKE_OK evidence=${evidencePath}`);
