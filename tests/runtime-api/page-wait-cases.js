(function createPageWaitCases(harness) {
  'use strict';

  const assert = harness.assert;
  const equal = harness.equal;
  const MAX_DURATION = 86400000;
  const cases = [];

  function add(group, name, covers, run) {
    cases.push(Object.freeze({ group, name, covers: Object.freeze(covers.slice()), run }));
  }

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    return { promise, resolve, reject };
  }

  function delayWith(timer, milliseconds) {
    return new Promise((resolve) => timer(resolve, milliseconds));
  }

  async function expectRejected(valueOrFactory, check, message) {
    let rejected = false;
    let reason;
    try {
      const value = typeof valueOrFactory === 'function' ? valueOrFactory() : valueOrFactory;
      await value;
    } catch (error) {
      rejected = true;
      reason = error;
    }
    assert(rejected, message || 'expected Promise rejection');
    if (check) check(reason);
    return reason;
  }

  function expectSyncInvalid(fn, message) {
    let thrown = false;
    let error;
    try {
      fn();
    } catch (caught) {
      thrown = true;
      error = caught;
    }
    assert(thrown, message || 'expected a synchronous INVALID_ARGUMENT error');
    equal(error && error.code, 'INVALID_ARGUMENT', 'invalid argument code');
    return error;
  }

  function expectTimeout(error, text) {
    equal(error && error.name, 'TimeoutError', 'timeout error name');
    equal(error && error.code, 'TIMEOUT', 'timeout error code');
    assert(String(error && error.message || error).includes(text), 'timeout text must include ' + JSON.stringify(text));
  }

  function expectCanceled(error) {
    equal(error && error.name, 'AbortError', 'cancel error name');
    equal(error && error.code, 'CANCELED', 'cancel error code');
  }

  async function withTrackedResources(run) {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const activeTimers = new Set();
    const trackedSignals = [];

    globalThis.setTimeout = function(callback, milliseconds) {
      let id = null;
      id = originalSetTimeout(function() {
        activeTimers.delete(id);
        callback();
      }, milliseconds);
      activeTimers.add(id);
      return id;
    };
    globalThis.clearTimeout = function(id) {
      const result = originalClearTimeout(id);
      activeTimers.delete(id);
      return result;
    };

    function trackSignal(signal) {
      const hadOwnAdd = Object.prototype.hasOwnProperty.call(signal, 'addEventListener');
      const hadOwnRemove = Object.prototype.hasOwnProperty.call(signal, 'removeEventListener');
      const originalAdd = signal.addEventListener;
      const originalRemove = signal.removeEventListener;
      const activeListeners = new Set();
      signal.addEventListener = function(type, listener) {
        const result = originalAdd.call(signal, type, listener);
        if (type === 'abort') activeListeners.add(listener);
        return result;
      };
      signal.removeEventListener = function(type, listener) {
        const result = originalRemove.call(signal, type, listener);
        if (type === 'abort') activeListeners.delete(listener);
        return result;
      };
      trackedSignals.push({ signal, hadOwnAdd, hadOwnRemove, originalAdd, originalRemove, activeListeners });
      return activeListeners;
    }

    try {
      return await run({
        activeTimers,
        originalSetTimeout,
        originalClearTimeout,
        trackSignal,
      });
    } finally {
      for (const record of trackedSignals.reverse()) {
        if (record.hadOwnAdd) record.signal.addEventListener = record.originalAdd;
        else delete record.signal.addEventListener;
        if (record.hadOwnRemove) record.signal.removeEventListener = record.originalRemove;
        else delete record.signal.removeEventListener;
      }
      for (const id of Array.from(activeTimers)) originalClearTimeout(id);
      activeTimers.clear();
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  }

  add('normal', 'synchronous predicate preserves the original success value', ['page.waitForFunction'], async () => {
    const marker = { ready: true };
    equal(await page.waitForFunction(() => marker, { timeout: 200, polling: 1 }), marker);
  });

  add('normal', 'asynchronous predicate success is awaited', ['page.waitForFunction'], async () => {
    const marker = { async: true };
    equal(await page.waitForFunction(async () => marker, { timeout: 200, polling: 1 }), marker);
  });

  add('normal', 'predicate arguments and identity pass through unchanged', ['page.waitForFunction'], async () => {
    const left = { side: 'left' };
    const right = { side: 'right' };
    const result = await page.waitForFunction((actualLeft, actualRight) => {
      assert(actualLeft === left && actualRight === right, 'predicate arguments changed identity');
      return actualRight;
    }, { timeout: 200, polling: 1 }, left, right);
    equal(result, right);
  });

  add('normal', 'falsey predicate values continue polling', ['page.waitForFunction'], async () => {
    const values = [false, 0, '', null, 'ready'];
    let calls = 0;
    const result = await page.waitForFunction(() => values[calls++], { timeout: 300, polling: 1 });
    equal(result, 'ready');
    equal(calls, values.length);
  });

  add('normal', 'synchronous predicate errors remain transient', ['page.waitForFunction'], async () => {
    let calls = 0;
    const result = await page.waitForFunction(() => {
      calls += 1;
      if (calls < 3) throw new Error('transient sync predicate error');
      return 'recovered';
    }, { timeout: 300, polling: 1 });
    equal(result, 'recovered');
    equal(calls, 3);
  });

  add('normal', 'asynchronous predicate rejections remain transient', ['page.waitForFunction'], async () => {
    let calls = 0;
    const result = await page.waitForFunction(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new Error('transient async predicate error')) : Promise.resolve('recovered');
    }, { timeout: 300, polling: 1 });
    equal(result, 'recovered');
    equal(calls, 3);
  });

  add('normal', 'predicate polling has at most one invocation in flight', ['page.waitForFunction'], async () => {
    const realSetTimeout = globalThis.setTimeout;
    let calls = 0;
    let inFlight = 0;
    let maximum = 0;
    const result = await page.waitForFunction(() => {
      calls += 1;
      inFlight += 1;
      maximum = Math.max(maximum, inFlight);
      return new Promise((resolve) => realSetTimeout(() => {
        inFlight -= 1;
        resolve(calls >= 3 ? 'ready' : false);
      }, 8));
    }, { timeout: 500, polling: 1 });
    equal(result, 'ready');
    equal(maximum, 1, 'predicate calls overlapped');
  });

  add('normal', 'rejected asynchronous predicates never overlap the next invocation', ['page.waitForFunction'], async () => {
    const realSetTimeout = globalThis.setTimeout;
    let calls = 0;
    let inFlight = 0;
    let maximum = 0;
    const result = await page.waitForFunction(() => {
      calls += 1;
      const attempt = calls;
      inFlight += 1;
      maximum = Math.max(maximum, inFlight);
      return new Promise((resolve, reject) => realSetTimeout(() => {
        inFlight -= 1;
        if (attempt < 3) reject(new Error('transient ' + attempt));
        else resolve('ready');
      }, 8));
    }, { timeout: 500, polling: 1 });
    equal(result, 'ready');
    equal(maximum, 1, 'rejected predicate calls overlapped');
  });

  add('normal', 'fixed zero millisecond wait completes asynchronously', ['page.waitForTimeout'], async () => {
    let synchronous = true;
    let observedSynchronous = null;
    const wait = page.waitForTimeout(0).then(() => { observedSynchronous = synchronous; });
    synchronous = false;
    await wait;
    equal(observedSynchronous, false, '0ms wait resolved synchronously');
  });

  add('normal', 'a completed wait settles its Promise chain once', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    let fulfillments = 0;
    let rejections = 0;
    const value = await page.waitForFunction(() => 'done', { timeout: 100, polling: 1, signal: controller.signal }).then(
      (result) => { fulfillments += 1; return result; },
      (error) => { rejections += 1; throw error; },
    );
    controller.abort('late abort');
    await page.waitForTimeout(0);
    equal(value, 'done');
    equal(fulfillments, 1);
    equal(rejections, 0);
  });

  add('normal', 'frozen options and input arrays are not modified', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    const timeoutOptions = Object.freeze({ signal: null });
    const functionOptions = Object.freeze({ timeout: 100, polling: 1, signal: null });
    const allOptions = Object.freeze({ timeout: 100, signal: null });
    const input = Object.freeze([Promise.resolve('left'), 'right']);
    await page.waitFor(0, timeoutOptions);
    await page.waitForTimeout(0, timeoutOptions);
    equal(await page.waitForFunction(() => 'ready', functionOptions), 'ready');
    equal(JSON.stringify(await page.waitForAll(input, allOptions)), JSON.stringify(['left', 'right']));
    equal(Object.keys(timeoutOptions).length, 1);
    equal(Object.keys(functionOptions).length, 3);
    equal(input.length, 2);
  });

  add('normal', 'Page wait helpers do not publish new globals', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    for (const name of [
      'PAGE_WAIT_MAX_DURATION', 'PAGE_WAIT_DEFAULT_TIMEOUT', 'PAGE_WAIT_DEFAULT_POLLING',
      'pageWaitError', 'invalidPageWaitArgument', 'pageWaitTimeout', 'pageWaitCanceled',
      'requirePageWaitDuration', 'requirePageWaitOptions', 'requirePageWaitSignal', 'pageWaitOptions',
    ]) {
      equal(Object.prototype.hasOwnProperty.call(globalThis, name), false, 'unexpected Page wait global: ' + name);
    }
  });

  add('deadline', 'a never-settling predicate cannot disable the independent deadline', ['page.waitForFunction'], async () => {
    const started = Date.now();
    const error = await expectRejected(
      page.waitForFunction(() => new Promise(() => {}), { timeout: 30, polling: 1 }),
      (caught) => expectTimeout(caught, 'Timeout waiting for function'),
    );
    expectTimeout(error, 'Timeout waiting for function');
    assert(Date.now() - started < 1000, 'API deadline did not settle promptly');
  });

  add('deadline', 'deadline wins when polling is longer than timeout', ['page.waitForFunction'], async () => {
    let calls = 0;
    const started = Date.now();
    await expectRejected(
      page.waitForFunction(() => { calls += 1; return false; }, { timeout: 25, polling: 500 }),
      (error) => expectTimeout(error, 'Timeout waiting for function'),
    );
    equal(calls, 1);
    assert(Date.now() - started < 250, 'long polling interval delayed the independent deadline');
  });

  add('deadline', 'zero function timeout wins without invoking its predicate', ['page.waitForFunction'], async () => {
    let calls = 0;
    await expectRejected(page.waitForFunction(() => {
      calls += 1;
      return true;
    }, { timeout: 0, polling: 0 }), (error) => expectTimeout(error, 'Timeout waiting for function'));
    equal(calls, 0, 'zero-timeout predicate was invoked');
  });

  add('deadline', 'continuous false values end with the API timeout', ['page.waitForFunction'], async () => {
    let calls = 0;
    await expectRejected(
      page.waitForFunction(() => { calls += 1; return false; }, { timeout: 30, polling: 2 }),
      (error) => expectTimeout(error, 'Timeout waiting for function'),
    );
    assert(calls >= 2, 'false predicate did not poll');
  });

  add('deadline', 'continuous predicate rejection ends with the API timeout', ['page.waitForFunction'], async () => {
    let calls = 0;
    await expectRejected(
      page.waitForFunction(() => { calls += 1; return Promise.reject('transient'); }, { timeout: 30, polling: 2 }),
      (error) => expectTimeout(error, 'Timeout waiting for function'),
    );
    assert(calls >= 2, 'rejected predicate did not poll');
  });

  add('deadline', 'late predicate success cannot settle or restart a timed-out wait', ['page.waitForFunction'], async () => {
    const pending = deferred();
    let calls = 0;
    let fulfillments = 0;
    let rejections = 0;
    const wait = page.waitForFunction(() => { calls += 1; return pending.promise; }, { timeout: 20, polling: 1 }).then(
      (value) => { fulfillments += 1; return value; },
      (error) => { rejections += 1; throw error; },
    );
    await expectRejected(wait, (error) => expectTimeout(error, 'Timeout waiting for function'));
    pending.resolve('late');
    await page.waitForTimeout(15);
    equal(calls, 1);
    equal(fulfillments, 0);
    equal(rejections, 1);
  });

  add('deadline', 'late predicate rejection cannot restart a timed-out wait', ['page.waitForFunction'], async () => {
    const pending = deferred();
    let calls = 0;
    await expectRejected(
      page.waitForFunction(() => { calls += 1; return pending.promise; }, { timeout: 20, polling: 1 }),
      (error) => expectTimeout(error, 'Timeout waiting for function'),
    );
    pending.reject(new Error('late predicate rejection'));
    await page.waitForTimeout(15);
    equal(calls, 1);
  });

  add('deadline', 'waitForAll rejects its own unfinished input deadline', ['page.waitForAll'], async () => {
    const started = Date.now();
    await expectRejected(
      page.waitForAll([new Promise(() => {})], { timeout: 25 }),
      (error) => expectTimeout(error, 'Timeout waiting for all promises'),
    );
    assert(Date.now() - started < 1000, 'waitForAll deadline did not settle promptly');
  });

  add('deadline', 'zero waitForAll timeout wins over already fulfilled input', ['page.waitForAll'], async () => {
    await expectRejected(
      page.waitForAll([Promise.resolve('too late')], { timeout: 0 }),
      (error) => expectTimeout(error, 'Timeout waiting for all promises'),
    );
  });

  add('deadline', 'waitForAll absolute deadline wins after event-loop blocking', ['page.waitForAll'], async () => {
    const input = deferred();
    const wait = page.waitForAll([input.promise], { timeout: 10 });
    const blockedUntil = Date.now() + 35;
    while (Date.now() < blockedUntil) {
      // Deliberately block this execution until the deadline is overdue.
    }
    // Resolve in this same turn. Its aggregate microtask runs before the
    // overdue timer callback, so only the absolute timestamp check can ensure
    // that the deadline still wins.
    input.resolve('late input');
    await expectRejected(wait, (error) => expectTimeout(error, 'Timeout waiting for all promises'));
  });

  add('cancel', 'pre-canceled predicate wait never calls the predicate', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    controller.abort('before call');
    let calls = 0;
    const error = await expectRejected(
      page.waitForFunction(() => { calls += 1; return true; }, { signal: controller.signal }),
      expectCanceled,
    );
    expectCanceled(error);
    equal(calls, 0);
  });

  add('cancel', 'active false-value polling honors cancellation', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    let calls = 0;
    const wait = page.waitForFunction(() => { calls += 1; return false; }, {
      timeout: 1000, polling: 2, signal: controller.signal,
    });
    realSetTimeout(() => controller.abort('polling canceled'), 12);
    await expectRejected(wait, expectCanceled);
    assert(calls >= 1, 'predicate never started before cancellation');
  });

  add('cancel', 'a hanging predicate Promise honors cancellation', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    const wait = page.waitForFunction(() => new Promise(() => {}), {
      timeout: 1000, polling: 1, signal: controller.signal,
    });
    realSetTimeout(() => controller.abort('hanging canceled'), 10);
    await expectRejected(wait, expectCanceled);
  });

  add('cancel', 'numeric waitFor forwards its signal option', ['page.waitFor', 'page.waitForTimeout'], async () => {
    const controller = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    const wait = page.waitFor(1000, { signal: controller.signal });
    realSetTimeout(() => controller.abort('numeric dispatch'), 10);
    await expectRejected(wait, expectCanceled);
  });

  add('cancel', 'functional waitFor forwards timeout polling and signal', ['page.waitFor', 'page.waitForFunction'], async () => {
    const controller = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    let calls = 0;
    const wait = page.waitFor(() => { calls += 1; return false; }, {
      timeout: 1000, polling: 2, signal: controller.signal,
    });
    realSetTimeout(() => controller.abort('function dispatch'), 10);
    await expectRejected(wait, expectCanceled);
    assert(calls >= 1, 'function dispatch did not invoke predicate');
  });

  add('cancel', 'predicate-triggered cancellation wins over a truthy return', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    await expectRejected(page.waitForFunction(() => {
      controller.abort('inside predicate');
      return 'too late';
    }, { timeout: 100, polling: 1, signal: controller.signal }), expectCanceled);
  });

  add('cancel', 'canceling after success cannot change the result', ['page.waitForFunction'], async () => {
    const controller = new AbortController();
    const result = await page.waitForFunction(() => 'ready', { timeout: 100, polling: 1, signal: controller.signal });
    controller.abort('after success');
    await page.waitForTimeout(0);
    equal(result, 'ready');
  });

  add('cancel', 'repeated cancellation rejects only once', ['page.waitForTimeout'], async () => {
    const controller = new AbortController();
    let rejections = 0;
    const wait = page.waitForTimeout(1000, { signal: controller.signal }).catch((error) => {
      rejections += 1;
      throw error;
    });
    controller.abort('first');
    controller.abort('second');
    await expectRejected(wait, expectCanceled);
    await page.waitForTimeout(0);
    equal(rejections, 1);
  });

  add('cancel', 'waitForTimeout clears its timer when canceled', ['page.waitForTimeout'], async () => {
    const controller = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    const wait = page.waitForTimeout(1000, { signal: controller.signal });
    realSetTimeout(() => controller.abort('fixed wait canceled'), 10);
    await expectRejected(wait, expectCanceled);
  });

  add('all', 'waitForAll mixes values and Promises without invoking functions', ['page.waitForAll'], async () => {
    let called = false;
    const valueFunction = () => { called = true; };
    const result = await page.waitForAll([1, Promise.resolve(2), valueFunction], { timeout: 100 });
    equal(result[0], 1);
    equal(result[1], 2);
    equal(result[2], valueFunction);
    equal(called, false, 'waitForAll invoked a function input');
  });

  add('all', 'waitForAll preserves input order across out-of-order completion', ['page.waitForAll'], async () => {
    const first = deferred();
    const second = deferred();
    const wait = page.waitForAll([first.promise, second.promise], { timeout: 200 });
    second.resolve('second');
    first.resolve('first');
    equal(JSON.stringify(await wait), JSON.stringify(['first', 'second']));
  });

  add('all', 'waitForAll accepts an empty array', ['page.waitForAll'], async () => {
    equal(JSON.stringify(await page.waitForAll([], { timeout: 100 })), '[]');
  });

  add('all', 'waitForAll preserves an Error rejection identity', ['page.waitForAll'], async () => {
    const marker = new Error('original rejection');
    const reason = await expectRejected(page.waitForAll([Promise.reject(marker)], { timeout: 100 }));
    equal(reason, marker);
  });

  add('all', 'waitForAll preserves a null rejection reason', ['page.waitForAll'], async () => {
    const reason = await expectRejected(page.waitForAll([Promise.reject(null)], { timeout: 100 }));
    equal(reason, null);
  });

  add('all', 'pre-cancellation still observes an already rejected input', ['page.waitForAll'], async () => {
    const controller = new AbortController();
    controller.abort('pre-canceled all');
    const marker = new Error('already rejected input');
    await expectRejected(page.waitForAll([Promise.reject(marker)], {
      timeout: 100, signal: controller.signal,
    }), expectCanceled);
    await page.waitForTimeout(0);
    equal(await page.waitForAll(['next'], { timeout: 100 }).then((values) => values[0]), 'next');
  });

  add('all', 'late input rejection after timeout is handled and cannot pollute the next wait', ['page.waitForAll'], async () => {
    const input = deferred();
    await expectRejected(page.waitForAll([input.promise], { timeout: 15 }), (error) => {
      expectTimeout(error, 'Timeout waiting for all promises');
    });
    input.reject(new Error('late input rejection'));
    await page.waitForTimeout(10);
    equal((await page.waitForAll(['clean'], { timeout: 100 }))[0], 'clean');
  });

  add('all', 'late input rejection after active cancellation stays observed', ['page.waitForAll'], async () => {
    const controller = new AbortController();
    const input = deferred();
    const wait = page.waitForAll([input.promise], { timeout: 1000, signal: controller.signal });
    controller.abort('stop aggregate');
    await expectRejected(wait, expectCanceled);
    input.reject(new Error('late after cancel'));
    await page.waitForTimeout(10);
    equal((await page.waitForAll(['clean'], { timeout: 100 }))[0], 'clean');
  });

  add('all', 'timeout does not stop caller-owned work', ['page.waitForAll'], async () => {
    const realSetTimeout = globalThis.setTimeout;
    let completed = false;
    const task = new Promise((resolve) => realSetTimeout(() => {
      completed = true;
      resolve('finished');
    }, 25));
    await expectRejected(page.waitForAll([task], { timeout: 5 }), (error) => {
      expectTimeout(error, 'Timeout waiting for all promises');
    });
    equal(await task, 'finished');
    equal(completed, true);
  });

  add('all', 'timeout does not abort the caller-owned controller', ['page.waitForAll'], async () => {
    const controller = new AbortController();
    await expectRejected(page.waitForAll([new Promise(() => {})], {
      timeout: 10, signal: controller.signal,
    }), (error) => expectTimeout(error, 'Timeout waiting for all promises'));
    equal(controller.signal.aborted, false);
  });

  add('arguments', 'waitForFunction rejects a non-function synchronously', ['page.waitForFunction'], async () => {
    expectSyncInvalid(() => page.waitForFunction(null), 'non-function predicate did not throw synchronously');
  });

  add('arguments', 'waitForAll rejects a non-array synchronously', ['page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitForAll({ length: 0 }), 'non-array input did not throw synchronously');
  });

  add('arguments', 'wait options must be objects', ['page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitForTimeout(0, null));
    expectSyncInvalid(() => page.waitForFunction(() => true, 'options'));
    expectSyncInvalid(() => page.waitForAll([], []));
  });

  add('arguments', 'wait signals must be AbortSignal-compatible', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    for (const invoke of [
      () => page.waitFor(0, { signal: {} }),
      () => page.waitForTimeout(0, { signal: { aborted: false } }),
      () => page.waitForFunction(() => true, { signal: { aborted: 'no', addEventListener() {}, removeEventListener() {} } }),
      () => page.waitForAll([], { signal: { aborted: false, addEventListener() {} } }),
    ]) expectSyncInvalid(invoke);
  });

  add('arguments', 'negative durations are invalid', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitFor(-1));
    expectSyncInvalid(() => page.waitForTimeout(-1));
    expectSyncInvalid(() => page.waitForFunction(() => true, { timeout: -1 }));
    expectSyncInvalid(() => page.waitForAll([], { timeout: -1 }));
  });

  add('arguments', 'NaN durations are invalid', ['page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitForTimeout(NaN));
    expectSyncInvalid(() => page.waitForFunction(() => true, { polling: NaN }));
    expectSyncInvalid(() => page.waitForAll([], { timeout: NaN }));
  });

  add('arguments', 'infinite and over-limit durations are invalid', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitFor(Infinity));
    expectSyncInvalid(() => page.waitForTimeout(MAX_DURATION + 1));
    expectSyncInvalid(() => page.waitForFunction(() => true, { polling: Infinity }));
    expectSyncInvalid(() => page.waitForAll([], { timeout: MAX_DURATION + 1 }));
  });

  add('arguments', 'string durations are not coerced', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    expectSyncInvalid(() => page.waitFor('1'));
    expectSyncInvalid(() => page.waitForTimeout('1'));
    expectSyncInvalid(() => page.waitForFunction(() => true, { timeout: '1' }));
    expectSyncInvalid(() => page.waitForAll([], { timeout: '1' }));
  });

  add('arguments', 'zero upper-bound and fractional durations follow the final contract', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    const first = new AbortController();
    first.abort('max fixed');
    await expectRejected(page.waitForTimeout(MAX_DURATION, { signal: first.signal }), expectCanceled);
    const second = new AbortController();
    second.abort('max dispatch');
    await expectRejected(page.waitFor(MAX_DURATION, { signal: second.signal }), expectCanceled);
    await expectRejected(page.waitForFunction(() => true, { timeout: 0, polling: MAX_DURATION }), (error) => {
      expectTimeout(error, 'Timeout waiting for function');
    });
    equal((await page.waitForAll(['max'], { timeout: MAX_DURATION }))[0], 'max');
    await page.waitForTimeout(0.5);
    equal(await page.waitForFunction(() => 'fractional', { timeout: 10.5, polling: 0.5 }), 'fractional');
  });

  add('arguments', 'omitted and null signals both mean no cancellation', ['page.waitForTimeout', 'page.waitForFunction', 'page.waitForAll'], async () => {
    await page.waitForTimeout(0);
    await page.waitForTimeout(0, { signal: null });
    equal(await page.waitForFunction(() => 'ready', { timeout: 100, polling: 1, signal: null }), 'ready');
    equal((await page.waitForAll(['ready'], { timeout: 100, signal: null }))[0], 'ready');
  });

  add('arguments', 'waitFor rejects unsupported first arguments synchronously', ['page.waitFor'], async () => {
    expectSyncInvalid(() => page.waitFor(undefined));
    expectSyncInvalid(() => page.waitFor({}));
  });

  add('cleanup', 'waitForTimeout success immediately releases its timer and listener', ['page.waitForTimeout'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      await page.waitForTimeout(2, { signal: controller.signal });
      equal(activeTimers.size, 0, 'completed fixed wait left a timer');
      equal(listeners.size, 0, 'completed fixed wait left a listener');
    });
  });

  add('cleanup', 'waitForTimeout cancellation immediately releases its timer and listener', ['page.waitForTimeout'], async () => {
    await withTrackedResources(async ({ activeTimers, originalSetTimeout, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      const wait = page.waitForTimeout(30000, { signal: controller.signal });
      originalSetTimeout(() => controller.abort('cleanup'), 2);
      await expectRejected(wait, expectCanceled);
      equal(activeTimers.size, 0, 'canceled fixed wait left a timer');
      equal(listeners.size, 0, 'canceled fixed wait left a listener');
    });
  });

  add('cleanup', 'zero function and all timeouts allocate no residual resources', ['page.waitForFunction', 'page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const functionController = new AbortController();
      const functionListeners = trackSignal(functionController.signal);
      let calls = 0;
      await expectRejected(page.waitForFunction(() => {
        calls += 1;
        return true;
      }, { timeout: 0, polling: 0, signal: functionController.signal }), (error) => {
        expectTimeout(error, 'Timeout waiting for function');
      });
      equal(calls, 0);
      equal(activeTimers.size, 0, 'zero function timeout left a timer');
      equal(functionListeners.size, 0, 'zero function timeout left a listener');

      const allController = new AbortController();
      const allListeners = trackSignal(allController.signal);
      await expectRejected(page.waitForAll([Promise.resolve('ready')], {
        timeout: 0, signal: allController.signal,
      }), (error) => expectTimeout(error, 'Timeout waiting for all promises'));
      equal(activeTimers.size, 0, 'zero aggregate timeout left a timer');
      equal(allListeners.size, 0, 'zero aggregate timeout left a listener');
    });
  });

  add('cleanup', 'waitForFunction success immediately releases deadline and listener', ['page.waitForFunction'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      equal(await page.waitForFunction(() => 'ready', {
        timeout: 30000, polling: 1, signal: controller.signal,
      }), 'ready');
      equal(activeTimers.size, 0, 'successful predicate wait left a timer');
      equal(listeners.size, 0, 'successful predicate wait left a listener');
    });
  });

  add('cleanup', 'waitForFunction timeout immediately releases all owned resources', ['page.waitForFunction'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      await expectRejected(page.waitForFunction(() => new Promise(() => {}), {
        timeout: 8, polling: 1, signal: controller.signal,
      }), (error) => expectTimeout(error, 'Timeout waiting for function'));
      equal(activeTimers.size, 0, 'timed-out predicate wait left a timer');
      equal(listeners.size, 0, 'timed-out predicate wait left a listener');
    });
  });

  add('cleanup', 'waitForFunction cancellation immediately releases all owned resources', ['page.waitForFunction'], async () => {
    await withTrackedResources(async ({ activeTimers, originalSetTimeout, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      const wait = page.waitForFunction(() => new Promise(() => {}), {
        timeout: 30000, polling: 1, signal: controller.signal,
      });
      originalSetTimeout(() => controller.abort('cleanup'), 2);
      await expectRejected(wait, expectCanceled);
      equal(activeTimers.size, 0, 'canceled predicate wait left a timer');
      equal(listeners.size, 0, 'canceled predicate wait left a listener');
    });
  });

  add('cleanup', 'transient predicate rejection still cleans resources on success', ['page.waitForFunction'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      let calls = 0;
      equal(await page.waitForFunction(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('retry')) : 'ready';
      }, { timeout: 30000, polling: 1, signal: controller.signal }), 'ready');
      equal(activeTimers.size, 0, 'recovered predicate wait left a timer');
      equal(listeners.size, 0, 'recovered predicate wait left a listener');
    });
  });

  add('cleanup', 'waitForAll early success clears its long deadline immediately', ['page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      equal((await page.waitForAll([Promise.resolve('ready')], {
        timeout: 30000, signal: controller.signal,
      }))[0], 'ready');
      equal(activeTimers.size, 0, 'early waitForAll success left the 30 second timer');
      equal(listeners.size, 0, 'early waitForAll success left a listener');
    });
  });

  add('cleanup', 'waitForAll Error rejection clears owned resources immediately', ['page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      const marker = new Error('reject now');
      equal(await expectRejected(page.waitForAll([Promise.reject(marker)], {
        timeout: 30000, signal: controller.signal,
      })), marker);
      equal(activeTimers.size, 0, 'rejected waitForAll left a timer');
      equal(listeners.size, 0, 'rejected waitForAll left a listener');
    });
  });

  add('cleanup', 'waitForAll null rejection clears owned resources immediately', ['page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      equal(await expectRejected(page.waitForAll([Promise.reject(null)], {
        timeout: 30000, signal: controller.signal,
      })), null);
      equal(activeTimers.size, 0, 'null-rejected waitForAll left a timer');
      equal(listeners.size, 0, 'null-rejected waitForAll left a listener');
    });
  });

  add('cleanup', 'waitForAll timeout clears owned resources immediately', ['page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      await expectRejected(page.waitForAll([new Promise(() => {})], {
        timeout: 8, signal: controller.signal,
      }), (error) => expectTimeout(error, 'Timeout waiting for all promises'));
      equal(activeTimers.size, 0, 'timed-out waitForAll left a timer');
      equal(listeners.size, 0, 'timed-out waitForAll left a listener');
    });
  });

  add('cleanup', 'waitForAll cancellation clears owned resources immediately', ['page.waitForAll'], async () => {
    await withTrackedResources(async ({ activeTimers, originalSetTimeout, trackSignal }) => {
      const controller = new AbortController();
      const listeners = trackSignal(controller.signal);
      const wait = page.waitForAll([new Promise(() => {})], {
        timeout: 30000, signal: controller.signal,
      });
      originalSetTimeout(() => controller.abort('cleanup'), 2);
      await expectRejected(wait, expectCanceled);
      equal(activeTimers.size, 0, 'canceled waitForAll left a timer');
      equal(listeners.size, 0, 'canceled waitForAll left a listener');
    });
  });

  add('cleanup', 'both waitFor dispatch branches release owned resources', ['page.waitFor', 'page.waitForTimeout', 'page.waitForFunction'], async () => {
    await withTrackedResources(async ({ activeTimers, trackSignal }) => {
      const first = new AbortController();
      const firstListeners = trackSignal(first.signal);
      await page.waitFor(1, { signal: first.signal });
      equal(activeTimers.size, 0);
      equal(firstListeners.size, 0);
      const second = new AbortController();
      const secondListeners = trackSignal(second.signal);
      equal(await page.waitFor(() => 'ready', {
        timeout: 30000, polling: 1, signal: second.signal,
      }), 'ready');
      equal(activeTimers.size, 0);
      equal(secondListeners.size, 0);
    });
  });

  add('cleanup', 'falsey timer infrastructure failures reject instead of resolving', ['page.waitForTimeout'], async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = function() { throw null; };
    try {
      equal(await expectRejected(page.waitForTimeout(1)), null, 'falsey timer failure was not preserved');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  add('cleanup', 'cleanup failure cannot leave a successful predicate Promise pending', ['page.waitForFunction'], async () => {
    const marker = new Error('clear failed after clearing');
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = function(id) {
      originalClearTimeout(id);
      throw marker;
    };
    try {
      equal(await expectRejected(page.waitForFunction(() => 'ready', {
        timeout: 100, polling: 1,
      })), marker);
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  add('cleanup', 'waitForAll preserves raw rejection when cleanup also fails', ['page.waitForAll'], async () => {
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = function(id) {
      originalClearTimeout(id);
      throw new Error('secondary cleanup failure');
    };
    try {
      equal(await expectRejected(page.waitForAll([Promise.reject(null)], { timeout: 100 })), null);
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  add('cleanup', 'partial signal registration failure is explicitly removed and rejected', ['page.waitForTimeout'], async () => {
    const marker = new Error('listener registration failed');
    let activeListener = null;
    const signal = {
      aborted: false,
      addEventListener(type, listener) {
        if (type === 'abort') activeListener = listener;
        throw marker;
      },
      removeEventListener(type, listener) {
        if (type === 'abort' && activeListener === listener) activeListener = null;
      },
    };
    equal(await expectRejected(page.waitForTimeout(100, { signal })), marker);
    equal(activeListener, null, 'partially registered listener was not removed');
  });

  add('cleanup', 'throwing optional abort reason cannot prevent cancellation', ['page.waitForTimeout'], async () => {
    const signal = {
      aborted: true,
      get reason() { throw new Error('reason unavailable'); },
      addEventListener() {},
      removeEventListener() {},
    };
    await expectRejected(page.waitForTimeout(100, { signal }), expectCanceled);
  });

  return Object.freeze(cases.slice());
})
