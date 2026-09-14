// Local Webhook P0 public shape, authentication boundary, and close lifecycle.
// Native single-flight, dedupe, cancellation, and independent external-process
// evidence stay in the corresponding Go owner/integration tests.

RuntimeAPITest.test({
  name: 'Webhook.listen creates an execution-scoped authenticated loopback handle',
  tier: 'unit',
  verification: 'behavior',
  covers: ['Webhook.listen', 'WebhookHandle.requestHeaders', 'WebhookHandle.close'],
}, async () => {
  RuntimeAPITest.equal(Object.keys(Webhook).sort().join(','), 'listen', 'Webhook public methods');
  const hook = Webhook.listen('runtime-api-webhook', async (request) => ({
    status: 200,
    body: { requestId: request.requestId },
  }));
  try {
    RuntimeAPITest.assert(/^http:\/\/127\.0\.0\.1:\d+\/v1\/webhook\//.test(hook.url), 'Webhook URL is not an ephemeral IPv4 loopback URL');
    const headers = hook.requestHeaders();
    RuntimeAPITest.assert(typeof headers.Authorization === 'string' && headers.Authorization.startsWith('Bearer '), 'Webhook handle did not provide a bearer authorization header');
    RuntimeAPITest.equal(headers['Content-Type'], 'application/json', 'Webhook content type');
    const secondHeaders = hook.requestHeaders();
    RuntimeAPITest.assert(headers !== secondHeaders, 'Webhook requestHeaders must return a fresh object');
    RuntimeAPITest.equal(secondHeaders.Authorization, headers.Authorization, 'Webhook listener credential changed within one listener');
  } finally {
    hook.close();
    hook.close();
  }
  await RuntimeAPITest.expectThrow(async () => hook.requestHeaders(), 'WEBHOOK_CLOSED');
});

RuntimeAPITest.test({
  name: 'Webhook listener rejects missing and incorrect credentials before handler execution',
  tier: 'unit',
  verification: 'behavior',
  covers: ['Webhook.listen', 'WebhookHandle.requestHeaders'],
}, async () => {
  let handlerCalls = 0;
  const hook = Webhook.listen('runtime-api-webhook-authentication', async (request) => {
    handlerCalls += 1;
    return { status: 200, body: { ok: true, requestId: request.requestId } };
  });
  const request = {
    method: 'POST',
    url: hook.url,
    data: { runtimeApi: 'webhook-authentication' },
    timeout: 2_000,
    responseType: 'json',
  };
  try {
    const missing = await http.request({
      ...request,
      headers: { 'Content-Type': 'application/json' },
    });
    RuntimeAPITest.equal(missing.status, 401, 'missing credential status');
    RuntimeAPITest.equal(missing.data.error.code, 'AUTHENTICATION_FAILED', 'missing credential code');
    RuntimeAPITest.equal(handlerCalls, 0, 'missing credential invoked handler');

    const incorrect = await http.request({
      ...request,
      headers: { Authorization: 'Bearer incorrect', 'Content-Type': 'application/json' },
    });
    RuntimeAPITest.equal(incorrect.status, 401, 'incorrect credential status');
    RuntimeAPITest.equal(incorrect.data.error.code, 'AUTHENTICATION_FAILED', 'incorrect credential code');
    RuntimeAPITest.equal(handlerCalls, 0, 'incorrect credential invoked handler');

    const accepted = await http.request({ ...request, headers: hook.requestHeaders() });
    RuntimeAPITest.equal(accepted.status, 200, 'correct credential status');
    RuntimeAPITest.equal(accepted.data.ok, true, 'correct credential response');
    RuntimeAPITest.equal(handlerCalls, 1, 'correct credential did not invoke handler exactly once');
  } finally {
    hook.close();
  }
});
