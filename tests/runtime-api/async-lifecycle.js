// Transport-only asynchronous conformance. This file is run once per
// legacy/upgraded/playwright stack by scripts/test_runtime_apis.sh; it needs no
// desktop target and only uses the isolated loopback fixture.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

if (!globalThis.RUNTIME_API_FIXTURE) {
  throw new Error('RUNTIME_API_FIXTURE was not injected for async lifecycle tests');
}

(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  const baseURL = globalThis.RUNTIME_API_FIXTURE.baseURL;

  test({
    name: 'stack async lifecycle: timer clear, concurrent axios, failure, cancellation and handled rejection',
    tier: 'unit',
    covers: ['global.AbortController', 'global.setTimeout', 'global.clearInterval', 'axios.get', 'axios.request'],
  }, async () => {
    assert(['legacy', 'upgraded', 'playwright'].includes(Execution.stack), 'unknown stack ' + Execution.stack);
    let ticks = 0;
    const interval = setInterval(() => { ticks += 1; }, 2);
    const responses = await Promise.all(Array.from({ length: 4 }, () => axios.get(baseURL + '/echo')));
    await new Promise((resolve) => setTimeout(resolve, 10));
    clearInterval(interval);
    assert(ticks > 0, 'interval never fired before clear');
    assert(responses.every((response) => response.status === 200), JSON.stringify(responses));

    await expectThrow(() => axios.get(baseURL + '/missing'), 'status code 404');
    await expectThrow(() => axios.get('http://127.0.0.1:1', { timeout: 80 }), 'HTTP request failed');

    const controller = new AbortController();
    setTimeout(() => controller.abort('runtime api test'), 20);
    await expectThrow(() => axios.get(baseURL + '/slow', { timeout: 1000, signal: controller.signal }), 'HTTP request canceled');

    let rejectionObserved = false;
    await Promise.reject(new Error('handled rejection')).catch((error) => { rejectionObserved = error.message === 'handled rejection'; });
    assert(rejectionObserved, 'handled Promise rejection was not observable');
  });
})();

await RuntimeAPITest.run('RUNTIME-API-ASYNC-' + Execution.stack.toUpperCase());
