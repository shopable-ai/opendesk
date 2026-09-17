# RPA 制作与复用：证据到 OpenDesk 设计的映射

查阅日期：2026-09-18。用途：支撑 [AI 助手制作与复用方案](../architecture/assistant-script-invocation.md)，不作为竞品排名、产品实测报告或 OpenDesk 已实现证明。只采用本轮能够从官方资料核对的产品事实；“借鉴”列是 OpenDesk 的设计选择。

## 1. 采用什么，不照搬什么

| 来源与产品事实 | OpenDesk 采用 | 不据此推断/不照搬 |
| --- | --- | --- |
| UiPath Orchestrator：Process 是配置部署的 Package 版本，关联 Folder，可启动 Job。[1] | 源资产、可调用 Flow、一次 Run 分层；版本与输入由宿主绑定 | 不复制 NuGet/云控制中心，不把“已部署”当业务资格 |
| UiPath Autopilot：工具可配置启用状态、对模型的用途描述；参数有展示及模型说明。[2] | 已安装与启用给助手分开；描述符帮助召回，精确 ID/摘要用于执行 | 不声称了解内部检索算法；说明或高相似度不是权限/安全证明 |
| Power Automate：输入/输出变量用于流程间传值，并有类型、外部名称、说明等定义。[3] | 内部变量与外部业务参数分开；固定流程可以先用，真实需求再参数化 | 不把所有坐标、定位常量、Secret 变成模型输入，不强制复制图形化编辑器 |
| Blue Prism：Process 可调用 Business Object 的应用操作；版本、草稿/审批和调试轨迹有独立表达。[4] | 业务 JS 与可复用应用 helper 分层；计划、代码、实际轨迹相互关联 | 不为每次点击暴露一个模型工具，不把可编辑调试过程当独立资格验证 |
| OpenAI Codex App Server：官方描述了 thread/turn/item、流式事件、审批与中断接口。[5][6] | 后期在版本化适配器内评估集成；本地与助手共用任务包 | 不把 Codex thread 当项目/Run ID，不假设接口存在即桌面权限与停止已完成 |

采用的是管理边界，不是要求 OpenDesk 使用与竞品相同的文件格式、数据库或 UI。普通 JS、现有 Flow Catalog、安装器与 Runtime 保持唯一实现。

## 2. 对前序讨论的边界修正

“制作绑定项目，使用绑定允许调用的 Flow 范围”是本项目对不同上下文的选择，不是宣称所有竞品有相同会话模型。

“Agent 完成一次 → 提炼普通 JS → 脚本独立运行 → 助手准确复用”是 OpenDesk 的验收目标。任何厂商展示的生成、录制、computer use 或部署功能，都不能单独证明这个完整闭环。

本轮 Automation Anywhere 的既有工作区文档链接未成功读取，因此不新增或重述它的具体产品行为作为当前证据；保留链接仅供后续核查：[待复核资料](https://docs.automationanywhere.com/r/cloud-build/cloud-work-area/cloud-using-the-task-list)。此前提到的影刀 CLI/Skill 未在本轮安装或执行，不作为接口兼容性、停止可靠性或安全性证明。

不把前序未经当前核查的弃用日期、价格、产品市场份额、准确率或竞品评分纳入本次设计评分。官方文档会变化；实施依赖某版本接口时需固定实际安装版本并留证。

## 3. Codex 适配的特别约束

本轮官方 App Server 页面描述默认 stdio 传输、线程与回合、审批、流事件和 turn/interrupt；同时在传输相关段落对 app-server 命令和 WebSocket 的生产支持给出实验性/不支持生产工作负载警示。不能把“WebSocket 不用就已生产安全”作为结论。首期仍优先本地 Codex 和现有受控 OpenDesk 能力；后期先完成目标版本兼容、权限、取消、重连、凭据和事件归属验证，再决定启用范围。[5]

中断响应被受理不等于 OpenDesk 所有动作已停止；适配器与实际 Execution 分别收口。官方协议有审批能力也不替代宿主对目标账号、文件、发送内容等业务授权。

## 4. 可复核官方来源

[1] UiPath — About Processes：
https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-processes

[2] UiPath — Tools / Configure tools：
https://docs.uipath.com/autopilot/other/latest/user-guide/automation-properties

[3] Microsoft — Manage variables and the variables pane：
https://learn.microsoft.com/en-us/power-automate/desktop-flows/manage-variables

[4] SS&C Blue Prism — Processes and business objects（页面标示 2026-06-15 更新）：
https://documentation.blueprism.com/workhq/en-us/design-studio/processes-objects.htm

[5] OpenAI — Codex App Server；本轮原开发者文档链接重定向至官方 Learn 文档：
https://developers.openai.com/codex/app-server/
https://learn.chatgpt.com/docs/app-server

[6] OpenAI — Unlocking the Codex harness: how we built the App Server：
https://openai.com/index/unlocking-the-codex-harness/

方案评分、硬否决和测试矩阵只维护在 [验收合同](../quality/assistant-authoring-reuse-acceptance.md)，不从产品文档的功能介绍推导实际通过率。
