---
title: "人工 Recorder → 普通 JS｜Human-to-Recipe"
description: "人工示范到可验证 OpenDesk 脚本的工作流入口、需求边界和文档驱动实施路径。"
order: 10
---

# 人工 Recorder → 普通 JS

**人提供示范，Recorder 保存事实，Agent 按需理解界面和过程，程序验证定位与操作，确定部分交付为普通 OpenDesk JavaScript。**

状态：Recorder 数据合同 v2、Custom UI 控制面、合成文件闭环与 macOS 真实 native capture 已实施并验收，2026-09-10。构建源码闭包 `8891ff3b…` 的 current8 pair 已完成公开 simple console 原命令下的 keypad Enter、ArrowLeft、Basic Latin、Meta+A 和 macOS 拼音最终值 capture → actions → generate → 恢复初始值 → 显式 replay；独立 AX oracle 验证最终值为“中文”，同 pair 的 native-stop、正式 Recorder Runtime JS、Custom UI 功能／视觉和资源归零也通过。随后 `polyfills/006-ui.js` 仅增加两项 UI-value 错误／参数诊断收紧；最终 current10 pair 以构建源码闭包 `587baeca…` 重新 `go build -a`，其 main／host 字节 hash 与 current8 实窗 pair 完全相同，并通过 current10 direct／正式 Recorder JS 14/14 和资源归零。按交接要求未重复桌面 UI/live；固定实窗证据与精确差异边界见[实施与验收计划](design/implementation-plan.md#415-2026-09-10-current8-livecurrent10-最终-pair-证据)。该轮输入由受控真实键鼠完成，不冒充真人手工输入。

仓库内现已分别提供零配置行为保持优化的 [`recorder-script-refiner` Skill](skills/recorder-script-refiner/SKILL.md)，以及业务生产化的 [`human-to-recipe` Skill](skills/human-to-recipe/SKILL.md)、最小 `SemanticBuildPlan` schema／validator和 Calculator plan golden；simple console 使用单行相对路径任务交接。通用 renderer 尚未实现，Skill 也未安装到用户级 Codex Skill 目录。用户通过 simple console 产生的 Calculator 录制包 `rec-20260909T113509.231387000Z-e2232547fa4e` 已完成旧 basic 源码的独立真实回放和 `115` oracle，并交付对应的[可维护语义优化 recipe](../../examples/human-to-recipe/calculator-115.semantic.recipe.js)；这些资格仍只属于各自 run-scoped evidence，不能自动转移给其他 candidate。

本目录只负责人工 human-to-recipe；另一条 [Agent-to-Recipe](../agent-to-recipe/WORKFLOW.md) 工作流保持独立推进。Agent-first 是本方案采用的开发分工背景，不表示本次输入改成 Agent 示范。

## 1. 用户需要得到什么

用户开始录制、正常操作桌面、停止录制后，能够看到录到了什么，生成可查看、可编辑的普通 JS，并在声明的条件下重复执行。用户不需要复杂复用时，不必先做全应用建模、模型识别或变量提取。

屏幕绝对坐标必须作为录制时事实保留，但 v2 不允许把它作为跨 execution 的唯一点击目标。基础生成至少需要动作级应用／窗口上下文和窗口内偏移；控件语义是可审核证据，业务参数化和通用 locator 仍按需加入。不能把所有增强能力绑成一个不可跳过的大流程，也不能为追求“简单”退回 screen-only 重放。

| 用户需求 | 可采用方式 | 必须说明的边界 |
| --- | --- | --- |
| 原样再做一次 | 当前应用／窗口解析、窗口内坐标、明确输入、必要等待 | 起始状态和界面结构仍需恢复；旧 v1 screen-only 包只可审阅 |
| 窗口移动后再做一次 | 当前窗口 bounds＋录制偏移 | 已支持平移；不等于缩放、布局重排适配 |
| 目标位置变化后仍操作正确对象 | 原生控件、文字、图像、锚点或区域关系 | 唯一性、对象归属、状态、适用条件与失效处理 |
| 换输入后完成同类任务 | 参数、运行时读值、经确认的分支和循环 | 一次示范不能自动证明通用业务规则 |

这些是独立需求维度，不是必须依次升级的四个关卡。同一脚本可以混合不同定位方式；坐标脚本也可参数化，高级定位脚本也可不包含业务变量。

## 2. 最终交付出口

| 出口 | 内容 | Agent 的位置 |
| --- | --- | --- |
| 受控坐标脚本 | 声明固定条件的普通 JS | 可以不参与，也可仅辅助整理 |
| 增强普通 JS | 已确认定位、输入、等待和结果验证 | 开发阶段参与，正常运行不必参与 |
| JS／Agent 混合流程 | 普通 JS 与明确的必要判断节点 | 只在声明的判断节点参与；需有实际宿主与权限支持 |
| Recorder → Agent 交接 | 仓库相对 generated script 入口 | 单行调用 `recorder-script-refiner`；无业务问卷，默认只做行为保持的静态优化 |

不为普通 JS 强制建设应用对象方法层、Registry、复杂可执行 IR、Compiler、专用 Replay Runtime 或 LangGraph。`calc.tapButton(...)` 不恢复为应用对象层。优先实际存在的框架 API 和有价值的普通函数。

## 3. 主链路与分支

```text
H1 明确任务、使用范围和采集方式
  → H2 用户示范，Recorder 保存操作与现场
  → H3 将原始事件整理为可审阅步骤
  → H4 审阅、纠错、补充缺失信息
      ├─ 快速复刻：保留受控坐标和明确动作 → H6
      └─ 理解增强：H5 Agent 理解目标、过程与复用规则 ↔ H4
  → H6 生成普通 OpenDesk JS，必要时声明 Agent 判断节点
  → H7 实际运行、验证结果、定向修复
  → H8 保存、交付和持续维护
```

H2 期间 H3 可以增量整理，H5 可以分析已保存材料；分析不阻塞输入采集，不擅自干扰人工正在使用的桌面。简单任务不强制逐条审阅或填写意图；关键缺失、歧义、授权和不支持动作不能被跳过。路径可按步骤混用，增强规则失败时不得静默放宽对象约束，伪装成已验证的坐标回退。

H1—H8 是制作和维护自动化的方法，不是每次运行都重走的步骤。日常运行是：

```text
读取本次输入 → 检查适用条件与当前对象 → 执行已确定的 JS
→ 仅在声明节点调用 Agent → 验证实际结果 → 完成或明确停止
```

## 4. 只保留四份主文档

| 文件 | 唯一职责 |
| --- | --- |
| 本 README | 需求背景、有效边界、主链路、文件地图与阅读顺序 |
| [完整作业任务树](design/task-decomposition.md) | H1—H8 及子作业、无文字图标点击分析、贯穿约束、场景解释 |
| [Recorder 工程设计](design/recorder-design.md) | DQ-01—DQ-15 规范性需求、已实现调用链、数据合同、真实符号、native 生命周期、动作、生成与下游交接 |
| [实施与验收计划](design/implementation-plan.md) | 真实完成、命令、证据、未运行、失败条件与下一批 |

任务树回答完整需要做什么；工程设计回答基础 Recorder 实际如何工作；实施计划只记录资格和证据。不按每个任务节点创建文件、Skill 或 Agent。当前两个 Skill 对应不同且可重复的专业流程：`recorder-script-refiner` 做 script→refined candidate 的行为保持优化；`human-to-recipe` 做 actions→plan→production/gate/evidence 的业务生产化。二者不是节点占位或迁移壳。

### 4.1 Skill、plan 和 renderer 的当前状态

| 能力 | 当前状态 | 边界 |
| --- | --- | --- |
| 仓库内 `recorder-script-refiner` Skill 源码 | 已实现 | 新会话用 generated script 相对路径零配置进入；校验 sibling lineage 后只做行为保持的静态优化 |
| 仓库内 `human-to-recipe` Skill 源码 | 已实现 | 仅在用户要求业务理解、动作取舍、参数化或结果资格时使用 |
| 用户级／系统级 Skill 安装 | 未安装 | simple console 由仓库 `AGENTS.md` 路由到仓库内 Skill，不要求用户传入 Skill 路径 |
| `SemanticBuildPlan` schema | 已实现 | `skills/human-to-recipe/references/semantic-build-plan.schema.json`；结构允许表达 blocked／unknown |
| plan validator | 已实现 | `skills/human-to-recipe/scripts/validate-semantic-build-plan.js`；unknown、遗漏、重复消费、source 漂移和 Gate 源码冲突会阻止生产生成 |
| 通用 renderer | 未实现 | 当前只能由 Agent 按 Skill 的确定性输出顺序生成，不能宣称一键编译 |
| 第一个 golden | Calculator | plan、production、Gate、Evidence 分层已校准；下一个建议应用是 TextEdit，但必须先取得其 human 录制和用户目标，不能预填业务意图 |

Recorder 只保存观察事实。AX／DOM 语义可能因 WebView、Canvas、远程桌面或权限不足正常处于 `unavailable`；这不等于失败，也不允许从坐标和常见布局猜标签或业务目标。OCR、图像和人工标注只能作为有来源的候选，必须保留授权范围、映射和未知项。

## 5. workflows 与 docs 的边界

人工录制的业务要求、完整作业、专业协作、工作包和验收计划以本目录为主，不在 docs 再复制一份任务树。

[docs/frameworks](../../docs/frameworks/README.md) 继续保存可共享的方法；[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md) 的已有公共结构应先核查复用，不在人工目录复制成第二份 AppProfile 权威规范。若人工来源需要新增共享字段，下一轮先提出最小差异和兼容影响，再协调修改。

[docs/api](../../docs/api/README.md) 只描述经实现与核对的公开接口；当前 JavaScript 全局对象见 [Recorder Runtime API](../../docs/api/recorder-runtime.md)。Agent-first MCP 的 [Recorder API](../../docs/api/recorder.md) 保持独立协议页，不据同名合并数据模型。

[application-engineer](../agent-to-recipe/skills/application-engineer/SKILL.md) 及其[专业正文](../agent-to-recipe/design/application-operations.md) 继续负责应用认识、关系、定位和操作。人工目录补充事件—现场关联与点击目标分析的任务要求，不另建 Recorder 专属 UI 模型。

[`human-to-recipe`](skills/human-to-recipe/SKILL.md) 消费固定 human actions lineage，负责逐动作 disposition、Business Episode、`SemanticBuildPlan`、生产 Recipe 与独立 Gate 分层。需要 locator 加固时才遵循 `application-engineer`，且只消费其 target／locator／geometry／strategy／guard／claim／source／unknown handoff；application-engineer 不生成最终 Recipe。

[`recorder-script-refiner`](skills/recorder-script-refiner/SKILL.md) 只消费已生成 Recorder script 的相对路径，通过确定性 inspector 在当前录制包内重定位并核对 candidate/actions/manifest/raw。它不要求业务目标，不删除或重排动作，也不取得业务资格；需要这些能力时才显式升级到 `human-to-recipe`。

## 6. 与 Agent-first 的共享边界

```text
人工示范 → 人工原始事件与证据 → 整理／审阅 → 人工来源的步骤与依据
                                                       ↓
                                  按需复用应用认识、过程提炼、JS 生成与验收
                                                       ↑
Agent 执行 → 工具调用、观察与验证 → 提炼 → Agent 来源的步骤与依据
```

两种入口不统一伪造原始记录。人工没有提供的意图、后置条件与验证结论保持未知；事后解释不冒充当时事实。共享是设计方向，不代表所有消费者已接通。

应用认识、业务过程提炼、代码构建、独立验收是不同职责，可由同一个 Agent 按工作包连续完成，不需要每步另起 Agent。正式存在的方法以实际仓库文件与宿主能力为准，不能把职责名称等同于已安装 Skill。

另一会话并行推进 Agent-first 时，默认只读其相关文档，不同时修改其专业正文、Skill 或已有 Recorder 契约。基线核查发现 [recorder API 文档](../../docs/api/recorder.md) 描述的是 Agent-first MCP 会话；不能据此认定人工监听 `Recorder.start()` 已存在，也不能为人工坐标模式放宽其确定性回放要求。完整源码状态在后续工作包核查。

## 7. 第一批交付与正常使用

闭环 A 的代码链已经实现：开始人工录制 → 降噪 raw＋动作上下文 → actions/v2 → 窗口／显示器相对 basic JS。macOS Calculator 已用真实 native listener 和受控 `mouse.click()` 验证 recording 点击、paused 点击丢弃、resumed 点击、按钮“9”／“7”的 AX 语义、stop、actions 和 candidate；另一个用户 simple console 录制包已在固定窗口尺寸下独立回放，并由回放后的 AX display oracle 验证为 `115`。两份包的资格分别记录，不能从一个 capture 或 replay 结果推断其他 candidate 通过。

闭环 B：一次无文字图标操作 → 可信现场 → 目标与上下文裁切 → Agent 判断控件及业务归属 → 重新定位与验证规则 → 普通 JS → 新条件下实际验证。

两条闭环独立验收：A 不依赖 B 的大模型分析；B 的证据需求从第一批就纳入采集设计，避免纯宏做完后才发现无法理解。范围、次序和通过条件见实施与验收计划。

从仓库根目录使用正常入口：

```bash
./dist/opendesk -allow-recorder-capture -script examples/human-to-recipe/record.js -console-mode script
```

F8 明确开始，F9 在示例 UI 层暂停／继续，F10 停止并制作 actions，F11 在 `ready` 时显式生成，F12 不生成结束；不会自动回放。

需要正常可见窗口按钮时，使用同一 `Recorder` Runtime 的 Custom UI 入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

先聚焦隔离、非敏感、可恢复的目标，再点击“开始录制”。窗口展示准备、录制／暂停、保存、
actions 与生成状态；停止后制作 actions，生成需要另一次点击且不会自动回放。取消、窗口关闭、
脚本异常和宿主退出沿同一个 native session 生命周期清理，不创建第二 Recorder owner。

简化的单行原生工具条入口同样从仓库根目录运行：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

该入口默认请求 `target-semantics`。普通 hover 不进入 raw；每个 release 绑定当时的应用、具体窗口、窗口内坐标和可取得的控件标签。切换应用或同一应用的其他窗口是允许的录制行为，不再触发旧版 `scope-changed` 停止。停止后会制作 actions；`ready` 自动生成完整 basic candidate，`needs-review` 自动生成带省略 warning 的 partial candidate，只有 package-integrity `blocked` 不进入生成。生成结果仍是 `verification: "not-run"`，只有另点“重放”才启动新的 execution。“复制 Agent 优化脚本”只在 `ready` generated script 存在且未运行时启用；`needs-review` 需要先人工修复行为缺口。复制内容只有脚本的仓库相对路径；仓库 `AGENTS.md` 负责路由到 `recorder-script-refiner`。该按钮不启动 Agent、不创建线程、不读取录制正文、不生成、不重放，也不改变录制包。

独立生成使用：

```bash
OPENDESK_RECORDER_ACTIONS_FILE=.runtime/recordings/<ID>/actions.json ./dist/opendesk -script examples/human-to-recipe/generate.js -console-mode script
```

本次 Calculator 录制经过人工来源核对、语义加固和独立资格验证后的正式优化文件，从仓库根目录运行：

```bash
./dist/opendesk -script examples/human-to-recipe/calculator-115.semantic.recipe.js -console-mode script
```

该文件只表达 `AC → 25 × 4 = → + 20 → − 5 =` 的日常业务动作，并保留平台、唯一窗口、录制布局、前台身份和 PID-scoped AXPress 的安全门禁；窗口内 offset 通过 `Geometry` 投影并检查越界。它不会把逐步 assert、独立 oracle 或 evidence 写入塞进正常自动化。严格来源核对、生产源码 hash、按钮语义、逐步显示值和最终 `115` 验证位于独立的 [`tests/runtime-api/calculator-115-semantic-recipe-macos.js`](../../tests/runtime-api/calculator-115-semantic-recipe-macos.js)，Gate instrument 实际生产源码而不维护第二份点击实现，证据只写入 `.runtime/tests/runtime-api/`。具体边界和两条独立命令见[实施计划 4.10](design/implementation-plan.md#410-生产自动化资格测试与证据分层)。

## 8. 文档驱动代码的使用顺序

```text
阅读本入口和任务树
→ 对照当前 API、实现、类型与测试核实已有能力
→ 选取最小可验收工作包
→ 给出调用时序、数据变化、现有／缺失能力和类方法差异
→ 形成获准范围内的实现与 JS 验收
→ 同步真实 API、示例、证据和设计状态
```

本轮 v2 修改必须在四份主文档中形成闭环：

| 变更 | 需求归属 | 技术合同 | 完成与证据 |
| --- | --- | --- | --- |
| hover move 过滤、button-held motion 保留 | 任务树 H2.2 | 工程设计 DQ-01/DQ-02、回调与队列 | 实施计划 4.1、4.8、5 |
| 应用／窗口／控件层级和多窗口 | 任务树 H2.3/H2.4 | 工程设计 DQ-03/DQ-04/DQ-06 | 实施计划 WP2、Calculator live |
| screen/window/element 多坐标 | 任务树 H2.3、H3.1 | 工程设计 DQ-05、文件合同 | 实施计划 coordinate recipe |
| 生产代码确定性生成／审阅、Geometry 收敛 | 任务树 H6 | demonstration pipeline 的确定性闸门、multi-application 路线图批次 A | 实施计划 4.10—4.12 |
| generated script→Agent 单行任务；actions→业务生产化 | 任务树 H4/H6 | `recorder-script-refiner` inspector；`human-to-recipe` schema 和 source-check validator | 实施计划 4.13；Calculator 是第一个 production plan golden |
| capture 起点 partial pointer envelope 与会话内 missing pair 分离 | 任务树 H2.2/H3.1 | 工程设计 DQ-15、唯一动作归组 | 实施计划 4.17、5 |
| 隐私、显式失败和旧包兼容 | 任务树 H1.5、H2.6 | 工程设计 DQ-07/DQ-08 | 实施计划硬性失败条件 |

公开 API 参数、返回值和错误只在 [Recorder Runtime API](../../docs/api/recorder-runtime.md) 维护；仓库正式质量报告仍归 [docs/quality](../../docs/quality/recorder-data-quality-v2.md)。workflow 保存“为什么、必须做什么、如何验收”，避免把 API Reference 或一次性运行日志复制进来。

本轮授权覆盖 Recorder 所需的生产代码、固定依赖、公开面、示例、测试和 human-to-recipe 文档；不覆盖提交、推送、分支操作、未获准真人监听或并行 Agent-to-Recipe 文件。后续接续仍按当次授权边界实施。

遵守 [AGENTS.md](../../AGENTS.md)：运行日志、截图、临时配置、脚本候选和测试证据写入 `.runtime/`，不提交个人屏幕或凭据。现有录制及 authoring 目录先复用并核查来源隔离；正式可维护的脚本、脱敏 fixture 和示例按各自归属保存，不把临时证据目录当永久文档库。证据被删除后应标不可复核，不继续声称已证实通过。

历史基线为 `master` 的 `d444fedc27fb28387f48e262111261b1c5f6b814` 加当时未提交实现；随后已完成 Calculator 独立 candidate 回放和回放后 `115` oracle，详见实施计划 4.8。当前接续已重新核对工作树与协作规范；任何新源码 hash 的普通用户命令、formal Gate 和视觉证据都必须重新运行并单列，不能继承历史结论，也不能覆盖并行修改。
