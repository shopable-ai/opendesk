(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractGlobals();
  RuntimeAPITest.contractObject('crypto');

  test({
    name: 'global timers, delay, URL, animation frame, sleep, and cancellation complete without leaks',
    tier: 'unit',
    covers: [
      'global.setTimeout', 'global.clearTimeout', 'global.setInterval', 'global.clearInterval',
      'global.delay', 'global.sleep', 'global.sleepSeconds', 'global.requestAnimationFrame', 'global.cancelAnimationFrame',
      'global.queueMicrotask',
      'global.URL', 'global.URLSearchParams', 'global.AbortController', 'global.TextEncoder', 'global.TextDecoder',
      'global.ReadableStream', 'global.WritableStream', 'global.TransformStream',
      'crypto.getRandomValues', 'crypto.randomUUID',
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

    const microtaskOrder = ['sync'];
    queueMicrotask(() => { microtaskOrder.push('microtask'); });
    await Promise.resolve();
    microtaskOrder.push('after');
    assert(microtaskOrder.join(',') === 'sync,microtask,after', microtaskOrder.join(','));
    await expectThrow(() => queueMicrotask(null), 'callback must be a function');

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
    let abortReason = null;
    try {
      controller.signal.throwIfAborted();
    } catch (error) {
      abortReason = error;
    }
    assert(abortReason === 'first reason', 'AbortSignal.throwIfAborted did not throw the original reason');
    new AbortController().signal.throwIfAborted();

    const encoder = new TextEncoder();
    const encoded = encoder.encode('Aé😀\ud800');
    assert(encoder.encoding === 'utf-8', encoder.encoding);
    assert(JSON.stringify(Array.from(encoded)) === JSON.stringify([65, 195, 169, 240, 159, 152, 128, 239, 191, 189]), JSON.stringify(Array.from(encoded)));

    const destination = new Uint8Array(4);
    const partial = encoder.encodeInto('A😀B', destination);
    assert(partial.read === 1 && partial.written === 1, JSON.stringify(partial));
    assert(destination[0] === 65, JSON.stringify(Array.from(destination)));

    const decoder = new TextDecoder();
    assert(decoder.encoding === 'utf-8' && decoder.fatal === false && decoder.ignoreBOM === false, 'TextDecoder metadata mismatch');
    assert(decoder.decode(encoded) === 'Aé😀�', decoder.decode(encoded));
    assert(decoder.decode(new Uint8Array([0xef, 0xbb, 0xbf, 65])) === 'A', 'TextDecoder did not strip the UTF-8 BOM');
    assert(new TextDecoder('utf8', { ignoreBOM: true }).decode(new Uint8Array([0xef, 0xbb, 0xbf, 65])) === '\ufeffA', 'TextDecoder ignoreBOM mismatch');

    const streamingDecoder = new TextDecoder();
    assert(streamingDecoder.decode(new Uint8Array([0xf0, 0x9f]), { stream: true }) === '', 'TextDecoder emitted an incomplete scalar');
    assert(streamingDecoder.decode(new Uint8Array([0x98, 0x80])) === '😀', 'TextDecoder did not join a split scalar');
    await expectThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xff])), 'invalid UTF-8');

    const randomBacking = new Uint8Array(12);
    randomBacking.fill(0xa5);
    const randomView = randomBacking.subarray(2, 10);
    assert(crypto.getRandomValues(randomView) === randomView, 'crypto.getRandomValues must return its input view');
    assert(randomBacking[0] === 0xa5 && randomBacking[1] === 0xa5 && randomBacking[10] === 0xa5 && randomBacking[11] === 0xa5,
      'crypto.getRandomValues wrote outside its input view');
    assert(crypto.getRandomValues(new Uint32Array(4)) instanceof Uint32Array, 'crypto.getRandomValues must support integer TypedArrays');
    await expectThrow(() => crypto.getRandomValues(new Float32Array(1)), 'integer TypedArray');
    await expectThrow(() => crypto.getRandomValues(new Uint8Array(65537)), 'at most 65536 bytes');

    const uuidA = crypto.randomUUID();
    const uuidB = crypto.randomUUID();
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert(uuidV4.test(uuidA), uuidA);
    assert(uuidV4.test(uuidB), uuidB);
    assert(uuidA !== uuidB, 'crypto.randomUUID returned the same identifier twice');

    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue('first');
        controller.enqueue('second');
        controller.close();
      },
    });
    const reader = readable.getReader();
    assert((await reader.read()).value === 'first', 'ReadableStream lost its first chunk');
    assert((await reader.read()).value === 'second', 'ReadableStream lost its second chunk');
    assert((await reader.read()).done === true, 'ReadableStream did not close');
    reader.releaseLock();
    assert(typeof Symbol.asyncIterator === 'symbol', 'Symbol.asyncIterator is unavailable');
    assert(typeof Symbol.asyncDispose === 'symbol', 'Symbol.asyncDispose is unavailable');

    let releaseReadableStart;
    let readablePulls = 0;
    const startGatedStream = new ReadableStream({
      start() { return new Promise((resolve) => { releaseReadableStart = resolve; }); },
      pull(controller) {
        readablePulls += 1;
        controller.enqueue('after-start');
        controller.close();
      },
    });
    const startGatedReader = startGatedStream.getReader();
    const startGatedRead = startGatedReader.read();
    await Promise.resolve();
    assert(readablePulls === 0, 'ReadableStream pulled before async start completed');
    releaseReadableStart();
    assert((await startGatedRead).value === 'after-start', 'ReadableStream did not pull after async start');
    startGatedReader.releaseLock();

    const iterated = [];
    const iterableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.close();
      },
    });
    const asyncIterator = iterableStream[Symbol.asyncIterator]();
    let iteration = await asyncIterator.next();
    while (!iteration.done) {
      iterated.push(iteration.value);
      iteration = await asyncIterator.next();
    }
    assert(iterated.join(',') === '1,2', iterated.join(','));

    const transformed = new TransformStream({
      transform(chunk, controller) { controller.enqueue(String(chunk).toUpperCase()); },
    });
    const writer = transformed.writable.getWriter();
    const transformedReader = transformed.readable.getReader();
    await writer.write('stream');
    assert((await transformedReader.read()).value === 'STREAM', 'TransformStream did not transform its chunk');
    await writer.close();
    assert((await transformedReader.read()).done === true, 'TransformStream did not close its readable side');
    writer.releaseLock();
    transformedReader.releaseLock();
  });
})();
