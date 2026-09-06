(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractGlobals();

  test({
    name: 'global timers, delay, URL, animation frame, sleep, and cancellation complete without leaks',
    tier: 'unit',
    covers: [
      'global.setTimeout', 'global.clearTimeout', 'global.setInterval', 'global.clearInterval',
      'global.delay', 'global.sleep', 'global.sleepSeconds', 'global.requestAnimationFrame', 'global.cancelAnimationFrame',
      'global.URL', 'global.URLSearchParams', 'global.AbortController',
    ],
  }, async () => {
    let cancelledTimeoutFired = false;
    const timeoutID = setTimeout(() => { cancelledTimeoutFired = true; }, 20);
    clearTimeout(timeoutID);
    let cancelledFrameFired = false;
    const frameID = requestAnimationFrame(() => { cancelledFrameFired = true; });
    cancelAnimationFrame(frameID);
    let intervalCount = 0;
    await new Promise((resolve) => {
      const intervalID = setInterval(() => {
        intervalCount += 1;
        if (intervalCount === 2) {
          clearInterval(intervalID);
          resolve();
        }
      }, 2);
    });
    let frameTimestamp = null;
    await new Promise((resolve) => requestAnimationFrame((timestamp) => { frameTimestamp = timestamp; resolve(); }));
    await sleep(2);
    await sleepSeconds(0.002);
    assert(intervalCount === 2, `intervalCount=${intervalCount}`);
    assert(frameTimestamp !== null, 'requestAnimationFrame did not run');
    assert(!cancelledTimeoutFired && !cancelledFrameFired, JSON.stringify({ cancelledTimeoutFired, cancelledFrameFired }));

    const delayed = delay(2);
    assert(delayed && typeof delayed.then === 'function', 'delay must return a Promise');
    await delayed;

    const url = new URL('/search?q=hello%20world', 'https://example.com/base/index.html');
    assert(url.origin === 'https://example.com', url.origin);
    assert(url.pathname === '/search', url.pathname);
    assert(url.searchParams.get('q') === 'hello world', url.searchParams.get('q'));
    url.searchParams.set('page', 2);
    url.hash = 'done';
    assert(url.href === 'https://example.com/search?q=hello+world&page=2#done', url.href);
    url.search = '?fresh=1';
    assert(url.searchParams.get('fresh') === '1', url.searchParams.get('fresh'));

    const params = new URLSearchParams('a=1&a=2&b=x%3Dy');
    assert(JSON.stringify(params.getAll('a')) === JSON.stringify(['1', '2']), JSON.stringify(params.getAll('a')));
    assert(params.get('b') === 'x=y', params.get('b'));

    const controller = new AbortController();
    let delivered = 0;
    controller.signal.onabort = () => { throw new Error('listener error must not halt dispatch'); };
    controller.signal.addEventListener('abort', () => { delivered += 1; });
    controller.abort('first reason');
    controller.abort('second reason');
    assert(controller.signal.aborted === true, 'AbortSignal did not become aborted');
    assert(controller.signal.reason === 'first reason', 'AbortSignal did not preserve first reason');
    assert(delivered === 1, 'AbortSignal did not continue past a throwing listener');
  });
})();
