// Argument and nonforeground Runtime regression. No target AX tree/CG query.
// The native gate reads only the system focused PID (requires AX permission).
// From repository root (after leader builds):
// ./dist/opendesk -script tests/runtime-api/window-app-scoped.js -console-mode script
'use strict';

async function main() {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const executable = '/argument-test-only/not-a-real-executable';
    const hiddenExtra = { pid: 1, exePath: executable };
    Object.defineProperty(hiddenExtra, 'extra', { value: true });
    const accessor = { exePath: executable };
    let getterRead = false;
    Object.defineProperty(accessor, 'pid', { enumerable: true, get() { getterRead = true; return 1; } });
    const symbolExtra = { pid: 1, exePath: executable, [Symbol('extra')]: true };
    const invalid = [
        undefined, null, [], 'target', {}, { pid: 1 }, { exePath: executable },
        { pid: 0, exePath: executable }, { pid: -1, exePath: executable },
        { pid: 1.5, exePath: executable }, { pid: NaN, exePath: executable },
        { pid: Infinity, exePath: executable }, { pid: 2147483648, exePath: executable },
        { pid: '1', exePath: executable }, { pid: 1, exePath: '' },
        { pid: 1, exePath: 'relative/executable' }, { pid: 1, exePath: '/bad\0path' },
        { pid: 1, exePath: 42 }, { pid: 1, exePath: executable, title: 'extra' },
        hiddenExtra, accessor, symbolExtra,
        Object.create({ pid: 1, exePath: executable }),
    ];
    check(typeof window.getAppWindow === 'function', 'window.getAppWindow is missing');
    for (let index = 0; index < invalid.length; index++) {
        let error;
        const promise = window.getAppWindow(invalid[index]);
        check(promise && typeof promise.then === 'function', 'Expected Promise at case ' + index);
        try { await promise; } catch (cause) { error = cause; }
        check(error && error.code === 'INVALID_ARGUMENT', 'Expected INVALID_ARGUMENT at case ' + index);
        check(error.operation === 'window.getAppWindow', 'Incorrect operation at case ' + index);
        check(error.capability === 'window.appScoped', 'Incorrect capability at case ' + index);
        check(typeof error.platform === 'string', 'Missing platform at case ' + index);
    }
    let extraError;
    try { await window.getAppWindow({ pid: 1, exePath: executable }, {}); } catch (error) { extraError = error; }
    check(extraError && extraError.code === 'INVALID_ARGUMENT', 'Extra positional argument accepted');
    check(!getterRead, 'Argument accessor was invoked');
    // A valid impossible PID exercises the registered native bridge while
    // the front-PID gate prevents any AX target access.
    const platform = window.getCapabilities().platform;
    if (platform === 'darwin') {
        // Exercise two independent scopes through the real native bridge.
        // A merely async JS facade around a synchronous reflected Go method
        // blocks both calls before a timer can run, and fails this regression.
        let pending = 2, ticksWhilePending = 0;
        const tick = setInterval(() => { if (pending > 0) ticksWhilePending++; }, 1);
        let observations;
        try {
            observations = await Promise.all([2147483647, 2147483646].map(pid =>
                window.getAppWindow({pid, exePath: executable}).then(
                    value => { pending--; return {value}; },
                    error => { pending--; return {error}; },
                )));
        } finally {
            clearInterval(tick);
        }
        check(ticksWhilePending > 0, 'Native getAppWindow blocked the owner EventLoop: no tick while two scopes were pending');
        check(observations.length === 2, 'Independent scope query was dropped');
        for (let index = 0; index < observations.length; index++) {
            const {value: result, error} = observations[index];
            if (error) {
                check(error.code === 'PERMISSION_DENIED', 'Foreground PID query must fail closed without AX permission');
                check(error.operation === 'window.getAppWindow' && error.capability === 'window.appScoped',
                    'Foreground PID error lost scoped context');
                console.log('SKIP native nonforeground gate: AX permission denied, scope ' + index);
            } else {
                check(result === null, 'Nonforeground PID must return null before target UI access');
            }
        }
        console.log('PASS window-app-scoped native async: 2 independent scopes; ticksWhilePending=' + ticksWhilePending);
    } else {
        let unsupported;
        try { await window.getAppWindow({pid:2147483647,exePath:executable}); } catch(e) { unsupported=e; }
        check(unsupported && unsupported.code === 'NOT_SUPPORTED', 'Other platforms must reject valid target');
    }
    console.log('PASS window-app-scoped argument-only: ' + (invalid.length + 1) + ' cases; no target AX tree access');
}

// The Runtime awaits its script body. Keep this entry pending even while the
// initial validation awaits have not created native workers or timers yet.
await main();

// Parent-controlled live regression, deliberately NOT invoked by main().
// After loading this file in one long-lived Runtime, the parent can call this
// with an authorized fixture target. setForeground(bool) must resolve only
// after the parent independently confirms that fixture's foreground state.
// This helper neither discovers applications nor activates/observes other UI.
// Run after the leader rebuilds; argument-only success does not prove this gate.
async function verifyAppScopedForegroundTransitions(target, setForeground) {
    const phases = [true, false, true, false];
    for (let phase = 0; phase < phases.length; phase++) {
        const expected = phases[phase];
        await setForeground(expected);
        // Repeated reads in the SAME Runtime expose activation-cache staleness.
        for (let sample = 0; sample < 8; sample++) {
            const current = await window.getAppWindow(target);
            if (!expected) {
                if (current !== null) throw new Error('Stale foreground result at phase ' + phase + ', sample ' + sample);
            } else if (!current || current.pid !== target.pid || current.exePath !== target.exePath ||
                !current.isForeground || !current.hasFocus) {
                throw new Error('Missing verified foreground fixture at phase ' + phase + ', sample ' + sample);
            }
        }
    }
    console.log('PASS window-app-scoped same-Runtime foreground transitions');
}
