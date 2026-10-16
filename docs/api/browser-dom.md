---
docType: reference
title: Browser DOM
description: 对已安装 Browser Core 的真实 Tab、Frame、Document 和 DOM 进行有界观察、语义定位、读写与验证。
---

# BrowserDOM

`BrowserDOM` 是 execution-owned 原生能力。普通 OpenDesk JavaScript 与现有 OpenDesk MCP
使用同一已安装 Browser Core。当前支持 macOS、Google Chrome 和受控 `http://127.0.0.1`
网站；不支持任意网页 JavaScript、CSS selector、完整 ARIA、shadow DOM 或跨 origin。

## API 一览

| 方法 | 用途 |
|---|---|
| BrowserDOM.observe | 观察当前有限 DOM |
| BrowserDOM.locate | 唯一语义定位 |
| BrowserDOM.read | 读取本次 DOM 实值 |
| BrowserDOM.act | fill 或 click |
| BrowserDOM.wait | 有界等待 DOM 条件 |
| BrowserDOM.verify | 独立 DOM 后置验证 |
| BrowserDOM.status | 连接、session、资源诊断 |
| BrowserDOM.tabs | 已授权网站的真实 Tab 列表 |
| BrowserDOM.close | 关闭本 execution 的 Client |

## 公共约定

本地脚本入口须显式使用 `-allow-browser`，并由宿主通过 `-browser-core-root`、
`-browser-origin`、`-browser-tab` 固定已验证 Core 的绝对工作区、精确网站 origin 和真实 Tab。
页面内容及脚本不能更改该授权。HTTP、Scheduler 和未配置的执行默认拒绝，返回
`BROWSER_DISABLED` 或 `BROWSER_NOT_CONFIGURED`；这些标志不会安装扩展或启动 Broker。
安装与普通启动见 [Core 使用说明](../../lab/browser-automation-core/README.md)。

八项操作是同步、有限期限的原生调用。它们返回完整结构化响应，不把 Core 错误压成普通
异常。已知的缺失字段、基础类型错误、无效 scope/condition、缺少 fill value 等在启动
Client 前返回 `INVALID_ARGUMENT` / `NOT_DISPATCHED`；更深的语义查询、opaque target
身份及动作可执行性仍由 Browser Core 最终判断。无效或缺失的 Adapter 响应按
`BROWSER_ADAPTER_RESPONSE_INVALID` / `OUTCOME_UNKNOWN` 安全停止，不自动补发。业务脚本须检查 `error` 和 `outcome`，有错误时停止依赖动作。整个 execution 取消会
关闭所属 Client；关闭不撤回已经产生的 DOM 输入或服务端提交。

响应包含 `requestId`、`result` 或 `error: {code, outcome}`、`outcome`、`executionId`、
`actionId`、`source`、`surface`、`evidence` 和 `browserExecution`。可用的 session/epoch
来自 Core；执行前本地拒绝时可能没有这些字段。`source` 由宿主固定为 `recipe` 或 `agent`。
Trace 的实际读取来源及后置不由操作 ACK 推断。

### Scope 和 Target

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| scope.tab | number | 是 | 无 | 宿主已授权的真实整数 Tab ID |
| scope.frame | number | 是 | 无 | 真实整数 Frame ID；主 frame 为 0 |
| scope.document | string | 否 | 无 | observe 获取的当前 Document 身份 |
| target | object | 动作及读取必需 | 无 | locate 返回的完整 opaque target，原样传递 |
| timeoutMs | number | 否 | Core 默认值 | 整数期限；上下限以当前 Core 配置为准 |

Target 的 broker/browser session、epoch、tab、frame、document、elementIdentity 和
semanticRevision 不可拼接或改写。导航、刷新、DOM replacement、Tab close 或 reconnect
之后旧 target 被拒绝；重新 observe/locate 才能取得新对象。不能在未知动作结果后借重新定位重试。

### Query 和 Condition

Query 采用已验证 Core 语义：`{kind:'role', role, name}`、
`{kind:'label'|'text'|'testId', value}`、`{kind:'attribute', attribute, value}` 或
`{kind:'relation', axis:'descendant', within, target}`。attribute 仅限
id/name/data-testid/data-action/data-order-role；relation 的 `within` 与 `target` 必须是非 relation 基础查询，不是递归 selector engine。每种 query 仅允许其正式字段；**附加字段（如 `index`、`css`、额外 `testId`）即使不影响底层查询，也必须拒绝**，不能悄悄忽略额外条件。字符串不能是纯空白。MCP `tm_browser_locate` 提供同源字段形状提示，最终语义及唯一性仍以 Browser Core 为准。

Condition 为 `{kind:'equals', field:'text'|'value', expected:string}` 或
`{kind:'nonEmpty', field:'text'|'value'}`。预期值只作验证，不能替代 DOM 实际读取值。

## BrowserDOM.observe(args)

观察当前 frame/document 的有限 DOM。

**签名** `BrowserDOM.observe({scope, timeoutMs?}): BrowserDOMResponse`

**参数** `scope` 必填；`timeoutMs` 可选，见公共约定。

**返回值** `result` 包含当前 identity 和受 Core 容量限制的观察；保留原始 Core 字段。

**行为与错误** 不操作 DOM。错误 Tab/网站在输入前拒绝；没有连接或无法确认资源来源不冒充可用。

**示例** `const observed = BrowserDOM.observe({scope: {tab: authorizedTab, frame: 0}});`

## BrowserDOM.locate(args)

在明确 scope 中唯一定位一个真实元素。与 Playwright 的懒 `Locator` 不同，当前是立即执行的同步 Core 查询，不支持 `getByRole()`、CSS、完整 ARIA、自动多次点击或 Playwright Page。


**签名** `BrowserDOM.locate({scope, query, timeoutMs?}): BrowserDOMResponse`

**参数** `scope` 与 `query` 必填；`timeoutMs` 可选。

**返回值** 成功时 `result.target` 是完整 opaque target。

**行为与错误** 零匹配 `TARGET_NOT_FOUND`；多匹配 `AMBIGUOUS_TARGET`；不选择第一个或重解析旧 target。

**示例** `const found = BrowserDOM.locate({scope, query: {kind: 'label', value: 'Order ID'}});`

## BrowserDOM.read(args)

从目标读取本次 DOM text 或 input value。

**签名** `BrowserDOM.read({target, field, timeoutMs?}): BrowserDOMResponse`

**参数** `target` 必填；`field` 是必填的 `text` 或 `value`；`timeoutMs` 可选。

**返回值** 成功时 `result.value` 为实际字符串；敏感字段为 `null` 并有 `redacted: true`。

**行为与错误** 读值带实际 target/document 来源。后续 fill 使用本次 `requestId` 绑定 producer。

**示例** `const amount = BrowserDOM.read({target: amountTarget, field: 'text'});`

## BrowserDOM.act(args)

对 opaque target 执行 fill 或 click。

**签名** `BrowserDOM.act({operation, target, value?, sourceReadRequestId?, timeoutMs?}): BrowserDOMResponse`

**参数** `operation` 是必填的 `fill` 或 `click`；`target` 必填；fill 的 `value` 为字符串；
`sourceReadRequestId` 可选但对从 read 消费的运行时值必须填写；`timeoutMs` 可选。

**返回值** Core 实际动作结果和 before/after evidence；不保证业务终点已经成立。

**行为与错误** fill source 必须来自同一 execution/document 的匹配 read；不匹配为
`READ_SOURCE_MISMATCH`。`OUTCOME_UNKNOWN` 必须停止，不自动 retry 或重连重放。

**示例** `const filled = BrowserDOM.act({operation:'fill', target:confirmationTarget, value:amount.result.value, sourceReadRequestId:amount.requestId});`

## BrowserDOM.wait(args)

在 Core 有限期限内等待目标满足 DOM 条件。

**签名** `BrowserDOM.wait({target, condition, timeoutMs?}): BrowserDOMResponse`

**参数** `target`、`condition` 必填；`timeoutMs` 可选。

**返回值** 实际满足条件的 observation；未满足则结构化超时。

**行为与错误** 不点击或补救；超时不表示先前动作未发生。关闭 execution 不是副作用回滚。

**示例** `const ready = BrowserDOM.wait({target:amountTarget, condition:{kind:'nonEmpty', field:'text'}});`

## BrowserDOM.verify(args)

用实际 DOM observation 验证后置。

**签名** `BrowserDOM.verify({target, condition, timeoutMs?}): BrowserDOMResponse`

**参数** `target`、`condition` 必填；`timeoutMs` 可选。

**返回值** Core verification 的 expected/actual 和结果。

**行为与错误** 条件不成立为 `VERIFICATION_FAILED`；click ACK 不替代此验证，也不替代独立服务端 verifier。

**示例** `const completed = BrowserDOM.verify({target:statusTarget, condition:{kind:'equals', field:'text', expected:'Completed'}});`

## BrowserDOM.status()

读取当前真实连接、session/epoch、Core 配置和资源诊断。

**签名** `BrowserDOM.status(): BrowserDOMResponse`

**参数** 无。

**返回值** Core status 和本次 `browserExecution` 的固定来源、网站/Tab、canonical Trace 引用。

**行为与错误** 首次调用建立本 execution 的 Client；不启动 Broker、安装 Extension 或重放动作。

**示例** `const status = BrowserDOM.status();`

## BrowserDOM.tabs()

读取授权网站 origin 内的真实 Tab 列表。

**签名** `BrowserDOM.tabs(): BrowserDOMResponse`

**参数** 无。

**返回值** `result.tabs`，保留 Core 的 tab/title/url/browserSession/epoch 字段。

**行为与错误** 不返回网站范围外的 Tab；同名 Tab 不作为唯一身份。动作仍被限制到宿主指定 Tab。

**示例** `const tabs = BrowserDOM.tabs();`

## BrowserDOM.close()

关闭当前 execution 的 Browser Client。

**签名** `BrowserDOM.close(): void`

**参数** 无。

**返回值** `undefined`。

**行为与错误** 不停止共享 Broker/fixture、不关闭用户 Tab。关闭后的调用拒绝；未确认副作用不因此变成未执行。

**示例** `BrowserDOM.close();`

## 错误

Core 的结构化错误原样保留，包括 `TARGET_NOT_FOUND`、`AMBIGUOUS_TARGET`、`STALE_TARGET`、
`TIMEOUT`/`WAIT_TIMEOUT`、`READ_SOURCE_MISMATCH`、`RUNTIME_RESOURCE_MISMATCH` 和
`OUTCOME_UNKNOWN`。宿主范围不匹配为 `PERMISSION_DENIED`、`NOT_DISPATCHED`。
本 execution 未授权、未配置、已关闭分别为 `BROWSER_DISABLED`、
`BROWSER_NOT_CONFIGURED`、`BROWSER_EXECUTION_CLOSED`。Client 断连/不合法响应可能是
`OUTCOME_UNKNOWN`；错误结果必须保留，不据错误文本决定重复提交。
