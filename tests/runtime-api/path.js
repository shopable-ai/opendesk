// From the repository root:
// ./dist/opendesk -script tests/runtime-api/path.js -console-mode script
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/unit/path.test.js');
await RuntimeAPITest.run('RUNTIME-API-PATH');
