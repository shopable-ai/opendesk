# Browser Automation Core Demo

独立的本地 Browser Automation Demo：Client → Broker → 已安装 Native Host → MV3 Worker → Content Script → 真实 Tab/Frame/Document/DOM。支持 observe、六类 locate、read、fill、click、wait、verify，以及 status、tabs、frames。源码和测试不依赖 OpenDesk、MCP、Recipe、Recorder 或第三方 npm 包。

正式验收规格：`docs/quality/browser-automation/core-demo-acceptance.json`。功能 verify 的 PASS 只表示组件和 A–D 功能检查；完整 Core PASS 还要求匹配候选的视觉、资源、公开命令、安装、cleanup 和反向审计。

## 工作目录和环境

下列每条命令均从仓库根目录 `/Users/mac/Documents/workspace/clawdesk` 执行。需要 macOS、Google Chrome 和 Node.js 22+；本轮验收报告记录实际版本。

源码在 `lab/browser-automation-core/`，稳定测试和 fixture 在 `tests/browser-automation-core/`。所有运行日志、截图、Trace、候选和测试结果在 `.runtime/tests/browser-automation-core/`。`.runtime/browser-core/` 保存安装指针和进程状态；永久 Native Host、私有 credential 和 socket 安装在 setup 输出的用户 Library 目录。

## 安装与普通运行

```sh
node lab/browser-automation-core/cli.mjs setup
```

setup 生成并安装自包含 Native Host 快照，注册唯一 Extension origin。Native Host 每次启动先检查安装资源 SHA256，随后导入安装快照。安装目录 0700、credential 文件和 socket 0600。credential 不写入工作区指针、staging、命令行、Extension、普通日志或 Trace。停止 Broker 后可重复 setup；保留 credential，更新快照，拒绝归属或注册冲突。

首次在 Chrome 的扩展管理中开启 Developer mode，加载以下真实目录：
`/Users/mac/Documents/workspace/clawdesk/lab/browser-automation-core/extension`。
名称为 Browser Automation Core Demo，版本 `0.3.1`，固定 ID `jpjgepfbapojijlabljgdpbhfmiapkin`。源码更新后只刷新本 Demo 扩展。扩展安装/删除使用 Chrome 自身的用户管理界面；不会通过其他控制面绕过浏览器安全限制。

```sh
node lab/browser-automation-core/cli.mjs start --background
```

或在独立终端保持前台 Broker：

```sh
node lab/browser-automation-core/cli.mjs start
```

```sh
node lab/browser-automation-core/cli.mjs doctor
```

```sh
node lab/browser-automation-core/cli.mjs tabs
```

doctor 检查 Native Host 资源、真实连接、Extension ID/版本和运行中 Worker 的代码指纹。每次 DOM 操作还在输入前核对接收器的实际可执行代码指纹；旧接收器返回 RUNTIME_RESOURCE_MISMATCH，需刷新该 fixture 页面。未连接或指纹不匹配退出码为 1。单独检查安装文件：

```sh
node lab/browser-automation-core/cli.mjs installation
```

安装文件 PASS 不代表 Chrome 已加载。工具栏的本 Demo popup 显示 READY/连接错误和实际身份。Host 诊断在 `.runtime/browser-core/native-host-status.json`，不包含消息或 credential。

## Fixture 和订单

在另一终端启动 fixture，保留终端或使用 Ctrl+C 停止：

```sh
node lab/browser-automation-core/cli.mjs fixture
```

普通模式下在 Chrome 打开 fixture 输出的 URL，然后执行以下命令。普通 golden 仅使用与本次 fixture URL 完全匹配且唯一的 Tab，获得完整身份后执行；没有或存在多个匹配 Tab 时明确拒绝。测试模式的 golden 通过 Demo 自身打开一个新 fixture Tab。

```sh
node lab/browser-automation-core/cli.mjs golden DEMO_ORDER_1 DEMO_ORDER_2 DEMO_ORDER_3
```

```sh
node lab/browser-automation-core/cli.mjs verify-golden
```

订单须在本次 fixture instance 中尚未确认。执行器只从真实 DOM 读取运行时随机 Amount，放入本地变量，再 fill Confirmation Amount。服务端和 verifier 不向执行器提供答案。verify-golden 在执行结束后读取独立服务端记录，检查 read/fill 原始响应、来源 requestId、页面身份、实际输入、Completed 和单次提交。executor 和 verifier 结果写入 `golden-*/`；三笔订单及提交次数显示在真实页面。

## 测试模式与验收

故障能力只在明确开启 test mode 时可用。先停止 Broker，再安装测试配置：

```sh
node lab/browser-automation-core/cli.mjs stop
```

```sh
node lab/browser-automation-core/cli.mjs setup --test-mode
```

```sh
node lab/browser-automation-core/cli.mjs verify --visual-checkpoint
```

verify 核对并停止本 Demo 的 Broker，冻结源码、测试、fixture、verifier、配置和验收规格 hash，依次运行 Unit、Integration、真实 A 与真实 B/C/D。它管理自己的 Broker/fixture/Tab；不关闭无归属的用户 Tab。Native Host 真实 Chrome 父进程、Worker 可执行代码指纹、加载文件 hash 和每个参与 document 的 Content/Locator 指纹均要匹配。源码或测试改变后旧候选的结果失效，需重新完整验收。

视觉 checkpoint 在 C 的三订单完成后等待最多 60 秒。验收负责人实际观察允许的 fixture 页面并保存真实截图、页面身份、runId、候选和观察记录；只有截图、观察和审阅均存在且按期完成才通过。无人观察会超时，不自动写 PASS。公开 verify 返回的是功能结果；完整审计使用：

```sh
node lab/browser-automation-core/cli.mjs audit
```

audit 读取 `.runtime/tests/browser-automation-core/final-index.json`，由规格的必需用例集合驱动。缺少、重复、旧候选、原始证据缺失、断裂 read→fill、未执行/未知结果冒充 PASS 或单独视觉 marker 均拒绝。

分层诊断入口：

```sh
node lab/browser-automation-core/cli.mjs verify-components
```

```sh
node lab/browser-automation-core/cli.mjs verify-a
```

```sh
node lab/browser-automation-core/cli.mjs verify-dom
```

后两项需要停止 Broker。verify-dom 还需当前候选真实 A PASS。Integration 使用真实 Broker/Host 和明确标注的模拟 Chrome adapter；它不能计为 Live。资源组件测试的发送缓冲、Trace 和模拟 Worker inventory 也分别标注，真实 DOM/Frame/target 边界由 Live 检查。

## 参数、目标和返回

Client JavaScript 接口是 `Client.connect()`、`request(operation, params, options)`、`cancel(requestId)` 和 `close()`。每次请求使用 executionId/requestId；响应携带 Broker/browser session 和 connection epoch。options 可指定 requestId 和 timeoutMs。所有返回均有明确终态；动作没有自动 retry 或断连重放。

DOM scope 必须显式指定整数 tab/frame；document 可在首次 observe 后取得。read/fill/click/wait/verify 使用 locate 返回的完整 target：`brokerSession/browserSession/connectionEpoch/tab/frame/document/elementIdentity/semanticRevision`。不得修改、拼接或跨 document 使用。旧 target 失效后重新 observe/locate；动作执行边界直接校验原 WeakRef，绝不重新解析 selector。

locate query 的支持范围：

| kind | 参数与语义 |
|---|---|
| role | `role` + 精确 `name`；有限的原生 role/aria-label/aria-labelledby/label/name 支持 |
| label | `value`；关联的原生 label，input/textarea/select |
| text | `value`；规范化空白后的精确叶端可见文本 |
| testId | `value`；精确 `data-testid` |
| attribute | `attribute/value`；只允许 id/name/data-testid/data-action/data-order-role |
| relation | `axis: descendant`，唯一 `within`，有限 `target`；不允许递归关系引擎 |

零匹配为 TARGET_NOT_FOUND，多匹配为 AMBIGUOUS_TARGET；完整扫描超过容量则 DOM_SCAN_LIMIT，不能把部分候选当唯一。read 的 field 是 text/value，返回当前 DOM 实值；敏感字段返回 `value: null, redacted: true`。fill 接收字符串 value，可携带 sourceReadRequestId；有来源时必须与同一 execution/document 的真实 read 相符。click 仅支持可操作的 button。wait/verify condition 支持 `{kind: equals, field: text|value, expected}` 和 `{kind: nonEmpty, field: text|value}`。verify 的 expected/actual 来自独立动作后观察。

常见错误：RUNTIME_RESOURCE_MISMATCH、STALE_TARGET、INSUFFICIENT_TARGET_IDENTITY、READ_SOURCE_MISMATCH、NOT_INTERACTABLE、WAIT_TIMEOUT/TIMEOUT、VERIFICATION_FAILED、QUEUE_FULL、MESSAGE_TOO_LARGE、BACKPRESSURE、UNAUTHORIZED、EXTENSION_NOT_ALLOWED、TEST_MODE_REQUIRED、UNSUPPORTED_OPERATION。error 只返回安全代码，敏感 input 的 observation/action/verification/Trace 脱敏。

| outcome | 含义 |
|---|---|
| NOT_DISPATCHED | 确定未发送到浏览器执行边界 |
| SUCCEEDED | 浏览器确认动作；业务结果仍需独立 verify |
| FAILED_CONFIRMED | 已发送但确认失败，能排除未知副作用 |
| CANCELLED_BEFORE_DISPATCH | 受控边界之前取消，确定零输入 |
| OUTCOME_UNKNOWN | 可能已执行；立即停止自动重试，保留证据并独立观察 |

## 有限资源与 transport

唯一实现源是 `config.mjs` 的 LIMITS。doctor 和候选记录实际值；容量 N−1/N/N+1、截断/淘汰、期限及超限后恢复分别验收。当前值：

| 资源 | 上限/期限 |
|---|---|
| 消息 | 65,536 UTF-8 bytes |
| Broker/Worker in-flight | 32；无额外无限等待队列 |
| Client in-flight | 33（含一次 Broker 超限探测） |
| 发送缓冲 | 16 × 最大消息字节数，每条连接 |
| 连接 | 48 |
| target / read 来源缓存 | 512；target 拒绝，来源缓存有界淘汰 |
| Tab / 每 Tab Frame | 64 / 24；inventory 超限拒绝 |
| DOM 扫描 / 观察元素 | 2,048 / 24；扫描拒绝，观察明确 truncated |
| 观察文本 / Tab URL | 128 / 512 chars；截断 |
| fill / query | 4,096 / 200 chars |
| Native 阶段诊断 | 16 条 |
| event ring / requestId 记忆 | 128 / 每 Broker session 4,096；过期 cursor 拒绝，满 session 需建立新会话 |
| Trace | 每 Broker run 16 MiB；dispatch 前保留完成空间 |
| operation timeout | 默认 5,000；允许 10–15,000 ms |
| Client 响应额外期限 | 1,000 ms |
| 认证 / hello | 2,000 / 5,000 ms |
| 重连 / cancel | 45,000 / 1,000 ms |
| 测量容差 / 视觉审阅 | 250 / 60,000 ms，运行前固定 |

采用单一 Chrome Native Messaging transport。Client/Host 使用不同 credential 连接私有 Unix IPC；Host origin 与 Worker identity 均固定验证。Worker 通过固定 Content Script 操作本地 HTTP fixture。NativeMessagingBridge 是 transport 边界，长期状态归 Broker。Worker 断连后最多五次立即重连，30 秒 alarm 兜底；不会重发旧 pending。

`fault.delay` 延迟真实 Extension ACK；`fault.duplicateAck` 重复真实响应；ACK-drop 在真实 Confirm、服务端记录和 DOM Completed 后精确丢弃该响应。执行/dispatch barrier 是有界、固定的测试同步点。普通模式禁止所有 fault/test operations 和测试动作 flags；这些能力不能绕过身份认证、提供任意代码或代替真实 DOM 动作。

## 清理与恢复

```sh
node lab/browser-automation-core/cli.mjs cleanup
```

cleanup 校验 PID/session、实际命令、fixture 工作目录/监听端口和安装资源归属，停止本 Demo Broker/公开 fixture，移除本 Demo Native registration/已核验安装快照/credential/状态指针。保留源码、全部验收证据及其他 Tab/扩展/进程。已加载的 unpacked Extension 由用户在 Chrome 管理中移除；cleanup 不控制受保护的扩展管理页面。可随后原样 setup、start、doctor 重新安装和诊断。

异常退出的残留 socket 使用：

```sh
node lab/browser-automation-core/cli.mjs recover
```

recover 仅在登记 PID 不存在、socket 无监听者且归属一致时保存证据并移除残留；未知 PID 或资源拒绝处理。

支持边界：当前安装仅 macOS + Chrome，页面权限仅 `http://127.0.0.1/*`。不支持 arbitrary eval、任意 CSS、完整 ARIA 实现、跨 origin、shadow DOM、上传下载、复杂 profile/cookie 管理或 Windows/Linux 安装；不声称模拟组件结果是真实系统验收。完整 Core PASS 后只向既有 Demo 2 交接，不在这里实施集成。
