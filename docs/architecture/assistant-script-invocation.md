---
title: "AI 助手：生产调用链、脚本关联与匹配演进"
description: "基于真实 master 源码解释提示词如何到达 Calculator JS；区分当前实现与待实施的调用追踪、能力注册、精准匹配和用户脚本接入。"
---

# AI 助手：生产调用链、脚本关联与匹配演进

核查日期：2026-09-16。
源码基线：`master@8e74b707fc8665ba02624cd545f767cc20458608`。
状态：**生产调用链源码核查记录 + 待实施改进建议**；不是新增能力已经实现或真机验收通过的证明。

本次交付只增加文档与源码目录导航，没有修改生产 JS、模型配置、Runtime API 或测试。没有运行 Codex、Calculator、macOS/Windows UI 或仓库测试；未核对用户本机当前进程实际加载的文件，因此“仓库当前实现”和“本机正在运行的实现”不能自动画等号。

## 1. 先回答：输入提示词后到底生成了什么

当前正式 AI 助手不是每次生成一份新的 JavaScript 再执行。实际是：

```text
自然语言
→ 固定路由规则判断是否进入 Calculator 任务分支
→ Codex 生成受约束的 JSON 任务参数
→ 宿主校验、复制冻结、生成执行预览
→ 用户确认
→ 调用已随产品加载的 Calculator JavaScript 能力
→ 真实桌面按键和 Accessibility 读数
→ 会话展示结果
```

三种东西必须分开：

| 对象 | 当前来源 | 是否本次由模型生成 |
| --- | --- | --- |
| 自然语言回复 | 普通聊天模型通道，或任务状态/结果文案 | 聊天回复可能是；宿主结果文案不是 |
| 任务参数 envelope | `assistant/task-service.js` 调用受控 `Agent.run()` | 是，随后还必须通过宿主校验 |
| 实际桌面操作程序 | `apps/opendesk/capabilities/calculator.js` | 否，是预先存在并加载的普通 JS |

**生成参数不等于生成代码；选中任务不等于获准执行；显示“完成”不等于已经独立验证业务结果。**

## 2. 文档所有权：不再增加互相矛盾的设计总纲

本文拥有正式 AI 助手的源码调用地图、当前事实与缺口、调用可见性和分阶段改造入口。

- [对话工作台](conversational-task-workspace.md)：用户体验、会话产品和代码可见性的产品合同。
- [Conversational Task Runner](conversational-task-runner.md)：`examples/ai-workflows/chat-calculator/` 示例的历史实现、合同和验收记录，不应当作正式助手当前源码的唯一导航。
- [Automation Capability Lifecycle](desktop-automation/task-capability-lifecycle.md)：Runtime / Catalog / Authoring、Candidate / Qualification / Publish 的唯一跨层总纲。
- [共享 Skill 合同](../frameworks/agent-to-recipe-skill-contract.md)：已有任务合同、候选、应用画像、资格与交接结构；本文不复制一套新权威 schema。

本文第 3—5 节是上述 SHA 的源码事实；第 6—10 节是实施建议，尚不能作为已发布 API 使用。既有文档里更早的“下一轮只做聊天”等阶段描述应按其日期理解，不能覆盖本次源码事实。

## 3. 正式入口到执行器的真实调用链

### 3.1 应用启动和模块加载

源码：[main.js](../../apps/opendesk/main.js)。

```text
apps/opendesk/main.js
  ├─ 从 Execution.scriptDir 加载 capabilities/calculator.js
  │    └─ globalThis.OpenDeskCalculatorCapability
  ├─ 加载 assistant/store.js
  ├─ 加载 assistant/model-channel.js
  ├─ 加载 assistant/task-service.js
  ├─ 加载 assistant/session.js
  ├─ 加载 assistant/controller.js
  ├─ OpenDeskAssistantTaskService.create({ agent, calculator })
  └─ OpenDeskAssistantController.create({ appDataRoot, taskService })
```

当前加载使用 `File.read(...)` 和间接 `eval` 安装产品自有模块。它不是执行模型生成内容，也不是从用户自然语言中获取脚本路径。这里描述事实，不把 `eval` 本身当作安全隔离证明。

实际根路径来自当前 App Mode 的 `Execution.scriptDir`。仓库源文件更新不证明安装目录、副本或旧进程已经更新；调用详情必须最终记录实际 package root、加载文件及加载时内容身份。

### 3.2 点击发送、分流和规划

源码：[controller.js](../../apps/opendesk/assistant/controller.js)、[session.js](../../apps/opendesk/assistant/session.js)、[task-service.js](../../apps/opendesk/assistant/task-service.js)。

```text
controller.bindWindow(): send.click
→ 读取 composer 的 text
→ session.submit(text)
→ store.beginRequest(): 先保存会话/请求/消息身份
→ session.performRequest(entry, messages, text)
   ├─ taskService.shouldHandle(text) == false
   │    → performChatRequest()
   │    → model-channel.send({ messages, signal, requestId })
   │    → 普通聊天回复，不进入 Calculator execute
   └─ taskService.shouldHandle(text) == true
        → performTaskRequest()
        → taskService.plan(text, { signal, requestId })
        → Agent.getCapabilities({ backend: 'codex', profile: 'codex-analysis' })
        → Agent.run({ backend: 'codex', profile: 'codex-analysis',
                      prompt, output: native JSON schema, signal,
                      timeoutMs: 120000 })
        → result.data
        → freezeEnvelope() / validateTaskEnvelope()
```

`Agent` facade 的源码入口是 [polyfills/008-ai-runtime.js](../../polyfills/008-ai-runtime.js)，它复用 execution-owned `Command` 进程 owner，不是在助手中另造 CLI executor。本次对该 facade 仅核对入口与所有权声明，不替代当前本机 CLI/profile 的完整安全或兼容性验收。

重要边界：当前任务规划使用固定 Codex profile。普通聊天通道与任务规划通道是两个职责；聊天能够回复，不足以证明 Calculator Planner 配置可用。

### 3.3 当前路由到底怎样匹配

`shouldHandle(text)` 要求同时满足：

```text
出现“计算器”或 calculator
AND
出现动作/计算关键词或特定算式文本
```

动作正则包含 `打开 / 使用 / 运行 / 执行 / 自动化 / 点击 / 按键 / 按下 / 实际 / 真实 / 显示区 / 计算 / 算一下 / 乘以 / 加上 / 减去` 等。由于“计算器”自身也含“计算”，这条规则对中文提及的语义区分尤其有限。

以下是依据正则推导的路由行为，不是本次真实模型或桌面测试结果：

| 输入例子 | 当前路由 | 暴露的问题 |
| --- | --- | --- |
| 用计算器计算 25 × 4 | Calculator Planner | 正常的固定能力入口 |
| 帮我算 25 × 4 | 普通聊天 | 没有应用名，不会自动进入桌面任务 |
| 不要打开计算器，只解释怎么运行 | Calculator Planner | 正则不理解否定；后续规划/确认仍是安全门 |
| 把乘数改成 7 | 普通聊天 | 不具备通用的结构化任务续改路由 |
| Calculator 的历史是什么 | 普通聊天 | 英文应用名本身不满足动作正则 |

**路由命中不等于已经错误执行。** 后续 Planner、宿主校验和用户确认仍存在；不能把正则误路由描述成已经发生未经确认的桌面动作。

当前 `performTaskRequest()` 传给 `plan()` 的是本轮 `text`，不是 `messages`。聊天有历史，不代表 Calculator 规划已经拥有结构化多轮任务上下文。若等待确认时提交新消息，`submit()` 会先取消旧任务和旧确认，再建立新请求；后一句没有应用名时，可能转入普通聊天。

### 3.4 参数、确认和执行

当前只开放两个逻辑任务：

```text
calculator.pressAndRead
calculator.twoStage
```

已有两阶段参数形状：

```json
{
  "schemaVersion": 1,
  "kind": "task",
  "task": "calculator.twoStage",
  "buttons": ["2", "5", "×", "4", "+", "1", "0", "="],
  "multiplier": "6",
  "message": ""
}
```

这里没有脚本路径、JS 源码、坐标、`firstResult` 或 `finalResult`。示例参数不是一次实际运行的证据。

```text
session 再次复制并冻结通过校验的 envelope
→ taskService.preview(envelope): 宿主生成真实动作预览
→ awaitingConfirmation
→ controller 的 confirmTask.click
→ session.confirmTask(taskId): 检查当前任务和重复确认
→ taskService.execute(envelope, { signal, requestId, onProgress })
→ calculator.execute(envelope, context)
   ├─ calculator.pressAndRead → pressAndRead(...)
   └─ calculator.twoStage     → twoStage(...)
```

当前关联是**已加载对象引用 + 白名单任务 ID + 显式函数分支**，不是文件名搜索，也不是 Script Runner 中选中了哪个文件。

`session` 里当前 `taskId` 取 `requestId`，而 `envelope.task` 是逻辑任务类型。不要在日志或后续设计中把两者混为同一种 ID。

### 3.5 Calculator 真正怎么操作

源码：[capabilities/calculator.js](../../apps/opendesk/capabilities/calculator.js)。

当前声明：`capabilityId = calculator.basic`、`version = 1.0.0`、`codeRef = apps/opendesk/capabilities/calculator.js`。

```text
openCalculator()
→ 检查 darwin / 启动 com.apple.calculator
→ 要求唯一目标窗口，核对应用路径、标题和 232×321 Basic 布局（容差 2）
→ 每次按键前重新检查当前窗口身份、焦点和几何
→ 使用已存相对 keyPoints 与当前窗口几何换算点击点
→ mouse.clickForPID(...)
→ Accessibility.snapshot(...)
→ 唯一数字 staticText + 连续两次相同读数
```

因此，**当前正式 Calculator 的按键动作仍是相对坐标点击；Accessibility 用于结果读取。** 不能因为框架其他接口增加了 AX 定位，就声称此执行器已自动迁移到 AX 按钮 invoke 或 `UI.tapTexts()`。

两阶段执行实际是：

```text
clear 两次
→ 第一段 buttons
→ 真实读取 firstResult
→ 要求 firstResult 是可重新输入的 1–12 位非负整数字符串
→ 由 multiplier 和本次 firstResult 构造第二段按钮
→ 再次 clear 两次
→ 第二段按钮
→ 真实读取 finalResult
```

有真实读数和输入依赖检查，不等于独立证明每次点击均成功、读数一定是新值、或全部自然语言目标都已满足；这些需要另外的结果验证和 live 证据。单阶段任务也不能仅凭“读到一个数字”替代业务正确性验收。

整个 OpenDesk 支持多个系统，与这个具体 Calculator 能力当前仅声明 macOS 范围，是两件事；不能把此能力的范围扩大成 Windows 已验证。

### 3.6 结果、停止和历史

`session.performTaskRequest()` 将执行结果传给 `taskService.resultText()`，再通过 `store.transitionRequest()` 保存结果文字/状态/错误。运行中完整 `taskState` 保存在活动请求内存中。

[store.js](../../apps/opendesk/assistant/store.js) 的当前 request/message 事件可以保留会话和终态，但没有持久的候选清单、选择原因、精确代码摘要、完整参数绑定与逐步运行轨迹。聊天历史不是完整的执行审计记录。

当前 `AbortController` 经 session 传入 Planner 和 Calculator；确认失效、重复确认和迟到结果都有处理。单次已提交的原生点击不能承诺撤销。此助手的单活动请求约束，也不能据此推断为已建立跨 Script Runner / Recorder / Scheduler 的全局桌面排他。

当前 Calculator 是在 App 已有 JS 上下文中调用模块，不是给每个 Calculator task 创建一个独立子 Execution。后续增加应用层 `runId` 应与宿主 `Execution.id` 分别记录，不能伪造一对一关系。

## 4. 优化时应修改哪里

| 需要改什么 | 正式源码入口 | 不应误改的对象 |
| --- | --- | --- |
| 哪些文本进入自动化 | `assistant/task-service.js`: `shouldHandle()`；`assistant/session.js`: `performRequest()` | 只改示例 Planner，期待正式助手变化 |
| Codex 提示词、输出参数和校验 | `assistant/task-service.js`: `buildPlannerPrompt()`、`plan()`、`validateTaskEnvelope()` | 让模型生成路径/JS 绕过白名单 |
| 确认、取消、多轮修订 | `assistant/session.js` | 把聊天历史当作执行授权 |
| 展示调用程序、参数和结果 | `assistant/controller.js` | 展示模型重新写的“等价代码”冒充实际源码 |
| 历史调用事实和关联 | `assistant/store.js` 及拟建运行记录服务 | 只保存最终一段文字 |
| 计算器点击、定位、读数 | `capabilities/calculator.js` | 以为已自动调用某个 golden 或 `UI.tapTexts()` |
| 模块加载和生产接线 | `apps/opendesk/main.js` | 只改 repo 文件而不核验实际加载目录/旧进程 |

不要修改 `examples/ai-workflows/chat-calculator/` 后就声称正式助手已修复；示例与生产能力是不同文件。共享逻辑后续可以收口，但应显式处理测试和来源关系，不能借本次文档核查静默重写黄金样本。

## 5. 当前缺口，不夸大也不掩盖

| 项目 | 已有 | 尚缺 |
| --- | --- | --- |
| 固定任务调用 | 两个 task、固定 Calculator 对象 | 可扩展的可信 Catalog / Resolver |
| 参数安全 | schema、白名单、表达式和数量约束、确认冻结 | 业务意图一致性、逐参数来源、结构化澄清续改 |
| 代码身份 | 内置 definition 中有 id/version/codeRef | 实际加载字节/依赖闭包摘要、可核对运行记录、发布资格引用 |
| 可解释性 | 动作预览和部分结果文字 | 为什么选它、排除了谁、实际入口和版本、查看实际代码 |
| 历史 | request/message 及终态事件 | 不可变 Run Record、阶段事件、观测和证据引用 |
| 用户脚本接入 | 此正式助手路径里没有通用接入 | 导入、候选冻结、独立验证、明确发布和撤销 |
| 多文件规模 | 当前不是从大量文件选脚本 | 正式描述符索引、去重、冲突诊断、检索评测 |
| 平台范围 | 当前执行器明确检查 macOS | 每个新平台/布局/输入域对应的资格与适用选择 |

`resultText()` 当前有“未运行 JavaScript、Shell、路径或任意脚本”的文案。它应在后续代码修改时改为：

> 本次复用了已加载的 Calculator JavaScript 能力；模型只生成任务参数，没有执行模型临时生成的代码或任意脚本路径。

当前定义中的 `version`、`codeRef`、变量名和预览中“已资格化”字样，本身都不是精确候选已完成独立资格验证的证据。

## 6. 改进建议一：先让每次调用可见、可追溯

这一批不应等待通用目录完成。先把当前唯一 Calculator 调用展示清楚，但不要给内置能力补造不存在的 candidate/qualification/hash。

对话中保留简洁任务卡，详情按需展开，不增加必需的任务库页面或参数表单：

```text
复用已有程序：Calculator Basic · 1.0.0
本次任务：两阶段计算
执行来源：已加载的内置 JavaScript 模块
第一段：25 × 4 + 10 =
第二段：6 × [本次显示区实际读取值] =
状态：等待确认 / 运行中 / 已停止 / 完成 / 失败

详情：匹配依据｜参数来源｜实际代码｜步骤与结果
```

这是建议 UI 文案，不是已完成界面。代码查看必须对应实际执行内容：

- 记录实际 packageRoot、模块加载路径和加载时摘要，而不是运行结束后重新读可能已变化的文件。
- 已有 bundle 则记录实际 bundle 和来源关系；源码视图不能冒充 bundle 本体。
- 显示真实入口函数和参数；不把模型生成的伪代码当作“实际执行代码”。
- `.odpkg` 等受保护内容按现有保护/许可边界展示元信息，不因“查看代码”解密或泄漏源码。

拟议 Run Record 最小信息组（字段名不是已发布 API）：

| 信息组 | 内容 |
| --- | --- |
| 关联 | conversationId、requestId、应用层 runId、宿主 Execution.id、任务类型 |
| 路由 | chat/task/authoring 的判断依据和结构化原因；规则版本 |
| 匹配 | 本次候选、排除原因、选中能力、显式约束；目录快照身份 |
| 执行身份 | capabilityId/version、Candidate 引用、实际模块/依赖摘要；尚不存在的项明确未建立 |
| 输入 | 已冻结参数及来源：本轮消息、明确澄清、已验证 observation；敏感值脱敏 |
| 授权 | 宿主预览、确认绑定、权限与环境检查；不能从日志重新获得执行权 |
| 过程 | 有序事件、当前步骤、最后确认副作用、取消/失败边界、耗时 |
| 结果 | 真实 observation、独立验证状态、错误、证据引用 |

规则：记录结构化选择证据与验证结果，不索要或保存模型隐藏思维链。模型解释不作为宿主验证事实。

记录区分 `observed / verified / failed / unknown` 等语义；“执行返回”与“业务结果验证通过”不得混为一项成功标记。

持久化需要兼容旧会话 schema、原子提交/恢复和保留策略。产品记录随现有 appDataRoot 管理；测试日志、截图和一次性运行证据仍归 `.runtime/`，不提交仓库。敏感 prompt、参数、源码和截图默认按最小暴露原则处理；日志不要自动外发。

## 7. 改进建议二：程序的关联单位是能力，而不是文件名

继续复用生命周期总纲的四个对象，不新增一套平行 Program/Skill 注册体系：

```text
CapabilityDefinition：它能做什么、需要什么输入、支持哪些范围
        ↓
CandidateManifest：精确代码、依赖闭包和 Definition 身份
        ↓
QualificationRecord：哪个候选在哪些条件下验证过
        ↓
CatalogEntry：哪个候选被明确发布、允许发现、是否撤销
```

内容引用保持无环：Definition 不回指 Candidate；Candidate 不回指 Qualification；CatalogEntry 汇总引用。模型只能提议逻辑能力与参数，实际版本、模块路径、导出、权限、资格和代码摘要由宿主解析并固定。

当前 `calculator.basic` 与两个 taskIds 不必立刻重命名；先通过适配器保留兼容，再决定如何表达多个 operation。不能在未验证的情况下把原来受限的两个任务合并成任意数学能力。

文件与能力不是一对一：一个任务可以依赖多个 JS 文件；多个能力可以使用同一受版本约束的模块；helper、测试、备份、旧版本不是可调用任务。**只有明确发布的 CatalogEntry 参与选择，不扫描所有 `.js` 后逐个猜用途，更不能 import/eval 文件来探测元信息。**

用户接入已有脚本的目标流程：

```text
作者侧显式选择已有 JS / Recorder 产物
→ 明确业务用途、参数、输入输出、应用和平台范围
→ 识别顶层副作用，必要时提取为可调用模块
→ 冻结 Definition + Candidate + 依赖
→ 独立验证输入范围与实际效果
→ 用户明确发布到本地可信目录
→ 助手可发现
→ 新的运行预览和确认
```

这不是当前已提供的导入按钮或命令。本地 Codex / Recorder 和既有 Agent-to-Recipe / Human-to-Recipe 工作流继续负责作者态；发布不自动执行原请求，不继承开发前的旧确认。

普通开发者仍可按现有 Script Runner 方式运行自己的脚本；“能在 Runner 里运行”和“允许助手自然语言自动选择”是不同授权层次，不要求将所有普通 JS 都强制纳入 Catalog。

## 8. 改进建议三：精准匹配采用分层解析，不堆更多关键词

目标运行链：

```text
本轮消息 + 明确绑定的当前任务上下文
→ 分清聊天 / 执行已有任务 / 请求生产新能力
→ 保留用户的应用、对象、动作、输入和禁止事项
→ 查询有权访问的已发布能力描述符
→ 相关候选召回与当前可用性判定
→ 少量候选之间的语义选择和参数提议
→ 宿主严格校验 / 澄清 / 阻塞 / 能力缺口
→ 精确绑定版本、代码、依赖、范围和参数
→ 可信预览与确认
→ 当前环境再次检查
→ 执行、观测、验证、记录
```

### 8.1 先约束，再排序

用户明确指定的应用、业务对象、动作、禁止事项和已明确选择的任务不能被相似度覆盖。平台、权限、发布状态、资格范围等由宿主判断，不由模型自报。

要区分“相关但被阻塞”和“不存在”。例如一个任务需要尚未授予的权限，应报告阻塞；不能把它过滤得无影无踪，再选择语义更差但可运行的另一项。未经授权的目录条目本身不应泄露给模型。

名称/别名只能帮助召回，不能提供执行身份；正式身份需要稳定的命名空间和 ID。重名可以展示作者/来源/应用进行区分；同一个 ID+版本绑定不同内容必须拒绝或隔离，禁止 last-write-wins。已选能力变为不可用时明确失败，不悄悄替换。

### 8.2 小目录先做简单、可测试的索引

先用可信本地描述符的名称、应用、描述、关键词、正例问法和容易混淆的反例做可复现召回；不必为两个能力先建立向量数据库或远程 Registry。

规模扩大后再根据实测引入词法检索与语义检索的组合，仅向模型加载少量相关候选的完整合同，而不是发送所有源码。Top-K、阈值和排序差距属于待评测参数，不能把随意设定的数字当成准确率保证。

缓存绑定目录 revision 和描述符摘要；新增、修改、撤销后使缓存失效。备份文件、测试文件和源码目录增长不应自动扩大能力集合。

### 8.3 允许不选，比强行第一名更重要

候选唯一也不意味着必定适用。相近候选应在当前对话内用简短选项消歧；缺参数就问缺项；相关但不满足条件就阻塞；确实没有能力才产生 Gap。

不强制添加独立脚本选择器。对话内必要的候选澄清是一次请求的交互，不是把助手改成任务商城或参数表单。

用户询问、否定、引用、假设或要求“只解释”时，不应仅因为文本里出现工具名和动词就进入执行授权。高相似度、模型自报 confidence、热门程度或过去成功记录，都不能绕过确认和硬约束。

### 8.4 参数必须有来源，修改必须有新版本

参数提议通过 schema 只证明结构合法。例如用户要求乘以 6，模型提议 7 仍可能通过数字格式校验；需要展示关键参数与来源，并评测语义一致性。

“把乘数改成 7”应绑定当前对话中明确的任务 draft/revision，而不是重新只按这一句话匹配整个库。修改后旧预览和确认失效；不能从别的会话借参数，也不能把任意历史数字当作执行输入。

跨步骤值应绑定已验证 observation 引用及具体 run/step/field；当前两阶段 Calculator 内部读取 firstResult 的规则保持不变。自然语言里“刚才结果”不能直接成为可信结果引用。

### 8.5 匹配不能承担运行隔离的职责

新增能力前还要复用/补齐现有 Runtime 的取消、超时、桌面排他和副作用边界。宿主级策略不是 description 里的声明，也不是靠提示词能保证。

索引 metadata 不自动执行不可信脚本；描述符不能自授权限。实际第三方代码的可信安装、允许来源与现有执行边界需单独审查，不能把普通 JS 同进程模块称为沙箱。

## 9. 实施顺序和当前粒度任务树

```text
A. 当前调用可见性（第一批）
   A1. 更正“未运行 JavaScript”的误导文案
   A2. 展示当前 capability/task、真实模块入口、参数和实际读值
   A3. 记录请求/run/加载来源及结构化事件，兼容旧会话
   A4. 区分 observed 与 verified，不伪造 hash/资格或结果
   A5. 补齐 JS 合同、持久化、迟到事件、渲染测试

B. 最小可信目录与通用解析（第二批）
   B1. 按现有生命周期合同实现最小本地 Catalog 与只读描述符
   B2. 冻结候选/依赖，接入独立资格和发布/撤销门
   B3. 将现有 Calculator 通过兼容适配器接入，不扩大原范围
   B4. 建立 Resolver 的选中/澄清/阻塞/Gap 结果
   B5. 测试增删条目、重复身份、过期版本、伪造路径和替换攻击

C. 自然语言和多轮正确性（第三批）
   C1. 区分请求执行与解释/否定/引用/作者态
   C2. 建立参数来源和同会话 task draft/revision
   C3. 候选消歧与缺项澄清，修改使旧确认失效
   C4. 在有限目录上评测后再优化召回和模型提示词

D. 用户脚本接入（第四批）
   D1. 对接 Existing Assets / Recorder / 既有作者工作流
   D2. 安全导入、明确业务合同、冻结依赖和独立验证
   D3. 发布、更新、停用、撤销；从不自动重跑旧请求
   D4. 给开发者提供与实际接口一致的接入文档

E. 规模和质量门（与 B—D 同步推进）
   E1. 结构化匹配案例与保留测试集
   E2. 100 / 1,000 / 10,000 描述符的合成干扰/性能实验
   E3. 错误选择、错误参数、拒选、延迟与追溯完整性分别统计
   E4. 当前构建的 macOS Calculator 独立真机/视觉验收
   E5. Windows 等能力按各自候选和范围独立验证，不继承 macOS 结论
```

A 阶段先解决“实际运行哪份代码、为什么调用、结果从哪里来”，不以“通用目录还没做”为理由继续保持黑箱。B 阶段的元数据、候选与资格记录必须接入正式实现后才能被标成可用。

不要一次建设远程插件市场、万能 DAG、临时脚本执行器或第二套 Runtime。明确停止、跨工具桌面排他和未知副作用 fail-stop 是执行扩展的门，不因目录只在本地就可以跳过。

## 10. 如何验证，不以主观评分代替证据

现有测试入口目录：[tests/assistant/](../../tests/assistant/)。本次只核查该目录存在以下相关文件，没有运行它们：

```text
assistant.test.js
controller.test.js
calculator-capability.test.js
message-rendering.test.js
assistant-ui-live-macos.js
calculator-live-macos.js
calculator-layout-failure-live-macos.js
```

第一批改动应优先复用这些 JS 测试。后续 Resolver/注册/调用追踪的测试仍使用 `.js`；不能用新增 Go 测试代替用户可观察契约，也不能把 Node mock 说成 OpenDesk 真机运行。

最低行为集合：

| 类别 | 应验证行为 |
| --- | --- |
| 路由 | 正常执行、普通聊天、否定、只解释、引用指令、缺应用名 |
| 匹配 | 重名能力、相似不同动作、平台差异、旧版/禁用/撤销能力、无匹配 |
| 参数 | 缺字段、范围错误、单位/对象错误、合法但与原需求不同的值 |
| 多轮 | 修改参数、旧确认、切换会话、跨会话污染、重复确认 |
| 身份 | 修改磁盘文件、热更新、加载内容与展示内容不符、依赖变化 |
| 注册 | 导入时无顶层执行、同 ID 冲突、未资格化不得发布、撤销后不得运行 |
| 执行 | 取消、迟到事件、错误窗口、失焦、读数歧义、未知副作用停止 |
| 记录 | 会话恢复、完整参数来源、结果观察/验证区分、脱敏、损坏记录诊断 |

评测应分别报告召回率、自动选择精度、错误选择率、应澄清时的澄清率、参数准确率、执行/业务验证成功率、追溯完整率和 p95 延迟。不能只统计“成功调用了一段程序”，也不能把全部拒绝换来的零错误包装成高可用。

安全用例以零未经确认执行、零禁用/越权命中、零代码身份错绑为放行目标；达标与否必须由测试结果给出。检索阈值在调试集上调优，在独立保留集上检验；不能把 description 中的正例原样当作全部测试题。合成目录实验只证明检索/规模行为，不证明 10,000 个程序均已验证可运行。

## 11. 外部技术参考的使用边界

Anthropic 2025-11-24 的工程文章 *Introducing advanced tool use on the Claude Developer Platform* 讨论按需发现工具、相近工具的错误选择和用例说明。它支持“描述符检索后加载少量候选”的方向，不证明 OpenDesk 的实现或准确率，也不要求采用它的代码执行方案。

来源：`https://www.anthropic.com/engineering/advanced-tool-use`，查阅于 2026-09-16。

MCP 的 2025-06-18 Tools 规范将工具身份、描述、输入 schema 与调用交互分开，并建议让用户清楚看到工具调用和有机会拒绝。这里仅作合同与可见性的参考，不把采用 MCP 或工具注解本身视为授权、资格或沙箱。

来源：`https://modelcontextprotocol.io/specification/2025-06-18/server/tools`，查阅于 2026-09-16；此处引用的是明确版本的规范，不声称它是最新版本。

## 12. 接续检查

后续实施必须先重新读取当前 `master`、本文所列生产文件、现有测试和对应文档，不沿用本文 SHA 覆盖并行修改。网页版只能核查远端仓库，不能代替用户本地 `git status`、加载来源和 UI 真机事实。

每批完成后更新本页的已实现/待实施边界，并在 `docs/quality/` 记录实际 PASS / FAIL / NOT RUN。新增公开接口后再按 `docs/api/.rules.md` 更新 API 文档；不要提前在 `docs/api/` 宣告 `Capability.run()`、导入命令或日志字段已经存在。
