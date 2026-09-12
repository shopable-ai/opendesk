---
title: LLM / Agent API 发布契约
description: 规定 LLM.generate 与 Agent.run 从设计进入 Runtime、类型、测试、docs/api 和机器索引时的单一发布门槛，避免未实现接口提前进入公开 API 文档。
---

# OpenDesk LLM / Agent API 发布契约

日期：2026-09-12。

状态：**实施交接契约。当前 Runtime 尚未提供本文拟定的 LLM / Agent 公共对象，因此本文位于 docs/architecture，不是当前用户 API Reference。**

本文件补充 [LLM / Agent Runtime 设计](llm-agent-runtime.md)，只回答一件事：当 LLM / Agent 从设计进入实现时，哪些公开文档、类型、测试和索引必须在同一轮一起落地，以及在什么条件下才允许写入 docs/api。

## 1. 发布原则

`docs/api/` 只描述已经实现、可调用并与类型和测试一致的公开接口。不得为了给后续开发提供目标，就提前建立看似正式的 `docs/api/llm.md` 或 `docs/api/agent.md` 占位页。

因此发布链必须是：

```text
设计合同
→ Runtime / facade 实现
→ 类型声明
→ JavaScript Runtime API 测试
→ docs/api 正式 Reference
→ API 索引 / 机器索引
→ 公开示例
→ 对应运行证据
```

如果实现只完成其中一部分，则状态必须如实记录；没有 Runtime 和测试支撑时，不把设计文本升级为用户 API。

所有 docs/api 修改必须遵守 `docs/api/.rules.md`：一个公开对象一个主文件、每个公开方法独立 H2、参数逐项记录，架构推导不进入 Reference。

## 2. 最终公开文档布局

当两个对象达到公开门槛后，固定形成：

```text
docs/api/
├── llm.md
├── agent.md
├── command.md
├── environment.md
├── index.md
└── README.md
```

`LLM` 与 `Agent` 是不同公开对象，分别使用独立主页面，不合并为 `llm-agent.md`。

- `llm.md`：模型生成调用，只记录 `LLM` 对象的公开合同。
- `agent.md`：外部 Agent 任务调用，只记录 `Agent` 对象和后端选择的公开合同。
- `command.md`：继续记录通用进程执行；若为 Agent 增加通用的环境替换等能力，应在这里记录，而不是复制进 Agent 页面作为第二套进程 API。
- `environment.md`：继续作为 `.env`、`.opendesk.env`、`-env-file` 与 `Execution.env` 的唯一公开来源；LLM / Agent 页面只引用，不复制整套优先级。
- `index.md` / `README.md`：仅在对象实际公开后加入导航和状态表。

## 3. LLM API 发布目标

### 3.1 页面结构

最终 `docs/api/llm.md` 至少包含：

```text
# LLM

## API 一览
## 公共约定

## LLM.getCapabilities(options?)
## LLM.generate(options)

## 类型
## 错误
## 平台与能力
```

方法条目必须按 docs/api 规范写：用途 → 签名 → 参数 → 返回值 → 行为与错误 → 示例。

### 3.2 LLM.generate 必须记录的公开字段

只有源码和类型实际支持的字段才进入 Reference。设计目标为：

- `profile`
- `prompt`
- `messages`
- `system`
- `output`
- `generation`
- `timeoutMs`
- `signal`

`prompt` / `messages` 的互斥关系、默认文本输出、JSON schema、`output.validation` 的 `native` / `local` 语义，以及不支持参数的失败行为必须写清楚。

### 3.3 LLM 结果合同

Reference 必须明确：

```js
{
  data,
  meta
}
```

`data` 是业务结果唯一入口：文本模式为字符串，JSON 模式为通过本地校验的对象。

`meta` 只记录真实可知的调用元数据，不把请求模型当成实际报告模型，不把未知 usage 编造为 0，也不默认暴露原始响应、推理正文、Authorization 或完整 prompt。

只有协议完成且输出验证通过才 resolve。HTTP 200、部分输出、模型拒绝、截断、无内容、schema 失败、timeout 和取消不能伪装成成功。

### 3.4 LLM 首批协议状态

首批目标是实际完成并分别验证：

- `openai-responses`
- `openai-chat-completions`

其他协议只有真实实现后才进入“支持”表。适配器状态必须与测试和类型同步；不能因为 baseURL 可配置就声称兼容任意 OpenAI-like 服务。

## 4. Agent API 发布目标

### 4.1 页面结构

最终 `docs/api/agent.md` 至少包含：

```text
# Agent

## API 一览
## 公共约定

## Agent.getCapabilities(options?)
## Agent.run(options)

## Backend 选择
## Profile 与配置
## backendOptions
## 输出与 schema
## 错误
## 平台与能力
```

### 4.2 Agent.run 必须记录的公开字段

设计目标为：

- `backend`
- `profile`
- `prompt`
- `model`
- `output`
- `cwd`
- `timeoutMs`
- `signal`
- `backendOptions`

没有显式 backend / profile / 默认配置时选择 Codex，是**后端选择默认值**，不是自动安装、登录、授权或自动切换失败后端。

必须区分：

```text
backend = CLI / Agent 家族
model   = 当前后端使用的模型 ID
profile = 一套后端绑定、程序位置、认证引用、默认参数和权限要求
```

`backendOptions` 只接受已选后端公开并验证的命名空间和字段，不提供无限制 `args` / `extraArgs` 绕过统一协议。

需要完整原始 CLI 参数控制的可信脚本仍使用 `Command.run()`。

### 4.3 Agent 与 Command 的公开边界

`Agent.run()` 是基于现有 Command / 进程 owner 的薄协议入口：

```text
Agent.run()
→ backend / Profile 解析
→ 后端协议适配器
→ Command / 共享进程 owner
→ 协议完成判断
→ 输出提取与 schema 校验
→ result.data
```

Agent 不能实现第二套：

- 进程启动器
- timeout / signal 生命周期
- 进程树清理
- `.env` 解析器
- 通用 shell

Reference 必须区分三种成功：

```text
进程成功 ≠ Agent 调用成功 ≠ 业务成功
```

### 4.4 Agent 首批后端状态

P0-B 的公开目标至少包含两个真实协议适配器：

- `codex`：默认后端。
- `claude-code`：首个真实可切换后端。

`gemini` 等后端可以保留在架构路线中，但未实现时不进入正式“支持”表；如果 Runtime 公开枚举中允许选择它，必须明确返回稳定的“不支持”错误，不能套用 Codex 参数运行。

后端各自的非交互参数、输出 envelope、成功终态、结构化输出和认证能力必须按实现时实际版本验证，不能只通过替换 executable 实现所谓适配。

## 5. 共享配置与环境发布门槛

LLM / Agent 都消费已有 execution 环境快照；不要建立新的 dotenv 解析器。

正式 Reference 只引用现有 Environment 文档，并记录与本对象直接相关的配置键或 Profile 入口。环境优先级仍由 `docs/api/environment.md` 定义。

拟新增配置在实现前都属于架构目标。实现后至少核验：

```text
LLM：协议、base URL、模型、凭据引用、timeout、默认 Profile
Agent：默认 backend / Profile、各后端 executable、模型、认证引用、timeout、权限要求
```

CLI 子进程如果需要真正的环境替换 / allowlist，应优先作为 `Command` 的通用能力实现和测试。不能把当前 `Command.run({env})` 的“覆盖”语义写成“替换”。

## 6. Capability 发布门槛

`LLM.getCapabilities()` / `Agent.getCapabilities()` 只有真实实现后才进入 docs/api。

能力查询默认必须是无副作用检查：

- 不发模型请求。
- 不自动登录。
- 不打开授权窗口。
- 不安装 CLI。
- 不自动修改配置。

配置完整、程序存在、已探测成功、认证可用必须是可区分状态；不能因为配置键存在就报告“可用”。

如果实现阶段发现 `getCapabilities(options?)` 不是最合适的最终签名，应以实际可测试合同为准，同时更新本设计；不能为了与设计文本一致保留低质量 API。

## 7. 类型与机器索引同步

公开 API 不允许只存在于 Markdown。

实现者必须定位仓库当前真实类型声明和 API 机器索引生成来源，并同步：

- `LLM` / `Agent` 全局对象类型。
- options、result、meta、output schema、错误类型。
- backend / protocol 枚举及当前真实支持状态。
- API 文档机器索引，例如当前仓库实际维护的 `runtime-api.ai.json` 或其生成来源。

若机器索引由脚本生成，不手工维护两份事实源；修改 canonical source 后重新生成并验证。

## 8. 测试门槛

可由 JavaScript 观察的公开合同必须在 `tests/runtime-api/` 使用 JavaScript 验证，遵守仓库现有 API 测试规则。

至少覆盖：

### LLM

- 文本成功。
- JSON schema 成功。
- 字符串数字、越界、小数、额外字段按 schema 失败。
- native / local 不静默互换。
- HTTP 200 下拒绝、截断、空内容、未知结构失败。
- timeout、取消和迟到结果处理。
- 不支持协议 / 参数在副作用前失败。

### Agent

- 默认 Codex 选择。
- 显式 Claude Code 选择。
- backend / profile 冲突。
- model 不改变 backend。
- backendOptions 命名空间和未知字段验证。
- Codex 与 Claude Code 使用不同协议 fixtures。
- 非零退出、协议失败、无成功终态、空结果、残留文件、输出超限失败。
- timeout / signal 复用 execution 和 Command 生命周期。
- 未实现后端明确失败，不自动 fallback。

fixture 只能证明解析和确定性合同，不能冒充真实模型或 CLI 登录调用。

## 9. 公开示例门槛

正式 API 页面至少提供：

```js
await LLM.generate({ prompt: '...' })
```

以及：

```js
await Agent.run({ prompt: '...' })
```

Agent 页面还应包含显式 backend、Profile 和结构化输出示例；LLM 页面应包含文本与 JSON 输出示例。

只有能够从文档声明工作目录按一行命令运行的示例，才能写成“已运行通过”。缺少凭据时可以记录配置方法和确定性测试，但不能声称真实请求成功。

## 10. 计算器贯穿验收

最终至少存在一条普通 OpenDesk JavaScript 示例或正式验收资产，证明：

```text
打开并绑定计算器
→ UI 点击 25 × 4 =
→ 显示区读取 baseResult
→ 选择 LLM.generate 或 Agent.run 获得 increment
→ 严格验证 5～15 整数
→ 重新验证窗口与计算状态
→ 点击 + increment =
→ 显示区读取 finalResult
→ 独立比较预期
```

`baseResult` / `finalResult` 必须来自 UI，不能从 expected 赋值。多位数按数字按钮拆分。等待模型期间状态不可确认就停止。

HTTP LLM 路线与 Agent CLI 路线的通过资格分别记录；某一路径成功不能证明另一条路径成功。

## 11. docs/api 正式发布检查表

只有同时满足以下事实，才创建或升级对应正式 API 页面：

- Runtime 对象真实存在。
- 类型声明与 Runtime 一致。
- 正常路径和关键错误路径已有 JS Runtime API 测试。
- capability / execution 来源限制已明确。
- 配置和凭据不泄露。
- 文档示例使用真实签名。
- API 一览、独立 H2、参数表和错误内容符合 `docs/api/.rules.md`。
- `docs/api/index.md`、`docs/api/README.md` 和机器索引同步。
- 未实施 backend / protocol 没有被描述为支持。

如果只有 Agent 已实现，则只发布 `agent.md`；如果只有 LLM 已实现，则只发布 `llm.md`。不要为了对称性发布不存在的对象。

## 12. 与主设计的关系

[LLM / Agent Runtime 设计](llm-agent-runtime.md) 决定运行模型、Profile、后端适配、权限和验收方向；本文只冻结“何时以及怎样进入公开 API Reference”。

后续实现若修改公共字段、错误模型、能力签名或后端状态，必须同时更新两份设计中受影响的有效决定，并最终以**真实 Runtime + 类型 + 测试 + docs/api**作为用户可调用事实。
