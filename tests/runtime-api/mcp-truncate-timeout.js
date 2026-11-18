// Inputs and loopback server belong to the MCP test harness.
const {scenario, base} = Execution.input;
function check(condition, message) {
  if (!condition) throw new Error(message);
}

if (scenario === 'truncate-reject') {
  const invalid = [[-0.5], [-1], [0.5], [NaN], [Infinity], [2 ** 53], ['0'],
    [null], [undefined], [], [new Number(0)], [Symbol('size')], [0n], [0, 1]];
  const handle = File.open('reject.txt', 'a');
  try {
    handle.seek(3);
    for (const args of invalid) {
      let error;
      try { handle.truncate(...args); } catch (caught) { error = caught; }
      check(error && /size/.test(error.message), 'truncate must reject invalid size before changing the file');
      check(handle.seek(0, 'current') === 3, 'invalid size changed the handle offset');
    }
  } finally {
    handle.close();
  }
} else if (scenario === 'truncate-valid') {
  for (const [name, size] of [['shorten.txt', 4], ['extend.txt', 10], ['zero.txt', 0]]) {
    const handle = File.open(name, 'a');
    try {
      handle.seek(5);
      check(handle.truncate(size) === undefined, 'valid truncate must return undefined');
      check(handle.seek(0, 'current') === 5, 'valid truncate changed the handle offset');
    } finally {
      handle.close();
    }
  }
} else if (scenario === 'http-timeout') {
  check(/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base), 'expected a loopback fixture');
  for (const attempt of [
    () => http.request({url: base + '/fraction-request', timeout: 0.5}),
    () => http.get(base + '/fraction-get', {timeout: 0.25}),
    () => axios.get(base + '/fraction-axios', {timeout: 0.75}),
    () => http.get(base + '/integer-timeout', {timeout: 50}),
  ]) {
    let error;
    try { await attempt(); } catch (caught) { error = caught; }
    check(error && /^HTTP request timed out/.test(error.message), 'expected a request-level timeout');
  }
  for (const [route, timeout] of [['/zero', 0], ['/negative', -0.5], ['/positive', 2000]]) {
    const response = await http.get(base + route, {timeout, responseType: 'text'});
    check(response.status === 200 && response.data === route, 'expected complete loopback response for ' + route);
  }
} else {
  throw new Error('explicit test scenario required');
}
