// Internal integration fixture. It is loaded by
// pkg/execution/webhook_external_integration_test.go and deliberately uses an
// independent Go process as a real loopback HTTP client. It is not a public
// example or a prerequisite for using Webhook from OpenDesk JavaScript.

const state = {
  processed: 0,
  orders: Object.create(null),
};

const hook = Webhook.listen("order-query-response", async (request) => {
  const event = request.body;

  if (
    !event ||
    event.type !== "order.query.response" ||
    typeof event.orderId !== "string" ||
    typeof event.status !== "string"
  ) {
    return {
      status: 400,
      body: { code: "INVALID_ORDER_EVENT", requestId: request.requestId },
    };
  }

  await sleep(20);

  state.processed += 1;
  state.orders[event.orderId] = event.status;

  return {
    status: 200,
    body: {
      requestId: request.requestId,
      orderId: event.orderId,
      orderStatus: state.orders[event.orderId],
      processed: state.processed,
    },
  };
}, {
  handlerTimeoutMs: 5000,
  maxQueuedRequests: 16,
  maxQueuedBytes: 1024 * 1024,
  dedupeWindowMs: 60_000,
  maxDedupeEntries: 64,
});

const event100 = {
  type: "order.query.response",
  orderId: "ORDER-100",
  status: "paid",
};

const helperInput = [
  JSON.stringify({
    url: hook.url,
    headers: hook.requestHeaders(),
    source: "order-query-helper",
  }),
  JSON.stringify({ deliveryId: "delivery-100", body: event100 }),
  JSON.stringify({
    deliveryId: "delivery-200",
    body: { type: "order.query.response", orderId: "ORDER-200", status: "shipped" },
  }),
  JSON.stringify({ deliveryId: "delivery-100", body: event100 }),
  JSON.stringify({
    deliveryId: "delivery-100",
    body: { type: "order.query.response", orderId: "ORDER-100", status: "refunded" },
  }),
  JSON.stringify({ deliveryId: "delivery-bad", body: { type: "order.query.response" } }),
].join("\n") + "\n";

try {
  const helper = await Command.run(
    "go",
    ["run", "./tests/webhook/tools/external-http-client"],
    {
      cwd: Execution.workdir,
      input: helperInput,
      timeout: 30_000,
      emitOutput: false,
      maxOutputBytes: 1024 * 1024,
    }
  );

  const lines = helper.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (!lines[0] || lines[0].kind !== "ready") {
    throw new Error("helper did not confirm readiness");
  }

  const results = lines.slice(1);
  const statuses = results.map((entry) => entry.status);
  if (JSON.stringify(statuses) !== JSON.stringify([200, 200, 200, 409, 400])) {
    throw new Error(`unexpected helper statuses: ${JSON.stringify(statuses)}`);
  }

  if (state.processed !== 2) {
    throw new Error(`dedupe/state contract failed: processed=${state.processed}`);
  }

  const first = results[0].body;
  const duplicate = results[2].body;
  if (!first || !duplicate || first.requestId !== duplicate.requestId || first.processed !== duplicate.processed) {
    throw new Error("duplicate delivery did not replay the original result");
  }

  console.log(JSON.stringify({
    integration: "external-http-process",
    helperReady: true,
    deliveries: results.length,
    statuses,
    processed: state.processed,
    orders: Object.keys(state.orders).sort(),
  }));
} finally {
  hook.close();
}
