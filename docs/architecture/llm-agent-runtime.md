---
title: LLM / Agent Runtime 与提示词代码混合执行
description: OpenDesk 模型生成、Codex Agent 调用、Profile 与环境配置、协议适配、Execution 生命周期和 P0 验收的设计基线。
---

# OpenDesk LLM / Agent Runtime：提示词与代码混合执行

日期：2026-09-12。

状态：**已讨论的设计基线，供后续实施接续；本次只保存方案，没有实现或运行验收。**

除“已核对基础”明确列出的现有能力外，本文中的 `LLM`、`Agent`、Profile、环境键和相关配置均为拟新增契约，不表示当前 Runtime 已经提供。文档示例用于说明目标用法，不是已经可以原样运行的公开示例。后续必须以最新源码核对实际进度，不能把设计文字当成实现证据。

本文件保存当前对话已经确定的解决方案，不重新展开整套 Workflow 平台设计。此前的 96/100 是方案设计自评，不是外部专家认证或实现验收成绩；实际交付质量目标为不低于 95/100，必须由对应测试和真实证据支持。

## 1. 目标需求

让普通 OpenDesk JavaScript 在同一次 Execution 中交替执行确定性代码与明确的模型或 Agent 节点，获得经过校验的数据后继续操作桌面。

核心用户链路：

```text
启动并确认计算器
→ 点击 25 × 4 =
→ 从显示区读取 baseResult
→ 通过 HTTP 模型或 Codex CLI 取得 5～15 的整数 increment
→ 校验并保存 increment
→ 重新确认计算器仍可安全继续
→ 点击 + increment =
→ 从显示区读取 finalResult
→ 独立校验并输出真实结果
```

最终成果仍是普通 OpenDesk JavaScript。模型只在明确需要的节点参与，确定性点击、数据处理、条件判断和结果校验继续由代码完成。

本例的“随机”定义为模型在区间内选择整数，不承诺均匀随机。若业务需要可检验的随机分布，应另用随机数工具；本例保留真实模型调用作为混合执行的验证场景。

## 2. 架构决定与职责

```text
普通 OpenDesk JavaScript
├─ LLM.generate()：调用模型，获得文本或结构化数据
└─ Agent.run()：委托 Codex 等 Agent 完成受控任务
         ↓
共享 Profile 解析、输出校验、错误规范和运行元数据
         ↓
HTTP 模型协议适配器 / Codex CLI 适配器
         ↓
复用现有 HTTP、Command 与 Execution 生命周期 owner
```

| 层次 | 职责 | 不能混淆的边界 |
| --- | --- | --- |
| 普通 JS | 业务流程、桌面动作、变量传递和校验 | 不将模型输出当作代码执行 |
| LLM.generate | 一次生成请求与完整结果交付 | 不暗中获得文件修改、工具执行或桌面操作权限 |
| Agent.run | 受控 Agent 任务及结果交付 | 不等于一个没有副作用的模型调用 |
| Profile | 模型、协议、凭据引用、默认值和允许的能力 | 配置不能自行提升宿主授权 |
| 适配器 | 协议请求、响应、错误和能力映射 | 不把厂商字段泄漏给业务代码 |
| Execution | 超时、取消、资源归属与清理 | 不为每个模型节点再创建独立 OpenDesk Execution |
| 轻量步骤管理 | 记录 stepId、输入输出和当前阶段 | 后续按需增加，不作为 P0 前置平台 |

调用入口按语义区分，而不是按传输方式区分：未来通过 HTTP 调用远端 Agent，仍应归 `Agent.run()`；不能因为都是 HTTP 就放进 `LLM.generate()`。

首版入口和 Profile 类型不匹配时明确失败。不得仅通过切换 Profile 就让 `LLM.generate()` 隐式变成可写文件、可执行命令的 Agent。

不另建通用 Replay Runtime，不强制引入 Python、LangGraph、Langflow、图编辑器、复杂 IR 或完整 Workflow 引擎。已有作者工作流负责制作与交付脚本，本设计负责交付后的运行时调用，二者不能混为一条每次运行都要重走的流程。

## 3. 已核对基础与待补能力

本次归档对应的已读取远端基线为 `ecea7e9df212193e55455c37a4379f713ee1e903`。这只是来源定位，不是后续实施必须停留的版本。

| 已有基础 | 已核对合同 | 本次利用方式 |
| --- | --- | --- |
| JavaScript Runtime | 支持 async/await；异步资源与取消归 Execution；不是 Node.js，未公开 ESM loader | 继续使用普通脚本和已有执行入口，不依赖 npm 包直接 import |
| HTTP / axios | 请求、超时及 AbortSignal | 复用 HTTP owner，不复制网络客户端 |
| 环境配置 | .env、.opendesk.env、显式 env-file、Execution.env 快照 | 复用唯一解析和优先级规则 |
| Command.run | 参数数组、一次性 stdin、超时、输出上限及取消 | 支撑非交互 CLI 调用 |
| Command 环境 | options.env 覆盖而非替换 Execution.env | Agent 所需 allowlist / 环境替换仍需在现有 owner 上补齐 |
| Command 交互 | 没有流式 handle、PTY、交互式 stdin 或 IPC | 不能把它直接当成完整 App Server 双向通道 |
| UI 与计算器案例 | 有明确 scope 的点击能力及已有计算器启动、按键、读数和等待函数 | 复用后补足本案例输入范围、状态守卫和平台证据 |

现有计算器例子位于 `examples/human-to-recipe/calculator-115.semantic.recipe.js`，限定特定 macOS 布局，现有数字映射不足以覆盖所有 5～15 的输入。不能直接把旧例子成功转移为本例或 Windows 的成功。

相关现有合同见 [Runtime](../api/runtime.md)、[HTTP](../api/http.md)、[Environment](../api/environment.md)、[Command](../api/command.md)、[Desktop UI](../api/desktop-ui.md)、[Execution](../api/execution.md)。真实资源和生命周期扩展归已有 native owner；纯 JS 参数适配和组合可放 facade，不复制同名 native global。

## 4. LLM.generate 接口契约

### 4.1 接口命名

保留 `await LLM.generate(options)`。它符合异步生成调用的常见组织方式，但 `LLM.generate` 不是行业统一方法名称。

此前讨论的参考形态包括 Vercel AI SDK 的生成函数与 output、LangChain 的 invoke 与结构化输出、OpenAI Responses 的 create/parse，以及 Codex 的非交互任务接口。这里只借鉴职责和数据合同，不要求 OpenDesk 直接加载这些 SDK。

首版不并列增加 ask、chat、complete、generateJSON 等一批相似入口。流式需求以后单独设计 `LLM.stream()`，不让 `generate({stream:true})` 改变返回类型。

### 4.2 目标调用方式

```js
const numberOutput = {
  type: 'json',
  name: 'integer_5_to_15',
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

普通文本：

```js
const result = await LLM.generate({
  profile: 'default',
  prompt: '用一句话说明这个任务的用途。'
});
console.log(result.data);
```

### 4.3 输入约定

| 参数 | 设计契约 |
| --- | --- |
| profile | 引用配置；省略时使用默认模型 Profile；调用处不填写密钥 |
| prompt | 简单一次性输入 |
| messages | 显式对话历史；与 prompt 互斥，不自动混合 |
| system | 可选任务规则，与普通业务数据分开 |
| output | 默认文本；JSON 必须提供 schema；使用 type/name/schema 组织，不继续使用孤立 outputSchema 顶层字段 |
| generation | 可选输出 token 上限等参数；只接受适配器及模型支持的选项 |
| timeoutMs | 整次调用预算，包含等待和重试，不按重试次数重新计时 |
| signal | 复用 Runtime AbortSignal；与外层 Execution 取消共同约束调用 |

配置、参数互斥、schema 与已知能力等可本地判定的错误，应在网络或子进程副作用前发现。具体类型声明、默认值和 schema 支持子集在实现时收口到一个可测试合同，不由各适配器自行解释。

### 4.4 统一结果

`result.data` 永远是业务结果入口：文本模式为字符串，JSON 模式为经过验证的对象。调用者不需要知道 choices、output items、message.content 或 CLI 日志行。

```js
// 形状示意，不是本轮真实调用数据。
{
  data: { value: 12 },
  meta: {
    callId: '...',
    profile: 'default',
    backend: 'model',
    adapter: 'openai-responses',
    model: '...',
    durationMs: 850,
    usage: { inputTokens: 30, outputTokens: 8 }
  }
}
```

只有完整结果且输出校验成功才能 resolve。模型拒绝、输出截断、格式错误、超时和取消不得伪装成成功。未被后端报告的模型或用量字段保持 null 或明确未知，不能编造。

### 4.5 结构化输出准入

区分两种明确模式：

| 模式 | 语义 |
| --- | --- |
| native | 要求后端提供约束输出，并在本地再次校验；JSON 默认采用此模式 |
| local | 用户显式允许提示词生成 JSON，但仍必须通过本地校验 |

这两种模式的公开字段名在实现时统一确定。后端不支持 native 时明确报错，不静默降级。不支持的 schema 关键字不能偷偷删除；不同协议与模型的 schema 支持子集需显式核对。

本地校验不进行隐式强制转换：字符串 "12" 不变成 12，16 不截断为 15，8.5 不取整，解释文字不通过正则抠数字。禁止 eval、任意代码生成后自动执行或从 expected 伪造业务结果。

## 5. Profile 与环境配置

### 5.1 沿用现有环境解析

```text
未显式指定环境文件：.env → .opendesk.env → OpenDesk 进程继承的环境
显式指定 env-file：仅选择该文件，仍遵循已有环境覆盖合同
```

LLM / Agent 消费已有 Execution.env 快照，不重新扫描目录，不读取 shell 初始化文件，不修改宿主环境。

一次 Execution 内配置稳定，不在每次调用时重新读 .env；环境文件修改在下一次运行生效。环境值是字符串，需要按选项进行显式类型与范围校验。

### 5.2 单模型最小配置

以下为拟新增配置示意，不代表已支持：

```dotenv
OPENDESK_LLM_PROTOCOL=openai-responses
OPENDESK_LLM_BASE_URL=https://api.openai.com/v1
OPENDESK_LLM_MODEL=YOUR_MODEL_ID
OPENDESK_LLM_API_KEY=YOUR_API_KEY
OPENDESK_LLM_TIMEOUT_MS=30000

OPENDESK_CODEX_EXECUTABLE=/absolute/path/to/codex
OPENDESK_CODEX_AUTH_MODE=saved
OPENDESK_CODEX_TIMEOUT_MS=120000
```

分别解析出默认模型配置和 Codex 配置。单模型使用者无需先创建额外复杂配置文件。

多个模型再增加可选的命名 Profile：default、fast、local、codex-analysis、codex-workspace。Profile 保存协议、默认参数和凭据引用，例如 `apiKeyEnv: 'MY_MODEL_KEY'`，不复制密钥。

普通调用参数优先于 Profile 默认值；环境键取值完全遵循现有合并规则；权限上限始终由宿主授权决定，不能被调用参数、env 或 Profile 自行提升。

### 5.3 凭据、GUI 与远程来源

- 不整体打印 Execution.env，不把凭据写入示例、日志、错误、截图说明或发行包。提交模板，不提交真实 .env。
- .env 是配置载体，不是加密保险箱。用户使用自己的凭据；未来官方代付调用应经受控服务，不内置通用 API Key。
- GUI 启动不依赖终端偶然提供的 PATH；CLI 路径经配置或显式检测后确定。
- App Mode 由宿主明确选择用户配置位置，再交给同一个解析器；不根据 GUI 进程偶然 cwd 搜索密钥文件。
- 现有 HTTP、MCP、Scheduler execution 的空环境与 Command 准入边界保持不变。未来定时或远程任务需要模型能力时，另由宿主授权特定 Profile，不暴露整个宿主环境。

## 6. HTTP 模型协议适配

这是客户端适配层，不是新增 localhost HTTP 服务，不引入固定端口。

```text
LLM.generate
→ 参数、Profile 与能力校验
→ 协议适配器构造请求
→ 现有 HTTP owner
→ 解析协议完成状态、正文和用量
→ 本地输出校验
→ 统一结果或错误
```

### 6.1 协议而非仅供应商名称

| 适配器 | 路径后缀 | 需独立映射的合同 |
| --- | --- | --- |
| openai-responses | /responses | input、text.format、类型化输出项与完成状态 |
| openai-chat-completions | /chat/completions | messages、response_format、Chat Completions 响应 |
| anthropic-messages | /messages | 自身鉴权、版本请求头和内容块；后续按需求实现 |

路径后缀基于包含版本前缀的 baseURL，例如 /v1；适配器确定拼接，不产生 /v1/v1。不能把改 baseURL 等同于所有厂商兼容。

P0 优先实现 Responses 与 Chat Completions 两种所需协议，其他协议按真实业务增加。端点、参数和第三方 CLI 均须在接入时对照官方资料与实际版本核验，不把归档示意当成永久不变的外部协议。

### 6.2 适配器职责

| 职责 | 要求 |
| --- | --- |
| 请求映射 | 统一输入、schema、生成参数到正确协议；不支持参数明确失败 |
| 鉴权与目标绑定 | 凭据只发往 Profile 授权的目的服务，不能随意更换 URL 后沿用密钥 |
| 完成状态 | HTTP 200 不直接等于业务成功；识别拒绝、截断、异常结束和缺失内容 |
| 响应规范化 | 统一 data + meta，不要求业务代码理解厂商字段 |
| 错误规范化 | 区分配置、鉴权、限流、网络、超时、取消、协议及输出校验错误 |
| 诊断保护 | 默认只记录状态、耗时、用量等元数据；正文与敏感信息不无选择落盘 |

保留 TLS 验证，远端默认 HTTPS；本地 HTTP 服务需显式配置。默认不自动跟随重定向，避免凭据被转发。

## 7. Codex CLI 与 Agent.run

### 7.1 统一数据，不隐式统一权限

```js
const result = await Agent.run({
  profile: 'codex-analysis',
  prompt: '选择一个 5 到 15 的整数，包含两个端点，按要求返回。',
  output: numberOutput,
  timeoutMs: 120000
});
const increment = result.data.value;
```

调用方明确选择 LLM 或 Agent，后续业务都消费 data。Agent 结果也必须完成协议判断和本地校验，不能仅凭子进程退出成功就提交业务输出。

### 7.2 P0 使用非交互 exec

采用 `codex exec`，不模拟键盘控制交互式终端。此前方案引用的命令结构如下；实际安装版本需重新核验参数支持：

```text
codex exec --json --output-schema <schema-file> --output-last-message <result-file> --sandbox read-only --ephemeral --skip-git-repo-check -
```

这只是适配协议示意；在实现中使用确定的可执行文件路径和参数数组，不拼接 shell 命令。使用独立任务目录时按真实需要选择跳过 Git 检查，不擅自扩大为任意工作目录授权。

```text
创建本次调用的独立目录
→ 写入输出 schema
→ 通过 stdin 传提示词
→ 受控启动并等待 CLI
→ 核对退出状态、失败事件和本次最终消息
→ 解析并校验
→ 返回 data + meta
```

`--json` 是 JSONL 事件流，不是单个最终业务 JSON。禁止从日志里寻找最后一个看起来像 JSON 的片段；最终消息文件必须属于本次调用，不能使用共享固定 result.json 或上次残留文件。

非零退出、失败事件、输出截断或超限、空最终结果、格式错误都失败。标准输出、标准错误与 CommandError 可能含敏感内容，进入日志与统一错误前必须保持脱敏边界。

`--ephemeral` 不代表 OpenDesk 自己生成的 schema、结果或日志自动消失。临时资料按本次 artifact 生命周期管理，不提交运行正文或凭据。

### 7.3 权限分级

| Profile | 允许方向 | 必须保持的边界 |
| --- | --- | --- |
| codex-analysis | 明确提供的数据和获准的只读分析 | 不默认授权桌面操作、业务文件修改或继承来的任意外部工具 |
| codex-workspace | 明确指定工作目录中的获准修改、命令与验证 | 独立授权，不因 prompt 要求就自行升级 |

read-only 沙箱不等于所有工具都被禁用。有效的用户配置、项目配置、MCP、插件与 hooks 都需要审查；不能只写提示词“不要用工具”就宣称隔离成立。当前版本无法实现要求的限制时明确不支持，不降低限制继续执行。

计算器案例中 OpenDesk 独占负责桌面动作，Codex 只交付数据；不得让双方同时操作鼠标、窗口或计算器。

### 7.4 认证

HTTP 模型使用所选 Profile 的 API Key。Codex 默认复用用户已经授权的 CLI 身份；明确选择单次 API Key 认证时，按当前官方契约提供 CODEX_API_KEY。

不自动登录、不复制认证文件、不因存在模型 Key 就覆盖 CLI 身份；缺少授权时说明所缺条件，继续完成不依赖该授权的确定性测试。

### 7.5 App Server 后续路线

持续会话、实时工具事件、人工审批和轮次管理放到后续 App Server 适配，采用正式双向协议。优先考虑 stdio，避免固定端口。

当前 Command.run 没有双向交互通道，不能伪装成 App Server 的完整能力。后续需基于真实进程和通信 owner 扩展，不提前用轮询结果文件假冒完整协议。

## 8. Execution、取消与子进程环境

### 8.1 统一归属

一个混合任务属于一个 OpenDesk Execution；模型调用及 CLI 子进程是该 Execution 持有的资源，不是独立 OpenDesk Execution。

```text
用户 Stop / 脚本 signal / Execution 取消
→ 调用取消
→ 取消在途 HTTP 或终止受控 CLI 进程树
→ 不提交迟到结果
→ 不派发后续桌面动作
→ 清理监听器、临时资源和进程
```

整次调用 deadline 包含等待和重试，并受更早的外层 Execution deadline 限制。不以 Promise.race 代替底层真正取消。

取消不承诺撤销已发生的点击或文件修改。进程清理、部分副作用和实际完成状态分别记录，不能在资源仍存活时虚报已清理。

### 8.2 最小子进程环境

当前 Command.run 的 env 是覆盖而非替换，因此 `env: { SOME_KEY: 'value' }` 不能阻止继承其他 Execution.env 键。

在现有进程 owner 上增加 Agent 可使用的环境替换或 allowlist 能力，保留普通 Command.run 的既有默认行为。只传启动、认证和批准功能确实需要的变量，不无选择传入数据库密码、业务 API Key 或全部代理设置。

环境隔离不等于文件系统沙箱，文件可见性和工具能力必须独立处理。该能力仍受 execution 来源准入限制，不能成为 HTTP、MCP 或 Scheduler 绕过 Command 禁用的后门。

### 8.3 查询与探测分离

拟新增：

```js
LLM.getCapabilities({ profile: 'default' });
Agent.getCapabilities({ profile: 'codex-analysis' });
```

默认只读取配置、已知能力和已检查缓存，不调用模型、不启动登录、不打开授权窗口。

实际安装版本检测、认证验证和真实连接测试放到显式检查动作中。区分“已配置”“已检查”“检查失败”“当前未知”；配置完整不等于服务可用。避免频繁状态查询反复触发弹窗或授权。

## 9. 失败、重试与接续

| 场景 | 应有行为 |
| --- | --- |
| 临时网络失败或限流 | 在允许条件和总预算内有限重试当前模型调用，不重做前面的桌面步骤 |
| 鉴权、配置、取消 | 不自动重试，不切换后端掩盖问题 |
| JSON 或业务校验失败 | 明确失败；若显式允许有限重新生成，记录独立尝试，仍须校验 |
| 模型输出已被接受 | 保存当前运行采用的结果，接续时复用，不自动重新取数 |
| 点击执行到一半失败 | 标记可能部分完成，先核实桌面状态，禁止整段盲目重放 |
| 取消后迟到响应 | 不提交、不触发下一节点 |
| 崩溃恢复 | 先核查记录和真实状态，不承诺仅靠 JSON 检查点无损恢复 |

P0 不自动切换供应商，不从 HTTP 失败静默改走 Codex。模型重试可能产生新的结果和额外调用，应有明确的尝试上限与记录；Agent 具有副作用的任务不能套用普通生成重试策略。

运行记录至少能关联 Execution、callId、必要 stepId、Profile、尝试、完成状态、耗时及可用用量。业务结果按任务需要保存，诊断默认不持久化完整 prompt、原始响应、环境或私有推理内容。

同一桌面输入步骤串行。缺少可靠跨 Runtime 互斥时，明确限制同一桌面只运行一条此类任务，不能放任多个流程争夺焦点。

## 10. 计算器贯穿案例

### 10.1 五个业务步骤

| 步骤 | 输入 | 行为与输出 | 停止条件 |
| --- | --- | --- | --- |
| 准备计算器 | 应用与允许的布局 | 绑定唯一窗口，建立明确清空状态 | 目标不唯一、布局或权限不满足 |
| 第一次计算 | 按钮 2、5、×、4、= | 实际点击并读取 baseResult，正常为字符串 100 | 点击或显示验证失败 |
| 获得数值 | 明确 prompt 与 schema | HTTP 模型或 Codex 返回 increment，校验后保存 | 非整数、越界、拒绝、超时或取消 |
| 继续计算 | 已接受 increment、原窗口与状态 | 数字转按钮序列，点击 +、各数字、= | 状态变化、窗口失效或动作部分失败 |
| 最终验证 | 显示区实际读数 | 读取 finalResult，与独立预期比较并打印 | 结果不匹配或观察不完整 |

increment=12 必须转成 `['1', '2']`，不是寻找名为 12 的按钮。所有输入 token 使用字符串。

baseResult 和 finalResult 都来自显示区，不从 expected 赋值。JavaScript 的 `Number(baseResult) + increment` 仅用于独立验证，不替代计算器运算。

模型等待期间需重新确认窗口身份及可安全继续的计算状态。显示值相同不一定证明没有待执行运算符；无法确认状态连续性时停止，不盲目继续。

### 10.2 目标用法示意

以下 LLM 接口尚待实现；计算器 helper 为业务函数，优先复用并补齐已有成果，不能冒充现有全局 API。assertCalculatorUnchanged 代表需要实现和验证的状态守卫，不是已存在函数。

```js
const target = await openCalculator();
await allClear(target);
await calculate25Times4(target);
const baseResult = await waitForCalculatorResult(target, '100');

const result = await LLM.generate({
  profile: 'default',
  prompt: '随机选择一个 5 到 15 的整数，包含两个端点。',
  output: numberOutput,
  timeoutMs: 30000
});
// 另一条显式路径使用 Agent.run({ profile: 'codex-analysis', ... })。

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

保留原固定计算器例子，新增本例，不直接覆盖原案例。优先已有 UI.tapTexts 等公开能力及有价值的普通 helper，不强制增加应用对象模型。补齐多位数、按钮映射、读数、窗口范围和状态守卫，不依赖未知布局或裸屏幕坐标。

## 11. 实施阶段与文档归属

| 阶段 | 必须交付 | 不作为前置要求 |
| --- | --- | --- |
| P0-A 模型调用 | LLM.generate、默认 env 配置、输出校验、统一错误、Responses / Chat Completions 适配、取消与脱敏 | 图编辑器、完整 Workflow 引擎 |
| P0-B Codex 协作 | Agent.run、codex exec、版本与能力检查、受控环境、认证边界、结果校验、两条计算器链路 | 持续会话、App Server 全量接入 |
| P1 持续交互 | 按需要增加 App Server、会话、实时事件、审批和模型流式输出 | 为功能完整罗列所有供应商 |
| 后续步骤与可视化 | 轻量步骤状态、明确数据传递、分支和受控接续；优先复用 Script Runner 展示 | 另一套独立产品主面板或强制工作流 DSL |

P0 先形成普通脚本最小闭环；不把一堆未实现方法写进 docs/api。实现后同步公开契约、类型和接口索引，新增方法文档遵守 docs/api/.rules.md。

本文件是当前设计单一入口，不在 workflows/agent-to-recipe 中复制运行时设计，也不重写其十二阶段。过程产物留在 .runtime，稳定源码、测试、脱敏示例和正式文档进入版本控制。

后续执行提示词只保留目标、必要现状、策略、完成标准和关键边界。引用本文件作为设计依据，不复制完整历史、文件清单和 Git 操作手册。

## 12. 验收与评分

### 12.1 验收矩阵

| 领域 | 必须验证 |
| --- | --- |
| 文本与 JSON | 文本成功；JSON 完整解析；5、10、15 等边界成功；字符串数字、越界、小数和额外字段按 schema 拒绝 |
| 协议与完成状态 | 两种 HTTP 协议独立覆盖；200 下拒绝、截断、空输出和未知结构不当成功；不支持参数不静默忽略 |
| 环境 | 合并优先级、显式 env-file、只读快照、数值配置、缺失凭据、GUI 环境差异与远程隔离 |
| CLI | 安装与版本检查、带空格路径、stdin、JSONL、非零退出、空结果、残留文件、输出超限、独立调用目录 |
| 安全 | 无关环境不传入；密钥不落日志；read-only 不被误称工具全禁；不能暗中扩大权限或切换供应商 |
| 超时与取消 | 预先取消不启动调用，在途取消与总 deadline 有效，迟到结果不进入后续 UI，进程树和资源清理有证据 |
| 真实业务 | HTTP 模型与 Codex 分别完成真实界面计算、模型取值、继续点击、显示区读数和独立校验 |
| 状态与接续 | 窗口变化、计算状态不明和点击部分失败时停止；已接受模型值不因接续而重新生成 |
| 双平台 | macOS / Windows 的启动、路径、配置和进程清理分别验证；一个平台成功不能替代另一平台 |
| 回归 | 原有普通脚本、HTTP、Command、环境与 Execution 行为不因新增能力被破坏 |

模拟模型和本地 fixture 可以验证确定性协议，但不能冒充真实模型或 Codex 认证调用。公开示例须从声明工作目录运行文档中的一行命令；临时命令不能替代公开入口验收。

缺少凭据、已安装 CLI、有效授权或目标平台时，明确标注未验证 / 阻塞项并保留可复核原因；继续完成其余实现和确定性测试，不伪造通过，也不擅自登录、扩大权限、启动虚拟机或发送无关仓库内容。

### 12.2 设计自评记录

| 维度 | 此前方案自评分 |
| --- | ---: |
| 接口清晰度与使用成本 | 19/20 |
| HTTP / CLI 职责与扩展边界 | 19/20 |
| 配置、凭据和权限设计 | 19/20 |
| 输出校验、错误与取消 | 20/20 |
| Runtime 衔接与验收可行性 | 19/20 |
| 合计 | 96/100 |

此表只保留设计评审记录。跨厂商支持差异、Codex 版本适配、双平台进程控制及真实业务均须靠实施收口；没有真实证据，不得把此分数当成实现达标。

## 13. 参考资料与来源边界

本文件依据本次对话中已形成的方案和已读取仓库合同整理。本轮是持久化归档，不是重新核查第三方最新版本；接入时须以当时官方文档、实际 CLI 版本和最新本地源码确认外部接口。

| 资料 | 用途 |
| --- | --- |
| [Vercel AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) | 生成与 output 设计参考 |
| [LangChain Models](https://docs.langchain.com/oss/javascript/langchain/models) | invoke 与结构化模型调用参考 |
| [OpenAI Text Generation](https://developers.openai.com/api/docs/guides/text) | Responses 请求与响应参考 |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | schema、拒绝与支持子集参考 |
| [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) | Chat Completions 协议参考 |
| [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create) | 后续 Messages 适配参考 |
| [Codex Non-interactive](https://developers.openai.com/codex/noninteractive) | exec、stdin、输出 schema、JSONL 与认证参考 |
| [Codex Config Reference](https://developers.openai.com/codex/config-reference) | 有效配置、工具与权限边界参考 |
| [Codex App Server](https://developers.openai.com/codex/app-server) | 后续双向协议与持续会话参考 |

实现接续应持续更新本文件的实际进度与必要契约差异，明确区分已实现、已测试、真实验证、未验证和后续规划，不再并列创建第二份相互漂移的设计总纲。
