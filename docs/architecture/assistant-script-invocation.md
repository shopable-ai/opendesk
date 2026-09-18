---
title: "AI 助手：制作、复用与真实调用链"
description: "以本次任务和可选脚本资产为中心，复用官方 Codex harness、通用 Skills 与既有 Flow 执行体系；普通用户无需创建项目。"
---

# AI 助手：制作、复用与真实调用链

设计修订 v0.4，2026-09-18。源码核查基线：`master@a3ad21f2699f4b56db50dea959d5a20ba95f573e`；首次写入前 HEAD 已前进到 `31b1a1428d29a1427d79ed92aca393fb25b64b83`，目标文档 blob 未变。后续写入逐文件检查当前 SHA，不覆盖并行修改。

**本轮是设计、官方机制核验和文档纠偏，不修改生产代码，不搬迁源码或安装目录，不运行真实业务、模型、Runtime、构建或桌面测试。** 第 3 节保留历史调用链；第 4 节是本次有限范围源码核查，不是安装包验收。当前合同取代 v0.3 的“制作必须绑定用户项目／主工作区”，但保留开发者已有工程的可选关联。

## 0. 2026-09-18 当前生产实现状态

本节只记录当前 `master` 已写入的生产代码和可复现测试入口；它不把尚未运行的本机／桌面资格写成 PASS，也不改变后续章节保存的历史设计依据。

当前正式产品链已经加入：

- `assistant/task-contract.js`：任务为持久主身份，`projectId` 和 `sessionId` 均不是任务存在的前提；四类资产都可保存。revision 保存使用调用方 expected revision，加上 `File.writeNew` 独占 revision 文件，旧 revision 不再采用“读最新再覆盖”的方式静默成功。
- `assistant/task-runtime.js`：负责当前对话的持久任务、候选版本、接续、可信 use 预览和 confirmation registry。候选生成、候选另存和独立验证是三个分离状态；验证必须绑定当前 candidate digest、真实 executionId、criteriaId、observedAt 和 `passed`。
- `assistant/controller.js → session.js → task-runtime.js`：现有助手 UI 已增加“普通聊天／解释／使用／制作／改进”和“无资产／单 JS／自动化目录／已安装 Flow”入口。目录没有唯一入口时保存任务并明确澄清，不运行探测脚本。
- `File.writeNew`：候选另存和不可变 task revision 使用独占创建。目标已存在时不覆盖；父目录若解析为 symlink／reparse-point 别名，或授权核对期间目录身份发生变化，则拒绝。
- 单 JS／目录 use：App-owned 私有宿主先对真实入口做路径、real-file、目录边界和 script hash 核验；确认后再次核验 hash，结构化参数进入正式 `pkg/execution.Request.Input → Execution.input`。
- Installed Flow use：助手只持有 canonical installId；宿主从唯一 `flowinstall.Service` 获取 Catalog/RunLease，预览与执行前分别核验当前状态，最终 run 再绑定 archive/manifest digest；受保护源码不通过助手 inspection 暴露。
- confirmation：宿主侧 task runtime 保存 canonical input/inspection snapshot；一次性 token 在任何异步最终检查之前先消费，因此并发双击不能同时越过“未消费”检查。
- stop：UI 请求停止后先进入 `stopping`；AbortSignal 继续传到模型和 App-owned Execution。模型返回、Abort 发出或已有 executionId 本身都不单独证明业务已停止；迟到结果不会把新任务覆盖为成功。
- 正式加载与发行：`main.js` 已加载 TaskContract/TaskRuntime，`.release/app-mode-runtime-files.txt` 和 App Mode payload contract 已包含两者。

当前仍保持明确 BLOCKED／未完成资格的范围：

- 已关联 JS／目录的 **作者源码读取和“改进已有源码”** 尚未获得任务级 native 文件授权 owner；因此不会把关联路径、`readSource` 字段或 analysis-only Agent 自动升级为作者权限。当前 `improve` 源码通道会 fail closed。
- 目录候选的多文件事务回写没有可靠 owner；当前只正式支持单文件候选安全另存，不宣称目录原子回写。
- Runner → 助手的显式资产 handoff 动作尚未新增；当前四类入口来自助手本身。任务一旦建立只使用 task contract 中冻结的资产身份，不轮询 Runner 当前选择。
- Runtime 成功终态默认记录为 `execution-finished-unverified`；没有独立业务 observer 时不升级为业务成功。
- macOS/Windows 真实 App Mode、真实模型/Codex、真实桌面副作用与发行包视觉验收必须由当前 CI 和后续本机资格给证据；未运行前继续是 NOT RUN。

正式可重复测试入口：

```text
node --test tests/assistant/assistant.test.js tests/assistant/task-runtime.test.js tests/assistant/product-wiring.test.js
go test ./cmd/opendesk -run 'TestAppRecipeRunner' -count=1
./dist/opendesk -script tests/runtime-api/assistant-task-core.js -console-mode script
OPENDESK_RUNTIME_API_MODE=assistant-task-core ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

App Mode CI 在 macOS 和 Windows 构建完成后执行最后两条 Runtime 测试；测试未完成时，不以文件存在代替执行证据。

## 1. 一屏看懂最终方案

**用户只需要“本次任务＋可选关联脚本／自动化”。OpenDesk 按需准备任务资料；Codex 负责理解与制作；现有 OpenDesk 服务负责授权、实际操作、脚本运行与结果。**

```text
一句需求 / 一个 JS / 一份目录自动化 / 已安装 Flow
                         │
                本次任务＋可选资产引用
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   制作／改进                         使用已有自动化
        │                                 │
按需自动准备任务资料                 已确定资产或允许的 Flow 范围
        │                                 │
opendesk-author＋官方 Codex          opendesk-use＋必要时 Codex 选择
        │                                 │
获准 OpenDesk 操作＋同步留证          核对固定行为或真实业务参数
        │                                 │
A：第一次业务结果核验                宿主校验＋可信预览＋用户确认
        │                                 │
普通 JS 候选→B：独立验证             现有正式执行服务→实际结果
        │                                 │
明确保存／安装／启用 ───────────→ 唯一 Local Flow Catalog
```

普通问答、只读解释和已确定 Flow 的运行不强制创建制作目录。业务执行不经过 Skill 解释器；Flow Runner、CLI、计划中心运行已确定脚本不强制启动 Codex。普通固定顶层 JS 不为接入被强制函数化、参数化或复制进 Skill。

| 决定 | 边界 |
| --- | --- |
| 任务是主对象，资产可为空，开发项目可选 | 不创建轻量 projectId 来伪装“无需项目” |
| 两个通用 Skill：`opendesk-author`、`opendesk-use` | 是本轮选定的目标名称，不宣称已部署；不按每份业务脚本生成 Skill/profile |
| 近期使用官方非交互 `codex exec` 接缝 | 当前只读 Planner 保持隔离；作者通道单独受控，不开放 raw CLI 参数 |
| OpenDesk 只做任务、资源、权限、事件与执行接入 | 不重写模型循环、记忆、多 Agent 编排或第二 Runtime |
| Flow 安装、Catalog、信任、权益和执行继续复用 | 不创建 capability-catalog、capability-releases 或第二份业务实现 |
| 先低风险真实闭环，再富交互接入 | App Server 不是当前前置；无法实施权限限制的范围保持 blocked |

设计评分、五视角模拟评审和硬否决只有 [验收合同](../quality/assistant-authoring-reuse-acceptance.md) 一处权威；设计分数不是实现完成率。

## 2. 四类起点与用户入口

| 起点 | 用户提供什么 | 系统自动补什么、关联哪份内容 | 使用什么入口 | 源码与任务工作目录 |
| --- | --- | --- | --- | --- |
| 无资产 | 一句需求；必要时补目标对象、成功标准和副作用授权 | 创建本次制作任务，资产引用为空；按需准备材料、候选及进度 | AI 助手“制作自动化”或本地受管 Codex 入口 | 尚无源码；开始产生制作资料时自动建任务目录，不要求用户选工程 |
| 单个 JavaScript | 明确一个文件，以及解释／改进／运行意图 | 绑定该文件身份与摘要；按获准范围检查依赖和运行语义 | 关联文件后解释／改进；明确授权后可按现有直接脚本入口运行 | 只读该文件不隐含读取父目录；改进时才建候选目录；解释与一次运行不强制安装 Flow |
| 目录型自动化 | 明确目录；入口不明时由用户确认入口 | 受限清单、可识别 Manifest／明确入口、必要依赖和资源边界 | 关联自动化目录，选择解释／改进／使用 | 只读获准内容；不能随便挑一个 JS。改进按需生成候选树；不把目录当原生宿主插件 |
| 已安装 Flow | 明确 Flow，或授权助手在一定 Flow 集合中选择 | 从唯一 Catalog 解析 installId、内容摘要、可用状态和获准调用说明 | Flow Runner 进入助手或对话选择；确定后共用正式执行入口 | 日常运行不需要源码、不建制作目录；解释受保护 Flow 只看允许元信息，改进需另有合法可编辑来源 |

关联文件不等于运行授权，也不等于把文件发给模型。目录清单、入口识别和说明阶段零业务代码执行；不执行 `package.json` scripts、安装依赖脚本或不可信 preflight 来“探测用途”。静态分析无法确定入口、动态依赖、账号或固定对象时，先澄清或阻塞。

从 Runner 带入的资产以入口事件身份固定；之后播放器切换条目不能改变已建立的任务。已有开发项目可以提供来源、可读范围或调用过滤条件，但不成为普通用户入口的必填对象。详细规则见 [任务与资产绑定合同](assistant-workspace-bindings.md)。

## 3. 已保存的真实调用链：2026-09-16 源码快照

本节引用 `d7bfffacb59b5f5c557aa47561e4af262d37d86c`，完整 v0.2 可从 Git 历史查阅。历史名称、路径与限制用于定位，不自动代表当前发行包；当前有限核查见第 4 节。

### 3.1 当时正式助手的 Calculator 路径

```text
apps/opendesk/main.js
→ 从 Execution.scriptDir 加载 capabilities/calculator.js
→ OpenDeskAssistantTaskService.create({agent, calculator})
→ assistant/controller.js：send.click
→ assistant/session.js：submit → 保存 request/message 身份 → performRequest
  ├─ shouldHandle(text)=false → model-channel.send(messages) → 普通回复
  └─ true → task-service.plan(text)
          → Agent.run(codex / codex-analysis)
          → result.data：固定 JSON 参数 envelope
          → 宿主再次校验/冻结 → 可信预览 → 用户确认
          → task-service.execute → calculator.execute
          → pressAndRead / twoStage → 显示区读值 → 会话结果
```

当时实际业务文件是 `apps/opendesk/capabilities/calculator.js`；能力 `calculator.basic@1.0.0`，任务 `calculator.pressAndRead` 和 `calculator.twoStage`。不是用户目录检索，也不是模型本次生成 JS，更不由播放器当前选择决定。

固定 envelope 为 `schemaVersion/kind/task/buttons/multiplier/message`。第一段 firstResult 必须从实际显示区读取，再用于 multiplier × firstResult；模型不能提供 firstResult/expected。

当时的限制继续保留：路由依赖“计算器/calculator”与动作正则，中文“计算器”自身含“计算”，不能可靠区分否定、引用和解释；误路由不等于已经绕过确认。Planner 接本轮 text，普通聊天接 messages，不能据此证明通用任务续改已实现。session 的旧确认失效、重复确认与迟到结果保护仍是可复用资产。

Calculator 当时以相对 keyPoints 调用 mouse.clickForPID，Accessibility 用于读数，不是自动采用 UI.tapTexts 或 AX 按钮 invoke；适用范围为 macOS、确定应用身份、232×321 Basic 布局及相应容差。request/message 终态不等于完整 Run Record。“未运行 JavaScript”应纠正为“复用已有 JS，没有执行模型临时生成代码”。`examples/ai-workflows/chat-calculator/` 是另一套示例，不能以修改示例证明正式助手更新。

### 3.2 当时正式 Runner 的用户脚本执行路径

```text
scriptRoot：已配置 OPENDESK_SCRIPT_RUNNER_DIR 或 appDataRoot/recipes
→ Script Runner 选择 scriptPath
→ script-runner-simple.js 的 productCommand.run 适配
→ __opendeskRecipeExecution.run({scriptPath, workdir, logDir, signal})
→ cmd/opendesk/app_recipe_runner.go
→ production loader 读取 JS / 入口快照
→ pkg/execution.Run
→ 新 Execution.id / 状态 / 日志 / 取消
```

这是 App host 内的新 Runtime/Execution，不是 OS 沙箱。该接缝当时只接 `.js`，已有 BUSY、Recorder 冲突检查和取消；不能据此推断全部入口的桌面排他、业务 input/result、依赖完整性和受保护包均完成。后续复用当前正式执行 owner，不能另造助手执行器，也不因历史限制重做已经完成的 Flow 能力。

## 4. 本次源码核查：已有、历史、拟议与未验证

下表路径均在 `a3ad21f2699f4b56db50dea959d5a20ba95f573e` 读取。源码存在不等于测试通过；没有读取的集成接线不宣称不存在。

| 核查对象 | 可证明的现状 | 本轮不能据此声称 |
| --- | --- | --- |
| `apps/opendesk/assistant/task-service.js` | 仍是 Calculator 两任务、固定 schema、`codex-analysis` Planner 和 calculator.execute | 通用四类资产入口、作者态或自然语言 Flow Catalog 已完成 |
| `polyfills/008-ai-runtime.js` 的 profile 校验与选择、runCodex、runOwnedCommand | P0 只接受 analysis；使用 Command owner、stdin、exec JSONL、独立 invocation、read-only、skip-git、ephemeral、ignore-user-config；不传 CLI `--profile` | 已有受管作者权限、实时事件持久化、线程恢复、Skills/MCP 作者集成 |
| 同文件 resolveAgentSelection/pathWithin | allowedCwd 检查 CLI cwd，路径归一化及作用域比较 | 文件读取沙箱、符号链接边界或“选一个文件只能读一个文件”已经实现 |
| `docs/api/agent.md` | 公共字段和选择顺序；getCapabilities 不启动 CLI、不检验版本或真实登录 | configured/executableFound 等于 authenticated/available |
| `pkg/flowinstall/catalog.go` | 真实 Catalog、稳定安装身份、摘要、来源与 ready/needs-activation/blocked；原子记录写入 | ready 等于助手启用、业务资格或本次授权 |
| `pkg/flowinstall/authority.go` | 宿主已配置根下验证匹配身份、摘要、有效期与签名的来源证明 | 包内名称或公钥自动可信；源码阅读等于安全审计 |
| `cmd/opendesk/app_recipe_runner.go` | App-owned 新 Execution、入口快照、显式 WorkDir、取消及 BUSY；该接缝仅 `.js`，启用多种 native 能力 | 所有 Flow 只支持 JS；整个产品具备细粒度任意脚本沙箱或所有入口互斥 |
| `docs/frameworks/agent-to-recipe-skill-contract.md` | 既有方法和 TaskContract／Candidate／Qualification 交接；不强制所有短脚本创建全部工件 | `opendesk-author`、`opendesk-use` 已被官方 Codex 发现或安装 |

当前只读 Agent 的 JSONL 在 Command 返回后解析；不能把这个返回协议当作已经实现“操作时同步留证”的作者事件管线。现有 MCP/HTTP 服务是否满足任务级文件授权、工具限制及停止，仍须定向核查与反例验证。本轮没有本机 Codex 版本、认证、macOS/Windows sandbox 或生产 UI 证据。

## 5. Codex、Skills、profile 与 OpenDesk 的职责

| 对象 | 拥有的职责 | 不拥有的职责 |
| --- | --- | --- |
| `opendesk-author` | 制作／改进的方法入口；按需复用 Agent-to-Recipe、Human-to-Recipe、application-engineer 与既有成果合同 | 不复制业务 JS，不发放文件或桌面权限，不新建生产工作流引擎 |
| `opendesk-use` | 从允许范围解释、选择、核对固定行为／参数，提交受管调用意图 | 不隐式修改代码、修复现场、安装或升级作者权限 |
| OpenDesk Agent profile | OpenDesk 的 backend、可执行程序、认证引用、模型、预算、cwd 和已实现 policy 选择 | 不是官方 CLI profile；名字相同也不自动映射，不是任务授权 |
| 官方 CLI profile | 官方 Codex 配置层；由支持的 CLI 版本解析 | 不是用户资产、制作任务或业务 Flow |
| 官方 Codex harness | 模型循环、工具选择、上下文压缩及其官方线程机制 | 不拥有 OpenDesk 的安装身份、权益、本次业务授权或实际结果真相 |
| OpenDesk 接入层 | 准备最小上下文与工作资源，连接许可和工具服务，关联事件，停止并对账真实结果 | 不实现另一套通用 Agent、记忆、多 Agent 编排或脚本执行系统 |
| 关联资产 | 用户脚本／目录／录制／Flow 的受控来源、入口与版本引用，可为空 | 路径和关联不授权；源码根不等于 Agent cwd |
| 任务工作目录 | 候选、必要材料、进度、接续和证据 | 不是用户项目，不是安装树，不是必需的永久工程，不承载所有会话共用 cwd |

### 5.1 当前 OpenDesk 配置选择与官方配置不是一条链

源码已核验的 OpenDesk 选择顺序：显式 profile → 仅显式 backend 的内建 analysis profile → `OPENDESK_AGENT_DEFAULT_PROFILE` → `OPENDESK_AGENT_CONFIG` JSON 的 defaultProfile → `OPENDESK_AGENT_BACKEND` → codex。backend/profile 冲突失败，不回退。显式模型／预算按公开 API 覆盖其 profile 默认值；原始 args/shell/defaultArgs 不开放。现有实现仅支持 analysis，本文不提前发布 `policy: author` API。

官方常规配置优先级见 [Config Basics](https://developers.openai.com/codex/config-basic/)：CLI 覆盖 → 可信项目配置（越接近 cwd 越优先）→ 所选 profile 文件 → 用户配置 → 云端默认 → 系统默认 → 内建默认；管理员 requirements 另作强约束。官方 [Advanced Configuration](https://developers.openai.com/codex/config-advanced/) 明确：**0.134.0 起，`--profile NAME` 使用 `NAME.config.toml`，不再读取旧 `[profiles.NAME]` 表，也不支持旧顶层 profile 选择器。** 这是 2026-09-18 官方文档事实，不是对用户已安装版本的判断。

近期受管适配器不必采用官方命名 profile；优先将少量有类型的宿主配置编译成受控调用参数和配置，记录实际有效配置的来源／摘要，不记录秘密。确需 CLI profile 才按检测到的版本显式映射。不能借配置优先级覆盖管理员限制，不能暴露任意 `-c` 或 raw argv，也不以关闭 sandbox／审批完成接入。

### 5.2 官方能力核验与选型

以下仅是外部机制；访问日期均为 2026-09-18，官方页面可能重定向到 ChatGPT Learn。

| 官方依据 | 核验结论 | 本项目决定 |
| --- | --- | --- |
| [Non-interactive mode](https://developers.openai.com/codex/noninteractive/) | exec 支持 JSONL、结构化输出、显式 session 恢复及 skip-git 检查 | 近期用 exec；非 Git 任务合法，但 skip-git 不放宽权限；接续不用跨任务 `--last` |
| [Skills](https://developers.openai.com/codex/skills/) | 官方发现目录含 `.agents/skills`、用户及系统位置；可显式选择；同名并非身份保证 | 两个通用 Skill 由产品部署；记录解析路径、来源、版本／摘要，必要时禁隐式选择；仓库 workflows 文件存在不证明已被发现 |
| [AGENTS.md](https://developers.openai.com/codex/guides/agents-md/) | 有全局指导和 root→cwd 指令链；无项目根时检查 cwd | Agent 在受管目录启动，关联资产不自动成为指令来源 |
| [MCP](https://developers.openai.com/codex/mcp/) | 支持本地 STDIO／HTTP、工具筛选和 required server | 接获准 OpenDesk 工具；服务不可用即阻塞，不退回裸 Shell；筛选工具不是服务端授权 |
| [App Server](https://developers.openai.com/codex/app-server/) | 提供 thread/turn/item、交互审批及中断协议 | 真正需要富交互时使用，不作为当前本地制作的前置 |
| [Configuration Reference](https://developers.openai.com/codex/config-reference/) | 文件、网络、工具、配置发现有不同控制面 | cwd、read-only 或 CODEX_HOME 均不能单独证明最小读权限；必须验证实际边界 |

### 5.3 最小接入与安全加载

本地受管入口先准备任务和授权资料，再启动官方 Codex。普通用户不执行 git init、不手工复制 SKILL.md、不编辑内部配置。登录、官方 CLI 安装／受支持版本检查、两个 Skill 的部署与健康检查属于一次性设置；任务只引用设置结果。认证继续通过官方支持的凭据存储和交互，不把 auth.json、token 或模型账号凭据放进任务目录、提示词、Flow 环境或证据。

保留现有 analysis 通道。新增作者通道复用 Command/native owner 等既有底层能力，但只开放经过任务授权的 OpenDesk 文件视图、候选写入和实际操作工具。文件操作名称是职责，不是本文新增公共 API。没有任务级强制授权的通用 `run arbitrary JS` MCP 接口不能作为安全的替代品；细粒度权限无法实施时拒绝该范围，不用提示词冒充隔离。

第三方目录里的 AGENTS、`.agents/skills`、`.codex`、hooks、插件配置与 README 仅作为按需获准的数据；不能因关联自动加载为指令、启动脚本或受信工具。受管启动不得进入其发现根，也不得把这些文件复制进可发现命名空间。仅设置 CODEX_HOME 或 ignore-user-config 不足以证明隔离：还要核验 HOME 下 Skills、系统／管理员配置、hooks 与插件来源。有效来源无法枚举或限制时阻塞受管作者模式；不删除用户全局配置，也不绕过管理员要求。

Skill 采用产品维护的版本化方法源和自动部署副本，不形成第二份业务脚本；更新做来源／摘要检查，活动任务固定版本，升级后确认兼容再接续。方法引用的必要资料随产品交付，运行不能依赖 OpenDesk 开发仓库存在。解释源码可走现有只读模型通道；使用态即使采用同一 Codex，也不开放作者工具。

非交互 exec 只承担已授权的有界工作。遇到新增权限、高风险对象或未知副作用，宿主阻止操作并返回待确认／交接；不解析 TUI 屏幕或向 stdin 自动输入“同意”。未来需要连续审批、流式会话和 turn 中断时接 App Server；两种传输共用任务、许可和工具服务，不创建另一套业务状态机。

## 6. 固定流程、参数流程与资产边界

固定录制／顶层脚本是一等对象；无业务参数时合同只接受空对象。固定门店、收件人、动作和输出必须符合完整请求，要求门店乙时不能忽略限定运行门店甲。已明确文件的一次性直接运行保留现有入口；未达到自动匹配资格时不自动进入助手可调用集合。

参数仅在实际代码消费且验证过时开放；业务输入、机器配置、Secret 引用、定位常量、Observation 分开。预设引用版本和参数，不复制 JS。当前账号、窗口、剪贴板、日期等隐式输入也要按影响核验。不通过字符串替换代码、共享配置变量、临时模型 launcher 或任意 Shell 传参；缺少结构化 input/result 时扩展原执行 owner，不在设计文档虚构 API。

任务工作目录、源文件位置、entryPath、资源根、业务 execution cwd、可写数据和日志位置分别绑定。为了准备候选而改变 Agent cwd，不能改变业务相对路径、scriptDir 或输出位置。目录型资产只固定必要代码依赖；动态依赖不明、越界／符号链接或资源缺失则阻塞相应操作。安装内容仍为 `flows/<installId>/`，数据仍按既有 flow-data／flow-state owner 管理；安装树不是作者工作目录。

修改默认生成可审阅候选；回写来源需独立同意，比较原内容摘要和依赖变化，冲突保留候选与原文件。保存、安装、启用、运行分别授权，批量操作也必须逐项展示其效果；无隐式推出关系。最小记录、并行写入、资源冻结和清理规则以 [绑定合同](assistant-workspace-bindings.md) 为准。

## 7. 三段成功与一条可接续制作链

```text
目标／成功标准／文件与业务授权／预算
→ 可为空的资产引用；复用已有任务包、录制和有效证据
→ 按需自动准备任务资料，不要求项目
→ Codex 通过获准 OpenDesk 工具真实操作，同时留证
→ A：核验本次业务结果，不只接受模型“完成”
→ 提炼有效步骤与来源，去掉探索／错误／重复
→ 普通 JS 候选：固定或按需参数化
→ 冻结代码／依赖和标准，使用获准测试状态独立运行
→ B：脚本不靠 Agent 临时救场成立
→ 用户明确保存；按需要另外安装／启用
→ 新请求或明确选择，经预览和授权运行
→ C：选择、输入、执行版本与实际业务结果一致
```

Agent-to-Recipe、Human-to-Recipe 和 Existing Assets 复用既有合同，保留真实来源，不强制重录或从零生成。录制 refiner 静态通过不是业务资格，已有有效证据也不能改名成为一次新示范。完整新示范仍满足其全部适用阶段。

第一遍真实任务可能已经发送、写入或删除；验证前必须确定测试对象、去重／恢复方法及副作用授权。无法安全重复则只做允许的静态／局部验证并明确剩余缺口，不能把它记为独立业务 PASS。独立验证时作者工具不临时补做，候选不能热改，也不复用第一次结果冒充新 Observation。

## 8. 受管使用、安全、停止与真实记录

使用链：自然语言或明确选择 → 允许的 Flow 范围／已绑定资产 → 固定行为与参数核对 → runnable／clarify／blocked／Gap → 宿主校验内容、信任、权益、支持范围及环境 → 可信预览 → 本次确认 → 现有执行服务原子取得运行权并重查 → 实际 JS → Observation／验证／真实终态。

调用说明只是唯一 Catalog 的受控投影，不是第二安装库，不修改签名 Manifest。模型只提议允许集合内的逻辑身份和业务参数，宿主解析实际路径、摘要和许可。安装、信任、权益、业务资格、助手启用、本次确认分别判断；没有合适 Flow 不自动进入作者态。新增业务资产不修改 main.js 的业务分支。

停止先撤销继续发动作的权利，再通知 Codex 和 OpenDesk 活动 Execution；等两侧实际收口才显示 stopped。停止 Codex 进程不保证工具服务里的动作已停。断连／进程崩溃／已提交外部效果不能推断安全完成；保持 stopping 或 interrupted/unknown 并对账。迟到事件可归档到原任务，但不得复活运行、提交旧确认或污染新会话。BUSY 不设隐形队列。

记录关联 conversation/request/task、Codex call/thread/turn/item、Flow/候选摘要、授权及 Execution，实际工具事件不是模型总结。返回成功、读到结果、业务验证通过分别展示，未知结果不伪装成功。计划与实际轨迹分开，代码视图对应真实执行版本；受保护源码不因解释／日志／追溯泄露。日志、截图、参数默认本地最小化，必要模型外发另审，不用作 PostHog 原始事件字段。

App 内局部排他不证明外部 CLI／Recorder／Scheduler 全覆盖；独立 Runtime 不等于 OS 沙箱。当前未核验的跨入口权限和停止边界是放行门，不通过扩大 profile 或文案承诺补齐。

## 9. 分阶段推进：不重做已有 Flow 能力

| 最小实施任务 | 成功标准 | 本轮状态 |
| --- | --- | --- |
| T0：任务／资产／授权绑定 | 四种入口均无需 projectId；已有可选项目兼容；只读解释与已确定运行不建制作目录；原会话 UI 不重做 | 生产代码已接入；Node/发行资格待本轮证据 |
| T1：资源视图、候选与接续 | 单文件无父目录授权；多入口消歧；Agent cwd 与执行语义分开；回写冲突不覆盖；清理不丢唯一资料 | 单文件候选、revision、接续和安全另存已实现；目录事务回写与清理资格仍阻塞 |
| T2：本地受管 Codex 与两个通用 Skill | 一次性自动准备；核验 CLI／有效配置／Skill 来源；analysis 不扩权；任务级 OpenDesk 工具授权、实时留证和联合停止可验证 | 设计完成，兼容及隔离未验证 |
| T3：最小真实制作闭环 | 核心目录外固定顶层 JS 与实际消费参数的任务；至少一个非 Calculator；A/B 分开、无 Agent 救场、无重复业务、可中断接续 | 本轮不运行真实业务 |
| T4：已有 Flow 对话使用 | 相似候选、固定冲突、未激活、权限不足、旧确认均正确处理；C 闭环；不增加主程序业务 if/else；明确运行不依赖 Codex | canonical Catalog/RunLease/Execution 接缝已实现；真实安装 Flow App Mode 资格仍待运行 |
| T5：需要时接助手富交互 | 官方 App Server 的身份、审批、事件和中断与同一任务/授权/工具服务联通 | 后续可选，不阻塞 T0—T4 |

先完成 T0/T1 的离线合同与资源反例，再放行 T2 的低风险集成，之后做 T3/T4；相关既有 Flow 接缝可并行核验。未通过任务级工具授权和加载来源隔离，不开启真实作者操作。不要从零重跑已完成商业 Flow B0—B6，不建立新的实施管理平台。

Calculator 在通用路径真实通过后再迁为同路示例；本轮不搬文件，不迁移旧 golden 资格。新 API 实现并测试后才进入 docs/api。性能规模、更多应用和跨平台资格为后续扩展，不以合成检索实验冒充业务可用。

## 10. 文档地图、冲突与核查边界

| 内容 | 权威位置 |
| --- | --- |
| 一屏结构、四类入口、历史／当前核查、官方选型、最小实施顺序 | 本文，不另建平行总纲 |
| 最小记录、资产授权、工作目录、候选保存、接续与删除 | [绑定合同](assistant-workspace-bindings.md) |
| 作者来源、候选、独立资格、发布、运行与维修 | [生命周期](desktop-automation/task-capability-lifecycle.md) |
| 五视角模拟交叉评审、评分、硬否决、行为反例与未验证项 | [验收合同](../quality/assistant-authoring-reuse-acceptance.md) |
| 方法与工件复用 | [共享 Skill 合同](../frameworks/agent-to-recipe-skill-contract.md)、[Agent 工作流](../../workflows/agent-to-recipe/WORKFLOW.md)、[Human 工作流](../../workflows/human-to-recipe/README.md) |
| 既有安装／授权 owner | [Flow 分发模型](execution/flow-distribution-installation.md)、[商业交付台账](../plans/commercialization/subscription-entitlement-delivery.md) |
| UI 与阅读导航 | [对话工作台](conversational-task-workspace.md)、[assistant README](../../apps/opendesk/assistant/README.md) |

有界纠偏：旧文档中“制作绑定项目、一个主工作区、单 JS 必须有轻量项目”不再适用；开发者可选 projectRef、历史代码中的 project 字段、原有 UI 功能和有证据的历史调用链保留。旧 `.runtime/automation-authoring` 示例不是允许删除未完成资料的政策。旧研究记录或历史版本的 CLI/profile 语法不作为当前执行命令，采用本次官方核验并继续绑定实际安装版本。

仍保留的生产差距：当前 Calculator 专用 Planner；analysis-only adapter 与作者权限的差异；有效 Skills/hooks/config 隔离；文件及工具强制权限；增量事件、联合停止与跨入口仲裁；结构化业务输入输出／执行目录兼容；持久资料保护与安全清理。它们没有被本轮文档更新伪装成已实现。未验证项由验收合同逐项保留，不能用设计评分解除放行门。
