// Run from the repository root:
//   ./dist/opendesk -script examples/local-webhook-order-query/main.js -console-mode script
//
// Keep this OpenDesk process running, then copy the printed localhost URL and
// required headers into the real external HTTP caller on this machine.

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
    const rejection = {
      requestId: request.requestId,
      source: request.source,
      deliveryId: request.deliveryId,
      code: "INVALID_ORDER_EVENT",
    };
    console.log("OPENDESK_WEBHOOK_REJECTED=" + JSON.stringify(rejection));
    return {
      status: 400,
      body: { ok: false, code: rejection.code, requestId: request.requestId },
    };
  }

  // The HTTP response waits for this asynchronous work to finish.
  await sleep(20);

  state.processed += 1;
  state.orders[event.orderId] = event.status;

  const result = {
    requestId: request.requestId,
    source: request.source,
    deliveryId: request.deliveryId,
    orderId: event.orderId,
    orderStatus: state.orders[event.orderId],
    processed: state.processed,
  };
  console.log("OPENDESK_WEBHOOK_DELIVERY=" + JSON.stringify(result));

  return {
    status: 200,
    body: { ok: true, ...result },
  };
}, {
  handlerTimeoutMs: 5000,
  maxQueuedRequests: 16,
  maxQueuedBytes: 1024 * 1024,
  dedupeWindowMs: 60_000,
  maxDedupeEntries: 64,
});

// Printing the credential is an explicit handoff for this interactive example.
// Treat this line as a secret and copy it only into the intended local caller.
console.log("OPENDESK_WEBHOOK_READY=" + JSON.stringify({
  method: "POST",
  url: hook.url,
  headers: hook.requestHeaders(),
  optionalHeaders: {
    "X-OpenDesk-Source": "your-system",
    "X-OpenDesk-Delivery-Id": "unique-id-for-this-delivery",
  },
  exampleBody: {
    type: "order.query.response",
    orderId: "ORDER-100",
    status: "paid",
  },
}));
console.log("OPENDESK_WEBHOOK_WAITING=Send a POST from the configured external system; press Ctrl+C to stop.");
