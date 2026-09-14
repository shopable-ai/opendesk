// Focused deterministic behavior gate for semantic and legacy UI.tapTargets.
// It writes the normal unit envelope so exact-ID coverage can consume current-
// run evidence without claiming that unrelated unit families executed.

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();
RuntimeAPITest.load('tests/runtime-api/unit/window-target.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-target-sequence.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-semantic-targets.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-semantic-targets-cancel.test.js');
await RuntimeAPITest.run('RUNTIME-API-UNIT');
