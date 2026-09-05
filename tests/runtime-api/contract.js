// Public JavaScript Runtime API contract, sourced from the same catalog as
// the per-interface unit and macOS live suites.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
const catalogValidation = RuntimeAPICatalogValidation.assertValid();
const catalogSnapshot = RuntimeAPICatalogValidation.writeSnapshot(catalogValidation);
console.log('[RUNTIME-API-CONTRACT CATALOG] ' + JSON.stringify({
  methods: RuntimeAPIManifest.length,
  catalogFingerprint: catalogValidation.catalogFingerprint,
  snapshot: catalogSnapshot.path,
}));

for (const objectName of Object.keys(RuntimeAPIObjects)) {
  if (objectName === 'global') RuntimeAPITest.contractGlobals();
  else RuntimeAPITest.contractObject(objectName);
}

RuntimeAPITest.load('tests/runtime-api/sqlite-contract-cases.js');
RuntimeAPISQLiteContractCases.registerHandleContracts();
delete globalThis.RuntimeAPISQLiteContractCases;

RuntimeAPITest.test({
  name: 'page input aliases preserve host object identity',
  tier: 'unit',
  verification: 'contract',
  covers: ['mouse.click', 'keyboard.type', 'touchscreen.tap'],
}, async () => {
  for (const name of ['mouse', 'keyboard', 'touchscreen']) {
    RuntimeAPITest.assert(page[name] === globalThis[name], `page.${name} does not reference global ${name}`);
  }
});

await RuntimeAPITest.run('RUNTIME-API-CONTRACT');
