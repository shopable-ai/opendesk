---
title: Execution Context
description: 每次 JavaScript 执行的标识、结构化输入、工作目录、artifact 路径与来源元数据。
order: 300
---

# Execution

`Execution` 是每次 JavaScript execution 注入的只读上下文。它只描述**当前**执行，不负责创建、暂停、取消、枚举或管理其他 execution。

## API 一览

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `Execution.id` | `string` | `executionId` 的短别名。 |
| `Execution.executionId` | `string` | 当前 execution 完整关联 ID。 |
| `Execution.input` | JSON value | 当前 recipe 的结构化输入。 |
| `Execution.workdir` | `string` | 当前 execution 工作目录。 |
| `Execution.env` | `Readonly<Record<string,string>>` | 冻结的环境字符串快照。 |
| `Execution.stack` | `string` | Runtime 兼容模式元数据。 |
| `Execution.artifactDir` | `string` | 当前运行 artifact 根目录。 |
| `Execution.source` | `string` | 脚本来源标签。 |
| `Execution.ext` | `string` | 实际交给 JavaScript Runtime 的源码扩展名。 |
| `Execution.scriptHash` | `string` | 实际执行源码 SHA-256。 |
| `Execution.scriptPath` | `string \| null` | 可信文件入口的规范化绝对路径。 |
| `Execution.scriptDir` | `string \| null` | `scriptPath` 父目录。 |
| `Execution.activationSource` | `string` | Custom UI capability 的授权来源。 |

## 公共约定

### 只读与生命周期

`Execution` 与 `Execution.env` 在一次 execution 内被冻结。脚本改写字段不会改变宿主持有的 ID、deadline、取消状态、artifact 或最终结果。

### 本地环境来源

本地 `-script`、`-script-text` 与 `ai run` 的环境优先级为 `.env` → `.opendesk.env` → OpenDesk 启动时收到的 OS 环境。显式 env-file 时只读取该文件。HTTP、MCP 与 Scheduler execution 默认使用空环境快照。完整规则见 [`environment.md`](environment.md)。

### 来源路径

`scriptPath` 只由可信文件入口提供；内联、stdin、HTTP、MCP 和 Scheduler inline 为 `null`。Runtime 不从可伪造的 `source` 标签推导真实路径。

### ESM 文件入口元数据

`.mjs` 文件会先经过模块 loader 链接静态 import graph，再把生成的 JavaScript payload 交给现有 Runtime 执行。因此模块入口下：

- `Execution.scriptPath` 仍指向用户实际运行的 `.mjs` 入口；
- `Execution.scriptDir` 仍是该 `.mjs` 入口所在目录；
- `Execution.ext` 描述实际执行 payload，当前为 `.js`；
- `Execution.scriptHash` 对实际执行 payload 计算，不应把它当成原始 `.mjs` 文件内容哈希。

模块的相对 `import` 按 importing file 所在目录解析，不按 `Execution.workdir` 或 `Execution.scriptDir` 强制重写。完整模块入口规则见 [JavaScript Runtime](runtime.md#脚本级-await-与模块边界)。

## Execution.id

当前 execution ID 的短别名。

**签名**
```ts
Execution.id: string;
```

**参数**

无。

**返回值**

`string`；canonical property 为 `Execution.executionId`。

**行为与错误**

只读元数据，不是凭据。

**示例**
```js
console.log(Execution.id);
```

## Execution.executionId

返回当前 execution 的完整关联 ID。

**签名**
```ts
Execution.executionId: string;
```

**参数**

无。

**返回值**

`string`。

**行为与错误**

只读；用于关联日志、summary 和 artifact。

**示例**
```js
console.log(Execution.executionId);
```

## Execution.input

返回当前 execution 的结构化 recipe 输入。

**签名**
```ts
Execution.input: unknown;
```

**参数**

无。

**返回值**

任意合法 JSON value；没有输入的入口通常为 `{}`。

**行为与错误**

`ai run` 支持 `--input`、`--input-file`、`--input-stdin`，三者互斥。Runtime 只保证 JSON 合法，业务脚本仍须验证所需形状。

**示例**
```js
const input = Execution.input;
if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Execution.input must be an object');
}
```

## Execution.workdir

返回当前 execution 的工作目录。

**签名**
```ts
Execution.workdir: string;
```

**参数**

无。

**返回值**

规范化工作目录 string。

**行为与错误**

由 execution 启动上下文决定；[`path.resolve()`](path.md#pathresolveparts) 与 `File.cwd()` 使用同一基准。ESM 相对 `import` 不使用该字段作为统一解析根，而是相对 importing file 解析。

**示例**
```js
console.log(Execution.workdir);
```

## Execution.env

返回当前 execution 的冻结环境字符串快照。

**签名**
```ts
Execution.env: Readonly<Record<string, string>>;
```

**参数**

无。

**返回值**

只读字符串字典；不存在键返回 `undefined`。

**行为与错误**

不会提供 Node `process.env`，也不会重新读取宿主环境。环境可能包含凭据，不应整体打印或外传。

**示例**
```js
const endpoint = Execution.env.MY_SERVICE_ENDPOINT;
```

## Execution.stack

返回 Runtime 记录的兼容模式元数据。

**签名**
```ts
Execution.stack: string;
```

**参数**

无。

**返回值**

`string`；当前默认兼容值为 `legacy`。

**行为与错误**

新脚本不应为了读取该值而添加旧 `-stack` 参数。

**示例**
```js
console.log(Execution.stack);
```

## Execution.artifactDir

返回本次运行的 artifact 根目录。

**签名**
```ts
Execution.artifactDir: string;
```

**参数**

无。

**返回值**

相对或绝对路径 string。

**行为与错误**

具体目录随入口变化；脚本应读取本属性而不是自行推导 `.runtime/...` 布局。

**示例**
```js
const resultPath = path.join(Execution.artifactDir, 'result.json');
File.write(resultPath, JSON.stringify({ ok: true }));
```

## Execution.source

返回脚本来源标签。

**签名**
```ts
Execution.source: string;
```

**参数**

无。

**返回值**

例如 `file:...`、`inline`、`stdin` 或 transport 来源。

**行为与错误**

仅用于来源描述，不是可信路径 authority。`.mjs` 文件入口仍保留对应 file source；模块 bundle 不把它改写成虚构的磁盘 bundle 路径。

**示例**
```js
console.log(Execution.source);
```

## Execution.ext

返回实际交给 JavaScript Runtime 的源码扩展名。

**签名**
```ts
Execution.ext: string;
```

**参数**

无。

**返回值**

普通 `.js` 文件通常为 `.js`；当前 `.mjs` 模块入口在静态 import graph 被链接后也以 `.js` payload 执行，因此该值同样为 `.js`。

**行为与错误**

只读 metadata。若需要判断用户实际运行的文件入口，不要从 `Execution.ext` 反推；使用 `Execution.scriptPath`。

**示例**
```js
console.log({ ext: Execution.ext, scriptPath: Execution.scriptPath });
```

## Execution.scriptHash

返回实际执行源码字节的 SHA-256。

**签名**
```ts
Execution.scriptHash: string;
```

**参数**

无。

**返回值**

十六进制 SHA-256 string。

**行为与错误**

可用于核对本次实际执行内容，但不能替代代码签名或信任校验。对于 `.mjs` 入口，它对应链接后的 JavaScript payload，而不是原始入口文件的逐字节哈希。

**示例**
```js
console.log(Execution.scriptHash);
```

## Execution.scriptPath

返回可信文件入口的规范化绝对源码路径。

**签名**
```ts
Execution.scriptPath: string | null;
```

**参数**

无。

**返回值**

文件入口为绝对路径；没有可信文件身份时为 `null`。运行 `.mjs` 时保留实际 `.mjs` 入口路径。

**行为与错误**

直接 `-script`、`ai run` 和 Scheduler file execution 可提供该值；内联/远程来源不从 `source` 猜测。模块 loader 不把该值替换为内部 bundle 路径。

**示例**
```js
if (Execution.scriptPath) console.log(Execution.scriptPath);
```

## Execution.scriptDir

返回 `scriptPath` 的父目录。

**签名**
```ts
Execution.scriptDir: string | null;
```

**参数**

无。

**返回值**

`string | null`。

**行为与错误**

始终与 `path.dirname(Execution.scriptPath)` 一致，或与 `scriptPath` 一起为 `null`。对于 `.mjs` 入口，它是入口文件目录；嵌套模块的相对 import 仍按各自 importing file 解析。

**示例**
```js
const asset = Execution.scriptDir
  ? path.join(Execution.scriptDir, 'assets', 'icon.png')
  : null;
```

## Execution.activationSource

返回当前 execution 的 Custom UI 授权来源。

**签名**
```ts
Execution.activationSource: 'disabled' | 'cli' | 'projectConfig' | 'httpRequest';
```

**参数**

无。

**返回值**

授权来源 string。

**行为与错误**

不能只据此判断 `ui` / `Dialog` 是否实际可用；仍应调用各自 `getCapabilities()`。

**示例**
```js
console.log(Execution.activationSource);
```

## 平台与能力

`Execution` 在每次 JavaScript execution 中提供只读上下文。它没有 `cancel()`、`pause()`、`resume()`、其他 execution 枚举或管理方法。外部 execution 管理使用 [`HTTP Server API`](http-server.md)。
