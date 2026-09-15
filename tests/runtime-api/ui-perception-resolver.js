// Run from the repository root:
// ./dist/opendesk -script tests/runtime-api/ui-perception-resolver.js -console-mode script
// This is a live Runtime surface check. A-K decision branches are deterministically
// exercised by the Node fixture beside this file and are not claimed as desktop input.
'use strict';

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPICatalogValidation.assertValid();

RuntimeAPITest.test({
  name: 'UI Perception Resolver exposes simple Runtime-owned text and read APIs',
  tier: 'unit', verification: 'contract',
  covers: ['UI.findTexts', 'UI.findText', 'UI.hasText', 'UI.tapText', 'UI.tapTexts', 'UI.tapTargets', 'UI.readText'],
}, async () => {
  RuntimeAPITest.assert(UI && typeof UI === 'object', 'missing Runtime UI object');
  for (const name of ['findTexts', 'findText', 'hasText', 'tapText', 'tapTexts', 'tapTargets', 'readText']) {
    RuntimeAPITest.assert(typeof UI[name] === 'function', `missing Runtime function UI.${name}`);
  }
});

RuntimeAPITest.test({
  name: 'UI Perception Resolver reports cloud visual perception disabled by default',
  tier: 'unit', verification: 'behavior', covers: ['UI.getCapabilities'],
}, async () => {
  const capabilities = UI.getCapabilities();
  RuntimeAPITest.assert(capabilities && capabilities.perception && capabilities.perception.resolver === true,
    'UI perception resolver capability is missing');
  RuntimeAPITest.assert(capabilities.perception.cloudVisual.defaultEnabled === false,
    'cloud visual perception must not default to enabled');
  RuntimeAPITest.assert(capabilities.perception.cloudVisual.sharedMultimodal === false,
    'P0 cloud visual perception must remain disabled until shared multimodal transport exists');
  RuntimeAPITest.assert(capabilities.perception.cloudVisual.automaticFallback ===
      'not-enabled-until-shared-multimodal-transport',
  'cloud visual perception must report the shared-transport gate');
  RuntimeAPITest.assert(capabilities.perception.sources.ocr === true,
    'local OCR observation must remain available independently of cloud policy');
});

await RuntimeAPITest.run('RUNTIME-API-UI-PERCEPTION');
