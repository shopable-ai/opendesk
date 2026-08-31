(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
for (const file of RuntimeAPITestFiles.unit) RuntimeAPITest.load(file);
await RuntimeAPITest.run('RUNTIME-API-UNIT');
