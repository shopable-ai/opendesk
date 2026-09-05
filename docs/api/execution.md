---
title: Execution Context
description: 每次 JavaScript 执行的标识、结构化输入、工作目录、artifact 路径与来源元数据。
order: 14
---

# Execution Context

`Execution` 是每次 JavaScript execution 都会注入的只读上下文约定。它让脚本读取本次运行的
标识、输入、工作目录、环境快照和 artifact 目录；它不是执行管理器，也不负责创建、暂停、取消或查询
其他 execution。

**状态：Stable / Runtime-owned metadata**

## 快速开始

工作目录：OpenDesk 仓库根目录。

```bash
./opendesk -script-text "console.log(JSON.stringify({id: Execution.id, artifactDir: Execution.artifactDir}))"
```

可复用 recipe 通过 `opendesk ai run` 接收结构化 JSON：

```bash
./opendesk ai run examples/ai-cli/write-to-focused-app.js \
  --input '{"text":"Hello from OpenDesk"}'
```

```js
const input = Execution.input;
console.log(Execution.id, Execution.workdir, Execution.env.MY_PROJECT_MODE);
```

## 字段

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `Execution.id` | `string` | `executionId` 的短别名。用于关联日志、结果和 artifact；不是凭据。 |
| `Execution.executionId` | `string` | 本次 execution 的完整关联 ID。 |
| `Execution.input` | JSON value | 本次 recipe 的结构化输入；未提供时为 `{}`。 |
| `Execution.workdir` | `string` | 调用方启动 execution 时的工作目录。 |
| `Execution.env` | `Readonly<Record<string, string>>` | 本次 execution 的只读字符串环境快照；不存在的键为 `undefined`。 |
| `Execution.stack` | `string` | Runtime 记录的兼容模式；新脚本省略 `-stack`，当前默认值为 `legacy`。 |
| `Execution.artifactDir` | `string` | 本次运行的 artifact 根目录；可能是相对路径或绝对路径。 |
| `Execution.source` | `string` | 脚本来源标签，例如 `file:...`、`inline`、`stdin` 或 transport 来源。 |
| `Execution.ext` | `string` | 执行源码的扩展名，JavaScript 通常为 `.js`。 |
| `Execution.scriptHash` | `string` | 实际执行源码字节的十六进制 SHA-256。 |
| `Execution.scriptPath` | `string \| null` | 可信文件入口的规范化绝对源码路径；内联/远程来源为 `null`。 |
| `Execution.scriptDir` | `string \| null` | `scriptPath` 的父目录；没有可信文件路径时为 `null`。 |
| `Execution.activationSource` | `string` | Custom UI 授权来源：`disabled`、`cli`、`projectConfig` 或 `httpRequest`。 |

字段在一次 execution 内表示启动时上下文。脚本应把 `Execution` 当作只读数据；在 JavaScript
里改写字段不会更改宿主持有的 execution ID、日志、证据路径、取消状态或最终结果。

## `Execution.input`

所有 JavaScript execution 都有 `Execution.input`。当前公开的参数化入口是 `opendesk ai run`：

```bash
./opendesk ai run recipe.js --input '{"limit":10}'
./opendesk ai run recipe.js --input-file input.json
cat input.json | ./opendesk ai run recipe.js --input-stdin
```

三个输入选项互斥，并且输入必须恰好包含一个合法 JSON value。对象、数组、字符串、数字、
布尔值和 `null` 都是合法 JSON；recipe 应自行验证业务所需的形状：

```js
const input = Execution.input;
if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Execution.input must be an object');
}
```

直接 `-script`、`-script-text`、HTTP execution 和 Scheduler 当前没有独立的公开 input 参数时，
该字段为 `{}`。不要用未约束的 argv 位置参数替代 recipe input。

## `Execution.env`

`Execution.env` 是 Vite `import.meta.env` / Node.js `process.env` 在 OpenDesk Runtime 中的对应入口，
但契约更窄：它只是 execution 启动时创建的字符串快照，不提供 Node.js `process`，也不会修改宿主进程。

```js
const endpoint = Execution.env.MY_SERVICE_ENDPOINT;
const liveEnabled = Execution.env.OPENDESK_LIVE_CALCULATOR === '1';
```

本地 `-script`、`-script-text` 和 `ai run` 按以下优先级合并环境，后者覆盖前者：

1. 当前工作目录的 `.env`；
2. 当前工作目录的 `.opendesk.env`；
3. 启动 OpenDesk 时继承的 shell 环境。

第 3 项准确地说是 OpenDesk 进程启动时收到的 OS 环境；Runtime 不会解析 `.zshrc`、`.bashrc`、
Windows 注册表或另起 login shell。从 GUI 启动时未传入的变量不会凭空出现。Linux/macOS 键名保持
大小写敏感；Windows 键名统一为大写，以匹配其大小写不敏感的系统语义。平台和架构信息使用
`System.getPlatformInfo()`，而不是新增伪环境键。

使用 `-env-file path`（`ai run` 使用 `--env-file path`）时，只读取指定文件，不再自动读取两个默认
文件。环境文件不会执行 shell 或展开 `${NAME}`；完整语法和命令见
[Environment Configuration](environment.md)。`Command.run()` 未显式覆盖 `env` 时，也继承同一个
快照，因此脚本读取值与子进程收到的值保持一致。

HTTP、MCP 和 Scheduler execution 默认得到空对象 `{}`，不会自动继承服务器进程环境。这是刻意的
秘密隔离边界；未来若某个 transport 需要环境输入，应由该 transport 显式定义可审计字段，而不是
回退到宿主 `os.Environ`。

`Execution.env` 和 `Execution` 对象本身均被冻结。环境值可能包含凭据；不要整体打印、写入 artifact
或发送给外部服务，只读取业务确实需要的键。无需枚举时可使用 `System.getEnv(name, fallback?)` 和
`System.hasEnv(name)`；它们读取的仍是同一个快照，不会重新访问宿主环境。

## Artifact 与来源

`Execution.artifactDir` 是当前运行保存截图、诊断 JSON 或业务结果的首选目录：

```js
const resultPath = File.join(Execution.artifactDir, 'result.json');
File.write(resultPath, JSON.stringify({ executionId: Execution.id, ok: true }, null, 2));
```

Runtime 自己的 `stdout.log`、`stderr.log`、`events.ndjson` 和 summary 也会关联同一个 execution。
具体目录随入口而不同，例如直接运行默认使用 `.runtime/runs/`，AI recipe 使用
`.runtime/ai/`；脚本不要自行推导目录，应读取 `Execution.artifactDir`。

`scriptPath` 由已实际选择文件的入口作为独立字段传给 Runtime，并非从 `source` 标签解析。
直接 `-script`、`ai run` 和 Scheduler file execution 会提供它；`-script-text`、stdin、HTTP、MCP
与 Scheduler inline 返回 `null`。`scriptDir` 始终与 `path.dirname(scriptPath)` 一致，或与其一起为
`null`。路径字符串计算见 [Path API](path.md)。

`source`、`scriptPath` 和 `workdir` 可能包含本机路径。不要把它们无条件发送到外部服务或写入面向不受信任
用户的输出。`scriptHash` 可用于核对本次执行内容，但不能替代代码签名或信任校验。

## `activationSource`

这个字段只描述当前 execution 的 Custom UI 授权来源。判断 `ui` 或 `Dialog` 是否可用时，仍应
调用各自的 `getCapabilities()`；不要只根据 `Execution.activationSource` 推断平台 host、窗口
能力或权限状态。完整规则见 [Custom UI](custom-ui.md) 和 [Dialog API](dialog.md)。

## 生命周期边界

`Execution` 不提供以下方法：

- `Execution.cancel()`、`pause()`、`resume()`；
- 创建或枚举其他 execution；
- 查询实时资源计数或修改 deadline；
- 修改宿主持有的 artifact、status 或 evidence。

从外部创建、查询、取消 HTTP execution 请使用 [HTTP Server API](http-server.md)；脚本 Runtime
如何等待异步资源和处理取消见 [JavaScript Runtime](runtime.md)。
