// Public argument-only regression; no native watcher is created or desktop read.
// From repository root after building the integrated Runtime:
// ./dist/opendesk -script tests/runtime-api/window-app-watch.js -console-mode script
'use strict';

function verifyAppWindowWatchArguments() {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(typeof window.watchAppWindow === 'function', 'window.watchAppWindow is not registered');
    const path = '/argument-validation-only/not-a-real-executable';
    const target = () => ({ pid: 2147483647, exePath: path });
    let getterRead = false;
    const accessor = { exePath: path };
    Object.defineProperty(accessor, 'pid', { enumerable: true, get() { getterRead = true; return 1; } });
    const hidden = target();
    Object.defineProperty(hidden, 'extra', { value: 1 });
    const invalid = [undefined, null, [], 'target', {}, {pid: 1}, {exePath: path},
        {pid: 0, exePath: path}, {pid: -1, exePath: path}, {pid: 1.5, exePath: path},
        {pid: NaN, exePath: path}, {pid: Infinity, exePath: path},
        {pid: 2147483648, exePath: path}, {pid: '1', exePath: path},
        {pid: {}, exePath: path}, {pid: 1, exePath: {}},
        {pid: 1, exePath: ''}, {pid: 1, exePath: '/' + 'x'.repeat(4095)}, {pid: 1, exePath: 'relative'}, {pid: 1, exePath: '/bad\0path'},
        {pid: 1, exePath: path, title: 'extra'}, hidden, accessor,
        Object.assign(target(), {[Symbol('extra')]: 1}), Object.create(target())];
    let cases = 0;
    function expectInvalid(args) {
        let failure;
        try { window.watchAppWindow.apply(window, args); } catch (error) { failure = error; }
        check(failure && failure.code === 'INVALID_ARGUMENT', 'Expected synchronous INVALID_ARGUMENT at case ' + cases);
        check(failure.operation === 'window.watchAppWindow', 'Incorrect operation');
        check(failure.capability === 'window.appWatch', 'Incorrect capability');
        check(typeof failure.platform === 'string', 'Missing platform');
        cases++;
    }
    invalid.forEach(value => expectInvalid([value, () => {}]));
    [undefined, null, true, 1, 'callback', {}, []].forEach(value => expectInvalid([target(), value]));
    expectInvalid([]);
    expectInvalid([target()]);
    expectInvalid([target(), () => {}, {}]);
    check(!getterRead, 'target accessor was evaluated');
    console.log('PASS window-app-watch argument-only: ' + cases + ' cases; no native subscription');
}

if (globalThis.RuntimeAPITest && typeof RuntimeAPITest.test === 'function') {
    RuntimeAPITest.test({name: 'window.watchAppWindow rejects invalid arguments without native subscription',
        tier: 'unit', covers: ['window.watchAppWindow']}, verifyAppWindowWatchArguments);
} else {
    verifyAppWindowWatchArguments();
}

// Parent-controlled fixture-only gate, deliberately never invoked above.
// Requires desktop coordination and an independently verified target. drive()
// must change ONLY that fixture and independently verify its result. The hints
// themselves must never be used as proof of focus/qualification or action success.
async function verifyAppWindowWatchFixture(target, drive) {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    let calls = 0, running = 0, maxRunning = 0, previousSequence = 0, previousTime = -1;
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const subscription = window.watchAppWindow(target, async hint => {
        calls++;
        running++;
        maxRunning = Math.max(maxRunning, running);
        check(hint.sequence > previousSequence, 'sequence must increase');
        check(hint.monotonicMs >= previousTime, 'monotonic time went backwards');
        check(hint.capabilities.verified === false, 'registration must not claim live verification');
        check(hint.active === null || typeof hint.active === 'boolean', 'invalid active hint');
        check(Array.isArray(hint.reasons) && hint.reasons.length > 0, 'missing merged reasons');
        check(!('window' in hint), 'hint must not authorize a target');
        previousSequence = hint.sequence;
        previousTime = hint.monotonicMs;
        await blocked;
        running--;
    });
    try {
        check(typeof subscription.unsubscribe === 'function', 'unsubscribe must be callable');
        check(subscription.capabilities.backend === 'per-pid-kvo-ax', 'incorrect backend');
        await drive();
        check(calls > 0, 'no hint delivered');
        check(maxRunning === 1, 'callback reentered while Promise was pending');
        subscription.unsubscribe();
        subscription.unsubscribe();
        const afterClose = calls;
        release();
        await new Promise(resolve => setTimeout(resolve, 100));
        check(calls === afterClose, 'callback delivered after unsubscribe');
    } finally {
        release();
        subscription.unsubscribe();
    }
}
