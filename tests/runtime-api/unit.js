// Full unit gate. Focused selection has its own entry and result namespace.
if (Execution.env.OPENDESK_RUNTIME_API_UNIT_FILTER !== undefined) {
  throw new Error('Use tests/runtime-api/unit-selected.js for OPENDESK_RUNTIME_API_UNIT_FILTER; omit it for full unit');
}
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
for (const file of RuntimeAPITestFiles.unit) RuntimeAPITest.load(file);
await RuntimeAPITest.run('RUNTIME-API-UNIT');
