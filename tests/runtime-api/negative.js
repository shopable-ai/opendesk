(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPITest.load('tests/runtime-api/coverage_validation.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');
RuntimeAPITest.load('tests/runtime-api/acceptance.js');
RuntimeAPITest.load('tests/runtime-api/acceptance_negative.test.js');
await RuntimeAPITest.run('RUNTIME-API-QUALITY-NEGATIVE');
