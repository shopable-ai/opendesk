// SQLite-only behavior gate. The full unit runner imports this same test file;
// this focused entrypoint keeps SQLite acceptance independent of unrelated
// desktop live tests and unrelated unit fixtures.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();
RuntimeAPITest.load('tests/runtime-api/unit/sqlite.test.js');
await RuntimeAPITest.run('RUNTIME-API-UNIT');
