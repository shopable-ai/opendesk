// Dedicated live proof for mouse.wheel. The wheel probe is intentionally
// separate from the recent-event log so this test can assert browser scrolling,
// rather than treating event delivery alone as success.
(() => {
  const { assert, test } = RuntimeAPITest;

  test({ name: 'mouse.wheel preserves requested deltas across steps and scrolls the dedicated list', tier: 'live', covers: ['mouse.wheel'] }, async () => {
    await RuntimeLive.openWith('openURLInApp', 'mouse-wheel');
    await RuntimeLive.moveToTarget('wheel-probe');
    await RuntimeLive.reset();

    const evidenceDir = `${RuntimeAPITest.context.runDir}/evidence/mouse-wheel`;
    const beforePath = `${evidenceDir}/before.png`;
    const afterPath = `${evidenceDir}/after.png`;
    const before = await RuntimeLive.capture(beforePath, RuntimeLive.region(['wheel-probe', 'feedback']));

    await mouse.wheel({ deltaX: 9, deltaY: 9, steps: 3, delay: 10 });
    const forwardSnapshot = await RuntimeLive.waitForExactCount('wheel', 3);
    const forwardEvents = RuntimeLive.events(forwardSnapshot, 'wheel');
    const deltas = forwardEvents.map((event) => ({
      x: Number(event.detail && event.detail.deltaX),
      y: Number(event.detail && event.detail.deltaY),
    }));
    assert(deltas.every((delta) => Number.isFinite(delta.x) && Number.isFinite(delta.y)), JSON.stringify({ forwardEvents, deltas }));
    assert(deltas.every((delta) => delta.x > 0 && delta.y > 0), JSON.stringify({ forwardEvents, deltas }));

    const total = deltas.reduce((sum, delta) => ({ x: sum.x + delta.x, y: sum.y + delta.y }), { x: 0, y: 0 });
    assert(Math.abs(total.x - 9) <= 1 && Math.abs(total.y - 9) <= 1, JSON.stringify({ total, deltas, forwardEvents }));

    const scrolled = await RuntimeLive.waitForEvent('wheel-scroll', (event) => Number(event.detail && event.detail.scrollTop) > 0);
    const scrolledEvents = RuntimeLive.events(scrolled, 'wheel-scroll');
    const forwardScrollTop = Number(scrolledEvents[scrolledEvents.length - 1].detail.scrollTop);
    assert(forwardScrollTop > 0, JSON.stringify(scrolledEvents));

    const after = await RuntimeLive.capture(afterPath, RuntimeLive.region(['wheel-probe', 'feedback']));
    assert(before && after && before.sizeBytes > 500 && after.sizeBytes > 500, JSON.stringify({ before, after }));

    await mouse.wheel({ deltaX: -9, deltaY: -9, steps: 3, delay: 10 });
    const returned = await RuntimeLive.waitForExactCount('wheel', 6);
    const reverse = RuntimeLive.events(returned, 'wheel').slice(3).map((event) => ({
      x: Number(event.detail && event.detail.deltaX),
      y: Number(event.detail && event.detail.deltaY),
    }));
    assert(reverse.length === 3 && reverse.every((delta) => delta.x < 0 && delta.y < 0), JSON.stringify({ reverse }));
    const reverseTotal = reverse.reduce((sum, delta) => ({ x: sum.x + delta.x, y: sum.y + delta.y }), { x: 0, y: 0 });
    assert(Math.abs(reverseTotal.x + 9) <= 1 && Math.abs(reverseTotal.y + 9) <= 1, JSON.stringify({ reverseTotal, reverse }));
    const returnedToTop = await RuntimeLive.waitForEvent('wheel-scroll', (event) => Number(event.detail && event.detail.scrollTop) === 0);
    const allScrollEvents = RuntimeLive.events(returnedToTop, 'wheel-scroll');
    assert(allScrollEvents.some((event) => Number(event.detail && event.detail.scrollTop) === 0), JSON.stringify(allScrollEvents));

    await RuntimeLive.writeEvidence(evidenceDir, {
      state: returnedToTop,
      events: [...RuntimeLive.events(returnedToTop, 'wheel'), ...allScrollEvents],
      manifest: {
        feature: 'mouse.wheel',
        request: { forward: { deltaX: 9, deltaY: 9, steps: 3, delay: 10 }, reverse: { deltaX: -9, deltaY: -9, steps: 3, delay: 10 } },
        observed: { forward: { deltas, total, scrollTop: forwardScrollTop }, reverse: { deltas: reverse, total: reverseTotal, scrollTop: 0 } },
        screenshots: {
          pre: { ...before, path: beforePath },
          post: { ...after, path: afterPath },
        },
      },
    });
    assert(RuntimeLiveEvidence && await File.exists(RuntimeLiveEvidence.manifestPath), JSON.stringify(globalThis.RuntimeLiveEvidence));
  });
})();
