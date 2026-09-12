const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || capabilities.packageId !== 'com.opendesk.test.contract-v1') {
  throw new Error('APP_PACKAGE_V1_CAPABILITIES_INVALID=' + JSON.stringify(capabilities));
}
console.log('APP_PACKAGE_V1_ENTRY_OK=' + JSON.stringify(capabilities));
await automation.app.quit();
