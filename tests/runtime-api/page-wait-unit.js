// Page-family behavior gate for Page-wait scoped coverage. The full unit runner
// imports this same Page test file; this entrypoint keeps the standard unit result
// in one run context without claiming unrelated families ran.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();
RuntimeAPITest.load('tests/runtime-api/unit/page.test.js');
await RuntimeAPITest.run('RUNTIME-API-UNIT');
