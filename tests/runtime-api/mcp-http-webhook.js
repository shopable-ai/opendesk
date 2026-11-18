// Formal Runtime cases; run one per fresh execution via Execution.input.case.
// No default case and no fixture/server creation here. The leader must approve
// the test design and supply an authorized fixture before any live execution.
// case:http requires input.baseURL = http://127.0.0.1:<port>
// with no credentials, query, fragment or path. Fixture contract (no redirects):
// POST /echo -> 200 JSON {method, body: parsed JSON, header: req.headers["x-contract-fixture"]};
// GET /failure -> 503 JSON. No external endpoints or business operations.
// case:webhook requires input.webhookHostAuthorized === true AFTER leader
// confirmation AND real host webhook authorization (e.g. trusted MCP capability).
// That input is only a test guard; it cannot enable the Runtime capability.
// This case briefly binds an OS-selected 127.0.0.1 port and sends no deliveries.

function check(value, message) {
  if (!value) throw new Error(`mcp-http-webhook: ${message}`);
}

async function rejects(action, pattern) {
  let failure;
  try { await action(); } catch (error) { failure = error; }
  check(failure && pattern.test(String(failure.message || failure)), `expected rejection ${pattern}`);
}

function fixtureBase(input) {
  check(typeof input.baseURL === 'string' &&
    /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.test(input.baseURL),
  'leader must inject an explicit IPv4 loopback fixture URL');
  const port = Number(input.baseURL.match(/:([0-9]+)\/?$/)[1]);
  check(port <= 65535, 'valid fixture port');
  return input.baseURL.replace(/\/$/, '');
}

async function main() {
  const input = Execution.input || {};
  const scenario = input.case;
  if (scenario === 'http') {
    const base = fixtureBase(input);
    const response = await axios.request({
      url: `${base}/echo`, method: 'POST', timeout: 1000,
      data: { text: '中文 & value', value: 42 },
      headers: { 'Content-Type': 'application/json', 'X-Contract-Fixture': 'request' },
    });
    check(response.status === 200, 'request success status');
    check(response.data.method === 'POST', 'request method');
    check(response.data.body.text === '中文 & value' && response.data.body.value === 42, 'JSON body');
    check(response.data.header === 'request', 'request header');
    await rejects(() => axios.request({ url: `${base}/failure`, timeout: 1000 }),
      /Request failed with status code 503/);
    const accepted = await axios.request({
      url: `${base}/failure`, timeout: 1000, validateStatus: (status) => status === 503,
    });
    check(accepted.status === 503, 'custom status validation');
    // Invalid responseType fails before I/O in the native owner.
    await rejects(() => axios.request({ url: `${base}/echo`, responseType: 'unsupported' }),
      /unsupported responseType/);
    const defaults = axios.defaults;
    const keys = ['url', 'method', 'data', 'timeout', 'headers', 'validateStatus'];
    const saved = keys.map((key) => ({ key, own: Object.prototype.hasOwnProperty.call(defaults, key), value: defaults[key] }));
    try {
      defaults.url = `${base}/echo`;
      defaults.method = 'POST';
      defaults.data = { inherited: 'yes', override: 'default' };
      defaults.timeout = 1000;
      defaults.headers = {
        common: { 'X-Contract-Fixture': 'common' },
        post: { 'X-Contract-Fixture': 'post' },
        'Content-Type': 'application/json',
      };
      defaults.validateStatus = (status) => status === 200;
      const response = await axios.request({ data: { override: 'request' } });
      check(response.status === 200 && response.data.method === 'POST', 'defaults URL and method');
      check(response.data.body.inherited === 'yes' && response.data.body.override === 'request', 'deep-merged body');
      check(response.data.header === 'post', 'method headers override common');
      const override = await axios.request({ headers: { 'X-Contract-Fixture': 'request' } });
      check(override.data.header === 'request', 'flat header overrides grouped defaults');
      defaults.validateStatus = () => false;
      await rejects(() => axios.request({}), /Request failed with status code 200/);
      const recovered = await axios.request({ validateStatus: (status) => status === 200 });
      check(recovered.status === 200, 'request overrides default validator');
    } finally {
      for (const { key, own, value } of saved) {
        if (own) defaults[key] = value;
        else delete defaults[key];
      }
    }
    check(axios.defaults === defaults, 'defaults identity preserved');
  } else if (scenario === 'webhook') {
    check(input.webhookHostAuthorized === true, 'leader confirmation and host authorization required before listen');
    const name = `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let calls = 0;
    const handler = () => { calls += 1; return { status: 200, body: { ok: true } }; };
    const hook = Webhook.listen(`  ${name}  `, handler);
    try {
      check(hook.name === name, 'normalized name');
      check(/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(hook.url), 'OS-allocated loopback listener');
      // Capture and close even an unexpectedly accepted duplicate before failing.
      let duplicate;
      try {
        await rejects(() => { duplicate = Webhook.listen(name, handler); }, /WEBHOOK_NAME_CONFLICT/);
      } finally {
        if (duplicate) duplicate.close();
      }
    } finally {
      hook.close();
    }
    hook.close();
    check(hook.name === name, 'name remains readable after close');
    const reopened = Webhook.listen(name, handler);
    try { check(reopened.name === name, 'closed name can be reused'); }
    finally { reopened.close(); }
    check(calls === 0, 'no HTTP deliveries or business handler calls');
  } else {
    throw new Error('mcp-http-webhook: explicitly select http or webhook');
  }
  console.log(JSON.stringify({ test: 'mcp-http-webhook', case: scenario, passed: true }));
}

main().catch((error) => { console.error(String(error.message || error)); throw error; });
