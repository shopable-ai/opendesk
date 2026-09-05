// SQLite-only contract gate. It writes the normal `contract` result envelope
// so SQLite-scoped coverage can use the same validation as the full catalog.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');

const catalogValidation = RuntimeAPICatalogValidation.assertValid();
const catalogSnapshot = RuntimeAPICatalogValidation.writeSnapshot(catalogValidation);
console.log('[RUNTIME-API-SQLITE-CONTRACT CATALOG] ' + JSON.stringify({
  methods: RuntimeAPIManifest.filter((entry) => ['SQLite', 'SQLiteDatabase'].includes(entry.family)).length,
  catalogFingerprint: catalogValidation.catalogFingerprint,
  snapshot: catalogSnapshot.path,
}));

RuntimeAPITest.contractObject('SQLite');
RuntimeAPITest.load('tests/runtime-api/sqlite-contract-cases.js');
RuntimeAPISQLiteContractCases.registerHandleContracts();
delete globalThis.RuntimeAPISQLiteContractCases;
await RuntimeAPITest.run('RUNTIME-API-CONTRACT');
