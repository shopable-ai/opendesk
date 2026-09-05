(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.contractObject('File');
RuntimeAPITest.load('tests/runtime-api/unit/file-json.test.js');
await RuntimeAPITest.run('RUNTIME-API-FILE-JSON');
