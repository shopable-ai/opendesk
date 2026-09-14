// Run this in a second terminal from the repository root:
//   ./dist/opendesk -script examples/local-webhook-order-query/send.js -console-mode script
//
// Copy only the JSON after OPENDESK_WEBHOOK_READY= from main.js before running
// this file. This must be a separate OpenDesk process so the listener's
// EventLoop remains free to run its handler.

async function main() {
  const rawConfig = clipboard.paste();
  if (typeof rawConfig !== "string" || rawConfig.trim() === "") {
    throw new Error("Clipboard must contain the JSON after OPENDESK_WEBHOOK_READY=");
  }

  let input;
  try {
    input = JSON.parse(rawConfig.trim());
  } catch (_) {
    throw new Error("Pasted Webhook configuration must be valid JSON");
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Webhook configuration must be the OPENDESK_WEBHOOK_READY JSON object");
  }

  const webhookUrl = input.url;
  const inputHeaders = input.headers;
  const body = input.body === undefined ? input.exampleBody : input.body;

  if (typeof webhookUrl !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/v1\/webhook\//.test(webhookUrl)) {
    throw new Error("config.url must be an OpenDesk IPv4 loopback Webhook URL");
  }
  if (!inputHeaders || typeof inputHeaders !== "object" || Array.isArray(inputHeaders)) {
    throw new Error("config.headers must be an object");
  }
  if (typeof inputHeaders.Authorization !== "string" || !inputHeaders.Authorization.startsWith("Bearer ")) {
    throw new Error("config.headers.Authorization must contain the listener Bearer credential");
  }
  if (inputHeaders["Content-Type"] !== "application/json") {
    throw new Error('config.headers["Content-Type"] must be application/json');
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("config.body or config.exampleBody must be an order event object");
  }

  const source = typeof input.source === "string" && input.source.trim()
    ? input.source.trim()
    : "opendesk-send-example";
  const deliveryId = typeof input.deliveryId === "string" && input.deliveryId.trim()
    ? input.deliveryId.trim()
    : `opendesk-send-${Date.now()}`;

  const response = await http.request({
    method: "POST",
    url: webhookUrl,
    headers: {
      Authorization: inputHeaders.Authorization,
      "Content-Type": "application/json",
      "X-OpenDesk-Source": source,
      "X-OpenDesk-Delivery-Id": deliveryId,
    },
    data: body,
    timeout: 10_000,
    responseType: "json",
  });

  const result = {
    status: response.status,
    deliveryId,
    body: response.data,
  };
  console.log("OPENDESK_WEBHOOK_SEND_RESULT=" + JSON.stringify(result));

  if (
    response.status !== 200 ||
    !response.data ||
    response.data.ok !== true ||
    response.data.orderId !== body.orderId
  ) {
    throw new Error("Webhook test did not return the expected successful order result");
  }

  console.log("OPENDESK_WEBHOOK_SEND_PASS");
}

await main();
