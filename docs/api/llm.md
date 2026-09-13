---
title: LLM API
description: 在普通 OpenDesk JavaScript 中通过 execution-owned HTTP 调用模型并取得严格验证的业务结果。
order: 392
---

# LLM

**状态：P0 / HTTP model generation**

`LLM` 是普通 JavaScript 的模型生成入口。它只调用 HTTP 模型 API，不拥有 Agent 工具、Command 或文件操作权限。当前真实适配器为 `openai-responses` 与 `openai-chat-completions`。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `LLM.getCapabilities(options?)` | 无副作用查询 Profile 与 HTTP 协议配置状态。 |
| `LLM.generate(options)` | 通过选定 HTTP 协议生成文本或严格结构化的 `result.data`。 |

## LLM.getCapabilities()

**用途**

只读解析目标 Profile 和协议能力，用于区分适配器支持、配置完整性与尚未验证的真实可用性。该方法不发起网络请求、不测试密钥、不登录，也不修改配置。

**签名**

```ts
LLM.getCapabilities(options?: {profile?: string}): OpenDeskLLMCapabilities
```

**参数**

| 参数 | 类型 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `object` | 否 | `{}` | capability 查询条件。 |
| `options.profile` | `string` | 否 | 配置选择规则 | 查询命名 LLM Profile；不会调用模型。 |

**返回值**

```ts
interface OpenDeskLLMCapabilities {
  schemaVersion: 1;
  kind: 'llm';
  enabled: boolean;
  executionScoped: true;
  supported: boolean;
  configured: boolean;
  executableFound: null;
  checked: false;
  authenticated: false | 'unknown';
  available: null;
  profile: string | null;
  protocol: string;
  supportedProtocols: ('openai-responses' | 'openai-chat-completions')[];
  reservedProtocols: string[];
  structuredOutput: {native: boolean; local: true};
  selectionError: {code: string; message: string; protocol?: string | null; profile?: string | null} | null;
}
```

`configured` 仅表示本次选择能解析到 base URL、model 和凭据环境值。`authenticated: 'unknown'` 表示没有进行网络鉴权检查；`available` 因而保持 `null`。`configured` 不等于真实调用可用。

**行为与错误**

未知参数以 `INVALID_ARGUMENT` 失败。Profile 缺失、配置文件无效、协议未知或保留但未实施时，方法返回 `configured: false` 和脱敏的 `selectionError`，不会产生模型请求。

**示例**

```js
const capabilities = LLM.getCapabilities({profile: 'default'});
console.log(JSON.stringify(capabilities));
```

## LLM.generate()

**用途**

通过选定 HTTP 协议执行一次模型生成，并将文本或经过本地 JSON Schema 校验的业务值放在 `result.data`。

**签名**

```ts
LLM.generate<T = string>(options: OpenDeskLLMGenerateOptions): Promise<OpenDeskModelCallResult<T>>
```

**参数**

| 参数 | 类型 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `object` | 是 | 无 | 只接受表中公开字段。 |
| `options.prompt` | `string` | 条件必需 | 无 | 简单输入；与 `messages` 必须且只能提供一个。 |
| `options.messages` | `{role:'user'\|'assistant',content:string}[]` | 条件必需 | 无 | 显式历史；与 `prompt` 互斥，不自动合并。 |
| `options.system` | `string` | 否 | 未设置 | 与业务输入分开的系统指令；Responses 映射为 `instructions`，Chat 映射为首个 `system` message。 |
| `options.profile` | `string` | 否 | 配置选择规则 | 命名 LLM Profile。 |
| `options.output` | `{type:'text'} \| {type:'json',name?,validation?,schema}` | 否 | `{type:'text'}` | 文本或结构化业务结果。JSON 默认 `validation: 'native'`。 |
| `options.output.name` | `string` | 否 | `result` | Native schema 名称，匹配 `[A-Za-z0-9_-]{1,64}`。 |
| `options.output.validation` | `'native' \| 'local'` | 否 | `native` | `native` 将 schema 发给适配器并再次本地校验；`local` 只通过提示约束，但仍严格解析和校验。两者不自动降级。 |
| `options.output.schema` | `OpenDeskJSONSchema` | JSON 必需 | 无 | P0 canonical schema 子集。 |
| `options.generation` | `object` | 否 | Profile 默认值 | 本次生成覆盖。 |
| `options.generation.maxOutputTokens` | `number` | 否 | 未设置 | 正整数，Responses 映射为 `max_output_tokens`，Chat 映射为 `max_completion_tokens`。 |
| `options.generation.reasoningEffort` | `'none'\|'minimal'\|'low'\|'medium'\|'high'\|'xhigh'` | 否 | 未设置 | 发送给当前协议；服务或模型不支持时由服务明确拒绝。 |
| `options.timeoutMs` | `number` | 否 | Profile / 30000 | 1 到 86400000 毫秒的整次调用预算。 |
| `options.signal` | `AbortSignal \| null` | 否 | `null` | 本次调用附加取消信号；不能替代外层 Execution 取消。 |

P0 schema 关键字为 `type`、`properties`、`required`、`additionalProperties`、`items`、`enum`、`const`、`minimum`、`maximum`、`exclusiveMinimum`、`exclusiveMaximum`、`minLength`、`maxLength`、`minItems`、`maxItems`。每个 schema 节点必须声明单一 `type`；`additionalProperties` 当前只接受 boolean。

**返回值**

```ts
interface OpenDeskModelCallResult<T> {
  data: T;
  meta: {
    callId: string;
    profile: string | null;
    kind: 'llm';
    backend: 'openai';
    adapter: 'openai-responses' | 'openai-chat-completions';
    requestedModel: string | null;
    model: string | null;
    durationMs: number;
    usage: Record<string, unknown> | null;
  };
}
```

`requestedModel` 是调用配置值；`model` 和 `usage` 只来自服务响应。服务未报告时保持 `null`，不会用请求配置冒充执行事实。

**行为与错误**

HTTP `2xx` 只是协议解析的前置条件。Responses 的非 `completed` 状态、未完成 output item、refusal、error、空输出，以及 Chat 的非 `stop`、refusal、tool call、空内容或异常 choice 结构都会拒绝。结构化结果必须是单一 JSON 值；不会使用 `parseInt()`、正则提取、取整、截断、`eval()` 或任何隐式类型转换。

内建 default Profile 最多对 transport failure 以及 HTTP `408`、`409`、`429`、`500`、`502`、`503`、`504` 做 2 次额外调用级重试；命名 Profile 通过 `maxRetries` 显式设置 0 到 5。总 deadline 覆盖配置解析、退避、HTTP、协议解析和 schema 校验。协议错误和输出错误不重试，也不会重放模型调用之前的桌面动作。

timeout 和 signal 都会把 AbortSignal 传给 execution-owned `http.request()`，从底层终止请求；外层 Execution 取消仍由 native owner 直接终止资源。迟到结果不会 resolve。错误统一为 `ModelCallError`，包含 `code`、`operation` 和 `phase`，且不回显 Authorization、响应正文或完整环境。常见 code 包括 `INVALID_ARGUMENT`、`INVALID_SCHEMA`、`UNSUPPORTED_SCHEMA`、`PROFILE_NOT_FOUND`、`PROFILE_CONFIG_ERROR`、`CONFIG_MISSING`、`UNKNOWN_PROTOCOL`、`PROTOCOL_NOT_IMPLEMENTED`、`INSECURE_BASE_URL`、`HTTP_FAILED`、`MODEL_REFUSAL`、`PROTOCOL_ERROR`、`PROTOCOL_INCOMPLETE`、`OUTPUT_PARSE_FAILED`、`OUTPUT_VALIDATION_FAILED`、`TIMEOUT` 与 `CANCELED`。

配置只读取冻结的 `Execution.env`。最小 default Profile 使用 `OPENDESK_LLM_PROTOCOL`、`OPENDESK_LLM_BASE_URL`、`OPENDESK_LLM_MODEL`、`OPENDESK_LLM_API_KEY`、`OPENDESK_LLM_TIMEOUT_MS`、`OPENDESK_LLM_MAX_RETRIES`。Loopback HTTP 还必须显式设置 `OPENDESK_LLM_ALLOW_INSECURE_LOCALHOST=true`；远端必须使用 HTTPS。

命名配置由 `OPENDESK_LLM_CONFIG` 指向 JSON 文件，相对路径以 `Execution.workdir` 为准；`OPENDESK_LLM_DEFAULT_PROFILE` 可选择默认项。选择顺序为：显式 `profile` → `OPENDESK_LLM_DEFAULT_PROFILE` → 配置文件 `defaultProfile` → 内建 `default`。Profile 可声明 `protocol`、`baseURL` / `baseURLEnv`、`model` / `modelEnv`、`credentialEnv`、`generation`、`timeoutMs`、`maxRetries` 与 `allowInsecureLocalhost`。真实密钥只能存在于 `credentialEnv` 指向的环境值，不写入 Profile。

**示例**

```js
const result = await LLM.generate({
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

仓库维护者可从仓库根目录运行确定性 fixture：

```bash
./dist/opendesk -script tests/runtime-api/ai-runtime.js -console-mode script
```

该 fixture 不使用真实模型凭据，不能作为真实 OpenAI 调用证据。
