---
title: "OpenDesk Execution Control R0.2｜Browser / Desktop / Mobile 多端统一云控总纲"
description: "统一任务提供者、三类执行端、受限长连接、执行授权、持久请求、结果对账与渐进实施边界。设计归档，不是已完成声明。"
---

# OpenDesk Execution Control R0.2 — 多端统一云控架构（长期设计入口）

> 归档日期：2026-10-11。状态：**DESIGN_BASELINE / NOT_IMPLEMENTED_AS_A_CROSS_SURFACE_CLOUD_LOOP**。  
> 范围：Browser、Desktop、Mobile 的统一任务接入与授权，不取代任何一端原有执行器。  
> 本文件是多端**总体方案与跨仓库阅读入口**，不是已发布 HTTP API、运行证据或云控 UI。  
> 相关可交互**静态**原型：[Cloud Control Prototype](../../apps/opendesk/prototypes/cloud-control/index.html)（不能实际连接服务器）。  
> Browser 侧 R1 必须将其作为上位约束，不能反过来把 Browser Task v1 规定为 Desktop 或 Mobile 的通用任务格式。

## 1. 历史决定和最重要的结论

- 此前曾讨论“OpenDesk + OpenDesk Browser R0.2 — 双执行端统一任务接入、长连接云控协议、存量框架复用与分阶段设计”。Browser + Desktop 是首批两个不同的执行端；**Mobile / 手机 App 是同一体系预留的第三类一等执行端**，不代表手机运行器或后台能力已经实现。
- 用户最终体验：正式产品内置一个受信任的默认任务提供者；用户可以显式启用托管，首次配对并批准执行/输出范围；高级设置允许手动改服务地址。开发环境可使用明确允许的回环测试服务器。
- **只配置一个 Socket URL 不能构成完整云控**。WebSocket/WSS 只负责连接、心跳、通知；claim、admission、startPermit、renew、receipt、reconcile 等持久业务操作走 HTTPS，要求提供者持久化、认证、幂等与授权。
- **每个执行端复用自己的执行事实来源、运行器和权限**：Browser 使用已存在的 Task v1/Authority/RunHost/Worker/ChromePage/Run/Result/IDB；Desktop 使用其既有 OpenDesk Recipe/Flow/Execution、Scheduler/Runtime ownership 与证据；Mobile 将来以各平台许可的 App/OS 执行能力为界。不能发明一个替代三端的通用 Runtime、统一数据库或隐藏执行权限。
- 首期 Browser R1 只支持**已安装且已授权**的 `opendesk.task-package.v1`；不能把这条 Browser 产物语义直接推广成 Desktop Flow、手机 Intent 或任意脚本执行授权。Desktop 适配、Mobile 适配与正式 Cool 后端分别实施。
- 历史讨论和新 GOAL **并不等于源码已写入**。本归档新建时未发现正式 Cloud Control R1 连接模块/云控原型/统一公共合同，任何完成度必须以实时源码与同候选测试证据更新。

## 2. 平台层级与唯一职责

```text
                   OpenDesk Cloud / Task Provider（正式 Cool 后端待实施）
              配对认证 ─ 任务与尝试 ─ 持久许可 ─ 租约/取消 ─ 回执/对账
                                      │
                   WSS 通知 / HTTPS 受限持久操作
           ┌──────────────────────────┼────────────────────────┐
           │                          │                        │
    Browser Executor            Desktop Executor         Mobile Executor
     首期 Browser R1             以后单独适配              以后单独适配
           │                          │                        │
   Browser Authority          OpenDesk Runtime           平台原生授权
   RunHost / Worker          Recipe / Flow / UI          App 允许的操作
   ChromePage + IDB          Execution / Results         Mobile execution
           │                          │                        │
   Browser local Run         Desktop local Run          Mobile local Run
   + Result + retirement     + Evidence + ownership    + 平台限定证据
```

统一的是**任务来源身份、领取尝试、授予范围、幂等、取消、租约、结果交付和状态对账语义**，不是各端脚本源码、动作/资源接口或 OS 权限。

- **Task Provider**：可信配对关系、Executor 身份、Job/Request/Claim/Assignment、开始许可、续租、取消、回执、重连对账；未来 Cool 8 数据库与 outbox/inbox 应由服务端实现。首版开发提供者只作为验证同一合同的最小持久服务。
- **Executor Adapter**：每端一个受限来源适配层，选择固定且被本机授权的可执行产物，并把远端意图绑定原生运行事实。不直接执行服务器传来的源码或扩权命令。
- **Local Authority / Execution Owner**：每端最后的决定者；核验安装身份、用户许可、运行 owner、目标、资源和取消栅栏；提交原生 Run/Result，不接受云端自报权限。
- **UI**：托管开关、默认/自定义提供者、配对、批准的任务/目标/输出范围、等待原因、运行/结果/退休/回执的独立状态。连接成功不等于可执行。

## 3. 统一身份与请求/结果状态

不可混用的身份：

- `jobId`：服务端保存的业务请求。
- `requestId`：一次明确的受限执行意图；用户真正再次执行必须用新 requestId，可通过 `retryOf` 或 `sourceRef` 关联。
- `claimId`：一次领取请求；网络重试必须沿用相同值，连“当时无任务”也返回原结果。
- `assignmentId` / `attemptEpoch`：一次绑定某 Executor 的领取与执行尝试；首版不在未知副作用下自动跨端重派。
- `executorId`：设备安装实例的稳定执行端身份（不是 WS session）；`pairingId` / Grant generation：本次可信配对及本机托管授权。
- `taskRef`：**明确 surface/runtime + artifactType + immutable version/hash**，由相应本地执行器解释；Browser 另绑定 `installationId`、`generation`、`manifestHash`、`sourceHash`、builtin/dependency identity。
- `runRef` / `resultRef`：对应端**原生持久运行与结果**的引用；Browser 的原 runId/resultId 不能被云端的 Job ID 替代。
- `connectionGeneration`：只隔离旧连接回调，不进入稳定请求键；Host registration 属于原执行 owner，也不进入稳定请求键。

稳定请求键绑定真实认证提供者、命名空间、配对实例和 requestId。相同键/相同内容只能返回原事实并对账；相同键/不同内容必须报冲突。

状态必须分开记录，不能用单个“成功”覆盖：

```text
已收到请求 → 已领取 → 本地准入并绑定原 Run → 已取得开始许可
       → 已派发/可能发生副作用 → 本地 Result 持久化 → 云端回执确认
       → 本地资源退休
       → （可选）业务来源回写完成
```

- 结果终态 **≠** 原执行资源槽已释放；网络回执成功 **≠** 业务来源完成。
- 可能已有副作用但不知结果：`OUTCOME_UNKNOWN`，不能自动再次执行。
- 本地 Result 已存在但上传失败：经**当前输出授权**复核后仅补回报，不重跑。
- 业务已完成、来源回写失败：只重试来源回写；不重新提交网页/桌面/手机动作。
- 取消、配对撤销、安装撤权、站点/系统权限撤销，都不能靠缓存旧许可恢复执行权。

## 4. 连接、授权和正式用户体验

### 4.1 默认提供者和自定义服务器

- 正式 App/扩展携带**发布时受信任的默认提供者配置**（实际域名未冻结，不得在实现前写死示例域名为真实服务）。用户首次需要启用托管并批准范围，不因内置默认地址而默许后台执行。
- 普通设置只展示“托管状态、提供者、允许的固定任务/目标、取消/结果状态”；高级设置提供“使用默认服务 / 自定义服务”切换、基础 HTTPS URL、连接诊断、配对与解除配对。
- 不让普通用户分别填写 WebSocket 路径、HTTP Path、heartbeat 数值与 token；若可发现服务端端点，发现结果仍必须通过身份/协议限制。
- 生产服务只用 HTTPS/WSS；受控开发模式允许**显式固定的回环地址** HTTP/WS，不得扩大为任意远端明文地址。长期凭据不放 URL、日志、网页消息、用户脚本或移动 WebView。
- 首期只一个已配对提供者和一个 Executor 连接 owner。切换地址必须停止旧任务领取、隔离旧凭据与旧请求，重新配对/批准；旧结果不得发送到新提供者。

### 4.2 授权与托管开关

```text
禁用托管（默认）
  → 选择可信提供者
  → 配对认证
  → 用户批准固定任务 + 可操作目标 + 输出字段 + 有效期
  → 启用托管（只在所批准范围内自动领取）
  → 连接/Host/目标/槽分别显示状态
  → 停止托管：不再领取 + 发起原生取消 + 等待结算/对账
  → 解除配对：撤销该提供者凭据与授权，禁止旧消息再次生效
```

正常重连不得重复弹确认；范围扩大、提供者更换和敏感动作需要明确的用户授权。停止并非原生效果的回滚；直到本地 Authority 证实，不显示“已安全停止”。

### 4.3 前台/后台能力必须依平台区别表达

- Browser R1：只有原合法 Host 存活且真实目标就绪才执行；Side Panel 关闭后不承诺无人值守、不能偷偷创建隐藏 Host。MV3 Service Worker 可用于网络通知/恢复，但不能把 WS 在线当成 Worker 执行权。
- Desktop：沿用原 OpenDesk Execution/Recipe/Flow、持久 Scheduler 和 Runner ownership；不得另建第二个调度器或对原本地任务施加 Browser runId/slot 语义。桌面托管是否常驻由正式 App lifecycle 和用户授权决定。
- Mobile：Android/iOS 原生能力、后台调度、通知、系统权限/可访问性限制与用户交互应分别设计、分别验收；不能假设手机 App 能像 Desktop 守护进程持续执行任意任务，也不能宣称当前已具备手机自动化运行器。
- 跨端工作流或 DAG 是以后阶段的显式编排，不应作为 Browser R1 的隐藏前置条件。

## 5. 建议的统一协议边界（尚非已发布 API）

建议外层协议标识：`opendesk.execution-control/0.2`。它与既有 `opendesk.foundation.v1`、OpenDesk HTTP/Flow API 是不同合同。

正式公共合同需要**唯一规范源**，至少包含 JSON Schema、必要 HTTP 描述、正负向/幂等向量以及跨端投影限制：

- 配对/认证/短期 WSS session credential（原生 WebSocket 不能任意加 Authorization request header）。
- Capability/Readiness（连接在线、Host、目标、执行槽分开）。
- claim → admission/run binding → durable startPermit → original authority recheck → original execution。
- renew / cancel / receipt / reconcile。
- JSON 规范化 UTF-8/SHA-256、时间与长度限制、未知字段与不兼容版本拒绝。
- 服务端事务唯一约束、receipt 幂等、outbox/inbox、重启后完整对账。
- 严禁 remote source、draft、任意 Shell/CDP/native path、远程安装授权或 grant 扩权。

**合同路径治理**：历史 Browser R1 GOAL 建议 `shopable-ai/opendesk-browser/docs/contracts/execution-control/v0.2/` 作为首个实现时的正式规范位置；目前仅为拟定。真正形成 Schema/API/向量前先查这一路径及其他仓库是否已有规范，选定**一个**权威位置、由另一端链接/消费其固定版本，不能同时维护两套独立定义。本总体文档不复制机器合同，也不能被冒充为已上线 v0.2 API。

## 6. 各端代码/仓库边界与当前真实证据

| 项目 | 已存在的可复用基础 | 云控新增范围与证据 |
| --- | --- | --- |
| OpenDesk Browser：`shopable-ai/opendesk-browser` | Task v1、Authority、RunHost、Controller/Worker、ChromePage、IDB runs/results/commandJournal、单槽、安装授权 | Cloud R1 WS/HTTPS、受限请求持久化、事务绑定/开始许可、取消/回执/对账、UI、开发提供者：归档时 **NOT_IMPLEMENTED / NOT_TESTED** |
| OpenDesk Desktop：`shopable-ai/opendesk` | Desktop Runtime/Recipe、Execution/Flow、原 Scheduler 单活归属和桌面能力 | Desktop 云来源适配、配对/任务匹配、原执行绑定、输出投影和真实桌面验收：**NOT_IMPLEMENTED / NOT_TESTED** |
| Mobile：后续确定仓库和平台 | 此架构只保留 Mobile Executor 的产品位置，不把第三方 Android/iOS 源码当成本项目能力 | 端侧授权、运行器、OS 生命周期、后台限制、真实设备验收：**PLANNED / NOT_TESTED** |
| Provider：开发/正式 | 本设计冻结合同需求，但不宣称存在可直接运行的 Cloud Provider | 最小本地提供者 + 后续 Cool 8 后端：**NOT_IMPLEMENTED / NOT_TESTED** |

相关现有基础文档：

- [Desktop ↔ Browser 执行表面和 owner](browser-automation/extension-runtime-bridge.md)；对应的 [Browser 能力证据矩阵](browser-automation/capabilities.md) 是该文档所属源码快照的历史结论，新候选须复核。
- [Desktop Scheduler 单活并发](scheduler-runtime-concurrency.md)；[Desktop Flow Runner](execution/flow-runner.md)；[外部工作流集成](external-workflow-runtime-integration.md)。
- [Browser 框架总览](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/README.md)；[Browser Agent → Task 局部合同](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/agent-to-task-contract-r1.zh-CN.md)，后者**不是**云任务协议。
- Browser Cloud R1 实施文档预期为 `docs/architecture/browser-framework/cloud-control-r1.zh-CN.md`；原 GOAL 提议但归档时尚未验证落地。

## 7. 分阶段交付，不跳过实际证据

- **Phase A — Browser R1**：一个受控提供者、一个配对、固定 Task v1、托管开关、WS 通知/HTTPS 持久操作、原事务 Run 绑定、服务端开始许可、原 RunHost 真运行、Result/回执/对账；在真实 Chrome 的固定表单 `sample.form-fill@1.0.0` 上取得真实 runId/resultId、页面效果、原 IDB 重读与服务器回执。
- **Phase B — Desktop Adapter**：独立 Desktop 产物类型/TaskRef、原执行 owner、用户授权/OS 权限、桌面结果和取消证据，不把 Browser 任务变成 Desktop 任意脚本。
- **Phase C — Mobile Adapter**：明确 Android/iOS 能力表、运行时限制、权限模型和在线/前台/后台语义；真机验证以后才扩展功能。
- **Phase D — 正式 Provider / 跨端业务**：Cool 8 认证、持久唯一约束、事务、outbox/inbox、租户隔离、业务结算与来源回写；后续再研究多提供者、跨端调度和可选无人值守。

验收单独记录：`SOURCE_CONFIRMED`、`COMPONENT_TESTED`、`BUILD_VERIFIED`、`NATIVE_VERIFIED`、`BLOCKED`、`NOT_TESTED`。不按任意等权模块给进度百分比，不把 HTML 演示当真实功能。

## 8. 下次开发的必读和防误执行规则

1. **先读本文件，再读相应端自己的 AGENTS.md、实施文档和实时源码**。Browser R1 不能覆盖 Desktop/Mobile 总体设计。
2. 如有人问“之前统一框架在哪里”，从本文件和静态原型开始；旧 R0.2 聊天是历史背景，不能作为“已经提交源码”的证据。
3. 修改公共消息/身份/协议，必须核查唯一合同源和各端消费版本，更新兼容/拒绝与测试向量。**只改 Browser 局部代码不能偷偷升级所有平台协议**。
4. 不新增第二套 Browser Authority、Run/Result 数据库或 Scheduler；不把 Desktop/手机的任务模型强制塞进 Browser Task v1。
5. 服务端地址内置≠自动启用托管。云端信任、任务安装/运行、网站/OS 权限、结果输出是不同授权。
6. 本原型是**纯前端离线演示，不发网络请求、不改变浏览器扩展配置、不执行任务**；界面确认以后仍需要真实产品接线与原生验收。
7. 任何实施完成声明必须附当前提交/源码、原生运行/结果身份、实际 Chrome/Desktop/Mobile 或提供者的可复核证据，不能把计划状态改为 PASS。
