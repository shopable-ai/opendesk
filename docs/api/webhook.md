---
docType: reference
---

# Webhook

`Webhook` lets one trusted local OpenDesk execution accept authenticated loopback HTTP JSON deliveries and process them in the same JavaScript execution.

P0 is a **local short-processing Webhook**. The HTTP response waits for the registered handler and any Promise it returns. It is not a durable inbox, background job system, public gateway, or cross-restart queue.

## API 一览

| API | 用途 |
| --- | --- |
| `Webhook.listen(name, handler, options?)` | 注册当前 Execution 的本地 POST JSON handler |
| `handle.requestHeaders()` | 取得调用当前入口所需的认证请求头 |
| `handle.close()` | 撤销新调用资格并关闭当前 listener |

## Webhook.listen(name, handler, options?)

注册一个只属于当前 Execution 的本地 Webhook。返回时，`handle.url` 已经是实际绑定并可接收请求的 `127.0.0.1` 地址。

**签名**

```ts
Webhook.listen<TBody, TResponse>(
  name: string,
  handler: (request: OpenDeskWebhookRequest<TBody>) =>
    OpenDeskWebhookResponse<TResponse> | Promise<OpenDeskWebhookResponse<TResponse>>,
  options?: OpenDeskWebhookListenOptions
): OpenDeskWebhookHandle
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `string` | 是 | 无 | 当前 Execution 内的业务标签。重名注册失败，不静默覆盖；名称不直接成为系统路由。 |
| `handler` | `function` | 是 | 无 | 在当前 Goja EventLoop 上执行。可以使用 `async/await`。 |
| `options` | `OpenDeskWebhookListenOptions` | 否 | 见下表 | 仅用于 P0 容量、等待和去重边界；不存在 `mode` 选项。 |

`options`：

| 字段 | 类型 | 默认值 | 上限 / 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `maxRequestBytes` | `number` | 1 MiB | 16 MiB | 单个 JSON 正文上限。 |
| `maxResponseBytes` | `number` | 1 MiB | 16 MiB | handler `body` JSON 编码后的上限。 |
| `maxQueuedRequests` | `number` | 32 | 256 | single-flight handler 后方的排队数量。 |
| `maxQueuedBytes` | `number` | 8 MiB | 64 MiB | 排队请求 canonical JSON 总字节数；必须至少等于 `maxRequestBytes`。 |
| `handlerTimeoutMs` | `number` | 30000 | 100..600000 | HTTP 调用方等待结果的边界。超时不等于 JavaScript 已停止。 |
| `dedupeWindowMs` | `number` | 300000 | 1000..3600000 | 已完成 deliveryId 结果保护窗口。 |
| `maxDedupeEntries` | `number` | 256 | 4096 | 受保护 deliveryId 记录上限。满载时拒绝新记录，不静默驱逐仍承诺保护的记录。 |

未知 option 会被拒绝。P0 不接受 `mode`、远程监听地址、端口、路由或系统函数名等选项。

**handler 请求**

```ts
interface OpenDeskWebhookRequest<TBody = unknown> {
  requestId: string;
  source: string;
  deliveryId: string | null;
  receivedAt: string;
  body: TBody;
  signal: AbortSignal;
}
```

- `requestId` 由 OpenDesk 为本次被接受的业务处理生成，与来源 `deliveryId` 分开。
- `source` 来自 `X-OpenDesk-Source`；缺省为 `external`。
- `deliveryId` 来自 `X-OpenDesk-Delivery-Id`；缺失时不承诺重复识别。
- `receivedAt` 是入口接受时间的 UTC RFC3339 时间。
- `body` 是已经通过大小、编码和 JSON 校验的值。
- `signal` 在调用方已离开／等待超时或 Execution 被取消时进入 aborted 状态。它只表达取消信号，不表示外部业务已经回滚，也不保证任意 JavaScript 函数能被单独强杀。
- 认证请求头不会混入 handler 的业务字段。

**返回值**

handler 必须返回或 resolve：

```js
{
  status: 200,
  body: { ok: true }
}
```

`status` 必须是 `200..599` 的整数；`body` 必须可 JSON 编码且不超过 `maxResponseBytes`。HTTP 完成响应只会在 handler 及其 Promise 真正结束后发送。

**行为与错误**

- 一个 listener 默认严格 single-flight：前一 handler 没有真正结束并完成响应交接前，不开始下一条。
- 排队使用入口接受顺序；这不等价于声称来源系统的原始事件顺序。
- 同一 listener 的 `source + deliveryId`、同 canonical JSON：保护窗口内不重复调用 handler，而是等待／复用第一次的真实结果。
- 同一 `source + deliveryId`、不同内容：返回 HTTP `409` / `DELIVERY_ID_CONFLICT`。
- 去重只属于当前 listener 实例；不承诺跨重启恢复、exactly-once 或持久化。
- handler 抛错返回 `500 / HANDLER_FAILED`；框架不会自动重跑业务。
- handler 返回非法状态/body 会转为明确的 `5xx` 合同错误，而不是固定成功文本。
- 调用方等待超时且 handler 已开始时返回 `504 / RESULT_UNKNOWN`。handler 仍占用 single-flight，直到它实际结束；框架不会偷偷切换成异步模式。
- 超时时若请求仍在队列且无人继续等待，则返回 `504 / REQUEST_EXPIRED_NOT_STARTED`，并移除该未开始请求。
- 队列满载返回 `429 / WEBHOOK_QUEUE_FULL`；去重保护容量耗尽返回 `429 / DEDUPE_CAPACITY`。

**调用侧 HTTP 合同**

P0 只接受：

```text
POST <handle.url>
Host: <URL 中的实际 127.0.0.1:port>
Authorization: Bearer <本 listener 凭据>
Content-Type: application/json
X-OpenDesk-Source: <可选来源标签>
X-OpenDesk-Delivery-Id: <可选来源 delivery id>
```

额外边界：

- listener 只绑定 IPv4 loopback `127.0.0.1:0`，端口由 OS 分配；JavaScript 不能升级为远程监听。
- 实际 TCP 来源必须是 loopback，`Host` 必须匹配本 listener 的真实地址。
- 浏览器 `Origin` 请求默认拒绝；不开放 CORS。
- 只支持 `application/json`，`Content-Encoding` 只能省略或 `identity`。
- 错误凭据、错误 method、畸形 JSON、超大正文都在进入业务 handler 前拒绝，因此没有业务副作用。
- 来源认证只证明入口凭据；handler 仍必须校验订单、账号、操作范围等业务对象，不能把本机认证当作完整脚本沙箱。

**示例**

```js
const state = { processed: 0 };

const hook = Webhook.listen("order-query-response", async (request) => {
  const event = request.body;
  if (!event || event.type !== "order.query.response" || typeof event.orderId !== "string") {
    return { status: 400, body: { code: "INVALID_ORDER_EVENT" } };
  }

  await sleep(20);
  state.processed += 1;

  return {
    status: 200,
    body: {
      orderId: event.orderId,
      orderStatus: event.status,
      processed: state.processed,
    },
  };
});

console.log("OPENDESK_WEBHOOK_READY=" + JSON.stringify({
  method: "POST",
  url: hook.url,
  headers: hook.requestHeaders(),
}));
// 保持 OpenDesk 运行，把上述 URL 与 headers 配置给同机的真实外部 HTTP 调用方。
```

完整的纯 OpenDesk JavaScript 示例见
[`examples/local-webhook-order-query/`](../../examples/local-webhook-order-query/README.md)。从仓库
根目录启动：

```bash
./dist/opendesk -script examples/local-webhook-order-query/main.js -console-mode script
```

普通使用不需要 Go、Node.js 或其他开发工具。OpenDesk 负责运行 JavaScript listener；用户把每次
启动生成的新 URL 与认证 header 配置给同一台机器上的真实外部 HTTP 调用方。示例文档分别说明
启动、配置、终端观察、HTTP 成功判断和 `Ctrl+C` 停止方式。

## handle.requestHeaders()

返回一份新的认证 header 对象，供受控集成代码传给外部程序。

**签名**

```ts
handle.requestHeaders(): Readonly<Record<string, string>>
```

**参数**

无。

**返回值**

至少包含：

```js
{
  Authorization: "Bearer <execution-scoped credential>",
  "Content-Type": "application/json"
}
```

**行为与错误**

- 凭据只授权当前 listener 路由，不授权 OpenDesk 系统管理、脚本执行、Scheduler 或其他 Execution。
- 凭据不作为 URL query、命令行参数或默认日志字段暴露。
- listener 已关闭后调用失败。

**示例**

```js
const hook = Webhook.listen("orders", async (request) => ({
  status: 200,
  body: { requestId: request.requestId },
}));

const config = {
  method: "POST",
  url: hook.url,
  headers: hook.requestHeaders(),
};
console.log("OPENDESK_WEBHOOK_READY=" + JSON.stringify(config));
```

上例主动输出 credential 是为了把配置交给外部系统，属于调用方明确选择的 secret handoff；不要
把该输出复制到公共日志、截图、工单或聊天。OpenDesk 默认不会自行把 credential 写入 URL、argv
或普通日志。

## handle.close()

幂等关闭当前 listener。

**签名**

```ts
handle.close(): void
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

- 返回前立即撤销新调用资格；旧 URL 与旧凭据不会获得新的业务调用资格。
- 尚未开始的排队请求以明确的 not-started 错误结束。
- 已经开始的 handler 允许完成；`close()` 不等待它，因此 handler 内调用 `close()` 不会等待自身或死锁。
- 已开始 handler 在真正结束前仍保持 single-flight；处理等待超时不释放下一条。
- Execution 取消会撤销 listener、唤醒等待、关闭本次拥有的 HTTP 资源；它不表示外部业务回滚。

**示例**

```js
hook.close();
hook.close(); // no-op
```

## 生命周期与运行入口

Webhook 注册属于当前 Execution，并通过既有 Runtime 网络 worker 生命周期保持执行活跃，不需要 `while (true)` 或轮询保活。

P0 只允许宿主已经授权的 trusted local script、App Mode package entry 或 local AI execution 使用
本地入口；HTTP、MCP、Scheduler 等远程或调度入口不能通过 JavaScript options、环境变量或请求
正文自行打开该监听能力。

普通 Webhook 使用首选 `-script`：它直接运行示例并在当前终端观察与停止。`-app <package>` 只在
调用方已经需要 App Shell、Tray/Menu Bar 或 app lifecycle 时使用；它运行 package manifest 的
entry，不是任意脚本的别名。尤其 `-app "$PWD/apps/opendesk"` 启动官方产品包，不会代替示例注册
listener，也不需要为此增加第二套 Webhook API 或产品按钮。

当最后一个 listener 关闭后，入口 worker 可以自然释放；Execution deadline / Ctrl+C / 执行取消仍是最终边界。无法安全停止单个任意 JavaScript handler 时，OpenDesk 不承诺 per-callback 强杀。

## 模式 B 边界

以下需求出现时，应单独设计可靠异步收件模式，而不是扩展本 P0：

- handler 可能长时间运行，希望先快速确认收件；
- 需要进程重启后恢复；
- 需要持久化、稳定任务归属、去重恢复和结果查询；
- 需要把入站事件与处理任务拆成可靠队列。

HTTP `202` 本身不等于持久化，也不代表业务完成。本页不定义任何模式 B 公共 API。
