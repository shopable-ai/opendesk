// Recorder file-production behavior. This command never enables native input
// capture and is safe to run from the repository root:
// ./dist/opendesk -script tests/runtime-api/recorder.js -console-mode script
'use strict';
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/unit/recorder.test.js');
await RuntimeAPITest.run('RUNTIME-API-RECORDER');
