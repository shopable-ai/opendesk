// Formal safe Runtime test for leader execution through MCP. Uses the actual
// page facade/native URL reader without monkeypatching. No page navigation,
// desktop observations/actions, permission calls, audio or network requests.
// ensureMacPermissions is intentionally not called: ordinary invalid/null
// options do not provide a guaranteed permission-free validation path.
function check(value, message) {
  if (!value) throw new Error(`mcp-page-wait: ${message}`);
}

check(typeof page.waitForNavigation === 'function', 'navigation wait exposed');
check(typeof page.url === 'function', 'URL reader exposed');
const before = page.url();
check(typeof before === 'string', 'URL reader returns a synchronous string');

// Valid options return a Promise; timeout must reject it, never throw during
// invocation. Do not assert elapsed time: scheduling can delay the 100ms poll.
let wait;
try {
  wait = page.waitForNavigation({ timeout: 1 });
} catch (_) {
  throw new Error('mcp-page-wait: valid options threw synchronously');
}
check(wait instanceof Promise, 'valid options return a Runtime Promise');
let rejected = false;
try {
  await wait;
} catch (error) {
  rejected = true;
  check(error instanceof Error && error.name === 'Error', 'timeout is an ordinary Error');
  check(error.message === 'Navigation timeout', 'timeout message matches contract');
  check(error.code === undefined, 'legacy timeout has no structured error code');
}
check(rejected, 'unchanged URL rejects instead of resolving');
check(page.url() === before, 'URL remains unchanged after timeout');

// Destructuring null happens before Promise creation. A rejected Promise is
// insufficient: this call must throw synchronously and return no value.
const notReturned = {};
let nullResult = notReturned;
let nullThrew = false;
try {
  nullResult = page.waitForNavigation(null);
} catch (error) {
  nullThrew = true;
  check(error instanceof TypeError && error.name === 'TypeError',
    'null options throw a synchronous TypeError');
}
check(nullThrew, 'null options throw before returning a Promise');
check(nullResult === notReturned, 'null options return neither a value nor a Promise');
check(page.url() === before, 'URL remains unchanged after null options');

// Report contract outcomes only; never print the native executable/URL value.
console.log(JSON.stringify({ test: 'mcp-page-wait', ok: true,
  timeoutRejected: true, nullSynchronousTypeError: true, urlUnchanged: true,
  permissionsTested: false }));
