(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractGlobals();

  test({
    name: 'global timers, animation frame, sleep, and cancellation complete without leaks',
    tier: 'unit',
    covers: [
      'global.setTimeout', 'global.clearTimeout', 'global.setInterval', 'global.clearInterval',
      'global.sleep', 'global.sleepSeconds', 'global.requestAnimationFrame', 'global.cancelAnimationFrame',
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
  });
})();
