export {};

declare global {
  interface OpenDeskWebhookRequest<TBody = unknown> {
    /** Framework-generated id for this accepted delivery; distinct from deliveryId. */
    readonly requestId: string;
    /** Source label from X-OpenDesk-Source, or "external" when omitted. */
    readonly source: string;
    /** Optional source-owned delivery id from X-OpenDesk-Delivery-Id. */
    readonly deliveryId: string | null;
    /** UTC RFC3339 timestamp captured when the delivery was accepted. */
    readonly receivedAt: string;
    /** Parsed JSON request body. */
    readonly body: TBody;
    /** Aborts when the waiting caller is gone/timed out or the execution is canceled. */
    readonly signal: AbortSignal;
  }

  interface OpenDeskWebhookResponse<TBody = unknown> {
    /** HTTP status returned after the handler has actually settled. Must be 200..599. */
    status: number;
    /** JSON-compatible response body. */
    body: TBody;
  }

  interface OpenDeskWebhookListenOptions {
    /** Maximum accepted JSON request body bytes. Default 1 MiB; maximum 16 MiB. */
    maxRequestBytes?: number;
    /** Maximum JSON-encoded handler response body bytes. Default 1 MiB; maximum 16 MiB. */
    maxResponseBytes?: number;
    /** Maximum requests waiting behind the single active handler. Default 32; maximum 256. */
    maxQueuedRequests?: number;
    /** Maximum total canonical JSON bytes held by queued requests. Default 8 MiB; maximum 64 MiB. */
    maxQueuedBytes?: number;
    /** Caller wait bound in milliseconds. Default 30000; range 100..600000. */
    handlerTimeoutMs?: number;
    /** Completed delivery-id dedupe protection window. Default 300000; range 1000..3600000. */
    dedupeWindowMs?: number;
    /** Maximum protected dedupe records. Default 256; maximum 4096. */
    maxDedupeEntries?: number;
  }

  interface OpenDeskWebhookHandle {
    /** Business label scoped to the current execution. */
    readonly name: string;
    /** Actual loopback URL allocated for this listener instance. */
    readonly url: string;
    /** Returns a fresh header map containing this listener's request credential. */
    requestHeaders(): Readonly<Record<string, string>>;
    /** Idempotently revokes new calls and rejects queued-not-started work. */
    close(): void;
  }

  var Webhook: {
    listen<TBody = unknown, TResponse = unknown>(
      name: string,
      handler: (request: OpenDeskWebhookRequest<TBody>) => OpenDeskWebhookResponse<TResponse> | Promise<OpenDeskWebhookResponse<TResponse>>,
      options?: OpenDeskWebhookListenOptions
    ): OpenDeskWebhookHandle;
  };
}
