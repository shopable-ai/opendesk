# OpenDesk Product Analytics — Current Implementation

> 日期：2026-09-18  
> 状态：**CURRENT IMPLEMENTATION**  
> Provider：PostHog Cloud + `github.com/posthog/posthog-go`  
> 范围：官方 OpenDesk 桌面产品 V1 六类事件。  
> Cloud 状态：**BLOCKED** — `configs/product.json` 当前没有真实 PostHog Project Capture Token。

## 1. 当前生产架构

```text
官方 OpenDesk 产品语义
        ↓
App-owned Product Analytics Core
        ↓
Default-on Enablement / Source / Schema / Privacy / Size 校验
        ↓
PostHog Provider
        ↓
posthog-go 官方 SDK
        ↓
Provider final wire privacy scrub
        ↓
PostHog Cloud
```

OpenDesk 不建设 Analytics Server、Analytics Database、独立 Analytics Daemon、第二 Runtime 或第二 App listener。PostHog 负责事件接收、存储、Trends、Funnels、Retention 和 Dashboard；OpenDesk 负责产品事件语义、随机安装标识、前台 Session、隐私白名单、Provider 生命周期、第三方隔离和 Execution 生命周期。V1 基础产品统计默认开启，不建设普通用户统计开关。

正式 Native owner 位于 `pkg/productanalytics/`。官方 JS 只通过 App Mode 已有的 `127.0.0.1:随机端口` local-services listener 调用窄接口；PostHog SDK 和 Project Capture Token 不进入产品 JS。

## 2. V1 固定事件与真实 owner

| 事件 | 当前 owner | 真实触发语义 |
| --- | --- | --- |
| `app_started` | Native `productanalytics.Service.Start()`，由 primary OpenDesk App local-services 初始化调用 | 默认开启且 Provider 已配置时，每个 primary App process 最多一次 |
| `app_session_started` | Analytics Core `ensureSessionLocked()` | 第一次真实前台统计活动，或超过 idle timeout 后的新前台活动 |
| `screen_viewed` | Flow Runner Product Analytics FloatingWindow wrapper | Native `show()` 成功后；create/menu click 不直接算 view |
| `ui_action` | Flow Runner logical action seam + Player product boundary | Run/Stop/Previous/Next/List；固定 `pointer/keyboard/menu` 枚举 |
| `flow_run_started` | `pkg/execution` 可信 Emitter lifecycle 经 `productanalytics.RunObserved()` | Request normalization 完成且 Execution 真正进入 running 后 |
| `flow_run_finished` | 同一 Execution lifecycle | 仅真实 `success/failure/cancelled` 终态；Stop click 不等于 cancelled |

`unknown` 不是 `flow_run_finished.outcome`。没有可信终态时不发送 finished，也不推断 success。

## 3. Core 与 Provider

`pkg/productanalytics/` 当前负责：

- 随机 `install_id`：基础统计默认开启，首次发现有效 Provider 配置时自动生成并以 `0600` 本地 Analytics 状态持久化；不用 machine ID、MAC、硬盘/CPU/设备序列号、License ID 或账号 ID。Provider 未配置时不生成 ID。
- 随机 `process_id`、`session_id`、`event_id`。
- foreground session idle timeout；后台运行不创建或延长前台 Session。
- 六类事件的封闭 schema、字段/枚举白名单和单事件大小上限。
- PostHog SDK 的有限 Queue、Batch、Retry、Request Timeout、Shutdown Timeout 和 Max Enqueued Requests。
- Debug Provider 的完整 Event Ring 仅用于自动测试/开发测试，不作为普通产品 UI 或第二套生产 Analytics。
- Provider / 内部 kill-switch 关闭 Analytics 时先关闭 Network Gate，取消可取消的 in-flight 请求，再有界关闭 SDK；未发送队列不能继续发起网络请求。该能力不是普通用户菜单。

PostHog Provider 使用 `posthog.CaptureModeAnalyticsV1`，只调用 Capture；不使用 Identify、Alias、Feature Flags、Error Tracking、Personal API Key 或 Project Secret。Provider 设置 `$process_person_profile=false`，不建立 PostHog person profile，并保持 `$geoip_disable=true`。

PostHog SDK 会在序列化阶段自动加入 `$os`、`$os_version`、`$os_distro`、`$go_version` 等 system context。OpenDesk V1 不允许这些字段越过产品隐私合同，因此同一个 PostHog Provider 内部的最终 Transport 会在真正网络请求前删除 SDK 自动加入的非白名单 `$...` 字段，只保留 `$geoip_disable` 处理控制位。该 Transport 不重新实现第二套 Analytics HTTP client。

## 4. Official Product Config

唯一 plaintext source：

```text
configs/product.json
        ↓
apps/opendesk/assets/product.odcfg
        ↓
internal/officialassets generated data
```

Analytics 配置由 `pkg/officialconfig` 严格验证，包括：

```text
provider
endpoint
projectToken
maxEventBytes
queue bounds
request / flush / retry / shutdown bounds
session idle timeout
```

`projectToken` 只接受空值或 `phc_` PostHog Project Capture Token。Personal API Key、Project Secret / Management Key 不符合配置合同。

当前 repository 的 `projectToken` 为空，因此生产代码完整但不会向 PostHog Cloud 发送事件。不得为验收伪造生产 token。

## 5. App local-services bridge

Analytics 与 Scheduler/Inspector/Product Activity 复用同一个 App local-services listener：

```text
127.0.0.1:<random>
```

Analytics 使用独立随机 256-bit token 和独立 header：

```text
X-OpenDesk-Analytics-Token
```

当前窄接口：

```text
GET  /api/product/analytics/status
POST /api/product/analytics/screen
POST /api/product/analytics/action
POST /api/product/analytics/run/start
POST /api/product/analytics/run/finish
```

所有 route 都再次检查 remote address 是 loopback、token 完全匹配、JSON 有大小上限且拒绝未知字段。Native 已经知道的 Recipe lifecycle 不绕 HTTP；installed Flow 子进程只使用受控 bridge 报告真实 Execution lifecycle。

生产客户端没有 Analytics enable/disable 设置 route、diagnostics route、diagnostics ring 或 Analytics Dashboard UI。

## 6. Recipe / Flow true-start 与 terminal

### App-owned Recipe

```text
Flow Runner request
→ Native appRecipeRunner preflight / artifacts
→ third-party Recipe environment 已剥离 Analytics 私有变量
→ productanalytics.RunObserved
→ pkg/execution Request normalization
→ Emitter: "script execution started"
→ flow_run_started
→ Runtime 执行
→ Emitter real terminal status
→ flow_run_finished
```

Recipe 与 App 位于同一 Native process，因此可信 owner 直接调用 Analytics Core，不经过 HTTP。Provider 未配置或内部 kill-switch 关闭时 Recipe 直接走原执行路径，不制造 Analytics run identity。

### Installed Flow / `.odflow`

```text
flow run request
→ Catalog / entitlement / lease / package load / artifacts
→ 从父进程环境建立一次私有 LocalBridge
→ third-party Flow Request.Environment 剥离 Analytics 私有变量
→ productanalytics.RunObserved
→ Emitter true-start
→ bridge run/start
→ Runtime 执行
→ real terminal
→ bridge run/finish
```

在 AcquireRun、包加载、工作目录、artifact 或 Request normalization 阶段失败时，不产生 `flow_run_started`。Cancellation 只有在 Execution 真正进入 canceled 后才产生 `outcome=cancelled`。

## 7. Third-party isolation

以下私有值不会进入普通 Recipe / installed Flow 的 `Execution.env`：

```text
OPENDESK_APP_ANALYTICS_TOKEN
OPENDESK_APP_ANALYTICS_ENABLED
OPENDESK_APP_ANALYTICS_CAPTURE_ENABLED
OPENDESK_APP_ANALYTICS_RUN_SOURCE
OPENDESK_ANALYTICS_DEBUG
```

普通 Runtime 也不加载第一方 Product Analytics client/integration/settings 模块。Loopback endpoint 本身不是 Analytics authority；没有独立随机 Analytics token 就不能调用 Analytics route。

## 8. Privacy / Schema 边界

V1 不接受或上传：

```text
JavaScript / Flow 源码
脚本内容
CLI arguments
Secret / Token
环境变量原值
本地完整路径
文件内容
OCR / Screenshot
Clipboard
AI 对话
用户输入文本
Prompt
原始异常文本
完整 Stack Trace
本地 Flow 名称
私有 Flow ID 或其 Hash
```

本地/private Flow 仅上传 `flow_origin=local` 或 `installed` 等受控类别。`run_id` 是随机 Analytics correlation ID，不是业务 Flow ID。错误只使用固定 `error_code` 枚举；不发送 `err.Error()`。

OpenDesk 自有事件在进入 SDK Queue / Debug Ring 前完成 schema、privacy 和大小校验；PostHog SDK 后续自动加入的 host metadata 再由同一 Provider 的 final wire privacy scrub 删除。业务模块没有 `Capture(name, map)` 之类通用任意事件 API。

## 9. 产品层级：默认开启 / 无客户端统计菜单

V1 基础 Product Analytics 采用与普通网页产品统计相同的产品模型：

```text
OpenDesk 启动
→ 基础匿名产品统计默认开启
→ Provider 配置有效时生成随机 install_id
→ 六类受控事件进入 Analytics Core
→ PostHog
```

普通用户不需要进入：

```text
设置
→ 隐私与数据
→ 帮助改进 OpenDesk
```

也不新增：

```text
基础使用统计…
Product Analytics
PostHog
Event
Dashboard
Diagnostics
```

等客户端菜单或管理页面。

当前行为：

- fresh install 默认使用基础匿名统计；
- `install_id` 只在 Provider 真正可用时生成，因此当前仓库 `projectToken=""` 时不会创建 Analytics identity，也不会发网络请求；
- 已存在的历史 `denied` 记录继续尊重，避免升级时悄悄反转旧的明确 opt-out；
- Provider 配置为 disabled / 缺少 capture token / Provider 初始化失败时统计自然不可用，但不能影响 OpenDesk 主业务；
- Product Analytics 的聚合、Trends、Funnels、Retention 和 Dashboard 仅由产品管理员在 PostHog Web 后台查看。

内部 `SetConsent(false)` / Network Gate 仍保留为测试和故障处置安全机制，但不通过普通产品 JS、菜单或设置页暴露。

## 10. 自动测试合同

当前代码包含以下自动测试资产：

- Core default-on、install ID 生成/持久化、legacy denied 兼容、session、schema、invalid enum、event size、Debug Ring、内部 disable。
- PostHog Go SDK **真实 wire payload**：Core → SDK → final privacy Transport → controlled RoundTripper，读取 `/i/v1/analytics/events` 的真实 batch。
- 最终 wire 字段闭包：拒绝 SDK 自动加入的 OS / Go / library metadata，仅保留批准的产品字段与 `$geoip_disable`。
- Network Gate disable / in-flight cancellation。
- blocked network 下的 bounded queue drop。
- bounded SDK shutdown。
- Provider failure fail-open。
- `RunObserved` success / failure / startup reject / real cancel。
- App-owned Recipe success / failure / startup reject / real cancel。
- installed Flow success / failure / startup reject / real cancel，并由真实 OpenDesk JavaScript Runtime 检查私有环境没有泄漏。
- Flow Runner UI action dedupe：工具条、列表 row、Run Selected、keyboard shortcut 合计 10 次逻辑 Run，必须恰好产生 10 个 `ui_action`；Stop pointer/keyboard 和 Previous/Next/List 也做去重断言。
- `tests/runtime-api/product-analytics-isolation.js`：正式 OpenDesk Runtime 入口用于第三方能力隔离验收。

测试断言不以 Analytics 成功为业务成功前提；Analytics callback/provider/network failure 不能改变 Execution result。

## 11. Verification 状态

本文件只区分真实证据，不把“代码存在”写成“已经原生验收”。

| 层级 | 当前状态 |
| --- | --- |
| Production implementation | IMPLEMENTED |
| Automated test coverage | IMPLEMENTED — 测试代码已加入 |
| Module / JS contract | PASS — Product Analytics workflow run #161 在 `afd929ac62a1ab7682f2a82328c9a3dee7b926b9` 通过 read-only module graph 与 Runner UI JavaScript contract。 |
| Go tests execution | PASS — 同一 macOS Production Contract 中 `pkg/productanalytics`、`pkg/officialconfig`、`internal/flowcli`、`cmd/opendesk`、`pkg/execution`、`pkg/appshell` 全部通过。 |
| Runtime JS execution | PASS — 同一 Production Contract 使用正式 `dist/opendesk` 执行 `tests/runtime-api/product-analytics-isolation.js` 通过。 |
| Local build | PASS — 同一 Production Contract 的 `go build -o dist/opendesk ./cmd/opendesk` 通过。 |
| Native product qualification | NOT RUN in this implementation environment |
| PostHog Cloud ingestion | **BLOCKED — repository does not contain a real project capture configuration.** |

Cloud HTTP 2xx 只能证明 capture endpoint 接收请求。只有能够在 PostHog 查询到事件，并核对 Dashboard 过滤/计数，才能把 Cloud ingestion 标为 PASS。

2026-09-18 最终生产 gate 证据：Product Analytics workflow run #161 在 macOS 上完成 Module / JavaScript Contract、Go tests、Runtime build 与正式 third-party isolation，结论为 PASS。该证据不等于完整 Native 产品窗口验收，也不解除真实 PostHog Cloud 配置缺口。

## 12. V1 不做的事情

本轮不增加 GA4 第二 Provider，不建设自有 Analytics backend、客户端 Analytics Dashboard、本地 Analytics diagnostics 或用户统计设置页，不增加第二 listener/daemon/runtime，不做自动异常采集，不上传用户原始内容，不把 Analytics API 暴露为公共 Runtime API，不把 Run click 当 started，不把 Stop click 当 cancelled，也不为了统计失败而阻断 OpenDesk 主业务。
