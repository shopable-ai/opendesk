(function installOpenDeskWebhook(global) {
  if (!global || !global.http) return;

  const native = {
    open: global.http.webhookOpen,
    headers: global.http.webhookHeaders,
    next: global.http.webhookNext,
    respond: global.http.webhookRespond,
    close: global.http.webhookClose,
  };

  if (Object.values(native).some((fn) => typeof fn !== "function")) return;

  // Keep the native transport private. Webhook.listen is the only supported
  // public entrypoint; these helpers are implementation details of this facade.
  for (const key of ["webhookOpen", "webhookHeaders", "webhookNext", "webhookRespond", "webhookClose"]) {
    try {
      delete global.http[key];
    } catch (_) {
      try {
        Object.defineProperty(global.http, key, { enumerable: false });
      } catch (_) {}
    }
  }

  function assertHandler(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("Webhook.listen handler must be a function");
    }
  }

  function normalizeOptions(options) {
    if (options === undefined || options === null) return {};
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("Webhook.listen options must be an object");
    }
    return options;
  }

  function handlerEnvelope(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { kind: "invalid" };
    }
    return {
      kind: "result",
      status: value.status,
      body: Object.prototype.hasOwnProperty.call(value, "body") ? value.body : null,
    };
  }

  function listen(name, handler, options) {
    assertHandler(handler);
    const info = native.open(name, normalizeOptions(options));
    let closed = false;

    const handle = {
      name: info.name,
      url: info.url,
      requestHeaders() {
        return native.headers(info.id);
      },
      close() {
        if (closed) return;
        closed = true;
        native.close(info.id);
      },
    };

    async function pump() {
      try {
        while (!closed) {
          const item = await native.next(info.id);
          if (item === null || item === undefined || closed) return;

          const controller = new AbortController();
          Promise.resolve(item.canceled).then(
            (reason) => controller.abort(reason),
            () => controller.abort("request_canceled")
          );

          let envelope;
          try {
            const value = await handler({
              body: item.body,
              requestId: item.requestId,
              deliveryId: item.deliveryId,
              source: item.source,
              receivedAt: item.receivedAt,
              signal: controller.signal,
            });
            envelope = handlerEnvelope(value);
          } catch (_) {
            envelope = { kind: "handlerError" };
          }

          // Even when the caller timed out, await handler settlement first.
          // Native code keeps single-flight occupied until this response handoff.
          await native.respond(info.id, item.requestId, envelope);
        }
      } catch (_) {
        // Execution cancellation and native teardown may revoke the transport
        // while the pump is pending. Avoid turning that expected lifecycle
        // transition into an unhandled Promise rejection.
        try {
          native.close(info.id);
        } catch (_) {}
      }
    }

    // Deliberately detached only at the facade level: pump catches every
    // terminal path, while the native listener remains an execution-owned
    // HTTP worker that keeps the Runtime alive without a polling loop.
    void pump();
    return handle;
  }

  Object.defineProperty(global, "Webhook", {
    configurable: true,
    enumerable: true,
    writable: false,
    value: Object.freeze({ listen }),
  });
})(globalThis);
