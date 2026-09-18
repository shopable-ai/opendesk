# OpenDesk AI 助手：制作与复用阅读入口

当前实现修订 v0.5，2026-09-18。先读 **[制作、复用与真实调用链](../../../docs/architecture/assistant-script-invocation.md)**，再按需要阅读下表。任务/资产、候选安全另存、App-owned JS/Flow 使用接缝和正式发行加载已经写入生产代码；真实 Runtime、模型、桌面和发行包资格仍以 CI／本机证据分别判定。

配图入口：[总体架构图、来源与阅读边界](../../../docs/architecture/assets/assistant/README.md)。原始 PNG 的实际归档状态以该页为准，概念图不代替运行证据。本轮实现与待本机资格的准确边界由主方案第 0 节和验收合同维护，不再把旧“最小实施提示词”当作当前代码状态。

## 一句话方案

**用户从“本次任务＋可选脚本／自动化”开始，不创建项目。系统按需准备任务资料；Codex 用通用 Skill 制作普通 JS；OpenDesk 用现有 Flow／Execution 体系授权、运行并核对结果。**

```text
一句需求 / 一个 JS / 一份目录自动化 / 已安装 Flow
                         ↓
              本次任务＋可选关联资产
  ├─ 制作：按需准备资料 → 获准真实操作与留证 → 普通 JS → 独立验证
  │                                                   ↓ 明确保存／安装／启用
  └─ 使用：允许范围 → 选择并核对固定行为／参数 → 唯一 Local Flow Catalog
                                                      ↓
                                               可信预览／确认
                                                      ↓
                                          现有执行服务／真实结果
```

普通问答、只读解释和已确定 Flow 运行不强制创建制作目录。开发者已有项目可以关联，但 projectId／主工作区不是必需对象。单 JS 不默认授权父目录；目录入口不明先澄清；已安装或受保护 Flow 日常使用无需源码。

零参数固定脚本和参数化脚本都保留，不为接入强制函数化。用户要求与固定行为冲突时不能忽略要求照旧执行。Flow Runner、CLI、计划中心确定运行脚本时，不强制启动 Codex。

## 文档职责

| 阅读目的 | 文档 |
| --- | --- |
| 一屏结构、四类入口、历史／当前核查、官方 Codex 机制与实施顺序 | [主方案](../../../docs/architecture/assistant-script-invocation.md) |
| 任务／会话／资产／授权、工作目录、候选保存、接续及清理 | [绑定合同](../../../docs/architecture/assistant-workspace-bindings.md) |
| 作者来源、候选、独立资格、保存／发布／运行／维修 | [生命周期](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md) |
| A/B/C、AR-01—44、五视角模拟评审、评分与硬否决 | [验收合同](../../../docs/quality/assistant-authoring-reuse-acceptance.md) |
| 历史 RPA 依据与采用／不采用决策；新版本 CLI 机制以主方案核查为准 | [研究记录](../../../docs/research/rpa-authoring-reuse-design.md) |
| 既有会话列表、消息、草稿、窗口与编辑体验 | [对话工作台](../../../docs/architecture/conversational-task-workspace.md)；强制项目描述不再适用 |
| 物理安装、签名、信任、权益、事务与目录 | [Flow 分发模型](../../../docs/architecture/execution/flow-distribution-installation.md) |

现有测试位置：[tests/assistant/](../../../tests/assistant/)。公开 Runtime 契约继续使用正式 JS 测试，静态、mock、真实 Codex、Runtime、业务与视觉分别留证。设计评分只有验收合同一处，不复制多份分数。

## 现有源码与历史导航

2026-09-16 快照中 main.js 加载 `capabilities/calculator.js` 并注入 task-service；controller 发送消息，session 分流／确认，task-service 让 Codex 生成固定 JSON 参数，Calculator execute 完成桌面业务。完整历史链保留在主方案第 3 节。

2026-09-18 本轮在 `a3ad21f2699f4b56db50dea959d5a20ba95f573e` 复核 task-service 仍有 Calculator 专用路径，Agent adapter 仍是关闭作者工具的 analysis 通道；真实 Flow Catalog 已存在。不能把这些事实说成通用资产作者态已经接线。其余源码职责保留作导航，实施前重新读取：

| 文件 | 职责／定位 |
| --- | --- |
| `controller.js` | 现有窗口内的普通聊天＋任务意图／四类资产／可信预览／确认／候选另存与状态渲染 |
| `session.js` | 请求身份、聊天／Calculator／持久资产任务分流、确认、停止、迟到结果及 unknown-effect 保护 |
| `task-contract.js` | 持久 task revision、四类资产、候选绑定、一次性确认和 signed Flow invocation 合同 |
| `task-runtime.js` | 任务/候选接续、safe save、JS/目录/installed Flow 使用链和证据持久化 |
| `task-service.js` | 既有 Calculator 专用路由、Planner、参数校验、执行适配和文案；保留回归路径 |
| `model-channel.js` | 普通聊天、无源码 make，以及经双重授权后由 host reader 提供的单 JS 解释／候选生成；源码作为不可信数据且不授予模型文件／命令／桌面工具 |
| `store.js` | 会话、草稿、request/message 状态；持久 task 由 TaskContract/TaskRuntime 另按 task identity 维护 |
| `../capabilities/calculator.js` | 演示业务代码，不是要求用户照搬的业务目录 |
| `../main.js` | 官方产品接线，不随新增用户业务脚本增加业务分支 |

App-owned 执行接缝的历史与当前局部核查同样在主方案中；后续从现有 Flow／Execution owner 接续，不重建已完成实现。`examples/ai-workflows/chat-calculator/` 是独立示例，只改示例不证明正式助手更新。

## 必须保持的边界

目标只保留 `opendesk-author`、`opendesk-use` 两个通用方法入口，不为每份业务 JS 生成 Skill/profile，不把业务代码复制进 Skill。这两个名称是设计目标，不代表已部署。OpenDesk profile、官方 CLI profile、Skill 和任务上下文分别承担配置、方法和资料职责，均不授权。

现有 analysis-only Agent.run 不扩权。近期受管 Codex 使用官方有界 exec，具体作者工具、事件和停止接缝须独立验证；需要富交互时才采用 App Server。一次性 CLI／认证／Skill 准备由产品引导，不要求普通用户手工复制内部文件或创建 Git 项目。

用户业务不进入应用核心。只保留唯一 Flow Catalog、安装器、Trust／Entitlement 和执行体系；不创建 capability-catalog／capability-releases。安装遵守 flows/installId，不加 version 子目录，也不拿安装树当作者目录。

发现不执行，关联不授权，编辑默认候选，源变化报冲突；保存、安装、启用和运行不互相推出。脚本独立验证不由 Agent 临时补做，不盲目重复第一次任务已经造成的效果。计划与实际轨迹分开，保护源码不因解释／追溯泄露。

停止以 Codex 与实际工具／Execution 收口为准，未知不冒充成功。切会话不污染原任务；清理缓存不删除用户唯一脚本、未完成任务资料或有效证据。保留既有 UI，不重做一套低代码编辑器或项目管理界面。

当前生产代码已经修改 JS／Go／发行 payload，并新增 Node、Go 与正式 OpenDesk Runtime gate。网页环境不能直接运行本机桌面/Codex；CI 或本机尚未产生证据的条目继续标为 CI PENDING / NOT RUN，不能以代码存在或设计评分替代运行验收。单 JS explain/improve 已通过显式 read＋model-share 双授权和私有 host reader 接线；目录型多文件 improve、通用 Codex 作者工具及目录事务回写仍保持 BLOCKED，不通过放宽 analysis 通道制造“已接通”。
