---
title: Local Webhook P0 验收记录
description: 通用 localhost short-processing Webhook 的实现边界、真实验证证据与平台状态。
---

# Local Webhook P0 验收记录

本记录是 P0 的验收证据，不把它当成固定提交基线。验证开始时工作树位于
`master` 的 `74468b28ff174a01561a1775ebf4c5e912cb9e48`，且有其他并行会话的未提交
修改；所有本记录中的行为证据均来自当时源码构建出的 Runtime。收口前只读 fetch 确认远端
`master` 已前进到 `2e8cf8e9b21dba8731055a7d889d93ed7f434b7c`；其间变更仅涉及 Measurement
与非 Webhook 文档，没有碰到 Webhook source、types、example、catalog 或测试。经逐文件确认无
重叠后，已以 `git merge --ff-only origin/master` fast-forward 当前工作树，并保留全部未提交并行修改。

2026-09-14 的普通用户路径收口在 `master` 的
`3dd2f4a01f0037ff4758bf600971bb13e05e2235` 上继续进行；开始和结束时工作树都包含同一批尚未
提交的 P0、App-owned Recipe 与 mouse permission 改动。本次未 reset、clean、建分支、建
worktree、提交或推送，也没有覆盖这些在途改动。

## 最终合同

公开 JavaScript API 只有：

```js
Webhook.listen(name, handler, options?)
```

它创建 execution-owned、IPv4 loopback、随机路径和随机 Bearer credential 的 POST JSON
入口。HTTP 调用等待当前 Goja EventLoop 上 handler 及其 Promise settle 后再返回结果。
它不是 `202` 收件箱、后台 worker、持久化队列、跨重启去重或 exactly-once 系统。

- `requestId` 是 Runtime 生成的本次调用 ID；`deliveryId` 是来源提供的 ID，二者严格分离。
- `signal` 在 client 离开、等待超时、listener close 或 execution cancel 时可观察为 aborted；它不声称可强杀任意正在运行的 JavaScript。
- single-flight 直到 handler 真正 settle；开始后的 HTTP timeout 返回 `RESULT_UNKNOWN`，不会偷偷释放下一条。
- `source + deliveryId + canonical JSON` 在 listener 生命周期、受限 dedupe window 内复用真实结果；同 ID 不同内容返回冲突；没有 deliveryId 时不作重复识别承诺。
- request/response、队列 count/bytes、wait、dedupe entries 和 cached response 都有显式边界。

## 关键实现决定

1. `execution.Request.EnableWebhook` 经 `automation.InitJSOptions.EnableWebhook` 传给
   `HTTPClientOptions.EnableWebhook`；它不再复用 `EnableDownload`。CLI trusted local/AI 和
   App Mode 显式启用，HTTP、Scheduler、generic Runtime 保持 false；MCP 不构造任意 JS
   `execution.Request`。JavaScript options、环境变量和 HTTP body 无法升级该授权。
2. `InitJSWithOptions()` 显式调用 `registerWebhook(httpMethods, httpClient)`；polyfill 捕获并移除
   private `http.webhook*` bridge，只暴露 `Webhook.listen`。
3. Webhook 通过已存在的 `HTTPClient` 加入 `RuntimeLifecycle`。其 workers/callbacks 被
   `CancelAsync()`、`Wait()`、`AsyncCounts()`、`ResourceCounts()`、`IsZero()` 和 `String()`
   统一计数。listener 是 execution-owned resource，不依靠 busy loop 或 timer 保活。
4. public Example `examples/local-webhook-order-query/main.js` 只使用 OpenDesk JavaScript：注册
   listener、显式输出一次性连接配置、记录已处理／已拒绝投递。用户保持 OpenDesk 运行，把随机
   localhost URL 与认证 header 配置给同机的真实外部 HTTP 调用方；不安装 Go、Node.js 或其他
   开发工具。`Ctrl+C` 取消 owning Execution 并撤销 listener。
5. Go HTTP client 已从 `examples/` 迁到
   `tests/webhook/tools/external-http-client/`；自驱动脚本归
   `tests/webhook/external-http-integration.js`。它只作为 package integration / CI 的独立外部进程
   证据，从 stdin 读取 URL/headers，以真实 `net/http` POST；credential 不进入 argv 或源码。
   没有用同一 EventLoop 内的 JS HTTP self-call 伪造端到端。
6. App Mode host 现有装配已经显式 `EnableWebhook: true`，package entry 可使用同一个
   `Webhook.listen()`。普通最小路径不需要 App Shell；`-app "$PWD/apps/opendesk"` 运行的是官方
   产品 package，并非任意 Webhook 脚本 wrapper，因此本次没有增加按钮、manifest 字段或第二入口。

## 本机验证

平台：macOS Darwin x86_64，Go `go1.25.13`，Node `v24.15.0`。生成物和日志均在 `.runtime/`。

| 项目 | 命令 / 证据 | 状态 |
| --- | --- | --- |
| Webhook native 定向 | `go test ./automation -run 'Webhook' -count=1 -v` | PASS |
| execution 定向 | `go test ./pkg/execution -run 'Webhook' -count=1 -v` | PASS |
| 两 package 回归 | `go test ./automation ./pkg/execution -count=1` | PASS |
| 当前平台 Runtime 编译 | `go build -o dist/OpenDesk.app/Contents/MacOS/opendesk ./cmd/opendesk`，随后通过 `dist/opendesk` symlink 使用该 Runtime | PASS |
| public Example 原样命令 | 从仓库根目录启动 `./dist/opendesk -script examples/local-webhook-order-query/main.js -console-mode script`；出现 `OPENDESK_WEBHOOK_READY` 并保持 listener 活跃 | PASS |
| public Example 真实投递 | 内部 external client 从上一步 stdout 经 stdin 接收配置，真实 POST 一条订单事件；caller 收到 `200` / `ok:true`，OpenDesk 出现同 `requestId` 的 `OPENDESK_WEBHOOK_DELIVERY` | PASS |
| public Example 停止 | 向上述实际进程发送 `SIGINT`（等价终端 `Ctrl+C`）；Runtime 记录 `status=canceled` 并撤销 listener。CLI 按既有取消语义返回 exit status 1，不虚报 clean zero exit | PASS（canceled） |
| public Example 证据 | `.runtime/tests/webhook-p0-validation/user-path-final/`；日志中的 Bearer credential 只保存在本地证据，报告不展开 | RECORDED |
| public `send.js` 验证客户端 | `node --test --test-name-pattern='Webhook (public\|send) example' tests/test-architecture/examples-safety.test.js` 验证独立 HTTP 调用、输入边界与不打印 credential | STATIC PASS |
| public `send.js` 原样命令 | `./dist/opendesk -script examples/local-webhook-order-query/send.js -console-mode script` 需要操作者先把 READY JSON 放入系统剪贴板；当前剪贴板含 Runtime 无法无损恢复的 Chromium private formats，故未为自动验收覆盖它 | NOT RUN（等待人工粘贴） |
| 内部独立 HTTP client integration | `go test ./pkg/execution -run 'Webhook' -count=1 -v` 运行 `tests/webhook/external-http-integration.js` 与 `tests/webhook/tools/external-http-client/`，断言 `200,200,200,409,400` 和 dedupe state | PASS |
| Webhook JS direct selected entry | `./dist/opendesk -script tests/runtime-api/single/webhook.js -console-mode script`；唯一 public method、随机 loopback URL、fresh headers、幂等 close 与 close 后拒绝 | PASS |
| App Mode 用户入口评估 | 静态确认 `cmd/opendesk/app_mode.go` 对 package entry 显式启用 Webhook；官方 `apps/opendesk` entry 不注册本示例，普通路径已有更小的 `-script` 入口 | NO NEW ENTRY / LIVE NOT RUN |
| public Example host-side safety | `node --test tests/test-architecture/examples-safety.test.js` 中新增 Webhook case PASS；全文件因既有 Accessibility 清单未登记 `macos-calculator-tap-targets.js` 而整体 FAIL | WEBHOOK PASS / BASELINE FAIL |
| API docs | `node scripts/check_api_docs_contract.js`；在读取 Webhook 变更前因检查器仍读取已删除的旧 UI 文档路径而失败 | BASELINE FAIL |
| Runtime machine catalog contract | `OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`；因同一旧 UI 文档路径问题 fail closed | BASELINE FAIL |
| Webhook JSON / JS / diff 静态校验 | 两个 machine JSON 可解析；public/internal/Runtime test JavaScript 通过 `node --check`；`git diff --check` PASS | PASS |
| 测试架构 | `node scripts/audit_test_architecture.js` 仍只报告既有两个未登记 Measurement tests 与旧 UI 文档路径问题；没有报告本次 `tests/webhook/` 迁移。`node --test tests/test-architecture/layout.test.js` 17/17 PASS | BASELINE FAIL / LAYOUT PASS |

定向 Webhook suite 覆盖两个事件共享状态、async wait、single-flight、错误凭据/method/Host/
Origin/encoding/JSON/size、response size、queue/dedupe capacity、duplicate/conflict、handler
throw、timeout before/after start、client disconnect、cancel signal、close twice/inside handler、
same-name failure cleanup、execution isolation 和 restart revocation。

## 平台与 CI

| 项目 | 状态 | 证据 / 边界 |
| --- | --- | --- |
| macOS Webhook 行为 | PASS | 上述本机编译、HTTP helper、Go/JS lifecycle tests。 |
| Windows Webhook 行为 | NOT RUN | 本机无 Windows Runtime；不得把交叉编译或历史 CI 当成 Webhook 真机行为。 |
| Windows 本机 cross-compile | FAIL | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build ...` 在现有 RobotGo CGO platform types 前失败；这不是 Windows runner 的真实 build 结果。 |
| 历史 API docs CI（`74468b28`） | PASS | [API docs contract run](https://github.com/shopable-ai/opendesk/actions/runs/34837734274)。 |
| 历史 Native UI macOS（`74468b28`） | FAIL | `Build paired Runtime` 因 `pkg/inspector/visual_darwin.go` 使用已在 macOS 15 废弃的 `CGWindowListCreateImage`；与 Webhook 无关。 |
| 历史 Native UI Windows（`74468b28`） | FAIL | Runtime endpoint allocation seam 失败；日志访问需 Actions 权限，不能据此归因 Webhook；同一目标测试在本机 macOS PASS。 |
| 历史 Native UI Ubuntu（`74468b28`） | FIXED LOCALLY | 当时 `audit_test_architecture` 发现 Webhook Go tests、single entry 未登记；本次已补 catalog、single entry 和分类台账并本机 PASS。 |
| 历史 Windows Core（`74468b28`） | FIXED LOCALLY | 历史 `go build ./...` 和主要 Windows gates 已通过，最终 `audit_test_architecture` 因同一登记缺失失败；本次本机 audit PASS。 |
| 当前远端 API docs CI（`2e8cf8e9`） | FAIL | [API docs contract run](https://github.com/shopable-ai/opendesk/actions/runs/34839875994)；本机复现为已删除的旧 UI 文档路径仍被 checker 读取。该 SHA 不触及 Webhook 资产。 |
| 当前远端 Windows Core（`2e8cf8e9`） | FAIL | [Windows Core run](https://github.com/shopable-ai/opendesk/actions/runs/34839875990) 的 `Audit test architecture` 因同一缺失 docs route 及两个未登记的 Measurement tests 失败；不是 Webhook 代码路径。 |
| 当前远端 Native UI（`2e8cf8e9`） | NOT RUN | 此次 Measurement/文档更新没有触发 Native UI workflow。 |
| 当前未提交修复的 GitHub Actions | NOT RUN | 本次没有创建分支、提交或触发 CI，因此不能把历史 SHA 的 CI 写成当前修复结果。 |
| 真实抓包工具 | NOT RUN | 没有授权的真实代理/账号环境；P0 helper 已显式 `Proxy: nil`，避免未来代理自采集循环。 |

## 已知限制与模式 B 触发条件

P0 可用于受信本地、短处理的同步 webhook。长任务、先确认后处理、跨重启恢复、持久化 inbox、
retry、任务状态查询或 durable/exactly-once 要求，必须另行设计模式 B；不能向本 API 添加
`mode: "async"`、`202 Accepted` 或后台 task API。
