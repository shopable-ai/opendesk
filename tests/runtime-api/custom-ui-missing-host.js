(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

const { assert, equal, test } = RuntimeAPITest;

test({
  name: 'enabled Custom UI reports and rejects a missing native host explicitly',
  tier: 'unit',
  covers: ['ui.getCapabilities', 'ui.createWindow'],
}, async () => {
  const capabilities = ui.getCapabilities();
  equal(capabilities.enabled, true, 'Custom UI CLI activation was lost');
  equal(capabilities.available, false, 'missing native host reported available');
  assert(String(capabilities.reason).includes('UI_HOST_NOT_FOUND'), 'missing-host reason omitted stable code');
  let failure = null;
  try {
    await ui.createWindow({
      id: 'missingHost',
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      content: { html: '<button id="ok">OK</button>' }
    });
  } catch (error) {
    failure = error;
  }
  assert(failure, 'createWindow silently succeeded without a host');
  equal(failure.code, 'UI_HOST_NOT_FOUND', 'wrong missing-host error code');
  equal(failure.operation, 'createWindow', 'missing-host error exposed an internal operation');
  equal(failure.windowId, 'missingHost', 'missing-host error omitted window identity');
  equal(failure.capability, 'ui', 'missing-host error omitted capability context');
});

await RuntimeAPITest.run('RUNTIME-API-CUSTOM-UI-MISSING-HOST');
