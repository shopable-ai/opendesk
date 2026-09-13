---
title: Agent API
description: 在普通 OpenDesk JavaScript 中通过 Command owner 调用 Codex 或 Claude Code，并取得严格验证的业务结果。
order: 393
docType: reference
---

# Agent

**状态：P0 / Codex + Claude Code CLI adapters**

`Agent` 是外部 CLI Agent 的薄适配层。默认后端选择为 Codex，也可显式选择 Claude Code；它复用当前 Execution 的 `Command.run()`、环境、timeout、AbortSignal 和进程树清理，不创建第二套进程 Runtime。

正常业务代码直接使用 `Agent.run()`；`Agent.getCapabilities()` 是可选的无副作用诊断/环境适配接口，不是每次调用前必须执行的握手。共享的 `enabled / supported / configured / available / checked / authenticated` 字段语义见 [Capability 状态模型](capabilities.md)。

最小业务调用：

```js
const result = await Agent.run({ prompt: '只返回 OK' });
console.log(result.data);
```

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Agent.run(options)` | 通过选定 CLI 协议执行一次 Agent task 并返回已验证的 `result.data`。 |
| `Agent.getCapabilities(options?)` | 可选诊断：无副作用查询 backend、Profile 与 executable 配置状态。 |

## Agent.run()

**用途**

通过选定 CLI 协议执行一次 Agent task，并将文本或经过同一 canonical schema validator 验证的业务值放在 `result.data`。

**签名**

```ts
Agent.run<T = string>(options: OpenDeskAgentRunOptions): Promise<OpenDeskModelCallResult<T>>
```

**参数**

| 参数 | 类型 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `object` | 是 | 无 | 只接受表中公开字段。 |
| `options.backend` | `string` | 否 | 选择规则 / `codex` | CLI 家族；当前实现 `codex`、`claude-code`。 |
| `options.profile` | `string` | 否 | 选择规则 | 绑定 backend、executable、auth、policy 和默认值的命名配置。 |
| `options.prompt` | `string` | 是 | 无 | 通过 stdin 发送，不拼接 shell。 |
| `options.model` | `string` | 否 | Profile / CLI 默认值 | 当前 backend 使用的模型；不会改变 backend。 |
| `options.output` | `{type:'text'} \| {type:'json',name?,validation?,schema}` | 否 | `{type:'text'}` | 与 `LLM.generate()` 共用输出和 schema 语义。JSON 默认 `native`。 |
| `options.cwd` | `string` | 否 | Profile cwd / 隔离调用目录 | CLI 工作目录；必须位于 Profile 的 `allowedCwd` 内。 |
| `options.timeoutMs` | `number` | 否 | Profile / backend / 120000 | 1 到 86400000 毫秒的整次调用预算。 |
| `options.signal` | `AbortSignal \| null` | 否 | `null` | 本次调用附加取消信号。 |
| `options.backendOptions` | `object` | 否 | Profile 默认值 | 只能包含当前 backend 命名空间和已知字段。 |
| `options.backendOptions.codex.reasoningEffort` | `'low'\|'medium'\|'high'\|'xhigh'` | 否 | 未设置 | 映射到受适配器控制的 Codex reasoning 配置。 |
| `options.backendOptions['claude-code'].maxBudgetUsd` | `number` | 否 | 未设置 | 正有限数，映射为 Claude Code budget 上限。 |

不支持 `args`、`extraArgs`、`rawCommand`、`shell` 或 Profile `defaultArgs`。需要任意原始 CLI 行为的可信脚本应直接使用 `Command.run()`。

**返回值**

```ts
interface OpenDeskModelCallResult<T> {
  data: T;
  meta: {
    callId: string;
    profile: string | null;
    kind: 'agent';
    backend: 'codex' | 'claude-code';
    adapter: 'codex-exec' | 'claude-code-print';
    requestedModel: string | null;
    model: string | null;
    durationMs: number;
    usage: Record<string, unknown> | null;
  };
}
```

Codex JSONL 当前不提供可靠的实际 model 字段，因此 `meta.model` 保持 `null`，即使 `requestedModel` 非空。Claude Code 仅在结果 envelope 直接报告 model，或 `modelUsage` 只含唯一模型时记录实际 model。usage 同样只保留后端真实报告。

**行为与错误**

选择顺序为：显式 `profile` → 仅显式 `backend` 的内建 `<backend>-analysis` Profile → `OPENDESK_AGENT_DEFAULT_PROFILE` → 配置文件 `defaultProfile` → `OPENDESK_AGENT_BACKEND` → `codex`。显式 profile 与 backend 冲突会在启动 CLI 前失败；未实现、未知、未配置、不存在或不可执行的程序不会 fallback 到其他 CLI。

内建 Codex / Claude Code Profile 在没有显式 executable 时，仅从当前 `Execution.env` 的受控 `PATH` 解析固定程序名 `codex` / `claude`。不会读取 shell 初始化文件、宿主的另一份环境或任务 `cwd`；空项和相对 PATH 项不参与查找。解析由 Command native owner 完成，结果必须是绝对路径；随后适配器仍以 `Command.run(absolutePath, args, {envMode:'replace', ...})` 启动，不经过 shell。PATH 顺序决定同名程序优先级。Windows 使用 `PATHEXT` 和环境变量名大小写不敏感语义。

Codex 适配器执行 `codex exec`，使用 stdin、JSONL event stream、`--output-last-message`，native JSON 时使用 `--output-schema`，并以 `--ephemeral`、`--ignore-user-config`、read-only sandbox 和独立 invocation 目录运行。适配器还以固定 `--disable` 参数关闭 `shell_tool`、`unified_exec`、`computer_use`、内外部 browser、in-app automation、apps 与 multi-agent；不接受调用方参数来重新开启这些能力。`--ignore-user-config` 保留 `CODEX_HOME` 认证，但不加载用户配置的 MCP server。只有 started thread、started turn、唯一最终 `turn.completed`、存在且有界的 final message、以及业务输出校验全部成功才 resolve。

Claude Code 适配器执行 `claude -p`，使用 stdin、`--output-format json`、plan permission mode、`--no-session-persistence`、`--strict-mcp-config` 和 `--tools ""`；native JSON 使用 `--json-schema` 并读取 `structured_output`。它不加载环境中的 MCP server，并关闭模型可调用的内置工具。只有 `type: 'result'`、`subtype: 'success'`、`is_error !== true` 以及业务输出校验全部成功才 resolve。两者不是仅替换 executable 的同一参数模板。

Agent 外层默认不自动重跑整个任务。总 deadline 覆盖配置、准备文件、Command、结果读取和 schema 校验。timeout、调用 signal 和 Execution cancel 都由现有 Command owner 终止进程组；完成后的 late output 不能提交业务结果。高层错误不会回显 CLI stdout/stderr、完整环境或认证材料。

错误统一为 `ModelCallError`。常见 code 包括 `INVALID_ARGUMENT`、`INVALID_SCHEMA`、`UNSUPPORTED_SCHEMA`、`PROFILE_NOT_FOUND`、`PROFILE_CONFIG_ERROR`、`BACKEND_PROFILE_CONFLICT`、`UNKNOWN_BACKEND`、`BACKEND_NOT_IMPLEMENTED`、`BACKEND_OPTIONS_CONFLICT`、`PROGRAM_NOT_CONFIGURED`、`PROGRAM_NOT_FOUND`、`PROGRAM_NOT_EXECUTABLE`、`AUTH_MISSING`、`UNSUPPORTED_AUTH_MODE`、`UNSUPPORTED_PERMISSION_POLICY`、`CWD_OUTSIDE_ALLOWED_SCOPE`、`PROCESS_FAILED`、`AGENT_PROTOCOL_FAILED`、`PROTOCOL_ERROR`、`PROTOCOL_INCOMPLETE`、`OUTPUT_PARSE_FAILED`、`OUTPUT_VALIDATION_FAILED`、`TIMEOUT` 与 `CANCELED`。

`OPENDESK_AGENT_CONFIG` 显式指向 JSON 配置，相对路径以 `Execution.workdir` 为准。Profile 字段为 `backend`、`executable` / `executableEnv`、`model` / `modelEnv`、`auth`、`policy`、`timeoutMs`、`cwd`、`allowedCwd` 和 `backendOptions`。P0 只接受 `policy: 'analysis'`；auth 为 `{mode:'saved'}` 或 `{mode:'env',env:'NAME'}`。凭据只从声明的环境引用传入所选 backend，child 使用 `Command.run(..., {envMode:'replace'})`，不会继承整个 `Execution.env`。

内建 Profile 使用 `OPENDESK_CODEX_MODEL` / `OPENDESK_CLAUDE_CODE_MODEL`；`OPENDESK_CODEX_EXECUTABLE` / `OPENDESK_CLAUDE_CODE_EXECUTABLE` 是高级显式覆盖，设置时必须是有效绝对路径并优先于 PATH discovery。自定义 Profile 的 `executable` 或 `executableEnv` 不会获得任意名称 discovery；声明的值缺失、为空或为相对路径时启动前失败。默认 Codex 不代表自动安装、自动登录或自动授予权限。`Agent.run()` 仅在 Command 已授权的本地 `-script` / `ai run` execution 中可用；HTTP、MCP 与 Scheduler execution 不能借此提升为本地进程权限。

**示例**

```js
const result = await Agent.run({
  backend: 'claude-code',
  prompt: '返回一个 5 到 15 的整数。',
  output: {
    type: 'json',
    name: 'integer_result',
    validation: 'native',
    schema: {
      type: 'object',
      properties: {
        value: {type: 'integer', minimum: 5, maximum: 15}
      },
      required: ['value'],
      additionalProperties: false
    }
  }
});

console.log(result.data.value);
```

仓库维护者可从仓库根目录运行不同协议的确定性 CLI fixture：

```bash
./dist/opendesk -script tests/runtime-api/ai-runtime.js -console-mode script
```

Fixture PASS 只证明适配器、选择、校验和 Command 生命周期；没有真实 CLI 登录时不能表述为真实 Agent backend 已验证。

## Agent.getCapabilities()

**用途**

无副作用解析后端、Profile 与可执行文件状态。该方法用于诊断或多环境分支；不会启动 CLI、检查版本、自动登录、安装程序、打开授权窗口或修改配置。正常业务代码不需要先调用它才能执行 `Agent.run()`。

**签名**

```ts
Agent.getCapabilities(options?: {backend?: string; profile?: string}): OpenDeskAgentCapabilities
```

**参数**

| 参数 | 类型 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `object` | 否 | `{}` | capability 查询条件。 |
| `options.backend` | `string` | 否 | 选择规则 / `codex` | 要查询的 CLI 家族。 |
| `options.profile` | `string` | 否 | 选择规则 | 要查询的命名 Profile；若同时指定 backend，二者必须一致。 |

**返回值**

```ts
interface OpenDeskAgentCapabilities {
  schemaVersion: 1;
  kind: 'agent';
  enabled: boolean;
  executionScoped: true;
  defaultBackend: 'codex';
  supported: boolean;
  configured: boolean;
  executableFound: boolean | null;
  checked: false;
  authenticated: boolean | 'unknown';
  available: null;
  backend: string;
  profile: string | null;
  requestedModel: string | null;
  supportedBackends: ('codex' | 'claude-code')[];
  reservedBackends: string[];
  structuredOutput: {native: boolean; local: true};
  selectionError: {code: string; message: string; backend?: string | null; profile?: string | null} | null;
}
```

`supported` 表示存在真实适配器；`configured` 表示选择和配置完整；`executableFound` 表示显式绝对路径或内建固定程序名已解析为可执行普通文件。Unix/macOS 同时检查执行权限；Windows 按大小写不敏感的环境名、`PATH` 与 `PATHEXT` 检查。该检查不启动程序。`checked: false` 表示没有执行版本探测，saved auth 因未登录测试而为 `'unknown'`，`available` 保持 `null`。这些字段不能互相替代；尤其 `available: null` 表示没有进行 live availability probe，不表示 unavailable。

**行为与错误**

未知参数以 `INVALID_ARGUMENT` 失败。选择或配置错误放入脱敏 `selectionError`。查询本身不会 fallback 到其他 CLI，也不会因配置完整就返回 `available: true`。

**示例**

```js
const capabilities = Agent.getCapabilities({backend: 'claude-code'});
console.log(JSON.stringify(capabilities));
```
