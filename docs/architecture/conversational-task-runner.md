---
title: "对话式任务运行器｜Chat UI + Codex CLI + Calculator P0"
description: "用自然语言选择受控任务、填写参数并调用本地普通 OpenDesk JavaScript；明确计算器首版、真实读数、取消、安全与网页到本地的实施交接。"
---

# 对话式任务运行器｜Chat UI + Codex CLI + Calculator P0

## 1. 目标需求

让普通用户打开一个类似聊天软件的 OpenDesk 窗口，用自然语言提出任务，不接触终端、脚本路径、窗口坐标或 JavaScript，便可在明确授权后调用已知的本地自动化能力，并看到真实执行结果。

首版用户链路：

```text
用户输入：打开计算器，计算 25 乘以 4
→ 本地聊天 UI 接收任务
→ Agent.run() 调用本机 Codex CLI
→ Codex 返回受支持任务及结构化输入
→ OpenDesk 校验参数，生成可信执行预览
→ 用户点击执行
→ 普通 OpenDesk JavaScript 打开计算器、点击按钮、读取显示区
→ 聊天窗口展示真实读数、进度、完成或错误
```

进一步必须覆盖：

```text
先计算 25 × 4 + 10
→ 实际读取 firstResult
→ 重新准备计算状态
→ 点击 6 × firstResult 对应的数字按钮 =
→ 实际读取 finalResult
```

`110` 与 `660` 只是这条验收用例的独立数学期望，不能进入生产流程充当实际读值。

**产品决策：先做“聊天驱动已验证脚本”，不做“聊天驱动任意生成代码”。Codex 理解任务，宿主决定允许执行什么，普通 JS 完成确定性操作。**

本方案中的 `calculator.pressAndRead`、`calculator.twoStage`、任务状态、数据字段和示例模块名都是拟实现的应用层契约，不是已经存在的 Runtime API。实现完成前，不将它们加入公开 API 清单，也不把本文的示意命令描述为已通过。

## 2. 状态、来源与复用基线

### 2.1 本文状态

- 文档建立日期：2026-09-13。
- 仓库：`shopable-ai/opendesk`，目标现有分支 `master`。
- 本文核对快照：`195e28a18cb6ff896229aa3a36e99f3ce2ffe5d5`。它相对上一轮 `b3c26651870668951d3d01f97f4f5f3a083cbc6d` 只修改 LangGraph module fixture 相关文件；本方案涉及的下列已读基础文件未变化。
- 当前交付是架构与实施契约；本文创建不表示聊天 UI、参数化计算器或端到端验收已经完成。
- 本轮未连接用户桌面、未调用用户本机 Codex、未取得新的计算器读数或截图。
- 后续执行者必须重新取得真实当前基线。旧 SHA 是来源记录，不是要求回退的目标。

### 2.2 已核对的可复用基础

| 来源 | 已确认内容 | 不能据此宣称 |
| --- | --- | --- |
| [Golden Samples](../../workflows/human-to-recipe/golden-samples/README.md) | `calculator.js` 是冻结期望，要求与对应生产示例字节一致 | golden 是新聊天功能的生产入口或通用计算器 |
| [Calculator production example](../../examples/human-to-recipe/calculator-115.semantic.recipe.js) | 有打开应用、目标身份/布局/焦点检查、窗口相对按钮点击、显示区 AX 读取、固定 `115` 校验 | 任意按钮、任意布局、Windows 计算器已支持 |
| [Agent-to-Recipe calculator case](../../workflows/agent-to-recipe/cases/calculator.md) | 规定两次计算及第一次实际读数进入第二次输入的关系 | 案例文档本身就是已运行脚本 |
| [AI runtime facade](../../polyfills/008-ai-runtime.js) | `Agent.run()` 复用 `Command.run()`；存在 Codex/Claude Code 适配、结构化结果及取消信号传递 | 无工具隔离、逐字流式 UI 或持久多轮会话已完成 |
| [Custom UI](../api/ui.md) | 受限本地 HTML/CSS、外层 JS listener、受控窗口生命周期 | 普通浏览器 `<script>`、任意 DOM 框架或远程页面可直接注入 |
| [JavaScript Runtime](../api/runtime.md) | 有模块入口与相对静态 import 的公开契约 | Node.js 全量兼容或第三方前端 SDK 可直接运行 |
| [Command](../api/command.md)、[Execution](../api/execution.md) | 现有命令与 execution 生命周期入口 | 可以为每次点击另起 OpenDesk Runtime 或杀死整个 UI 实现任务停止 |

原计算器生产示例仅绑定 macOS Calculator 的 `232 × 321` 布局；按钮表只包含示例需要的部分键。其顶层代码会立即运行固定业务流程，因此**不能把整个文件直接 import 到聊天 UI 当作无副作用工具库**。

### 2.3 与已有工作的关系

- Agent-to-Recipe / Human-to-Recipe 负责制作、解释和验证脚本；聊天运行器消费完成的能力，不要求每次用户输入重新走完整作者工作流。
- Script Runner 继续负责选择并运行脚本，Recorder 继续负责采集；本轮不替换它们，也不重新调整产品资源 ownership。
- LLM / Agent Runtime 继续作为模型调用的唯一复用入口；本轮不在 UI 内复制 Codex 进程管理或第二套 JSONL 解析器。
- 首版独立示例通过后，再按现有 App Shell 生命周期接入官方菜单；菜单集成与发行打包不是本轮首要门槛。

## 3. 首版范围与非目标

### 3.1 P0 必须形成的能力

- 对话入口：输入任务、展示消息、可信执行预览、执行/取消、阶段进度、真实结果及可理解错误。
- 计算器任务：一次按钮计算并读取；同一任务内读取中间值、作为数字再次输入并读取。
- 参数化：业务只提供按钮字符与用户指定的乘数；定位、清空、状态检查、读数和停止由普通 JS 负责。
- 可控执行：首次默认显式确认；单个运行器同一时刻只有一个活动任务；关闭窗口和取消均有完整清理。
- 真实交接：普通用户一行启动命令、可维护源码、自动化测试、未通过/未运行项，以及本地 live 验收入口。

### 3.2 P0 不做

不实现任意 JS 生成后即执行、动态脚本目录扫描并自动授信、模型输出 Shell、任意文件路径调用、通用动作 DSL、Workflow IR、Compiler、独立 Replay Runtime、LangGraph 编排、长期记忆、语音、跨会话续算或自动后台执行。

本轮不为聊天 UI 另引入 Electron、完整 Node 后端、第二个固定 localhost 服务或第二个 OpenDesk 桌面自动化 Runtime。Codex 自身作为受 `Command` 管理的外部子进程，不属于被禁止的第二个 OpenDesk Runtime。

Windows 继续是 OpenDesk 产品支持方向，但本次现成 golden 只为 macOS 提供依据。首版必须在 Windows 明确报告计算器适配尚未验收/不支持，不能套用 macOS bundle ID、坐标或 AX 读数规则。

## 4. 总体架构与职责

```text
Custom UI：只呈现、接收输入和发出明确用户事件
    ↓
应用层 controller：管理 taskId、状态、确认、取消及事件归属
    ↓
Agent.run()：受控调用本机 Codex，取得 decisionResult.data
    ↓
应用层参数验证：结构、任务白名单、按钮语法、长度、支持范围
    ↓
宿主根据有效参数生成预览，等待用户确认
    ↓
固定 task → function 映射
    ↓
calculator.mjs：在同一 execution 中执行普通 JS
    ↓
目标窗口检查 → 点击 → 显示区读取 → 任务结果
    ↓
executionResult：真实观察及状态 → UI
```

关键分工：

| 部件 | 输入 | 输出 | 禁止承担 |
| --- | --- | --- | --- |
| Chat view | 已处理消息、任务状态 | 用户输入、按钮事件 | 直接读取文件、调用鼠标、执行模型代码 |
| Controller | 用户事件、模型决定、执行事件 | 状态转换、确认、调用、取消 | 用模型回复作为成功证据 |
| Planner | 当前完整用户任务、静态任务说明、输出 schema | 任务参数 / 澄清 / 不支持 | 自动操作桌面、替用户授权、输出实际结果 |
| Task contract | 模型 JSON | 校验后的只读任务输入 | 解释任意代码、路径、循环或通用表达式语言 |
| Calculator module | 已批准输入、取消上下文、进度回调 | 实际读值及执行记录 | 调用模型或自行扩权 |
| Result presenter | 已完成执行的真实结果 | 人能理解的完成/失败信息 | 第二次调用模型改写读数 |

`decisionResult.data` 是模型建议，不是桌面结果。`executionResult` 才携带真实观察。完成提示由宿主确定性生成，首版无需再调用一次模型总结。

## 5. 最小任务输入契约

### 5.1 两种固定任务，而非通用计划语言

1. `calculator.pressAndRead`：准备新的计算状态，执行一个按钮序列，再读取显示区。
2. `calculator.twoStage`：执行第一序列并读取 `firstResult`，准备新计算，再输入 `multiplier × firstResult =` 并读取 `finalResult`。

第二类任务的真实读值引用固定在受信函数里，不交给模型填写结果，不为两段计算引入 JSONPath、变量表达式解释器或通用 steps graph。

### 5.2 模型输出示意

以下为拟实施的应用数据示例，不是已提供的 Runtime 方法调用。

一次计算：

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

读取后再算：

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

无法确定目标时：

```json
{
  "schemaVersion": 1,
  "kind": "clarify",
  "task": "",
  "buttons": [],
  "multiplier": "",
  "message": "请写出本次完整计算内容；首版不从上一条对话自动续算。"
}
```

不支持的任务使用同样空输入形状，`kind` 为 `unsupported`。它不得触发应用启动、清空、截图或点击。

### 5.3 Schema 与本地语义校验分工

全部对象关闭额外字段。固定字段全部声明 required；枚举、字符串长度和数组长度由 schema 限制，跨字段规则由应用层普通 JS 校验。

当前 `008-ai-runtime.js` 的 schema 白名单只支持有限关键字，不支持 `oneOf`、`anyOf`、`$ref`、`pattern` 或 type union。首版使用简单 object/array/string/enum/const/length 组合，不为了这两个任务先扩展成完整 JSON Schema 引擎。[来源：AI runtime facade]

建议冻结以下初始边界，调整时必须同步测试：

| 项目 | P0 规则 |
| --- | --- |
| 任务 | 仅上述两个 task 字符串 |
| 模型决定 | `task`、`clarify`、`unsupported` 三选一 |
| 用户指令 | 非空；应用层上限 4096 个字符，仍受 Runtime 字节限制 |
| 按钮 | 数字 `0`—`9`、`+`、`-`、`×`、`=`，全部为单字符字符串 |
| 单段按钮数 | 3—64；必须含有效二元运算，等号恰好一次且位于末尾 |
| 数字输入 | 非负十进制整数；每个操作数最多 12 位；不接受科学计数法、千分位或小数 |
| 操作语法 | 不以运算符开头、不连续输入运算符、不缺操作数；括号、百分数、函数键不支持 |
| 两阶段乘数 | 1—12 位十进制数字字符串；单阶段必须为空字符串 |
| 返回分支 | `clarify/unsupported` 的 task、buttons、multiplier 必须为空，不可夹带动作 |
| `message` | 仅澄清/解释文本；转义呈现，不能参与任务授权或实际结果 |

清空方式不让模型指定：P0 两个任务均从新计算开始，宿主预览明确提示“将清空当前计算器输入”。`C/AC` 不属于模型可传的任意按钮序列。

用户使用 `*`、`x` 或“乘”时，由输入理解归一化为 `×`；执行层仍独立检查最终字符串。不得把 `"25"` 当作一个按钮。内部数字拆分只做格式转换，不做算术替代。

自然语言中的数学优先级与计算器逐键行为不能混淆。无法确定用户是数学表达式还是按顺序运算时，返回澄清；首版不静默把复杂表达式改成另一种求值语义。验收样例选择无此歧义的运算链。

### 5.4 确认的是有效参数，不是模型 prose

预览由宿主从通过校验的输入重新生成：应用名称、会清空输入、第一段按钮、第二段真实读值依赖、支持条件。

用户确认后冻结该参数副本并绑定 taskId/修订号。编辑输入、重新规划或取消都会使旧确认失效；迟到的模型返回、旧按钮事件或重复点击执行均不得触发另一任务。

## 6. 计算器模块：业务简单，操作条件不省略

### 6.1 Golden 复用方式

保留 `workflows/human-to-recipe/golden-samples/calculator.js` 与对应生产示例的原有基准关系。新参数化模块只继承有来源的目标识别、Geometry、按钮和读数规则，并取得自己的验证资格。

不要完整复制黄金文件中的固定业务与通知代码作为聊天 controller，也不要 import 有顶层副作用的生产脚本。可移植必要普通函数并标明来源和差异；若进一步抽取公共模块会改变原示例，必须同时遵循原 workflow 的生产/golden 更新与独立回归要求，不能悄悄修改被冻结基准。

实际参数化生产工作应遵守 [Human-to-Recipe Skill](../../workflows/human-to-recipe/skills/human-to-recipe/SKILL.md)；纯行为保持 refiner 不能替代新参数范围的资格验证。已有材料优先复用，不从零重复十二阶段探索。

### 6.2 模块应负责的语义

- 打开并绑定正确计算器实例，辨别平台、应用身份、窗口、布局和焦点。
- 为本次已确认任务建立新的计算状态；清空是显式业务准备，不是每次 press 的隐含副作用。
- 按有依据的按钮映射或已经验证的定位能力逐次点击；新按钮必须真实核对，不能按常见布局猜坐标。
- 每次动作使用当前窗口几何，支持已验证的窗口平移；尺寸/布局改变不套用旧偏移。
- 中途失焦、身份变化、布局不符或目标歧义时停止，不能持续抢焦点、点击其他窗口或盲重试。
- 在限定时间内读取当前显示区并检查观察完整性、唯一性和稳定性。
- 把实际读值与来源返回给调用方，支持逐步进度与合作式取消。

保留选择余地：优先复用已有有效实现，不为了“按钮字符输入”强制改成全 AX、全 OCR 或统一应用对象类。只有当前布局的真实观测证明某种定位更合适时才替换。

### 6.3 两阶段业务的目标写法

以下是待实现的普通函数伪代码，不是新增全局 API：

```js
await startFreshCalculation(target, taskContext);
await pressButtons(target, input.buttons, taskContext);
const firstObservation = await readStableDisplay(target, taskContext);
const firstResult = requireReusableInteger(firstObservation);

// 第一值验证失败或任务已取消时，不执行后续清空和点击。
await startFreshCalculation(target, taskContext);
await pressButtons(target, [
  ...toDigitButtons(input.multiplier),
  "×",
  ...toDigitButtons(firstResult),
  "="
], taskContext);
const finalObservation = await readStableDisplay(target, taskContext);
```

第一读值不能来自模型、expected、上一任务缓存或剪贴板遗留。第二次实际点击字符及其 firstResult 来源必须可复核。

### 6.4 读取、稳定与正确性不是同一件事

原示例的 `waitForCalculatorResult(target, '115')` 适用于该固定 oracle，不应成为通用运行器的读数逻辑。通用读取必须独立于预期答案，保存 raw 与按已验证 locale 规范化的文本；不确定的数字格式不能通过盲目删除逗号等方式“修复”。

建议有界轮询多次一致读值，并结合最后动作已完成和应用状态；但**稳定读数本身不证明等号已正确生效或数学一定正确**。需独立 live 用例验证操作链，失败不能输出预写答案。

P0 可复用中间值限定为最多 12 位非负整数。负数、超长数、科学计数法和应用错误应保留观察并明确报告不支持或失败，不能截断、取绝对值或补零后继续。生产提示区分“已从显示区读取”与确有独立 oracle 的“已验证”，不夸大保证。

## 7. Codex 调用与权限边界

### 7.1 复用现有入口

通过当前 `Agent.run()` 调用默认 Codex；已有 backend/profile 机制保留，不为 UI 再写厂商协议解析。此次 live 验收首先验证 Codex，不能仅因适配器存在就宣称 Claude Code 的聊天链路已通过。

当前 facade 以 `codex exec --json --ephemeral` 等受控参数调用，支持 schema 和结果读取，`signal` 传给 `Command.run()`。它在调用完成后返回结果，不能据此声称已经支持逐字 token streaming 或持久 thread。[来源：AI runtime facade]

P0 使用阶段状态，而非伪造实时模型思考内容。可在 UI 保存本次会话中的显示消息，但每个任务必须自包含；“继续上一次”未明确时先澄清。用户输入命令通过已有 stdin/参数数组机制传递，不拼接 Shell 字符串。

### 7.2 当前必须补齐或验证的安全缺口

默认 `policy: analysis` 与 `--sandbox read-only` 不等于 planner 没有工具。已读实现仍继承 HOME/CODEX_HOME 等配置来源，且当前 `backendOptions.codex` 仅支持 reasoningEffort，保留参数校验会阻止随意传 `-c/--config/--profile`。[来源：AI runtime facade]

因此不能在本例中虚构 `tools: []`、`noTools: true` 或其他现有 API 不接受的字段，也不能通过 defaultArgs 绕过现有保护。

实施要求：

- 在现有 Agent/Command owner 内建立或验证受控 planner 配置；只做为本任务隔离确有必要的最小变化，补对应 API 合同测试和文档。
- 根据实际 Codex 版本的官方配置能力限制 shell/exec、MCP、插件和 hook 等外部副作用来源，检查用户级/项目级配置继承；不能仅用提示词约束。
- 官方文档提供 shell tool 开关与 MCP enable/allowlist 等控制，但单一开关不自动构成完整隔离。记录实际支持版本、有效配置和行为验证，不猜参数。
- 保持最小文件读取范围，planner 只需要任务说明和用户文本；不向其暴露整个仓库或桌面文件。模型请求本身所需的网络与任意工具网络访问应区分。
- 无法确认受控策略时，默认禁用模型驱动 live 执行并解释具体缺口；仍可完成 UI、数据校验与确定性脚本的受控测试，不退回无限制 Agent。

不使用 full-access、绕过审批或自动赋予桌面权限作为“解决配置问题”的办法。不修改用户全局 Codex 配置以影响其其他任务；配置、认证引用与任何缺失授权均需可解释。

### 7.3 普通用户首次使用

应区分：Runtime/Custom UI 是否可用、Command 是否启用、CLI 路径是否配置、CLI 版本/协议是否支持、认证是否可用、planner 策略是否满足、当前平台计算器与权限是否就绪。

现有 `Agent.getCapabilities()` 的 configured 不等于已验证登录和完整调用成功。认证可能只能通过显式受控探测/调用确认，不能显示误导的“已就绪”。缺项给一次清楚提示和设置指引，不在每次状态刷新时打开授权窗口。

复用现有程序路径、model、profile、认证引用配置，不硬编码开发者路径或某个账号可用模型。聊天框不得接收或保存 API key。默认本地运行的是 CLI 与自动化；除非另行配置本地模型，不能宣传为全部离线运行。[外部依据 E1]

## 8. Task 生命周期、取消与并发

### 8.1 状态机

```text
idle → checking → planning
planning → awaiting_confirmation | needs_input | unsupported | failed
awaiting_confirmation → running | canceled
running ↔ observing
running/observing → succeeded | failed
planning/running/observing → canceling → canceled
任何未满足的运行前置条件 → blocked
```

状态名是应用层内部约定，不是 Runtime 枚举。终态只能由当前 taskId 的受控路径设置；terminal 后不得被迟到成功事件覆盖。

### 8.2 取消语义

- 理解阶段：取消当前 Agent 调用，将信号传给现有 Command owner，等待子进程受控清理。
- 等待确认：取消预览，不启动计算器，不产生清空动作。
- 点击/观察阶段：每次外部副作用之前检查取消；每个 await 返回后再次检查；长等待有超时与及时检查点。
- 当前已提交的单次 native click 不承诺撤销；停止后不发出下一次点击。界面区分“正在停止”与“已停止”。
- 新任务必须等待旧任务清理完成；不能以仅把 busy=false 的方式重新开放运行。
- 任务失败或取消不自动重试整段计算，不把已完成前缀隐藏，也不自动清空、撤销或关闭计算器。
- 停止当前任务不退出整个 UI execution；关闭此聊天窗口则取消自身任务并释放自身 listener/计时器/子进程，不调用 `ui.closeAll()` 关闭其他产品窗口。

如果底层某项 native 调用不支持主动取消，必须声明最大等待边界，通过有界调用与后续动作检查实现停止；不能声称零延迟停止。

### 8.3 任务串行与真实桌面共存

首版同一聊天运行器只有一个活动任务；忙碌时拒绝重复发送/执行，不静默排队。用应用层 taskId 管理逻辑任务，不发明 `Execution.create()` 或通过第二个 opendesk 进程隔离每一轮。

这只提供本运行器内串行，不自动证明整个桌面全局互斥。若有已存在的统一执行协调能力应复用；否则与 Script Runner 或用户手动操作同时抢桌面时，依靠焦点/身份守卫停止并明确声明限制，不在本例暗建全局 Scheduler。

## 9. Chat UI 设计

### 9.1 最小视图

| 区域 | P0 内容 |
| --- | --- |
| 顶部 | 对话式任务运行器、当前计算器支持状态、简要配置状态 |
| 对话区 | 用户指令、澄清/不支持说明、宿主生成的任务卡片、真实结果 |
| 输入区 | 多行输入、发送；运行中显示停止 |
| 任务卡片 | 将操作的应用、清空提示、按钮链/真实结果依赖、执行/取消 |
| 状态区 | 理解、等待确认、操作第几步、读取、停止、完成或失败 |

首版允许只以按钮发送。Enter/组合键、中文输入法 composition 和快捷键必须有现有 bridge 支持及真实测试后再启用，不允许在输入法选词时误发任务。

### 9.2 技术边界

使用 [Custom UI](../api/ui.md) 的真实已支持能力。HTML/CSS 是受限本地资源，业务逻辑在外层 JS listener；不插入 `<script>`、内联事件、远程脚本或任意浏览器框架。模型和用户文字一律作为文本转义，不作为 HTML 执行。

滚动区、动态内容、长消息和任务卡片的实现按当前 control/update 能力验证，不能想当然照搬浏览器 DOM API。若存在 UI 表达缺口，先以现有控件组合完成可用首版；仅对确实阻塞的能力作最小扩展并补测试。

### 9.3 焦点与反馈

点击“执行”后，在任务开始时按已验证流程激活计算器；进度更新不得反复 show/activate 聊天窗口。用户点击停止可能改变焦点，取消必须优先阻止后续桌面动作。模型异常和桌面错误必须可见，但不弹出无限重复模态框。

UI 验收单独检查中文换行、滚动、输入框和按钮对齐、窗口尺寸、长错误、空消息、禁用状态及关闭清理。功能测试通过不代替真实窗口视觉验收。

## 10. 结果、证据与错误合同

### 10.1 结果来源

应用层结果至少能表达：taskId、任务类型、终态、已完成步骤前缀、失败阶段、耗时，以及 firstResult/finalResult 的 raw/normalized/read source。

读数来源应绑定本次窗口身份与观察时间；每一段实际按钮序列都可追溯到用户输入或本次实际读值。不得以模型文字、旧运行日志或测试 expected 填充真实输出。

输出不必设计新的通用 Runtime result class；可用普通对象。显示数值作为字符串保留，避免无必要的 Number 转换、精度损失或格式猜测。

### 10.2 记录与隐私

正式源码与测试 fixture 入仓库；运行记录、截图、临时配置和探测结果放在 `.runtime/` 或当次 `Execution.artifactDir` 的约定子目录。不得提交真实认证、个人屏幕或完整用户聊天。

默认 UI 历史只保存在内存。证据按本次验收所需最小范围采集；截图只在授权后进行，主要用于验证，不作为每次规划必传输入。日志脱敏，不记录 API key、认证文件内容或未经批准的环境变量。

### 10.3 必须区分的失败

配置未完成、CLI/认证失败、planner 策略未满足、模型超时/非法 JSON、未知任务/按钮、输入超界、权限缺失、平台/布局不支持、窗口失焦、读数不完整/歧义/不稳定、不支持数字格式、用户取消。

可定义应用层错误分类，但不得伪称为已经存在的 Runtime error code。无论哪类失败，都不得显示“任务成功”或继续消费无效第一读值。

## 11. 文件归属与启动契约

建议新增职责布局；执行者应先核对现有目录是否已有同职责实现，优先复用而非再建平行入口：

```text
examples/ai-workflows/chat-calculator/
├── main.mjs           # UI 入口与任务生命周期
├── panel.html         # 受限本地视图
├── panel.css          # 本地样式
├── calculator.mjs     # 无顶层执行副作用的参数化操作模块
├── task-contract.mjs  # 静态 task 映射与校验；不是通用执行引擎
└── README.md          # 依赖配置、支持范围、普通用户命令与验收状态
```

模型 schema、提示词模板、应用状态逻辑在职责确有需要时再拆小文件，避免一开始堆大量目录或让 controller 承担厂商协议。

纯应用逻辑测试归 `tests/` 对应领域；新增或修改 Runtime 公共契约时按 `AGENTS.md` 使用正式 `tests/runtime-api/` JavaScript 测试。不要把异常矩阵全部塞入 examples，也不要为 JS 可观察行为另建 Go 包装测试。

实现后的目标公开命令是从仓库根目录执行：

```bash
./dist/opendesk -ui -script examples/ai-workflows/chat-calculator/main.mjs -console-mode script
```

这是待验收的目标命令，本文不声称文件或可运行二进制已存在。CLI 路径/认证仍需先按实际公开契约配置；一行启动不表示替用户完成登录。已安装 Runtime 用户可使用等价的 `opendesk` 入口，不能要求普通用户 checkout 源码或安装 Go。

首版目录不放进 `workflows/`，因为这是运行时公开示例，而不是脚本作者工作流。后续产品化再按现有产品 source/resource ownership 接入，不能为了打包把业务源代码搬进 Go 实现目录。

## 12. 实施任务树与环节交接

- A｜得到可独立调用的确定性计算能力。
  - 输入：已有生产示例、golden 来源、目标任务与支持范围。
  - 工作：建立无顶层副作用的普通模块，补齐必要按键、校验、状态检查、通用读数和取消点。
  - 输出：不依赖模型的两种可调用任务、正反例和来源差异；真实资格另行标记。
- B｜得到受控的自然语言任务输入。
  - 输入：任务 schema、固定任务说明、当前 Agent/Command 合同。
  - 工作：复用 Agent.run；落实或验证 planner 权限配置；模型输出与宿主语义校验分离。
  - 输出：有效任务 / 澄清 / 不支持；坏输入不造成任何桌面动作。
- C｜得到可交互的任务窗口。
  - 输入：有效计划、状态机、Custom UI 实际能力。
  - 工作：实现输入、预览、确认、进度、取消、长消息和关闭清理。
  - 输出：可单独启动的聊天 UI；以清楚标记的 fake 验证交互，但不冒充真实模型/桌面通过。
- D｜得到可追溯的完整执行链。
  - 输入：冻结的用户确认、有效任务、就绪环境。
  - 工作：同一 execution 调用参数化模块；记录 firstResult 到第二段按钮的真实数据关系。
  - 输出：真实执行结果、完成前缀、错误/取消状态及最小证据。
- E｜得到可交付的资格与接续材料。
  - 输入：精确候选源码、当前 Runtime/host pair、配置与测试记录。
  - 工作：原样运行公开命令；验证业务、变化、异常、取消和视觉；沿失败链路最小修复。
  - 输出：PASS/FAIL/NOT RUN/BLOCKED 清单、支持范围、直接命令和剩余本地验收目标。

A/B/C 可在能力边界清楚的前提下推进，不要求为每个节点另建 Skill、Agent 或工作流文件。

## 13. 验收矩阵与评分门槛

文档创建时以下各项均为待实现或待验收；不得从原 golden 资格推导新参数化链路通过。

| 编号 | 必须证明的行为 | 成功标准 |
| --- | --- | --- |
| T01 | 普通启动 | 文档工作目录下原样执行一行命令，真实聊天窗口可用 |
| T02 | 简单自然语言 | “计算 25 乘以 4”经过真实 Codex 转参数，确认后真实点击并读取 `100` |
| T03 | 同任务读值复用 | `25 × 4 + 10` 实际读取后再 `6 × firstResult`；观察到 `110`、`660`，第二段数字来源可核对 |
| T04 | 变化输入 | 例如 `12 × 3 + 4` 后再乘 `5`，实际读到 `40`、`200`；不是写死 golden 答案 |
| T05 | 未知/恶意输入 | 未知 task、按钮、额外 code/path/command、越界长度、模型夹带动作均在副作用前拒绝 |
| T06 | 不支持与澄清 | 非计算器任务、复杂不支持运算、跨消息“继续算”等不猜测、不执行 |
| T07 | 首次确认 | 确认前无清空/点击；预览来自已校验参数；旧确认与双击不能重复执行 |
| T08 | 规划取消 | 当前 Agent/Command 调用停止并清理；迟到结果不能进入执行 |
| T09 | 操作/读数取消 | 停止后无新的动作；有界等待；保留已完成前缀，UI 仍可用 |
| T10 | UI 关闭与重复任务 | 自身窗口关闭清理，不影响其他窗口；新任务不与旧任务交错 |
| T11 | 窗口平移与失效 | 至少一次平移后仍定位正确；失焦、尺寸变化、错误窗口必须停止 |
| T12 | 读数异常 | 缺失、歧义、超时、异常格式不补答案、不进入第二阶段 |
| T13 | planner 安全 | 有版本/有效配置与行为证据，确认前 planner 不能通过其他工具操作桌面或执行无关命令 |
| T14 | 配置和权限缺失 | 只读检查不循环弹授权窗口，错误能指导用户修复 |
| T15 | 原有资产不回归 | golden/production 约束未被悄悄改变；Script Runner/Recorder 不被替换 |
| T16 | 真实视觉 | 中文、长消息、滚动、输入/按钮、状态切换与窗口比例有实窗证据 |

`100/110/660/40/200` 为独立测试 oracle；生产实现不能用这些值作为实际结果。独立门禁不能仅复用同一生产 read function 的返回就自称独立验证；应结合独立观察、动作记录与可复核实窗证据。

建议质量权重：用户链路 20、真实操作与数据关系 20、安全与确认 15、取消与生命周期 15、输入与失败边界 10、UI 与首次体验 10、维护与证据 10，总分 100，目标 ≥95。

评分只能基于对应测试证据，不能因为本文写得完整就给实现 95 分。真实模型、真实读值依赖、安全、取消或视觉未完成时，不宣称 P0 完整通过；分别记录已完成的静态/模拟层次。

## 14. 网页实施到本地验收的交接

用户接续方式：先在有 GitHub 连接的网页对话中实施并提交主要源码、示例、测试和说明；然后在能访问 macOS 桌面的本地环境完成真实模型、UI 与计算器验收。

网页执行者应重新读取当前 master 与相关规范，复用并行会话已完成的能力，直接交付可运行候选而非再交一份同类方案。网页环境有可用测试工具时运行其能真实运行的测试；没有桌面、CLI 登录或 Runtime/host pair 时，如实记录 NOT RUN/BLOCKED，不伪造 PASS。

缺少本机权限不应阻止网页阶段完成不依赖它的代码和测试资产；也不得擅自申请认证、扩大权限、操作无关桌面或要求用户提供秘密。遇到真正缺失的授权，应只暂停相关 live 项并说明。

交接必须保留：已提交候选与范围、已运行的确切验证及证据、尚未运行项、普通用户启动命令、下一次本地执行需要达到的最终行为。后续提示词以“目标需求”开头，以产品行为和完成标准为主体，不堆历史 Git 命令或全部文件索引。

## 15. 后续演进与外部依据

### 15.1 P1 后再考虑

稳定后可增加保存已批准参数任务、更多经验证应用任务、官方菜单入口与打包、可选低风险免确认策略。新增应用沿同一“已知任务 + 参数 + 真实结果”模式，不自动扩大到任意桌面 Agent。

确有持久会话、增量消息、审批回传和 turn 中断需求时，再评估官方 Codex App Server。P0 不自建完整会话协议，未来替换 planner transport 不应迫使计算器模块和任务输入重写。[外部依据 E2]

### 15.2 外部资料与事实边界

以下为 2026-09-13 核对的官方资料；它们只说明上游能力，不证明 OpenDesk 已完成相应集成：

- E1：[Codex Non-interactive mode](https://developers.openai.com/codex/noninteractive)（当前跳转到 ChatGPT Learn）：说明 `codex exec`、JSON 事件、结构化输出、权限及认证。用于选择受控非交互调用。
- E2：[Codex App Server](https://developers.openai.com/codex/app-server)：提供 thread/turn/event 与中断等协议。只作为后续完整会话的候选，不列为本轮依赖。
- E3：[Codex Configuration Reference](https://developers.openai.com/codex/config-reference)：列出 shell tool、MCP 及配置控制。具体隔离组合必须按用户实际安装版本验证，不将单个只读参数当成完整安全边界。

仓库已有事实以上文链接文件和核对快照为准；本方案的任务 envelope、长度限制、状态机和评分是新设计决策，不是从上游文档或历史 golden 证明出来的现成能力。
