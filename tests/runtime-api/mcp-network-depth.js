// Real Runtime cases, exclusively against caller-owned loopback/filesystem fixtures.
function check(value, message) { if (!value) throw new Error(`mcp-network-depth: ${message}`); }
function report(value) { console.log(JSON.stringify({test: 'mcp-network-depth', ...value})); }
async function fails(action, pattern) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(error && pattern.test(String(error.message || error)), `expected ${pattern}`);
}
const input = Execution.input;
if (input.scenario === 'pure') {
  const mapped = input.rectangles.map(rect => Geometry.center(rect));
  report({scenario: 'pure', mapped});
} else if (input.scenario === 'conditional') {
  check(Object.keys(Execution.env).length === 0, 'empty provider environment');
  check(Command.getCapabilities().enabled === false, 'no command authorization');
  const llm = LLM.getCapabilities();
  const agent = Agent.getCapabilities();
  check(llm.configured === false && llm.available === null && llm.checked === false, 'provider unverified');
  check(agent.enabled === false && agent.available === null && agent.checked === false, 'agent unavailable without owner authorization');
  const failures = [];
  for (const [name, action, expected] of [
    ['LLM.generate', () => LLM.generate({prompt: 'controlled missing-configuration boundary'}), 'CONFIG_MISSING'],
    ['Agent.run', () => Agent.run({prompt: 'controlled disabled-owner boundary'}), 'DISABLED'],
  ]) {
    let error;
    try {await action();} catch (caught) {error = caught;}
    check(error && error.code === expected, `${name} accurately refuses execution`);
    failures.push({operation: name, code: error.code});
  }
  await File.writeJSON(path.resolve(Execution.artifactDir, 'stopped.json'), {status: 'stopped', failures});
  report({scenario: 'conditional', status: 'stopped', failures});
} else if (input.scenario === 'console') {
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    check(console[name]('console-null-fixture', null, undefined, 0, false, {fixture: true}) === undefined, `${name} returns undefined`);
  }
  report({scenario: 'console', alive: true});
} else if (input.scenario === 'http') {
  check(/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(input.base), 'explicit loopback fixture');
  const response = await axios.get(`${input.base}/echo#client-fragment`, {params: {name: '中文 & +', zero: 0, omitted: null}});
  check(response.data.url === '/echo?name=%E4%B8%AD%E6%96%87%20%26%20%2B&zero=0', 'params precede fragment');
  const raw = await http.get(`${input.base}/failure`);
  check(raw.status === 503 && raw.statusText === '503 Service Unavailable', 'native HTTP exposes non-2xx');
  check(Array.isArray(raw.headers['Content-Type']), 'native header value arrays');
  check(raw.headers['Content-Type'][0] === 'application/json' && raw.headers['X-Fixture'].join(',') === 'one,two', 'actual headers preserved');
  check(typeof raw.headers.Get === 'undefined', 'no reflected Go methods');
  const text = await http.get(`${input.base}/bytes`, {responseType: 'text'});
  check(text.data === 'fixture-byte-data', 'text response');
  const bytes = await http.get(`${input.base}/bytes`, {responseType: 'arraybuffer'});
  check(bytes.data instanceof ArrayBuffer && new Uint8Array(bytes.data).length === 17, 'binary response');
  await fails(() => http.get(`${input.base}/slow?deadline`, {timeout: 60}), /HTTP request timed out/);
  const aborted = new AbortController();
  aborted.abort('before-send');
  await fails(() => http.get(`${input.base}/must-not-send`, {signal: aborted.signal}), /HTTP request canceled/);
  const controller = new AbortController();
  const pending = axios.get(`${input.base}/slow?abort`, {signal: controller.signal, timeout: 0});
  setTimeout(() => controller.abort('controlled'), 60);
  await fails(() => pending, /HTTP request canceled/);
  const restored = await http.get(`${input.base}/echo`);
  check(restored.status === 200, 'network remains usable after deadline/abort');
  const order = [];
  check(axios.interceptors.request.use(async config => {order.push('request'); return config;}) === 1, 'registration count');
  check(axios.interceptors.response.use(async result => {order.push('response'); return result;}) === 1, 'response count');
  const intercepted = await axios.request({url: `${input.base}/failure`, validateStatus: status => {order.push('validate'); return status === 503;}});
  check(intercepted.status === 503 && order.join(',') === 'request,response,validate', 'interceptor execution order');
  report({scenario: 'http', passed: true});
} else if (input.scenario === 'http-pending') {
  check(/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(input.base), 'explicit loopback fixture');
  await http.get(`${input.base}/pending`, {timeout: 0});
  throw new Error('pending request unexpectedly completed');
} else if (input.scenario === 'webhook-reopen') {
  for (let index = 0; index < 12; index++) {
    let hook;
    hook = Webhook.listen('generation-reuse', async () => {
      hook.close();
      await sleep(1);
      return {status: 200, body: {index}};
    });
    const response = await http.post(hook.url, {index}, {headers: hook.requestHeaders()});
    check(response.status === 200 && response.data.index === index, 'closed generation preserves new listener');
    hook.close();
  }
  report({scenario: 'webhook-reopen', generations: 12});
} else if (input.scenario === 'webhook-no-body') {
  let processed = 0;
  let hook;
  hook = Webhook.listen('controlled-no-body', request => {
    if (request.body.close === true) {
      hook.close();
      return {status: 200, body: {processed}};
    }
    processed += 1;
    return {status: request.body.status, body: {processed, omittedOnWire: true}};
  });
  await File.writeJSON(path.resolve(Execution.artifactDir, 'webhook-ready.json'), {url: hook.url, headers: hook.requestHeaders()});
} else if (input.scenario === 'webhook') {
  const fixture = input.fixture;
  check(typeof fixture === 'string' && fixture.startsWith(Execution.workdir + '/'), 'owned fixture');
  let processed = 0;
  let hook;
  hook = Webhook.listen('controlled-receipts', async request => {
    const body = request.body;
    if (!body || body.nonce !== input.nonce) return {status: 400, body: {code: 'INVALID_FIXTURE_EVENT'}};
    if (body.kind === 'close') {
      hook.close();
      let revoked = false;
      try { hook.requestHeaders(); } catch (error) { revoked = /WEBHOOK_/.test(String(error)); }
      check(revoked, 'closed credential accessor fails');
      report({scenario: 'webhook', closed: true, processed});
      return {status: 200, body: {closed: true, processed}};
    }
    if (body.kind === 'slow') {
      await sleep(350);
      check(request.signal.aborted, 'timed-out caller signals abort');
      await File.writeJSON(path.resolve(fixture, 'slow-finished.json'), {aborted: request.signal.aborted, processed});
      return {status: 200, body: {finished: true}};
    }
    if (typeof body.quantity !== 'number') report({scenario: 'webhook-number', actualType: typeof body.quantity, actualValue: body.quantity});
    check(body.kind === 'receipt' && body.quantity === 7 && body.nested.values[0] === null &&
      body.nested.values[1] === true && body.nested.values[2] === 2.5 && body.text === '7' &&
      Object.getPrototypeOf(body) === Object.prototype, 'validated JSON types in fixture receipt');
    processed += 1;
    const receipt = {id: body.id, quantity: body.quantity, processed, source: request.source,
      deliveryId: request.deliveryId, requestId: request.requestId};
    await File.writeJSON(path.resolve(fixture, 'receipt.json'), receipt);
    return {status: 201, body: receipt};
  }, {handlerTimeoutMs: 120, maxRequestBytes: 512});
  // Intentional local handoff only; never put the credential into console or MCP text.
  await File.writeJSON(path.resolve(Execution.artifactDir, 'webhook-ready.json'), {url: hook.url, headers: hook.requestHeaders()});
  if (input.hold) await sleep(30000);
} else {
  throw new Error('mcp-network-depth: explicit scenario required');
}
