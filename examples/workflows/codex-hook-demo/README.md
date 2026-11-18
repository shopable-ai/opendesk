# OD-CODEX-HOOK-DEMO V1.2 — 独立创建任务能力

## 当前结论与范围（2026-11-04）

**阶段 2 / T03 阻塞，整体未完成。没有创建、预填或提交任何演示任务。**

最终目标仍是：Codex A → Hook 通知 OpenDesk → 官方客户端中的 B → B 完成通知 → 停止。
本轮只拆分、验证独立创建任务能力，不接 Hook，不建队列，不修改 Web Flow。
后续只有 T02/T03 通过后才能提交一次固定演示任务；不能以新 CLI agent 替代官方桌面关联。

当前 `master` / HEAD `98679755e8c91befef9b00706133a5f4e9273443`，本轮未创建分支、提交或推送，未 fetch。
两个仓库均有其他任务的未提交改动；Browser 同时有其他会话工作，不修改、不恢复、不重启它们。

原 Demo 七文件和原始 17/17 日志仍未找到，本机相关 Git 路径历史为空；现有目录原先只有上轮新增的 README。
历史阻塞记录保留于 `.runtime/tests/codex-hook-demo/audit-20261104T171906+0800/`。
这不阻止本轮按新授权补充 T02 的独立模块，但不表示恢复或重新实现了原 Hook Demo。

## 已执行调查与官方入口选择

本轮证据根：`.runtime/tests/codex-hook-demo/v1.2-20261104/`。以下均区分入口存在、调用接受、桌面显示和真实执行。

| 候选 | 官方支持 / 本机结果 | 项目与执行证明 | 界面、权限与安全停止 | 决定 |
| --- | --- | --- | --- | --- |
| Deep Link | 官方文档支持 `codex://threads/new?path=...&prompt=...`；本机 plist 注册了 scheme；没有打开链接 | `path` 选本地绝对目录，`prompt` 只设置 composer；无提交回执；本机归属未验证 | 通常可保留 App；必须实查空白/获准草稿、目标安装路径与回读；两个安装副本存在，不能只按 bundle ID 猜 | 优先保留为 T03 候选，可能需要 OpenDesk 完成提交；尚未选为合格实现 |
| App Server stdio | 安装版 schema 已生成；真实 initialize、thread/loaded/list、当前 thread/read 成功 | 可读当前聊天 ID/cwd；独立进程 loaded 列表为空。只证明历史可读；未调用 thread/start/resume、turn/start | 公共协议可用；没有证明与当前 Desktop 同一执行实例或新线程在客户端显示 | 不作为完整产品替代 |
| App Server proxy/daemon | help 提供公共 proxy；daemon version 返回 running/0.166.0；proxy initialize 在 12 秒 deadline 内未获响应并正常关闭（未留实测耗时） | 无创建/提交请求；不能推出提交未知，也不能推出桌面共享 | 不猜私有 socket framing，不重启/更新 daemon，不修改配置 | 本候选 BLOCKED；只保留证据 |
| 原生 App 工具 | list_projects/list_threads 成功；能区分本地与 ChatGPT 项目 | 本地 opendesk ID `b4cf3025-44d3-4089-9129-a94f4d9eb82a`；同名 ChatGPT ID `g-p-6aeae7d57c708191854792b1d3f03c62` | 当前聊天工具不是已经公开给 OpenDesk 的外部 API；没有调用 create_thread | 作为可信只读归属证据，不冒称 T06 外部入口 |
| OpenDesk UI | 现有 App/window/Accessibility/输入 API 与相邻插入模块存在 | 没有取得本轮目标窗口、草稿、输入框或新线程截图 | 当前 Computer Use 明确拒绝访问 com.openai.codex；不经其他 UI 技术绕过 | 当前现场 BLOCKED，未写未验证的按钮/快捷键方案 |

官方资料（2026-11-04 已实际获取）：[Commands](https://learn.chatgpt.com/docs/reference/commands)、
[App Server](https://learn.chatgpt.com/docs/app-server)、[Projects](https://learn.chatgpt.com/docs/projects)、
[Hooks](https://learn.chatgpt.com/docs/hooks)、[Developer commands](https://learn.chatgpt.com/docs/developer-commands)。
App Server 属实验接口；本机 schema 比照本机版本，不能用当前网页替换安装版本契约。
`turn/completed` 还需检查 turn.status，事件名称不证明成功。
CLI `/app` 是官方已保存会话接续方式，但未证明是可供 OpenDesk 独立创建的接口。

## T01 能力与权限矩阵

| 能力 / owner | 状态 | 实际依据与限制 |
| --- | --- | --- |
| 官方桌面安装与运行 | SUPPORTED | /Applications/ChatGPT.app，26.1027.61615 (24141)，com.openai.codex，OpenAI 签名，PID 22719；另有 ~/Applications 旧副本 |
| 安装版 CLI / schema | SUPPORTED | 0.166.0-alpha.5.1；schema/v1 与 v2，明确提供所需协议字段 |
| 独立 App Server 只读协议 | SUPPORTED | documented-stdio-probe.json；没有创建线程或启动回合 |
| 外部新线程在当前官方桌面显示 | NOT_TESTED | 共享历史读取不证明桌面显示 |
| public proxy 当前连接 | BLOCKED | initialize 超时；没有执行写方法 |
| Computer Use → 官方客户端 | BLOCKED | 工具原文：Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons. |
| OpenDesk → 目标窗口的实际读写 | NOT_TESTED | 本轮不以其他 UI 通道规避上述拒绝 |
| ChatGPT Project 通过 cwd 指定 | UNSUPPORTED | 本地目录与 ChatGPT Project 为不同产品对象，本脚本拒绝 |
| OpenDesk Runtime 的纯检查入口 | SUPPORTED | 文档一行命令已原样运行，File.realPath/stat 实际成功，Command enabled/supported；不控制目标 UI |
| 本次宿主的 AX / Screen Capture 快照 | SUPPORTED（只读权限检查） | 两项 granted；不等同于对目标 Codex 窗口读写获准或已验证 |

Codex/OpenCodex 负责代码和协议开发；OpenDesk 本地可信 Runtime 才承担其获准的桌面动作；
macOS 管理该具体宿主的权限；官方客户端负责线程和任务执行。更换开发工具不授予桌面权限，
静态 TCC 记录或另一个进程获权也不证明本入口可操作目标。
本轮未改 provider/model、Hook、凭据、应用签名、权限、daemon 或既有运行进程；只启动并关闭自有只读 probe/检查进程。

stdio 原始回执还包含 19 项配置被忽略的 configWarning，样例包括 auth_mode、disable_response_storage、features.child_agents_md。
本轮不修改这些个人配置。只读初始化/历史读取已成功；对未来写方法的影响仍未确认，不能外推兼容通过。
实际 probe 在 initialize 响应后发送过 initialized，但原始 JSON 日志漏记该发出通知；保留此留档缺口，不改写 raw log。
proxy 记录仅有无响应/退出，不把退出码 0 当连接成功。CLI 与 managed daemon 版本分别见 daemon-version.json。

## T02 项目识别与已落地的最小实现

源码：`project-target.mjs`。明确目标只支持以下形状：

```js
{ type: 'codex-local', path: '/absolute/existing/directory' }
{ type: 'projectless' }
{ type: 'chatgpt-project', projectId: 'g-p-...' } // 明确 BLOCKED
```

本地目标依赖显式路径 + 当前宿主 File.realPath + File.stat(directory)，输出 canonical workspacePath 与依据。
输出 App projectId 保持 null：文件系统失败保留 failurePhase 与可安全识别的 errorCode（宿主没有 code 时为 null），不复制可能含路径的异常消息。
目录身份不冒称已验证的桌面项目绑定。T02 的本地目录识别/拒绝前缀已验证；App projectId 联结和创建后的归属仍待 T03。
当前聊天的 App 元数据 projectId 为 null，即便 cwd 是 opendesk，也不把它说成已经属于本地项目。
只有原生 list_projects 返回的 type/id/path 才能证明已配置项目身份；其现场记录单独留证。

项目缺失、标题、最近使用、当前窗口、多个路径或猜测 projectId 均返回 PROJECT_UNKNOWN；
不可访问/不存在/非目录分别拒绝。不覆盖用户草稿，不改变前台窗口。
projectless 可以被识别，但 Deep Link 省略 path 未证明不会沿用最近项目，因此准备阶段 BLOCKED。
ChatGPT Project 即使同名、有 cwd 也拒绝，不宣称继承共享上下文。

`planCodexTask({ projectTarget, prompt }, File)` 只生成正确编码的 Deep Link 候选。
状态固定是 NOT_STARTED / PREPARATION_PLAN_READY，**不是 DRAFT_READY 或 SUBMITTED_VERIFIED**；
不执行打开、输入或提交。没有合格 T03 之前不增加假的 createCodexTask 成功入口。

## 最小实施与验证顺序

1. 先写目标识别/拒绝与 URL round-trip 回归测试，确认实现缺失时失败。
2. 只补 T02 和 T03 无输入计划模块；不建立适配器、通用 SDK 或提交框架，不新增依赖。
3. 由同一模块进入 OpenDesk 本地可信检查入口，验证真实文件系统与当前宿主只读权限报告。
4. 当前 T03 界面关联/草稿门禁不能通过，停止依赖输入；后续 T04/T05/T06 不提前实现或提交。
5. 独立审查与评分按实际完成范围，不用组件结果替代实机证据。

## 独立检查命令

从仓库根目录运行下面的一行命令。默认显式绑定**本脚本所在仓库根目录**，不跟随前台项目或进程 cwd；
使用固定无业务副作用的 DEMO_PROMPT，但仅生成计划，不向 Codex 发送任何内容。

```sh
./dist/opendesk -script examples/workflows/codex-hook-demo/inspect.mjs -console-mode script -log-dir .runtime/tests/codex-hook-demo/v1.2-20261104/opendesk-inspect-r2
```

组件测试（Node 维护验证，不是桌面验收）：

```sh
node --test tests/codex-hook-demo/project-target.test.mjs
```

本轮仅有 inspect.mjs 的检查入口，不是已实现的独立创建/提交入口；不要把此命令接入 Hook。
重复运行检查不会提交任务；这也不能算真实提交去重、未知恢复或草稿保护已经通过。
所有本轮日志、协议原始回执、schema、测试输出和审查资料保存在上述证据根，忽略规则沿用现有 `.runtime/`。

初版直接命令执行 ID：`direct-20261104-175550-458000`，检查脚本成功；评审后对错误诊断做小修，最终版见下述 r2 证据，业务状态仍为 NOT_STARTED。

业务模块在实际 OpenDesk Runtime 下另有 9/9 检查（非桌面验收），执行 ID `direct-20261104-175737-418000`：

```sh
./dist/opendesk -script tests/codex-hook-demo/runtime-project-target.mjs -console-mode script -log-dir .runtime/tests/codex-hook-demo/v1.2-20261104/runtime-project-target-r2
```

最终版执行 ID：`direct-20261104-180416-891000`、`direct-20261104-180417-683000`。

初版日志保持不变；最终版 `opendesk-inspect-r2/` 与 `runtime-project-target-r2/` 都保留 stdout、summary、script snapshot 和 events。
ESM summary 的 script_hash 是链接 payload 的 hash；源码本体另在 verification.json 留 SHA-256，二者不混用。

## T01–T06 进度

| 任务 | 源码/证据与当前状态 | 未完成 |
| --- | --- | --- |
| T01 能力发现 | 调查已完成；官方原生 stdio 只读成功，UI BLOCKED；host.json / schema / 协议记录 | 无桌面操作资格 |
| T02 项目识别 | project-target.mjs，组件 10/10；本地类型/目录与 projectless 分类、ChatGPT 拒绝 | OpenDesk 一行命令和真实 Runtime 9 项检查通过；桌面项目绑定未验证 |
| T03 准备新对话 | 仅静态准备计划已实现；BLOCKED | 实际打开、项目一致、草稿、输入框、DRAFT_READY |
| T04 填写校验 | NOT_STARTED（依赖 T03） | 原生值回读与目标保持 |
| T05 单次提交 | NOT_STARTED（依赖 T03/T04） | thread/turn 身份、执行事件、项目、未知持久化、一次性提交 |
| T06 独立创建封装 | NOT_STARTED；只有独立检查脚本 | 实际 createCodexTask 及 Fresh Run，尚不能接 Hook |

## 测试矩阵

| 场景 | 代码/组件验证 | 当前实机验证 |
| --- | --- | --- |
| 普通独立对话 | 显式识别；未证明无 path 语义，准备拒绝 | 未打开/未提交 |
| 当前项目内新对话 | 显式目录与 URL 验证 | 仅只读 App 项目目录与现有 thread/cwd；未创建 |
| 从一个项目到另一个 | 两个明确目录的身份不同，无当前窗口 fallback | 未切换 |
| 多项目、当前未知 | PROJECT_UNKNOWN | 原生项目目录确实有多个；未执行选择 |
| 已有未发送草稿 | 没有输入调用，计划保持 NOT_STARTED | 无草稿观察；不声称保护测试通过 |
| 非目标窗口前台 | 计划不依赖窗口 | 未做输入或切换测试 |
| 缺 Accessibility | 目录识别不依赖 AX；目标桌面路径尚未实现 | 只读权限快照；没有撤销权限进行负向实测 |
| 动作返回未知 | 没有动作路径；未来必须 SUBMISSION_UNKNOWN 并禁止重试 | 未制造动作，不声称未知提交测试通过 |
| 重复创建请求 | 重复规划结果一致且保持 NOT_STARTED；无动作依赖另由源码审查确认 | 真实创建去重尚未实现/验证 |

## 独立审查

五个独立代理分别评估整项请求的验收准备度；不是实机通过评分，未完成能力不以高分补足。

| 维度 | 独立审查者 | 分数 | 主要缺口 |
| --- | --- | --- | --- |
| 官方接口选择与兼容性 | Bacon | 58/100 | 新线程的 Desktop 关联、alpha/daemon 连接语义未验证 |
| 项目识别正确性 | Helmholtz | 78/100 | 目录识别已验证，真实 App 项目绑定未验证 |
| macOS 桌面自动化可靠性 | Kant | 40/100 | 无 T03 实窗/草稿/输入框证据 |
| 权限、安全和未知提交保护 | Kierkegaard | 75/100 | 当前前缀安全；未来未知状态持久化、去重和负向门禁未实现 |
| 代码复用、测试质量和最小实现 | Galileo | 70/100 | 两项代码意见已修复复核，独立创建本身仍未实现 |

**平均 (58 + 78 + 40 + 75 + 70) / 5 = 64.2/100。未通过 95 分门槛；安全维度也未达 95，整体不能交付为创建能力。**
详情在 expert-reviews.json。前四份评审基于 r1；第五份定向复核 r2，关键桌面阻塞项未变化。
评审指出的证据索引/README 同步已补齐，原始日志未伪补，未因此自动上调评分。

## 唯一下一步

在允许访问官方客户端的独立执行环境中，沿用本轮明确的本地项目目标，
只验证 T03 的 Deep Link → 正确安装副本/项目 → 不覆盖草稿 → 输入框内容回读并保留实窗证据。
T03 通过之前不提交任务；不能为补证据把当前工具的明确拒绝转经 OpenDesk 或其他 UI 技术执行。
如官方接口能直接证明桌面归属与可见性，复用该入口，不再另造 UI 方案。
