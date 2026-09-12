const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || capabilities.packageId !== 'com.opendesk.test.contract-legacy') {
  throw new Error('APP_PACKAGE_LEGACY_CAPABILITIES_INVALID=' + JSON.stringify(capabilities));
}
console.log('APP_PACKAGE_LEGACY_ENTRY_OK=' + JSON.stringify(capabilities));
await automation.app.quit();
