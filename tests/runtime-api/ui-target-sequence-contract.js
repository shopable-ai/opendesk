// Exact public-surface contract for UI.tapTargets. The complete catalog
// contract remains available through the ordinary contract mode.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();

const ids = ['window.current', 'window.activate', 'UI.tapTargets'];
for (const id of ids) {
  RuntimeAPITest.assert(
    RuntimeAPIManifest.some((entry) => entry.id === id),
    `${id} is missing from the Runtime API manifest`,
  );
}
RuntimeAPITest.test({
  name: 'exact window lifecycle and UI.tapTargets are exposed by the JavaScript runtime',
  tier: 'unit',
  verification: 'contract',
  covers: ids,
}, async () => {
  RuntimeAPITest.assert(window && typeof window === 'object', 'missing Runtime window object');
  RuntimeAPITest.assert(typeof window.current === 'function', 'missing Runtime function window.current');
  RuntimeAPITest.assert(typeof window.activate === 'function', 'missing Runtime function window.activate');
  RuntimeAPITest.assert(UI && typeof UI === 'object', 'missing Runtime UI object');
  RuntimeAPITest.assert(typeof UI.tapTargets === 'function', 'missing Runtime function UI.tapTargets');
});

await RuntimeAPITest.run('RUNTIME-API-CONTRACT');
