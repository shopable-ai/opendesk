# Local Webhook order query example

这个示例只运行一段 OpenDesk JavaScript。普通用户不需要安装 Go、Node.js、npm package、HTTP
server 或其他开发工具；真正的外部系统负责向 OpenDesk 输出的本机地址发送 HTTP。

## 启动

先确保当前源码对应的 OpenDesk Runtime 已构建，然后从仓库根目录原样运行：

```bash
./dist/opendesk -script examples/local-webhook-order-query/main.js -console-mode script
```

进程会输出一行 `OPENDESK_WEBHOOK_READY=...`。其中包含本次运行随机分配的：

- `url`：只可由同一台机器访问的 `http://127.0.0.1:<port>/...`；
- `headers.Authorization`：只授权这个 listener 的 Bearer credential；
- `headers.Content-Type`：固定为 `application/json`；
- `exampleBody`：可用于首次投递的业务 JSON。

保持终端和 OpenDesk 进程运行，把 `url`、两个必需 header 与 JSON body 配置到真实外部 HTTP
调用方。调用方必须与 OpenDesk 位于同一台机器；云端服务不能直接访问这个 localhost URL。
推荐让调用方同时发送稳定的 `X-OpenDesk-Source`，并为每次业务投递发送唯一的
`X-OpenDesk-Delivery-Id`。

`OPENDESK_WEBHOOK_READY` 包含 secret。不要把整行复制到工单、聊天、截图或普通日志；OpenDesk
重启后应使用新输出的 URL 和 credential 更新调用方配置。

## 用第二个 OpenDesk 进程验证

`send.js` 是本地验证客户端，不是生产接入方式。打开第二个终端，仍从仓库根目录运行：

```bash
./dist/opendesk -script examples/local-webhook-order-query/send.js -console-mode script
```

运行前，先复制第一个终端里 `OPENDESK_WEBHOOK_READY=` 后面的完整 JSON（不要包含前缀）。
`send.js` 从系统剪贴板读取该 JSON，并在第二个独立 OpenDesk execution 中通过真实 localhost
HTTP 发送 `exampleBody`。credential 不会写入 `send.js`、命令行参数、环境变量或
`Execution.input` artifact；sender 也不会打印 Authorization。测试完成后请清空剪贴板或复制一段
非敏感文本覆盖它。生产使用时仍应把同样的 URL 与 headers 配置给真正的同机外部系统。

## 观察结果与成功判断

有效的 `order.query.response` 投递满足以下两个独立条件时才算成功：

1. 外部调用方收到 HTTP `200`，JSON response 中包含 `ok: true`、同一订单的 `orderId` /
   `orderStatus` 和递增的 `processed`；
2. OpenDesk 终端出现 `OPENDESK_WEBHOOK_DELIVERY=...`，其中的 `requestId` 与 HTTP response 一致。

使用 `send.js` 时，第二个终端还必须显示 `OPENDESK_WEBHOOK_SEND_PASS` 并成功退出。

无效业务 JSON 返回 HTTP `400`，终端记录 `OPENDESK_WEBHOOK_REJECTED=...`。相同 source、相同
delivery id 和相同 JSON 的重复投递会复用第一次的真实结果，不会再次运行 handler；相同 id
但不同 JSON 返回 `409 / DELIVERY_ID_CONFLICT`。

## 停止

在运行 OpenDesk 的终端按 `Ctrl+C`。Execution 取消会撤销 listener、URL 和 credential；外部
调用方之后不应再把旧地址视为可用。CLI 会把这次主动中断显示为 `status=canceled`，并可能返回
非零退出码；这是预期的 operator cancellation，不表示先前已经返回 `200` 的投递失败。示例不需要
`while (true)`、轮询或额外的保活工具。

## App Mode

这个最小示例应使用上面的 `-script` 命令。`-app <package>` 只运行已有 App package 的 manifest
entry，并不是给任意 `main.js` 加壳；`-app "$PWD/apps/opendesk"` 启动的是官方 OpenDesk 产品包，
不会代替本示例注册 listener。

已有自定义 App Mode package 的 entry JavaScript 可以直接调用同一个 `Webhook.listen()`，适合
确实需要 App Shell、Tray/Menu Bar 或应用生命周期的场景；不需要为 Webhook 增加第二套 API 或
额外产品入口。API 合同见 [Webhook Reference](../../docs/api/webhook.md)。
