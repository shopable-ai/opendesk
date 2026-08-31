(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');

const { assert, expectThrow, test } = RuntimeAPITest;
test({
  name: 'safe Runtime API smoke reports System, Screen and Vision capability metadata',
  tier: 'unit',
  covers: ['System.getSystemInfo', 'Screen.getDisplays', 'Vision.getCapabilities'],
}, async () => {
  const system = await System.getSystemInfo();
  const displays = await Screen.getDisplays();
  const capabilities = await Vision.getCapabilities({});
  assert(system && typeof system === 'object', 'System.getSystemInfo returned no object');
  assert(Array.isArray(displays) && displays.length > 0, 'Screen.getDisplays returned no display');
  assert(capabilities && Array.isArray(capabilities.providers), 'Vision.getCapabilities returned no providers');
});

test({
  name: 'side-effecting Runtime APIs reject invalid input before host access',
  tier: 'unit',
  covers: ['mouse.click', 'keyboard.type', 'OCR.extractText', 'http.request'],
}, async () => {
  await expectThrow(() => mouse.click(0, 0, { button: 'not-a-button' }), 'invalid button type');
  await expectThrow(() => keyboard.type(''), 'cannot be empty');
  await expectThrow(() => OCR.extractText(''), 'cannot be empty');
  await expectThrow(() => http.request({}), 'url is required');
});

test({
  name: 'Runtime timer polyfills resolve without an external provider',
  tier: 'unit',
  covers: ['page.waitFor', 'global.setTimeout', 'global.sleep'],
}, async () => {
  const started = Date.now();
  await page.waitFor(10);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await sleep(1);
  assert(Date.now() >= started, 'runtime clock moved backwards');
});

const catalog = RuntimeAPICatalogValidation.assertValid();
console.log('[RUNTIME-API-SMOKE CATALOG] ' + JSON.stringify({
  methods: RuntimeAPIManifest.length,
  catalogFingerprint: catalog.catalogFingerprint,
}));
await RuntimeAPITest.run('RUNTIME-API-SMOKE');
