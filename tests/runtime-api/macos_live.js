// Opt-in macOS Safari conformance entrypoint. The Runtime JS gate injects an isolated
// loopback fixture as RUNTIME_API_FIXTURE and all browser actions stay inside it.
if (!globalThis.RUNTIME_API_FIXTURE) {
  throw new Error('RUNTIME_API_FIXTURE was not injected; run OPENDESK_RUNTIME_API_MODE=live ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script');
}
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');
await RuntimeAPITest.load('tests/runtime-api/live_driver.js');
