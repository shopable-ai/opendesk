# Browser Extension Runtime Bridge

状态：Architecture contract / Planned，2026-10-02。本文冻结目标、职责与交接边界；不表示 Browser Extension、Browser Broker、Browser MCP tool、DOM Runtime 或 Browser Human Capture 已实现。当前能力事实仍以 [Browser Automation Capability Matrix](capabilities.md) 为准。

## 1. 目标需求

OpenDesk 需要把 Browser 建成与 Desktop 并列的一等 execution surface，而不是再做一套独立的“浏览器版 OpenDesk”。

目标链路：

```text
Agent / Codex
→ OpenDesk MCP / Browser API
→ Browser execution owner
→ Browser Extension
→ 用户当前 Browser / Tab / Frame / DOM
→ Observe / Locate / Read / Act / Verify
→ Browser Agent Trace + Evidence
→ 现有 Agent-to-Recipe
→ 普通 OpenDesk JavaScript Recipe / Flow
→ Fresh Run / Qualification
```

人工网页演示的目标链路：

```text
Human
→ Browser Extension Capture
→ Browser Human Trace
→ 现有 Human-to-Recipe / 共用制作职责
→ Recipe / Qualification
```

Browser 与 Desktop 共用上层自动化生产、Flow、Scheduler、Evidence、Qualification 和分发能力；不强行共用底层观察、定位或录制机制。

## 2. Control, Capture and Trace Ownership

| Surface / source | 控制或采集方式 | 权威事实 owner | 明确不做 |
| --- | --- | --- | --- |
| Browser Agent | Browser MCP / Browser API → Browser execution owner → Extension → DOM | Browser execution owner 保存实际 request、resolved target、action、post-observation、verification、evidence | 不再让 Browser Recorder 或 Desktop Recorder 重录同一次 Agent action |
| Browser Human | Human → Browser Extension Capture → DOM/Tab events | Browser-side capture provider | 不从桌面 x/y 推断 DOM target，不伪装成 Agent tool trace |
| Desktop Agent | Desktop MCP / Runtime API | 当前 Desktop execution owner | 不把普通网页 DOM 当作默认 desktop OCR/coordinate workload |
| Desktop Human | 当前 Recorder | Desktop/native Recorder | 不监听页面 DOM，不捕获 Browser MCP/API action |

共同的上层产物可以引用不同来源的 Action / Observation / Verification / Evidence，但 provenance 必须保留。共享后半段不等于共享底层 raw trace schema。

## 3. Browser-first 与 Surface 切换

普通网页操作默认使用 Browser semantic capability：

```text
DOM / accessibility semantics
→ role + accessible name
→ label / text / test-id
→ stable attributes / relations
→ browser-specific geometry or fallback
```

Desktop 自动化主要用于 Browser 无法直接拥有的系统级或浏览器外壳界面，例如文件选择器、系统权限窗口、证书窗口和其他 native dialog。

跨 surface 示例：

```text
Browser DOM
→ 点击上传
→ surface transition
→ Desktop file picker
→ surface transition
→ Browser DOM verification
```

这是 Workflow/Recipe 显式切换 surface，不是两个 Recorder 相互监听。

## 4. Browser execution owner

P0 需要建立或复用一个唯一的 Browser execution owner；“Browser Broker”是当前架构工作名，不预先决定最终 package/type 名称。

所有需要真实 Browser control 的入口应复用该 owner：

```text
OpenDesk MCP ───────┐
OpenDesk JS / Flow ─┼→ Browser execution owner → Extension → Browser
Scheduler ──────────┘
```

它至少负责：

- Extension connection 与 identity；
- browser session、tab/frame/document identity；
- request/response correlation、timeout、cancellation；
- permission 与 execution association；
- reconnect、stale session/document 处理；
- Browser Agent structured trace 与 Evidence；
- Browser Human capture session 的协调边界，但不把 Human raw events 伪装成 Agent calls。

它不拥有第二套 Flow Catalog、Scheduler、Agent-to-Recipe、Human-to-Recipe、Marketplace 或 Qualification。

## 5. Agent Trace：调用链就是事实来源

Agent 通过 Browser MCP/API 调用网页时，实际执行链比事后监听鼠标事件更接近业务事实。

最小关系必须能够回答：

```text
request
→ resolved target
→ precondition / observation
→ actual action
→ result
→ post observation
→ verification
→ evidence
```

同一个实际 Agent action 只有一个可修改的事实 owner。Extension 侧低层事件可作为该 action 的内部执行证据，但不能被重新计为另一条 Human/Recorder action。

未来若形成共同 envelope，至少应保留 action/session/execution identity、surface、source、provider、target reference、operation、observation/verification/evidence references 与时间；不得为了统一 envelope 丢失 Browser 或 Desktop 的专有语义。

## 6. Browser Human Capture

Browser Human Demonstration 需要由 Extension 在浏览器内部采集更准确的页面事实，例如：

- tab / frame / document / origin / URL；
- click、input/change、submit、keyboard semantic action、navigation；
- role、accessible name、label、text、test-id、必要的稳定属性与 DOM relation；
- 必要且获准的 before/after state 与时间。

默认不保存完整页面 DOM、密码、安全字段或无界业务内容。Human capture 的 raw schema、隐私字段和生成规则在实现前另行冻结；本文不把它写成现有 Recorder API。

## 7. Extension ↔ Local OpenDesk 通信

P0 必须从真实生命周期、安全和吞吐需求选择一条主 transport。当前候选包括：

1. Native Messaging only；
2. Native Messaging bootstrap + authenticated dynamic localhost WebSocket；
3. direct localhost HTTP/WebSocket；
4. Native Host 与 Browser execution owner 之间的 OS IPC。

当前尚未冻结最终选择。无论选择哪一种，都必须回答谁主动连接、谁拥有进程/endpoint、extension identity、session credential、dynamic port/discovery、Chrome/OpenDesk 任一侧重启、MV3 service worker 回收、stale session 与未授权本地调用。

`127.0.0.1` 本身不是身份或授权。不得为了快速实现同时维护多套正式 transport。

## 8. MCP 与 JavaScript/Flow 的共享 owner

Browser MCP 应优先扩展当前 OpenDesk MCP，而不是默认新建 `opendesk-browser-mcp`。具体 tool 名称和公开 JavaScript API 只有在实现合同冻结后才能进入 `docs/api/`。

无论最终工具/API 名称如何，MCP 与 JavaScript/Flow 必须调用同一个 Browser execution owner。不得形成 MCP、Runtime、Recorder 三套互相漂移的 Browser control 实现。

## 9. Provider 边界

首个真实 provider 是 Extension Provider，目标是用户当前已经登录的本地浏览器环境。

未来可以增加 Driver Provider，例如 Playwright/CDP/Cloud Browser，用于隔离、headless 或云执行；它应复用上层 Browser capability contract，而不是继续扩展当前历史 Playwright-shaped compatibility shim。

Extension Provider 的完成不是 Driver Provider 的完成，反之亦然。

## 10. 实施顺序

```text
ownership contract
→ Browser execution owner
→ Extension connection
→ Browser MCP vertical slice
→ Browser Agent structured trace
→ Browser Agent golden sample
→ Recipe Fresh Run / Qualification
→ Browser Human Capture
→ Human-to-Recipe Browser source
→ Browser + Desktop cross-surface
→ Driver / Cloud provider
```

第一条黄金样本优先使用仓库可控网页 fixture，证明“输入 → 查询 → 读取运行时值 → 消费该真实值 → 提交 → 页面结果验证”。Agent Browser 链通过以前，不优先建设大型 Browser Human Recorder。

## 11. Evidence 与当前状态纪律

本文只有 architecture-contract Evidence，不是 capability Evidence。

| Area | Current state at 2026-10-02 |
| --- | --- |
| Ownership contract | Defined in this document |
| Real Browser execution owner | NOT_IMPLEMENTED |
| Browser Extension Provider | NOT_IMPLEMENTED |
| Browser MCP semantic tools | NOT_IMPLEMENTED |
| Browser Agent structured trace | NOT_IMPLEMENTED |
| Browser Agent golden sample | NOT_RUN |
| Browser Human capture | NOT_IMPLEMENTED |
| Human Browser golden sample | NOT_RUN |
| Browser + Desktop cross-surface sample | NOT_RUN |

任何后续 PASS 必须回到 `capabilities.md`、测试和真实 evidence 更新，不得通过修改本表或 Roadmap 自报完成。

## 12. 关联文档

- [Browser Automation Capability Matrix](capabilities.md)：只记录当前可证明能力。
- [Browser Automation Runtime Stack](stack.md)：历史 browser/playwright compatibility facade 的真实边界。
- [Browser Automation Current Backlog](../../plans/browser-automation/roadmap.md)：实现顺序与当前 backlog。
- [Recorder Runtime API](../../api/recorder-runtime.md)：当前 Desktop/native Recorder 的公开合同。
- [Agent-to-Recipe Skill Contract](../../frameworks/agent-to-recipe-skill-contract.md)：S1—S12 与示范/制作/资格的上层合同。
- [Human-to-Recipe](../../../workflows/human-to-recipe/README.md)：人工示范到普通 JS 的制作链。
