# OpenDesk AI 助手：制作与复用阅读入口

当前设计修订：2026-09-18。先读 **[制作、复用与真实调用链](../../../docs/architecture/assistant-script-invocation.md)**，再按需要阅读下表。设计文件不证明生产代码或本机安装包已更新；真实运行状态须核验实际加载来源和证据。

## 一句话方案

**制作绑定用户项目与任务，使用绑定允许调用的 Flow 范围，执行绑定确定版本与本次授权。Codex 制作普通 JS，OpenDesk 通过现有 Flow 体系受管运行。**

```text
本地 Codex / AI 助手
  ├─ 制作：项目/任务 → 真实操作与留证 → 普通 JS → 独立验证
  │                                         ↓ 明确发布/安装/启用
  └─ 使用：可调用范围 → 选择 Flow ───────→ 唯一 Local Flow Catalog
                                                  ↓
                                          预览确认 → 共享执行服务
                                                  ↓
                                            真实结果与运行证据
```

普通问答不要求绑定项目；运行已安装 Flow 不要求取得源码工作区。零参数固定脚本和参数化脚本都受支持，不为接入强制函数化。用户要求改变固定行为时必须澄清/扩展，不能忽略要求照旧执行。

## 文档职责

| 阅读目的 | 文档 |
| --- | --- |
| 总体结构、历史调用链、Flow 映射和实施阶段 | [主方案](../../../docs/architecture/assistant-script-invocation.md) |
| 入口场景、会话/项目/任务/版本、模式权限与 Codex 接续 | [绑定合同](../../../docs/architecture/assistant-workspace-bindings.md) |
| 作者来源、候选、独立资格、发布、运行、维修 | [生命周期](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md) |
| 三段证明、28 项覆盖、误命中评测、设计评分与否决项 | [验收合同](../../../docs/quality/assistant-authoring-reuse-acceptance.md) |
| 官方 RPA 依据、采用/不采用与 Codex 适配限制 | [研究决策](../../../docs/research/rpa-authoring-reuse-design.md) |
| 既有对话列表、消息、草稿、窗口与编辑体验 | [对话工作台](../../../docs/architecture/conversational-task-workspace.md)；模式和绑定采用当前增补 |
| 物理安装、签名、信任、权益、事务和目录 | [Flow 分发模型](../../../docs/architecture/execution/flow-distribution-installation.md) |

现有测试位置：[tests/assistant/](../../../tests/assistant/)。新增公开 Runtime 契约继续采用正式 JS 测试；mock、模型、Runtime、业务和视觉分别留证。

## 保留的历史源码导航

2026-09-16 核查的入口为 main.js 加载 `capabilities/calculator.js` 并注入 task-service；controller 发送消息，session 分流及确认，task-service 让 Codex 生成固定 JSON 参数，Calculator execute 完成桌面业务。该记录保存在主方案第 3 节，**不是对今天代码未变化的声明**。

| 文件 | 该快照中的职责 |
| --- | --- |
| `controller.js` | 窗口、输入、任务预览/确认/停止和渲染 |
| `session.js` | 请求身份、聊天/任务分流、确认冻结、取消与迟到结果保护 |
| `task-service.js` | Calculator 专用路由、Planner、参数校验、执行适配和文案 |
| `model-channel.js` | 普通聊天通道 |
| `store.js` | 会话、草稿、请求、消息和终态 |
| `../capabilities/calculator.js` | 当时的演示业务代码，不是用户业务目录模板 |
| `../main.js` | 官方产品接线 |

已有 App-owned 执行接缝的历史定位同样在主方案中；后续从当前正式 Flow/执行 owner 接续，不重建已完成实现。`examples/ai-workflows/chat-calculator/` 是独立示例；只改示例不证明正式助手更新。

## 必须保持的边界

用户业务不进入应用核心；不为新增 Flow 修改 main.js。只保留唯一 Flow Catalog、安装器、Trust/Entitlement 和执行链；不创建 capability-catalog 或 capability-releases 的平行物理库。正式安装根遵守 flows/<installId>，不加 version 子目录。

发现不执行，绑定不授权，安装/验证/启用不自动运行。脚本独立验证不能由 Agent 临时补做。计划和实际轨迹分开，实际代码视图对应运行内容；受保护源码不因追溯而泄露。

取消以实际执行收口为准，未知效果不自动重放；切会话不污染旧任务。删除会话不删除 Flow、源脚本或业务输出。保留既有 UI 体验，不因本次设计重新做一套助手窗口或低代码编辑器。

本次仅更新文档；没有修改生产 JS、Go、打包资源，也没有运行构建、模型或桌面测试。
