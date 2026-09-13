---
title: "对话式任务运行器｜Chat UI + Codex CLI + Calculator P0"
description: "用自然语言选择受控任务、由 Codex 填写固定参数、经宿主确认后调用普通 OpenDesk JavaScript 操作真实计算器；记录当前实现、验证与本地验收边界。"
---

# 对话式任务运行器｜Chat UI + Codex CLI + Calculator P0

## 1. 目标需求

让普通用户打开一个类似聊天软件的 OpenDesk 窗口，用自然语言提出计算任务，不输入终端命令、脚本路径、窗口坐标或 JavaScript，便可在明确确认后完成真实 Calculator 自动化，并在聊天窗口看到真实读取结果。

首版必须成立：

```text
用户自然语言
→ Chat UI
→ Agent.run() / 本机 Codex CLI
→ 固定任务 envelope
→ OpenDesk 宿主严格校验
→ 宿主生成可信执行预览
→ 用户确认
→ 普通 OpenDesk JavaScript 操作真实 Calculator
→ 从显示区读取实际结果
→ Chat UI 展示结果 / 状态 / 错误
```

两阶段任务进一步必须成立：

```text
第一段按钮
→ 实际读取 firstResult
→ 准备新的计算状态
→ multiplier × firstResult 的逐位数字按钮 =
→ 实际读取 finalResult
```

`firstResult` 只能来自本次 Calculator 显示区。模型推测、固定答案、历史缓存、测试 expected 或 JavaScript 算术都不能替代它。

产品边界保持不变：**Codex 理解“做什么”；宿主决定“允许什么”；普通 JavaScript 负责“可靠执行什么”。P0 不执行模型生成的任意代码。**

## 2. 当前实施状态

### 2.1 2026-09-13 网页阶段结果

本方案最初建立后，`master` 已新增正式 `Agent` / `LLM` Runtime。网页实施阶段基于当时最新 `2c0c186d6b7db9d79bad93559ea1738d5d4db41d` 接续，并已将本 P0 的主要应用层候选写入现有 `master`；后续其他并行会话继续向 `master` 提交与 App Mode 文档有关的变更，本轮没有回退或覆盖它们。

已实际写入：

```text
examples/ai-workflows/chat-calculator/
├── index.js          # 可启动 Chat UI + 应用层 wiring
├── planner.js        # 受控 Agent.run() / Codex planner
├── task-contract.js  # 固定 envelope、严格宿主校验、可信预览
├── task-session.js   # taskId、确认、取消、迟到结果与串行生命周期
├── calculator.js     # 无顶层副作用的参数化 Calculator 模块
└── README.md         # 工作目录、启动命令、前提与验收边界

tests/ai-workflows/chat-calculator.test.js
```

网页环境已经运行纯 JavaScript 回归：

```text
12 tests
12 pass
0 fail
```

并对 `examples/ai-workflows/chat-calculator/*.js` 运行 JavaScript 语法检查，无语法错误。

这些 PASS 只证明应用合同、Planner 调用形状、状态机和注入式 Calculator mock 的行为；**没有真实 Codex 登录、真实 Calculator、WindowServer 或真实 Custom UI host，因此不能把它们表述为完整 P0 通过，也不能据此评分 ≥95。**

### 2.2 仍为 NOT RUN / BLOCKED 的证据

网页阶段没有条件完成下列 live 证据：

- 公开一行命令从仓库根目录真实启动当前 Runtime / UI host。
- 真实 Codex CLI 登录后的自然语言 → envelope。
- 真实 Calculator 点击、两次显示区读取和变化输入。
- 真实窗口平移、失焦、错误布局与错误窗口停止。
- 规划、点击和读数阶段的真实取消 / 子进程清理。
- 中文、长消息、滚动、输入框、按钮、状态和窗口比例的实窗截图。
- golden / 原生产示例 / Script Runner / Recorder 的本地回归。

这些项目必须由可访问本机 macOS、当前 `dist/opendesk`、UI host 与 Codex CLI 的本地环境继续验收。

## 3. 已复用的来源与不变边界

### 3.1 当前生产 Calculator 来源

`examples/human-to-recipe/calculator-115.semantic.recipe.js` 与对应 golden 提供并继续拥有：

- macOS Calculator bundle / executable / title 身份。
- `232×321` 已资格化 Basic / Standard 窗口前提。
- 活动窗口、焦点、窗口身份与 Geometry 防护思路。
- Accessibility snapshot 的完整性检查和唯一数字显示读取。
- `C/AC` 双击建立 fresh calculation 的已有语义。

原生产脚本存在顶层固定业务执行，因此新 Chat 模块没有直接 import 整个生产脚本，也没有修改 golden 与原生产示例的基准关系。

### 3.2 完整按键地图来源

当前生产示例只保存其固定业务使用的部分按键。参数化 P0 所需的完整数字键不是按“常见计算器网格”猜测得到；`calculator.js` 复用仓库历史真实 Calculator Recipe `4eec3c501d94b749ed5d17ae7de5440e66130c91` 中保存的 `232×321` Basic 布局归一化 key points。

P0 只开放：

```text
0-9
+
-
×
=
```

历史资产中存在但 P0 合同没有开放的键不会因为坐标存在就自动成为模型可调用能力。

### 3.3 Human-to-Recipe 约束

本次属于“已有业务自动化的参数化与新输入范围”，因此遵循 Human-to-Recipe：已有资格资产优先复用；没有来源的按钮、窗口布局、显示格式或恢复策略不能靠视觉规律猜测补齐。新增 live 支持范围必须有新的真实资格证据。

## 4. 固定任务合同

首版只允许两个应用层 task id，它们不是 Runtime 全局 API：

1. `calculator.pressAndRead`
2. `calculator.twoStage`

Planner 只能返回以下六个根字段：

```json
{
  "schemaVersion": 1,
  "kind": "task",
  "task": "calculator.pressAndRead",
  "buttons": ["2", "5", "×", "4", "="],
  "multiplier": "",
  "message": ""
}
```

两阶段：

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

澄清 / 不支持必须使用空动作形状：

```json
{
  "schemaVersion": 1,
  "kind": "clarify",
  "task": "",
  "buttons": [],
  "multiplier": "",
  "message": "请补充本次完整计算内容。"
}
```

## 5. 宿主校验与授权边界

`task-contract.js` 在 Agent native JSON schema 校验之外再次执行普通 JavaScript 语义校验。P0 当前冻结：

| 项目 | 规则 |
| --- | --- |
| 根字段 | 只能是 `schemaVersion/kind/task/buttons/multiplier/message`；额外字段拒绝 |
| schemaVersion | 只能为 `1` |
| kind | `task / clarify / unsupported` |
| task | 只允许两个固定 task；非 task 必须为空 |
| buttons | 只允许单字符 `0-9 + - × =` |
| 按钮数量 | `3-64` |
| 等号 | 恰好一次且必须在末尾 |
| 表达式 | 不以运算符开始、不连续运算符、不缺操作数，至少一个二元运算 |
| 操作数 | 非负十进制整数，每个最多 12 位 |
| multiplier | `twoStage` 为 1-12 位数字字符串；单阶段必须为空 |
| 非 task 分支 | `task=""`、`buttons=[]`、`multiplier=""`，不得夹带动作 |
| 用户输入 | trim 后非空，应用层最大 4096 字符 |
| message | 只用于文本展示，不能扩大执行授权 |

模型返回的 path、code、shell、command 或任何未知字段都不能进入执行通道。

执行预览由 `buildTrustedPreview()` 根据**已经通过宿主校验**的参数重新生成。用户确认的是冻结参数，不是模型 prose。输入被编辑、重新规划或取消后，旧确认立即失效。

## 6. Planner 与 Agent Runtime

`planner.js` 复用现有 `Agent` owner，不复制进程、JSONL、认证或取消实现：

```text
Agent.getCapabilities({ backend: "codex", profile: "codex-analysis" })
→ preflight
→ Agent.run({
     backend: "codex",
     profile: "codex-analysis",
     prompt,
     output: native JSON schema,
     signal,
     timeoutMs
   })
→ result.data
→ validateTaskEnvelope(result.data)
```

本例没有使用 `args`、`extraArgs`、`rawCommand`、`shell`、`defaultArgs` 或保留参数绕过保护。

当前 `Agent` Runtime 已在本例实施之前收口：内建 Codex profile 使用独立 invocation、`--ephemeral`、`--ignore-user-config`、read-only sandbox，并由 adapter 固定关闭 shell / unified exec / computer use / browser / in-app automation / apps / multi-agent 等能力；调用方不能用任意 raw args 重新开启。Planner 因此不需要在 Chat UI 再实现第二套 CLI 隔离层。

这仍不等于“任何安装版本下都已经 live 安全验收”。本地阶段还必须检查：当前 Codex CLI 可发现、saved auth 可用、实际版本兼容、调用确实按当前 adapter contract 工作。`configured` 不能被展示成“已验证登录成功”。

## 7. 参数化 Calculator 模块

`calculator.js` 没有顶层桌面动作，可被 `index.js` 相对 import。职责：

- 只支持 macOS 自带 Calculator。
- launch 后要求唯一目标窗口；验证 executable / title / window identity。
- 只接受已资格化 `232×321` Basic / Standard 尺寸（容差 2）。
- 每次点击前重新读取当前 active Calculator；失焦、身份或布局变化立即失败。
- 每个 key point 按**当前窗口位置与尺寸**换算 screen-logical point，窗口整体平移不复用旧 screen coordinate。
- 每次任务显式双击 clear 建立 fresh calculation。
- 每个 native click 提交前检查取消；click 返回后再次检查，取消后不再提交下一动作。
- Accessibility snapshot 必须 `complete=true`、非 truncated、有 root，并得到唯一 numeric staticText。
- 读数采用有界轮询，要求连续两次同值才作为稳定 observation。
- 未知按钮、目标歧义、显示缺失 / 歧义 / 不稳定、第一结果不可重新输入时 fail-stop。

`calculator.pressAndRead`：

```text
open/check
→ clear
→ approved buttons
→ stable display read
→ result
```

`calculator.twoStage`：

```text
open/check
→ clear
→ first buttons
→ stable firstResult
→ require firstResult is re-enterable 1-12 digit non-negative integer
→ build [multiplier digits, ×, firstResult digits, =]
→ clear
→ click second stage
→ stable finalResult
```

第二阶段按钮数组只从本次 `firstResult` 构造；生产函数没有 `expected` 参数，也没有用 JS 算术计算结果。

## 8. Task 生命周期与取消

`task-session.js` 是此示例的轻量应用层状态机，不是新的通用 Workflow Engine。

核心状态：

```text
planning
→ awaitingConfirmation | clarify | unsupported | error | stopped
awaitingConfirmation
→ running | stopped
running
→ completed | error | stopping → stopped
```

约束：

- 一个 Chat runner 同时只有一个活动任务。
- 新规划会使旧的等待确认失效。
- `taskId` + current task identity 阻止迟到 Planner 结果提交。
- 每个确认最多启动一次；旧 taskId / 重复执行拒绝。
- 取消 planning/running 时先同步标记 `stopping` 并 abort，再等待 UI 更新，避免渲染延迟导致下一次桌面动作被提交。
- 已提交的单次 native click 不承诺撤销；后续动作停止。
- `stopped` 后 runner 可继续处理新任务。
- 关闭聊天窗口 abort 自己的当前任务并释放 listener；不调用 `ui.closeAll()`，不关闭其他产品窗口。

## 9. Chat UI 实现

`index.js` 使用当前 `ui.createWindow()` / `WindowHandle` / `ControlHandle`：

- 用户输入。
- 对话消息区与滚动容器。
- 宿主生成的可信预览。
- 执行 / 取消。
- planning / running / reading / stopping / completed / error 状态。
- 最终真实结果字段的展示。
- 空输入处理、长文本 `pre-wrap` / `overflow-wrap`。

HTML 只声明受限本地结构，没有 `<script>`、inline handler 或远程框架。业务逻辑全部在外层 JavaScript listener。用户 / 模型文本都通过 `ControlHandle.update({text})` 进入 text control，不作为 HTML 解释。

点击执行后不反复 `show()` Chat UI，因此进度更新不会主动把聊天窗口重新激活到 Calculator 前面。

## 10. 网页阶段测试证据

已运行：

```bash
node --experimental-default-type=module --test /mnt/data/opendesk-chat-p0/tests/ai-workflows/chat-calculator.test.js
```

结果：

```text
tests 12
pass 12
fail 0
```

覆盖：

1. 两种 task 合同与宿主预览。
2. 未知额外字段、非 task 夹带动作拒绝。
3. 非法表达式、非法等号、不支持按钮、超长操作数拒绝。
4. Planner 固定 Codex analysis profile、native JSON schema、无 raw args，并再次校验 `result.data`。
5. Mock 实际第一读值 `37` 生成第二段 `6 × 3 7 =`，没有写死 expected。
6. 显示区歧义时第二阶段不开始。
7. 模拟窗口平移后，每次 click 使用新的窗口位置重算坐标。
8. 第一次 click 后 abort 时没有后续 click。
9. 编辑后旧 confirmation 失效。
10. 同一 confirmation 只执行一次。
11. 取消后迟到 Planner 结果不能变成可执行任务。
12. running 取消经历 stopping → stopped，并可继续提交新任务。

另对所有示例 `.js` 运行 Node syntax check，无错误。

这里的 Calculator/Agent 都是测试替身；这些测试不等价于真实 Codex、真实桌面或视觉 PASS。

## 11. 公开使用契约

工作目录：**OpenDesk 仓库根目录**。

目标一行启动命令：

```bash
./dist/opendesk -ui -script examples/ai-workflows/chat-calculator/index.js -console-mode script -log-dir .runtime/examples/ai-workflows/chat-calculator
```

前提：

- 当前源码对应的 `dist/opendesk` 与 UI host 已构建且 provenance 一致。
- macOS Calculator 可用。
- OpenDesk 已拥有操作 Calculator 所需 Accessibility 权限。
- 本机 Codex CLI 已安装，当前 OpenDesk execution 的受控 PATH 可解析 `codex`。
- Codex saved auth 有效。

**网页阶段没有原样执行这条公开命令，因此当前状态是 NOT RUN，不得把 README 中的命令表述成已通过。**

## 12. 完整 P0 验收矩阵

| 编号 | 行为 | 网页阶段 | 完整 P0 成功标准 |
| --- | --- | --- | --- |
| T01 | 公开启动 | NOT RUN | 从仓库根目录原样执行命令，Chat UI 实窗可用 |
| T02 | `25 × 4` | MOCK ONLY | 真实 Codex 转参数，确认后真实点击并从显示区读取 `100` |
| T03 | `25 × 4 + 10` → ×6 | MOCK DATAFLOW ONLY | 实际读取 `110`，第二段由该读值构造，最终实际读取 `660` |
| T04 | 变化输入 | MOCK PARAMETERIZED | `12 × 3 + 4` 后 ×5 等变化输入真实工作，不能写死答案 |
| T05 | 非法/恶意 envelope | PASS / PURE JS | 所有非法输入在桌面副作用前拒绝 |
| T06 | clarify / unsupported | PASS / CONTRACT | 真实 Codex 对缺失/不支持任务不猜测、不执行 |
| T07 | 确认冻结 / 重复事件 | PASS / PURE JS | 实窗确认前无 clear/click；编辑、旧确认、双击不重复执行 |
| T08 | 规划取消 / 迟到结果 | PASS / STATE MOCK | 真实 Codex child 被现有 Command owner 清理；迟到结果不提交 |
| T09 | 点击/读数取消 | PASS / MOCK | 真实 native 动作停止后不再继续，UI 仍可用 |
| T10 | 窗口关闭 / 新任务 | PASS / STATE MOCK | 实窗关闭只清理自身；下一任务不与旧任务交错 |
| T11 | 平移 / 失焦 / 布局 | PASS / GEOMETRY MOCK | 至少一次真实平移仍正确；失焦、错误窗口/布局明确停止 |
| T12 | 读数异常 | PASS / MOCK | 真实缺失、歧义、不稳定或不支持格式时不补答案、不进第二段 |
| T13 | Planner 安全 | SOURCE CONTRACT VERIFIED | 当前本机 Codex/adapter 行为与固定受控策略有 live 证据 |
| T14 | CLI/认证/权限缺失 | NOT RUN | 清楚提示，不循环打开授权窗口 |
| T15 | 原资产回归 | NOT RUN | golden/生产示例/Script Runner/Recorder 无未经授权回归 |
| T16 | 视觉 | NOT RUN | 中文、长消息、滚动、输入、按钮、状态、窗口比例有截图证据 |

`100 / 110 / 660 / 40 / 200` 只能作为独立验收 oracle，不能进入生产读数路径。

质量目标仍是 ≥95/100，但只有完成真实模型、真实桌面、取消、安全、回归和视觉证据后才评分。网页静态/模拟层当前不应给完整 P0 95 分。

## 13. 本地验收顺序

本地接续不重新设计架构，也不重做 Human-to-Recipe 全流程。按失败链路最小修复：

```text
1. 重新取得当前 master / 当前构建 provenance
2. 运行纯 JS / 必要现有回归
3. 原样运行公开 Chat UI 命令
4. 验证真实 Codex capability + saved auth + planner envelope
5. 验证 25×4 → 100
6. 验证 25×4+10 → firstResult 110 → 6×110 → 660
7. 验证变化输入 12×3+4 → 40 → ×5 → 200
8. 验证非法输入 / clarify / unsupported 在副作用前停止
9. 验证 planning / clicking / reading 三阶段取消
10. 验证窗口平移、失焦、错误布局、读数异常
11. 保留真实 Chat UI 视觉截图
12. 回归 golden / production / Script Runner / Recorder
13. 更新本文 PASS / FAIL / NOT RUN / BLOCKED 与最终评分
```

任何 live 失败都沿现有 owner 最小修复；不要退回无限制 Agent、不要通过 full-access / 绕过审批解决问题、不要启动第二个 OpenDesk Runtime。

## 14. 后续演进

P0 完整通过后才考虑：官方菜单入口、应用发行打包、更多经 Human-to-Recipe 资格化的固定任务、保存已批准参数任务、低风险场景的可选确认策略。

只有确实出现持久多轮 session、turn interruption、审批回传等需求时，再评估 Codex App Server。P0 不建立通用工作流解释器、Workflow IR、Replay Runtime 或任意代码执行通道。
