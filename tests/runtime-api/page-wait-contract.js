// Exact public-surface contract for the four Page wait methods. This is used
// only by the composite page-wait gate; the normal contract mode remains the
// full catalog contract.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();

const pageWaitContractIds = [
  'page.waitFor',
  'page.waitForTimeout',
  'page.waitForFunction',
  'page.waitForAll',
];

for (const id of pageWaitContractIds) {
  const method = id.slice('page.'.length);
  RuntimeAPITest.assert(
    RuntimeAPIManifest.some((entry) => entry.id === id),
    'Page wait contract ID is missing from the manifest: ' + id,
  );
  RuntimeAPITest.test({
    name: id + ' is exposed by the JavaScript runtime',
    tier: 'unit',
    verification: 'contract',
    covers: [id],
  }, async () => {
    RuntimeAPITest.assert(page && typeof page === 'object', 'missing runtime object page');
    RuntimeAPITest.assert(typeof page[method] === 'function', 'missing runtime function ' + id);
  });
}

await RuntimeAPITest.run('RUNTIME-API-CONTRACT');
