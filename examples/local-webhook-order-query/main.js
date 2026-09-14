// Run from the repository root:
//   ./dist/opendesk -script examples/local-webhook-order-query/main.js
//
// This is a real cross-process HTTP integration example. The Go helper is an
// independent process. It receives the ephemeral URL + auth headers only via
// stdin, sends multiple HTTP deliveries, and never receives source code or a
// JavaScript function name.

const state = {
  processed: 0,
  orders: {},
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

  // This delay demonstrates that HTTP completion waits for the actual async
  // handler instead of acknowledging early or switching to a background mode.
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
  // Same source + id + content: must replay the first real result and must not
  // increment state.processed.
  JSON.stringify({ deliveryId: "delivery-100", body: event100 }),
  // Same source + id, different content: must be an explicit 409 conflict.
  JSON.stringify({
    deliveryId: "delivery-100",
    body: { type: "order.query.response", orderId: "ORDER-100", status: "refunded" },
  }),
  // Business-invalid JSON still reaches the registered handler and returns the
  // handler's actual 400 result, proving responses are not fixed success text.
  JSON.stringify({ deliveryId: "delivery-bad", body: { type: "order.query.response" } }),
].join("\n") + "\n";

try {
  const helper = await Command.run(
    "go",
    ["run", "./examples/local-webhook-order-query/helper"],
    {
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
    webhook: "order-query-response",
    helperReady: true,
    deliveries: results.length,
    statuses,
    processed: state.processed,
    orders: Object.keys(state.orders).sort(),
  }));
} finally {
  hook.close();
}
