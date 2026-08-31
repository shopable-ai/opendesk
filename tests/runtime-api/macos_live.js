// Opt-in macOS Safari conformance entrypoint. The shell injects an isolated
// loopback fixture as RUNTIME_API_FIXTURE and all browser actions stay inside it.
if (!globalThis.RUNTIME_API_FIXTURE) {
  throw new Error('RUNTIME_API_FIXTURE was not injected; run scripts/test_runtime_apis.sh live');
}
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');
await RuntimeAPITest.load('tests/runtime-api/live_driver.js');
