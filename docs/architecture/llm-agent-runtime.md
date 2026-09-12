---
title: LLM / Agent Runtime 与提示词代码混合执行
description: OpenDesk 模型生成、默认 Codex 的多 CLI Agent 薄适配、Profile 与环境配置、协议边界、Execution 生命周期及分环境验收的设计基线。
---

# OpenDesk LLM / Agent Runtime：提示词与代码混合执行

日期：2026-09-12。设计修订：2。

状态：**已讨论的设计基线，供后续实施接续；本次更新文档，没有实现或运行验收。**

除“已核对基础”明确列出的现有能力外，本文中的 `LLM`、`Agent`、Profile、环境键、适配器和新增 Command 选项均为拟新增契约，不表示当前 Runtime 已经提供。示例表达目标用法，不是已通过运行的公开示例。后续以最新源码核对实际进度，不把设计文字当成实现证据。

本次有效决定：**保留 `LLM.generate()`；将 `Agent.run()` 明确定义为基于现有 Command 的外部 Agent 薄调用入口。默认选择 Codex，可以显式选择其他 CLI，但必须由对应协议适配器处理，而不是仅替换可执行文件名。** 不开发第二套 Agent 引擎、进程管理器或环境解析器。

此前 96/100 仅为方案设计自评，不是外部专家认证或实现成绩。实际交付质量目标不低于 95/100，以证据支持；网页代码工作、真实 CLI、真实模型和本地桌面验收分开记录。

## 1. 目标需求

让普通 OpenDesk JavaScript 在同一次 Execution 中交替执行确定性代码与明确的模型或 Agent 调用，获得经过校验的数据后继续操作桌面。

```text
启动并确认计算器
→ 点击 25 × 4 =
→ 从显示区读取 baseResult
→ 通过 HTTP 模型，或默认 Codex / 显式选定的其他 CLI，取得 5～15 的整数 increment
→ 校验并保存 increment
→ 重新确认计算器仍可安全继续
→ 点击 + increment =
→ 从显示区读取 finalResult
→ 独立校验并输出真实结果
```

最终成果仍是普通 OpenDesk JavaScript。模型只在明确需要的节点参与；确定性点击、数据处理、条件判断与结果验证继续由代码完成。

用户应能从只提供 prompt 的简单调用开始，按需要增加 backend、model、命名 Profile 和后端专属参数；不必在业务代码中处理 CLI 参数、认证材料、JSONL 或厂商响应字段。

本例的“随机”定义为模型在区间内选择整数，不承诺均匀随机。需要可检验随机分布的业务另用随机数工具；本例保留真实模型调用以验证混合执行。

## 2. 架构决定与职责

```text
普通 OpenDesk JavaScript
├─ LLM.generate()
│   └─ HTTP 模型协议适配器
│       └─ 现有 HTTP owner
├─ Agent.run()
│   └─ 确定本次 backend / Profile
│       ├─ codex      → Codex exec 适配器（未配置其他默认项时使用）
│       ├─ claude-code→ Claude Code 非交互适配器
│       └─ gemini     → Gemini CLI headless 适配器（分批实施）
│           ↓
│       现有 Command.run / 进程 owner
└─ Command.run()：保留直接调用通用外部程序的能力

共享输出校验和必要配置工具；请求、子进程与取消归当前 Execution 管理。
```

| 层次 | 唯一职责 | 不能混淆的边界 |
| --- | --- | --- |
| 普通 JS | 业务流程、桌面动作、变量传递和业务校验 | 不把模型输出作为任意代码执行 |
| LLM.generate | 一次模型生成与完整结果交付 | 不隐式获得 Agent 工具、文件修改或桌面权限 |
| Agent.run | 选择后端、提交外部任务、等待并校验结果的薄入口 | 不实现自主规划器、工具循环、多 Agent 调度或独立 Runtime |
| CLI 适配器 | 参数与输入编码、协议完成判定、结果提取及错误映射 | 不重复进程启动、停止、环境解析和资源清理 |
| Command | 通用可执行文件启动、stdin、输出限额、退出与进程生命周期 | 不理解 prompt、模型名、schema、Codex 或其他 Agent 事件 |
| Profile | 后端绑定、程序位置、认证引用、默认参数和授权要求 | 配置不能自行提升宿主授权；不同后端的配置不能混用 |
| Execution | 资源归属、总超时、取消和清理 | 不为每个模型或 Agent 节点建立独立 OpenDesk Execution |
| 后续步骤管理 | stepId、输入输出、分支与接续状态 | 不是 P0 的前置平台 |

`Agent.run()` 的语义是向已配置、已授权的外部 Agent 提交一次任务，不是“无副作用文本服务”。不能只把 Command 改名，也不能把这层封装扩大成另一套 Agent 框架。

调用入口按语义而非传输划分。以后经 HTTP 调用外部 Agent 仍归 Agent；经 CLI 调用普通程序并不自动成为 Agent。普通 Python、构建工具等继续直接使用 Command；需要共享 Agent 数据合同的自定义程序可走后续 wrapper 路线。

首版入口与 Profile 类型不匹配必须失败。不得仅换一个 Profile 就让 LLM.generate 暗中变成可写文件、可调用工具的 Agent。

### 2.1 三层成功分别判断

| 层次 | 判断依据 | 负责方 |
| --- | --- | --- |
| 进程成功 | 退出状态、I/O 和输出限额 | Command |
| 调用成功 | 协议完成、无终止性失败、最终输出满足 schema | CLI 适配器 / Agent.run |
| 业务成功 | 真实桌面或文件达到用户要求 | 业务脚本及独立验收 |

进程返回 0 不等于 Agent 完成；schema 合法不等于内容真实；Agent 说“已修改”不等于文件或业务已经验证成功。

## 3. 已核对基础与待补能力

初次设计所读源码基线为 `ecea7e9df212193e55455c37a4379f713ee1e903`；本次更新读取 `e6df609ff4e9dfc57ddb4b0d0bd14b3670f54510` 的设计和 Command 合同。SHA 仅为来源定位，后续实施须重新取得最新基线，不回退或锁定旧提交。

| 现有基础 | 已核对合同 | 本次复用与缺口 |
| --- | --- | --- |
| JavaScript Runtime | async/await；资源和取消归 Execution；不是 Node.js；该基线没有公开 ESM loader | 使用已有脚本入口，不预设 npm SDK 可直接 import；并行 ESM 工作以新源码为准 |
| HTTP / axios | 请求、超时与 AbortSignal | 复用 HTTP owner |
| 环境配置 | .env、.opendesk.env、显式 env-file、Execution.env 快照 | 不创建第二套环境解析 |
| Command.run | 参数数组、cwd、一次性 stdin、有界 stdout/stderr、timeout、signal | 足以作为一次性非交互调用的底层 |
| Command 环境 | env 覆盖 Execution.env，而非替换 | 在现有 owner 补通用环境替换，不隐藏在 Codex 特例中 |
| Command 交互 | 没有流式 handle、PTY、持续 stdin 或 IPC | P0 不冒充 App Server 双向通道 |
| Command 准入 | 本地 -script / ai run 可用；HTTP、MCP、Scheduler 禁用 | Agent 不得成为绕过入口准入的后门 |
| UI / 计算器 | 已有明确 scope 的操作和启动、按键、读数 helper | 复用后补齐多位数、完整数字输入和状态验证 |

现有案例 `examples/human-to-recipe/calculator-115.semantic.recipe.js` 限定特定 macOS 布局，数字映射不足以覆盖所有 5～15 输入。旧例子的通过不能转移为本例或 Windows 的通过。

现有公开合同：[Runtime](../api/runtime.md)、[HTTP](../api/http.md)、[Environment](../api/environment.md)、[Command](../api/command.md)、[Desktop UI](../api/desktop-ui.md)、[Execution](../api/execution.md)。真实资源及生命周期扩展归已有 native owner；纯 JS 参数适配和组合可以是 facade，不复制同名 native global。

## 4. LLM.generate 与共享输出契约

### 4.1 保留单一主要生成入口

保留 `await LLM.generate(options)`。这是异步生成接口的合理命名，不是行业统一标准名称。不并列增加 ask、chat、complete、generateJSON 等相似入口。流式需求以后单独设计，不让 generate 因一个 stream 参数改变返回类型。

```js
const numberOutput = {
  type: 'json',
  name: 'integer_5_to_15',
  validation: 'native',
  schema: {
    type: 'object',
    properties: {
      value: { type: 'integer', minimum: 5, maximum: 15 }
    },
    required: ['value'],
    additionalProperties: false
  }
};

const result = await LLM.generate({
  profile: 'default',
  prompt: '随机选择一个 5 到 15 的整数，包含两个端点。',
  output: numberOutput,
  timeoutMs: 30000
});
const increment = result.data.value;
```

普通文本省略 output，result.data 为字符串。上述接口仍为拟实施合同。

| 输入 | 契约 |
| --- | --- |
| profile | 省略时使用默认模型配置，不在调用处填写密钥 |
| prompt / messages | 简单 prompt 或显式历史，互斥，不自动混合 |
| system | 可选任务规则，与普通业务输入分开 |
| output | 默认文本；JSON 使用 type、name、schema、validation |
| generation | 可选 token 上限等；只接受当前协议与模型支持的参数 |
| timeoutMs | 整次调用总预算，包含准备、等待、重试与验证 |
| signal | 复用 Runtime AbortSignal，始终受外层 Execution 约束 |

### 4.2 统一结果与完成语义

业务数据统一使用 `result.data`：文本为字符串，JSON 为验证后的对象。业务代码无需访问 choices、output items、structured_output、response 或 CLI 日志。

统一结果包含 data 和 meta。meta 至少关联 callId、Profile、调用种类、后端、适配器及耗时；模型名、用量等只在确实可知时提供。为避免字段混淆，本次修订用 `kind` 区分 llm / agent，用 `backend` 标识实际后端，不再使用此前示意中 backend='model' 作为分类。

```js
// Agent 结果形状示意，不是本轮运行数据。
{
  data: { value: 12 },
  meta: {
    callId: '...',
    profile: 'codex-analysis',
    kind: 'agent',
    backend: 'codex',
    adapter: 'codex-exec',
    requestedModel: null,
    model: null,
    durationMs: 850,
    usage: null
  }
}
```

请求的 model 与后端实际报告的 model 区分。未返回实际模型或用量时为 null，不把配置值冒充实际执行事实。后端原始正文、诊断日志和推理事件不默认塞入公共结果。

只有完整结果、协议成功且输出校验通过才能 resolve。拒绝、截断、缺失结果、超时、取消、格式错误必须保持失败；结构化结果不含糊返回半个对象。

### 4.3 输出验证模式

本次明确公共字段为 `output.validation`，LLM 与 Agent 共用：

| 模式 | 契约 |
| --- | --- |
| native | JSON 默认模式；要求后端有可核验的 schema 输出能力，并在本地再次校验 |
| local | 显式允许通过提示词要求 JSON；仍严格解析和本地校验，但不声称后端约束生成 |

后端是否支持、schema 子集及具体模型限制由适配器声明并核验。CLI 输出一个 JSON envelope 不代表 envelope 内的业务回答满足用户 schema。没有 native 能力时明确失败，不静默降级 local，不偷偷删除不支持的 schema 关键字。

本地不强制转换：字符串 "12" 不变成 12，16 不截断成 15，8.5 不取整；不从解释文字中正则抠数字，不执行输出中的代码。可本地判断的 schema、互斥参数、未知字段与能力冲突应在网络或 CLI 启动前拒绝。

## 5. Profile 与环境配置

### 5.1 复用已有环境快照

```text
默认环境：.env → .opendesk.env → OpenDesk 进程继承的环境
显式 env-file：仅选择该文件，并保持已有进程环境覆盖规则
```

LLM / Agent 消费 Execution.env，不重新扫描目录、不读取 shell 初始化文件、不修改宿主环境。一次 Execution 内配置稳定；下次运行才消费文件变化。环境值为字符串，必须按字段验证类型、范围和空值；dotenv 的字面量不变成新的变量插值机制。

### 5.2 最小配置与后端独立参数

以下全部为拟新增键：

```dotenv
# HTTP 模型保持独立配置。
OPENDESK_LLM_PROTOCOL=openai-responses
OPENDESK_LLM_BASE_URL=https://api.openai.com/v1
OPENDESK_LLM_MODEL=YOUR_MODEL_ID
OPENDESK_LLM_API_KEY=YOUR_API_KEY
OPENDESK_LLM_TIMEOUT_MS=30000

# Agent 默认后端；省略且没有其他默认 Profile 时为 codex。
OPENDESK_AGENT_BACKEND=codex
OPENDESK_AGENT_TIMEOUT_MS=120000

# 每个 CLI 的路径、可选模型、认证配置相互独立。
OPENDESK_CODEX_EXECUTABLE=/absolute/path/to/codex
OPENDESK_CODEX_AUTH_MODE=saved
# OPENDESK_CODEX_MODEL=YOUR_CODEX_MODEL_ID
# OPENDESK_CLAUDE_CODE_EXECUTABLE=/absolute/path/to/claude
# OPENDESK_CLAUDE_CODE_MODEL=YOUR_CLAUDE_MODEL_ID
# OPENDESK_GEMINI_EXECUTABLE=/absolute/path/to/gemini
# OPENDESK_GEMINI_MODEL=YOUR_GEMINI_MODEL_ID
```

默认 Codex 是后端选择默认值，不代表已安装、已登录、具有权限或零配置运行一定成功。未提供 model 时允许 CLI 使用其实际配置，不固化一个可能过时的默认模型 ID。

已有设计中的 OPENDESK_CODEX_TIMEOUT_MS 作为 Codex 后端专属默认值继续保留；通用 OPENDESK_AGENT_TIMEOUT_MS 是后备值。其他后端不读取 Codex 的模型、凭据或专属超时。密钥使用适配器需要的独立引用，不把 HTTP Key 自动传给 CLI。

### 5.3 可选命名 Profile

单一后端不必先创建 Profile 文件。多个配置可通过拟新增 `OPENDESK_AGENT_CONFIG` 显式指向配置文件；相对路径以 Execution.workdir 为准，文件必须有效且由可信本地配置选择，不由远程脚本自行选择宿主文件。没有此键就不自动遍历目录寻找配置。

```dotenv
OPENDESK_AGENT_CONFIG=config/agents.json
OPENDESK_AGENT_DEFAULT_PROFILE=codex-analysis
```

配置形状示意：

```json
{
  "schemaVersion": 1,
  "defaultProfile": "codex-analysis",
  "profiles": {
    "codex-analysis": {
      "backend": "codex",
      "executableEnv": "OPENDESK_CODEX_EXECUTABLE",
      "modelEnv": "OPENDESK_CODEX_MODEL",
      "auth": { "mode": "saved" },
      "policy": "analysis",
      "timeoutMs": 120000
    },
    "claude-analysis": {
      "backend": "claude-code",
      "executableEnv": "OPENDESK_CLAUDE_CODE_EXECUTABLE",
      "modelEnv": "OPENDESK_CLAUDE_CODE_MODEL",
      "policy": "analysis",
      "timeoutMs": 120000
    }
  }
}
```

`policy` 是要验证和执行的权限要求，不是授予权限的魔法字符串。auth 的类型和值按后端定义；不假定 Codex 的 saved/API Key 选项对其他 CLI 同样有效。未声明认证模式时，由后端选用已配置且允许的认证方式；不自动登录。

Profile 可使用 executable / executableEnv、model / modelEnv 两种来源形式，但同一字段的字面值与 Env 引用互斥。显式 Env 引用缺失时按字段处理：程序路径可在授权的已知路径中解析，找不到就失败；可选 model 缺失可沿用 CLI 默认；必须的凭据不能因此变为匿名或其他身份。空值和非法值不当作缺省。

内建 `<backend>-analysis` 配置使用对应后端的环境引用。自定义 Profile 只读取其声明的引用，不再被一套隐含厂商默认值改写。Profile 名称在各自 LLM / Agent 配置域解析，不跨域混用。配置不能直接包含真实密钥或任意待执行脚本。

### 5.4 后端选择和覆盖规则

选择必须确定，不能简单把所有配置混成一个对象：

1. 显式 profile：它绑定本次 backend。若同时传 backend，必须相同，否则启动前报告配置冲突。
2. 只传 backend：使用该后端的内建 analysis 配置；不套用另一个后端的全局默认 Profile。
3. 两者均省略：依次选择 OPENDESK_AGENT_DEFAULT_PROFILE、配置文件 defaultProfile；都没有时使用 OPENDESK_AGENT_BACKEND；再没有才使用 codex。
4. 已明确选择的后端、Profile 或程序不存在时失败，不自动换成已安装的其他 CLI，不自动安装、登录或回退到 HTTP。

同一有效后端内，可覆盖字段使用：本次调用 > 选定 Profile > 对应后端默认值 > 通用默认值。权限只能在宿主授权内收紧或选择已授权配置，不能按这一普通覆盖规则扩大权限。

配置是冻结快照；model 等标量替换，数组整体替换，backendOptions 只按已知 schema 字段合并；不接受未知键或任意深合并。记录最终选择来源与脱敏摘要，不记录整个环境或密钥。

### 5.5 GUI、凭据与远程来源

GUI 不依赖终端偶然提供的 PATH。CLI 路径优先按可信配置解析为确定程序，不在不可信 cwd 搜索同名程序；诊断给出程序位置和已检查版本，不打开登录窗口。

.env 是配置载体，不是加密保险箱。不将真实文件、API Key、CLI 认证材料或完整环境打包发布。未来官方代付调用应走受控服务，不内置通用 Key。

App Mode 由宿主明确选择用户配置位置，再交给已有解析器；不根据 GUI 偶然 cwd 寻找密钥。保持 HTTP、MCP、Scheduler 的空环境与 Command 禁用边界；将来需模型能力时，单独授权指定 Profile，不暴露整个宿主环境。

## 6. HTTP 模型协议适配

这是客户端适配，不新增 localhost 服务或固定端口：

```text
LLM.generate → 校验输入 / Profile → 协议适配 → 现有 HTTP
→ 判定完成状态 → 提取结果 → 本地 schema 校验 → data + meta
```

| 适配器 | 路径后缀 | 独立合同 |
| --- | --- | --- |
| openai-responses | /responses | input、text.format、类型化输出项和完成状态 |
| openai-chat-completions | /chat/completions | messages、response_format 与对应响应 |
| anthropic-messages | /messages | 专属鉴权、版本请求头及内容块；后续按需实施 |

baseURL 包含版本前缀，例如 /v1，适配器负责路径拼接，不生成 /v1/v1。改变地址不等于所有厂商兼容。P0-A 保留 Responses / Chat Completions 目标，实际参数以实施时官方资料为准。

适配器分别负责请求映射、鉴权与目的地址绑定、拒绝/截断/缺失结果判断、data + meta、稳定错误和脱敏。HTTP 200 不等于业务成功。不支持的参数明确拒绝，不静默忽略。保留 TLS 验证，远端默认 HTTPS，本地 HTTP 需显式配置；默认不跟随重定向转发凭据。

只在当前模型调用内部进行允许的有界重试，总 deadline 不重置。不自动切换厂商，不从 HTTP 失败暗中转到 Codex。完整 HTTP 协议验收属于 P0-A，与 Agent 多 CLI 适配可分别推进，但结果合同须共享。

## 7. Agent.run：默认 Codex 的多 CLI 薄适配

### 7.1 渐进式调用

以下是目标接口，不代表适配器已经实现：

```js
// 无显式默认配置时选择 Codex；仍要求程序、认证与权限已满足。
const a = await Agent.run({
  prompt: '随机选择一个 5 到 15 的整数，包含端点。',
  output: numberOutput
});

// 显式切换 CLI；数字消费和后续桌面代码不变。
const b = await Agent.run({
  backend: 'claude-code',
  prompt: '随机选择一个 5 到 15 的整数，包含端点。',
  output: numberOutput,
  timeoutMs: 120000
});

// 对支持的后端设置模型及专属参数。
const c = await Agent.run({
  backend: 'codex',
  model: 'YOUR_CODEX_MODEL_ID',
  prompt: '根据给定文本提取一个符合 schema 的结果。',
  output: numberOutput,
  backendOptions: {
    codex: { reasoningEffort: 'low' }
  }
});

// 生产业务优先引用已审核的命名配置。
const d = await Agent.run({
  profile: 'codex-analysis',
  prompt: '随机选择一个 5 到 15 的整数，包含端点。',
  output: numberOutput
});
```

`reasoningEffort` 等专属字段必须由已选适配器和模型实际支持；示意值不能变成无条件通用参数。业务程序切换后端时保持 output 合同，但不承诺得到相同内容、质量、耗时或权限。

### 7.2 参数分层

| 参数 | 语义 |
| --- | --- |
| backend | CLI 家族标识，如 codex、claude-code、gemini；不是模型供应商名、程序路径或模型 ID |
| profile | 命名的后端绑定及默认参数；与显式 backend 不一致时拒绝 |
| prompt | 本次任务文本，必须是有效字符串；P0 不隐式加载历史或复用上一次会话 |
| model | 可选模型 ID；只覆盖当前后端允许的模型选择，不自动切换后端 |
| output | 与 LLM 共用文本 / JSON schema / validation 合同 |
| cwd | 可选、在已授权范围内的任务目录；省略时由 Profile 或本次隔离任务目录决定，不默认把整个业务仓库交给 CLI |
| timeoutMs / signal | 总预算与取消，复用 Execution 与 Command |
| backendOptions | 按后端名称命名空间组织的已知专属选项，不是任意原始命令参数 |

backendOptions 只允许当前已选后端的命名空间。传入其他后端字段、未知字段、与公共字段重复的 model/cwd/output 设置都应明确拒绝，不能静默忽略。

程序路径、认证引用、默认权限与额外可读目录属于可信 Profile / 宿主配置，不从 prompt 推断，也不在通用业务调用里暴露任意 shell。

不为灵活度加入无限制 args、extraArgs 或任意 `-c` 配置透传。适配器拥有非交互模式、stdin、输出协议、结果位置、权限和会话相关参数；调用者不能用原始参数覆盖这些保留项。新增需求先补受验证的 backendOptions；需要完全原始 CLI 行为的可信作者继续直接用 Command，不把它伪装成统一 Agent 合同。

P0 不增加 Codex.run、Claude.run、AI.run 等平行公开入口；内部适配器映射保持轻量，不建设动态插件市场或任意 JS 注册执行系统。

### 7.3 适配器接口边界

内部按统一职责组合，不要求公开以下方法名：

```text
描述协议与已验证能力
→ 校验本次输入、配置、权限和选项
→ 生成可执行文件、argv、stdin、结果提取计划
→ 由共享调用层使用现有 Command 启动
→ 按本后端协议解析完成 / 失败与最终业务结果
→ 共享本地校验、取消完成竞态检查和错误规范化
```

适配器不能自行新建进程 manager、绕过 Command 准入、依赖未公开 require/import 或调用未授权工具。准备文件、进程执行和最终读取均计入一个调用预算。CommandError 中的原始 stdout/stderr 不直接扩散到高层公共错误。

错误需能区分配置冲突、后端未实现、程序缺失、认证缺失、版本/选项/schema/权限不支持、进程失败、协议失败、输出非法、超时和取消，并保留后端与阶段的脱敏定位信息。

### 7.4 三种 CLI 的协议差异与实施次序

以下外部能力来自本次核对的官方文档；OpenDesk 对应适配器仍待实施，并须记录实际测试版本。

| backend | 官方非交互形态 | 输出提取重点 | 本方案实施顺序 |
| --- | --- | --- | --- |
| codex | codex exec；JSONL；output-schema 和最终消息文件 | 终止状态与最终消息分开判断，schema 文件和结果归本次 callId | 默认后端，P0-B 必须实施 |
| claude-code | claude -p；output-format json；json-schema | 文本 result 与结构化 structured_output 不同；完整 envelope 的错误/完成信息独立检查 | 首个真实可切换后端，P0-B 一并实施 |
| gemini | headless / -p；output-format json 或 stream-json | json envelope 的 response 是回答字符串，stats/error 为协议字段 | 后续批次；文本和显式 local JSON 可先实施，native 未核验不得宣称支持 |

Gemini CLI 输出 JSON 的事实不证明可以约束业务 schema，也不代表 Gemini 模型 API 没有 schema 能力；这是 CLI 暴露合同与模型 API 能力的区别。确认具体版本后才能提升 native 能力状态。

P0-B 至少用 Codex 和 Claude Code 两种真实协议实现及不同 fixtures 验证公共接口，不能只有 Codex 代码、一个空注册表和永远报不支持的第二名字。没有真实登录条件时可交付实现和协议 fixture 测试，但真实 CLI 验收单列未验证。

选择未实现的 gemini 等后端时，在启动前返回不支持，不以替换 executable 后继续使用 Codex 参数。后续为 Gemini 增加适配器不应改动 Agent.run 调用合同、Command 生命周期或计算器消费者。

### 7.5 Codex exec 的首版行为

复用现有 Command 的可执行文件与 argv 数组，不模拟键盘控制终端。命令形态参考：

```text
codex exec --json --output-schema <schema-file> --output-last-message <result-file> --sandbox read-only --ephemeral --skip-git-repo-check -
```

这不是固定版本的万能命令模板。根据实际 CLI 版本、任务目录和 Profile 权限选择有效选项；跳过 Git 检查不能被当成扩大权限。提示词优先通过 stdin；命令行只含稳定选项和不敏感配置，不拼接 shell 字符串。

每次调用建立独立目录和 callId；JSONL 用来判断协议状态，指定最终消息为业务正文来源。核对文件属于本次调用，不接受旧残留、其他调用结果或超限文件。不能从日志里搜索最后一段像 JSON 的文字。

非零退出、终止性失败、缺失成功终态、截断、输出超限及无有效最终消息均失败。事件是否致命按后端协议判断；不能将其他 CLI 的非致命 warning 事件套用 Codex 规则，也不能忽略明确失败。

--ephemeral 不会自动清除 OpenDesk 创建的结果和日志。P0 每次新任务，不自动 resume --last、不跨调用混用会话；后续显式会话必须绑定 backend、Profile 和权限，不能跨厂商复用 sessionId。

### 7.6 权限与认证不做虚假统一

分析 Profile 只请求明确输入和获准的只读分析；workspace Profile 才能使用明确授予的工作目录与修改能力。默认不授权桌面、业务文件修改、未知 MCP、插件或 hooks。不同 CLI 的 read-only、plan、工具 allowlist、approval 不是等价概念，适配器必须说明能执行和能保证的限制。

`cwd` 不是沙箱，Command 不是沙箱，read-only 不是所有工具禁用，清理 env 也不阻止文件读取。有效用户/项目配置及自动加载内容必须考虑；不能只靠 prompt 中“不要使用工具”声明隔离成功。所要求的限制无法落实时，在副作用前拒绝或显式标明该 Profile 不支持，不自动降级安全策略。

首版非交互调用不能挂起等待不可见的人类审批；按支持协议明确失败或提示缺少前置授权，不自动启用跳过审批/无限权限选项。提示词和模型输出不能提高授权。

Codex 默认复用已授权 CLI 身份；明确选择单次 API Key 模式才按其合同传入 CODEX_API_KEY。Claude Code 和 Gemini 各自使用其受支持、已配置的认证，不共用 Codex Key 或认证文件。不自动登录、不复制认证文件、不将业务秘密批量传入 CLI。CLI 仍是可信本地程序，不能宣称此封装隔离了同一 OS 用户的所有文件。

计算器由 OpenDesk 控制桌面，外部 CLI 只被委托返回数值；分工要求还需配合真实工具权限检查，不能双方同时控制鼠标和窗口。

### 7.7 其他 CLI 和自定义 wrapper 的扩展路径

非内建后端有两条路径：为有稳定非交互协议的 CLI 增加小型适配器；或后续增加 `json-cli` wrapper 协议，让用户已有 Python、Node、Go 程序转换它所调用的后端。

json-cli 是拟议扩展，不是 P0 必交：stdin 接收一个带 protocolVersion/callId/prompt/output 的 JSON 请求，stdout 仅返回一个同 callId 的成功/失败 envelope，诊断走有界 stderr。宿主仍校验正文、状态、schema、大小和取消；wrapper 自述的权限能力不能被盲信。

wrapper 使用可信配置里的确定可执行文件与固定参数，不将 prompt 拼入 shell。普通 CLI 不遵守这个协议时不能直接贴上 json-cli 标签。无统一结果需求时直接 Command 足够，不强制所有外部语言加入 Agent。

### 7.8 后续持续交互

需要会话、实时事件、人工审批和轮次管理时，使用 Codex App Server 或对应后端正式协议，优先 stdio；不引入固定端口，不用轮询文件伪造双向 RPC。

当前 Command.run 不足以承载双向持续通道。后续在既有进程 owner 上扩展流式通信，不在 Agent 层创建并行进程管理。各后端会话与审批能力分别声明，不强行伪装一致。

## 8. Execution、取消与 Command 通用补强

### 8.1 一个调用归属一个已有 Execution

```text
用户 Stop / signal / Execution 取消
→ 不再接受业务结果
→ 取消同一次 HTTP 或传给 Command 的 signal
→ 由唯一资源 owner 清理请求或受控进程树
→ 迟到结果不提交，不派发后续点击
```

CLI 是已有 Execution 的子进程资源，不是另一个 OpenDesk Execution。Agent 层管理调用完成状态，但不再实现自己的 kill/进程树终止器。

超时覆盖准备、进程执行、结果读取与验证，Command 获得剩余预算，外层更早 deadline 始终生效。Promise.race 不能冒充底层取消。取消与结果提交必须有明确先后判定，已取消的结果不进入业务。

取消不撤销已发生的点击或文件修改。部分副作用、进程是否退出、资源清理是否完成分别记录；不在子进程仍存活时声称清理完成。

### 8.2 环境覆盖与替换

当前 Command.run 的 env 为覆盖。建议在现有 Command 合同增加可复用的 `envMode`，不是新增 Agent 专属进程 API：

| 拟新增模式 | 行为 |
| --- | --- |
| inherit | 默认；保持已有 Execution.env 继承与同名覆盖 |
| replace | 使用显式提供的环境集合，不隐含继承其他键；确有平台必要补项必须公开列明 |

程序解析与环境收紧要一致：先按可信策略确定程序位置，不为补 PATH 临时读取 shell 初始化文件或重新注入整个宿主环境。只给子进程必需的系统变量、获准的代理/证书配置和选定认证引用；Windows 大小写规则保持原合同。

replace 不是文件系统沙箱，也不能改变 execution 来源准入。已有普通 Command 调用默认行为不回归。

### 8.3 结果与输入限额

Command.maxOutputBytes 仅覆盖 stdout + stderr；最终消息文件需要独立的有界读取、大小检查和生命周期。stdin、schema 与业务输入也按已选 CLI 和运行平台的实际限制设限；超限明确报错，不截断后继续。

stdin 写入失败不能被当成已发送成功；某后端会在 stdin 失败后继续执行其他 prompt 时，必须识别并拒绝误用结果。敏感正文优先 stdin，不能为方便透传移入 argv 或 console。

Windows 上需核对实际安装入口是原生可执行文件、脚本还是 .cmd shim，不能为兼容而将模型文本拼进 cmd.exe / PowerShell。受信任的固定解释器启动方案需有独立参数与取消测试；不支持的入口如实报告。

### 8.4 查询与显式检查分离

拟新增 `LLM.getCapabilities()` 与 `Agent.getCapabilities({backend?, profile?})` 使用相同选择规则，只读配置、已知适配器能力和已有检查缓存；不产生模型请求、不启动登录、不弹权限窗口。

至少区分：适配器是否实现、是否配置、程序/版本是否检查、是否支持请求能力、认证状态是否已知、目标平台是否测试。unknown 不等于 false，也不等于可用。

显式检查或真正的 run 才可在授权范围内进行必要的非交互程序/版本检查，不能让列表轮询反复启动探测。网络认证测试需明确动作；配置完整不代表已通过真实模型调用。版本/能力缓存应绑定程序身份与有效配置，程序替换后不能沿用旧资格。

## 9. 失败、重试、结果保存与接续

| 场景 | 行为 |
| --- | --- |
| 临时 HTTP 错误 / 限流 | 仅在允许条件、次数和总预算内重试当前模型调用 |
| CLI 已启动后失败 | Agent.run 默认不自动重启任务，防止重复工具和文件副作用 |
| CLI 内部自行重试 | 属于后端行为，要说明与宿主重试的区别；外层不重启不代表只发生一次模型请求 |
| 鉴权、配置、取消、未知后端 | 明确失败，不静默切换 CLI、模型服务或认证身份 |
| schema / 业务校验失败 | 默认失败；显式重新生成必须有界且记录尝试，不把任意 Agent 当作无副作用生成重试 |
| 已接受结果 | 按任务授权保存并关联 callId、backend、Profile；接续复用，不自动重新选择整数 |
| 点击部分失败 | 先核实真实状态，不整段盲目重放 |
| 取消后迟到结果 | 不提交、不触发下一步 |
| 崩溃恢复 | 检查记录和真实桌面，不承诺仅凭 JSON 检查点无损重放 |

诊断默认只记录状态、脱敏错误、耗时和可知用量，不无选择保存 prompt、原始响应、完整环境或推理事件。任务确需持久化业务结果时与诊断区别处理，不把 `.runtime/` 当永久证据库。

同一桌面输入串行；缺少跨 Runtime 可靠互斥时，明确限制同时运行一条此类桌面任务。CLI 取值阶段不会因此获得桌面控制权。

## 10. 计算器贯穿案例

| 步骤 | 输入 / 行为 | 输出与停止条件 |
| --- | --- | --- |
| 准备 | 明确应用、唯一窗口、允许布局、清空状态 | 对象、布局或权限不满足就停止 |
| 第一次计算 | 点击 2、5、×、4、= | 从显示区读取 baseResult，正常应为字符串 100 |
| 取得数值 | 相同 prompt 与 schema，显式选 LLM 或 Agent | increment 为 5～15 整数；拒绝、超时、取消和非法输出不能进入点击 |
| 继续计算 | 保存的 increment、同一窗口及可验证状态 | 点击 +、逐个数字、=；窗口或状态变化、动作部分失败就停止 |
| 最终验证 | 读取显示区实际值 | 返回 finalResult，与独立预期校验并打印 |

increment=12 转为 `['1', '2']`，不是寻找名为 12 的按钮。全部按钮 token 用字符串。baseResult / finalResult 均来自显示区，不从 expected 赋值；JS 运算只作独立验证。

等待模型后重核窗口身份及计算状态。显示仍为 100 不必然排除待执行运算符；状态连续性无法验证时停止，不盲目继续。

```js
// 目标用法：下面的新调用接口和状态守卫仍需实施。
// 计算器 helper 是业务函数，优先复用并补齐旧案例，不是新全局 API。
const target = await openCalculator();
await allClear(target);
await calculate25Times4(target);
const baseResult = await waitForCalculatorResult(target, '100');

const result = await Agent.run({
  prompt: '随机选择一个 5 到 15 的整数，包含两个端点。',
  output: numberOutput,
  timeoutMs: 120000
});
// 另一 CLI：增加 backend: 'claude-code'。
// HTTP 路线：显式改为 LLM.generate({...})，不由失败回退触发。

const increment = result.data.value;
if (!Number.isInteger(increment) || increment < 5 || increment > 15) {
  throw new Error('模型结果不是 5～15 的整数');
}
await assertCalculatorUnchanged(target, baseResult);
await pressKeys(target, ['plus', ...String(increment).split(''), 'equals']);
const expected = String(Number(baseResult) + increment);
const finalResult = await waitForCalculatorResult(target, expected);
console.log({ baseResult, increment, finalResult });
```

保留原固定例子，新增本例；优先实际 UI.tapTexts 等 API 及有价值的普通 helper，不强制应用对象模型。补齐全数字输入、布局依据、多位数、读数和状态验证；不用未知布局或裸屏幕坐标声称通用。

## 11. 实施阶段、网页工作与文档归属

### 11.1 分批范围

| 阶段 | 必须交付 | 不作为前置 |
| --- | --- | --- |
| P0-A HTTP 模型 | LLM.generate、env、输出验证、两种所需 HTTP 协议、错误与取消 | CLI 多厂商、图编辑器 |
| P0-B 多 CLI 基础 | 薄 Agent.run、默认/显式选择、Profile 与 backendOptions、Codex + Claude Code 真实协议适配源码与测试、Command 通用补强 | 所有 CLI、持久会话、App Server |
| P0-B 本地资格 | 已安装和授权条件下的真实 CLI / 模型、公开脚本及计算器闭环；各平台独立记录 | 网页模拟不代替真实设备 |
| 后续 CLI 扩展 | Gemini、可信 json-cli wrapper、其他适配器，逐项声明能力 | 为每个厂商修改公共接口 |
| P1 持续交互 | 有实际需要再做 App Server、会话、事件、审批、流式输出 | 新 Agent 引擎 |
| 后续步骤展示 | step 状态、数据传递、分支、受控接续；优先复用 Script Runner | 另一主面板或强制 DSL |

保留两条 HTTP / CLI 业务路线。并行会话正在实施 HTTP 或 ESM 时，先核查其真实源码，只复用与最小接线，不重做或覆盖。当前多 CLI 批次重点是 P0-B，不要求为了它一次完成所有后续后端。

### 11.2 网页新对话的可执行交付

网页执行指通过该会话已有 GitHub / 代码工具修改仓库，不是让浏览器直接启动用户电脑上的 Codex。

优先交付真实源码、配置模板、类型、公开文档、确定性 fixture 和测试程序；具备可运行仓库环境时执行测试和构建，缺少时仍完成可审查的代码变更，明确标记未运行并给出本地接续项。不能只有审计报告、提示词或永远抛未实现的占位后端。

只具备 GitHub 读写不等于具备测试执行器；网页、云端 CI 或 Linux 容器通过不等于用户 macOS / Windows 安装版通过。没有本地桌面连接时不得声称启动了计算器或完成真实 UI。缺少凭据不自动登录、不复制认证文件、不借用无关身份，也不将付费请求隐藏在能力查询里。

本轮文档归档不授权立即实施运行代码。后续用户粘贴实施提示词才进入实现任务；实现会话根据工具能力完成最大可执行交付，不能因缺本地设备就停留在纯设计，也不能伪造 live PASS。

### 11.3 文件职责

本文件保持设计单一入口。新增可调用 API 才进入 docs/api，并按 docs/api/.rules.md 同步类型与索引；未实施后端不放在已支持能力列表。正式 Runtime 公共接口测试遵守 AGENTS.md，使用 JavaScript 验证，不用 Go 白盒替代用户入口。

不在 workflows/agent-to-recipe 复制运行时总纲，不重写十二阶段或 Recorder 产品 UI。源码、稳定测试和脱敏文档进入版本控制；运行结果、截图与临时配置留在 .runtime。更新同一文档的实际状态，不追加互相矛盾的新设计总纲。

接续提示词以目标需求置顶，目标与完成标准为主体。网页任务可保留必要的仓库连接目标和现有分支约束，不粘贴本地路径、整套 Git 命令、目录清单或历史讨论。

## 12. 验收与评分

### 12.1 验收矩阵

| 领域 | 必须验证 |
| --- | --- |
| 默认选择 | 无选择时按既定顺序解析并最终默认 Codex；没有程序明确失败，不自动安装或换后端 |
| 显式选择 | backend / Profile / env 优先级，显式冲突，未知名字；不同后端配置不混用 |
| 参数 | model 与后端独立；backendOptions 已知映射、错误命名空间、非法类型、保留参数覆盖均有测试 |
| 双协议最小闭环 | Codex、Claude Code 使用不同真实格式的 fixture；新增后端无需改业务消费者或进程生命周期 |
| 文本与 JSON | 文本；合法 5、10、15；字符串数字、越界、小数、额外字段拒绝；native/local 不静默互换 |
| 完成状态 | 进程 0 但协议失败、缺失终态、无效结构化输出不能成功；终止性错误与警告按后端区分 |
| 环境 / 权限 | env 快照、替换/继承、GUI 路径、密钥脱敏、有效配置限制、远程准入不回归 |
| I/O 与文件 | stdin 失败、带空格路径、Unicode、Windows 入口类型、stdout/stderr 与最终文件分别限额、残留/并发结果不混用 |
| 取消 | 预取消不启动，在途取消、总 deadline、迟到结果拒绝、进程树和监听器清理有证据 |
| 重试 | Agent 外层默认不自动重启；说明 CLI 自身内部重试；失败不重放桌面动作 |
| 真实 CLI | 每个声称 live 支持的后端记录实际程序/版本、认证方式、有效策略和结果，不以 fixture 冒充 |
| 真实业务 | HTTP 模型与 Codex 分别通过显示区读数闭环；新增 CLI 有独立数据交接验证，桌面资格不从旧例继承 |
| 状态与接续 | 已接受整数被复用；窗口漂移、状态不明和点击部分失败被拦截 |
| 平台与回归 | macOS / Windows 分别说明启动与清理证据；原 Command / HTTP / 环境 / Execution 不回归 |
| 交付真实性 | 设计、代码提交、静态审查、测试执行、真实 CLI、真实桌面分级报告，未执行不记 PASS |

模拟 fixture 验证协议和逻辑，不证明 CLI 真正认证成功、权限限制有效或桌面可用。公开例子按声明工作目录和一行原命令验收；临时变体不代替用户入口。

缺少 CLI、凭据、授权、构建工具或设备时，继续完成能执行的源码与测试交付，明确阻塞；不自动安装、登录、启动 VM 或发送无关代码。关键安全失败不能靠降级断言或开放所有权限获得通过。

### 12.2 评分记录

保留此前设计自评：接口 19/20、HTTP/CLI 边界 19/20、配置与权限 19/20、结果及取消 20/20、Runtime 与验收 19/20，合计 96/100。本次扩展不将文档修改计为实现得分。

实现质量目标不低于 95/100；必须附验收范围、真实通过和未验证项。未运行的测试不能计入通过；没有真实 CLI / 双平台 / 桌面证据，不得宣称对应完整产品验收达到 95 分。

## 13. 参考资料与来源边界

既有 LLM 设计与环境规则沿用前轮方案和已读仓库合同。本次重新核对了 Codex、Claude Code、Gemini CLI 的官方非交互资料，用于多 CLI 边界；仍未运行这些 CLI。第三方文档持续变化，实际实施必须记录所用版本，不能把本文例子当成永久 CLI 合同。

| 资料 | 用途与核对范围 |
| --- | --- |
| [Vercel AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) | 前轮生成与 output 设计参考 |
| [LangChain Models](https://docs.langchain.com/oss/javascript/langchain/models) | 前轮 invoke 与结构化输出参考 |
| [OpenAI Text Generation](https://developers.openai.com/api/docs/guides/text) | 前轮 Responses 请求与响应参考，实施时重核 |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | schema、拒绝及支持子集，实施时重核 |
| [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) | 前轮协议参考 |
| [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create) | 后续 HTTP Messages 适配参考 |
| [Codex Non-interactive](https://developers.openai.com/codex/noninteractive) | 本次核对 exec、JSONL、schema、最终消息、认证和权限说明；页面可能重定向至官方 ChatGPT Learn |
| [Codex Config Reference](https://developers.openai.com/codex/config-reference) | 有效配置、工具及权限；具体映射实施时重核 |
| [Codex App Server](https://developers.openai.com/codex/app-server) | 后续双向协议，不是 P0 前置 |
| [Claude Code Headless](https://code.claude.com/docs/en/headless) | 本次核对 -p、stdin、JSON envelope、structured_output 及版本差异 |
| [Gemini CLI Headless](https://geminicli.com/docs/cli/headless/) | 本次核对 headless、response/stats/error envelope、JSONL 与退出行为；不据此声称业务 schema 原生支持 |

后续持续在本文件记录已实现、已测试、真实验证、未知和后续规划；避免设计、源码与公共文档分别宣称不同的默认值、参数或能力。
