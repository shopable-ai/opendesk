---
title: Path API
description: 以当前平台规则组合、规范化和比较路径字符串，不访问文件系统。
order: 15
---

# path

`path` 是每个 OpenDesk JavaScript execution 注入的同步路径字符串工具。它参考 Node.js `node:path` 常用行为，但不是 Node module，也不提供 `require()` 或 `process`。

## API 一览

| 成员 | 用途 |
| --- | --- |
| `path.sep` | 当前平台目录分隔符。 |
| `path.delimiter` | 当前平台路径列表分隔符。 |
| `path.join(...parts)` | 连接并规范化路径片段。 |
| `path.resolve(...parts)` | 以 `Execution.workdir` 为 fallback 基准解析绝对路径。 |
| `path.normalize(value)` | 规范化路径字符串。 |
| `path.dirname(value)` | 返回父目录。 |
| `path.basename(value, suffix?)` | 返回最后路径段，可去除精确 suffix。 |
| `path.extname(value)` | 返回扩展名。 |
| `path.relative(from, to)` | 返回相对路径。 |
| `path.isAbsolute(value)` | 判断是否为当前平台绝对路径。 |

## 公共约定

### WorkDir

只有 `path.resolve()` 与 `path.relative()` 使用本次 execution 的 `Execution.workdir`；不会读取或修改宿主进程 cwd。`Execution.scriptPath` / `scriptDir` 是已解析的来源路径，不由 `path` 从 `Execution.source` 猜测。

### 字符串边界

所有路径参数必须为 string。方法只计算字符串：不检查文件存在、不展开 `~` / 环境变量、不解析 symlink、快捷方式或挂载点。文件 I/O 使用 [`File`](file.md)。

## path.sep

当前平台目录分隔符。

**签名**
```ts
path.sep: string;
```

**参数**

无。

**返回值**

POSIX 为 `'/'`，Windows 为 `'\\'`。

**行为与错误**

只读属性。

**示例**
```js
console.log(path.sep);
```

## path.delimiter

当前平台路径列表分隔符。

**签名**
```ts
path.delimiter: string;
```

**参数**

无。

**返回值**

POSIX 为 `':'`，Windows 为 `';'`。

**行为与错误**

只读属性。

**示例**
```js
console.log(path.delimiter);
```

## path.join(...parts)

连接非空路径片段并规范化。

**签名**
```ts
path.join(...parts: string[]): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `parts` | `string[]` | 否 | `[]` | 路径片段。 |

**返回值**

`string`；没有有效片段时返回 `'.'`。

**行为与错误**

非字符串参数抛 `TypeError`。

**示例**
```js
const log = path.join(Execution.artifactDir, 'result.log');
```

## path.resolve(...parts)

从右向左解析绝对路径。

**签名**
```ts
path.resolve(...parts: string[]): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `parts` | `string[]` | 否 | `[]` | 路径片段。 |

**返回值**

绝对路径 string。

**行为与错误**

缺少绝对片段时以不可变的 `Execution.workdir` 为基准。非字符串参数抛 `TypeError`。

**示例**
```js
const config = path.resolve('config', 'app.json');
```

## path.normalize(value)

规范化路径字符串。

**签名**
```ts
path.normalize(value: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 路径字符串。 |

**返回值**

`string`。

**行为与错误**

折叠重复分隔符、`.` 与可折叠 `..`，并保留有意义的尾部分隔符。非字符串抛 `TypeError`。

**示例**
```js
console.log(path.normalize('a/./b/../c'));
```

## path.dirname(value)

返回路径的父目录部分。

**签名**
```ts
path.dirname(value: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 路径字符串。 |

**返回值**

`string`；空字符串返回 `'.'`。

**行为与错误**

不访问文件系统。非字符串抛 `TypeError`。

**示例**
```js
console.log(path.dirname('/a/b/file.txt'));
```

## path.basename(value, suffix?)

返回最后一个路径段。

**签名**
```ts
path.basename(value: string, suffix?: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 路径字符串。 |
| `suffix` | `string` | 否 | 未设置 | 精确匹配时从结果末尾去除。 |

**返回值**

`string`。

**行为与错误**

参数必须为 string。

**示例**
```js
console.log(path.basename('/a/b/file.txt', '.txt'));
```

## path.extname(value)

返回最后路径段的扩展名。

**签名**
```ts
path.extname(value: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 路径字符串。 |

**返回值**

`string`；例如 `.index` 返回空字符串。

**行为与错误**

非字符串抛 `TypeError`。

**示例**
```js
console.log(path.extname('archive.tar.gz'));
```

## path.relative(from, to)

返回两个路径间的平台原生相对路径。

**签名**
```ts
path.relative(from: string, to: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `from` | `string` | 是 | 无 | 起点。 |
| `to` | `string` | 是 | 无 | 终点。 |

**返回值**

`string`。

**行为与错误**

两端先按同一 `Execution.workdir` 解析。非字符串抛 `TypeError`。

**示例**
```js
console.log(path.relative(Execution.workdir, Execution.artifactDir));
```

## path.isAbsolute(value)

判断字符串是否是当前平台的绝对路径。

**签名**
```ts
path.isAbsolute(value: string): boolean;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 要判断的路径。 |

**返回值**

`boolean`。

**行为与错误**

按当前目标平台语义判断。非字符串抛 `TypeError`。

**示例**
```js
console.log(path.isAbsolute(Execution.workdir));
```

## 错误

路径类型错误使用 JavaScript `TypeError`。`path` 不执行 I/O，因此不存在“文件不存在”语义。

## 平台与能力

OpenDesk 保留当前运行平台的 POSIX/Windows path 语义。当前不提供 `parse()`、`format()`、`toNamespacedPath()`、`matchesGlob()`、`path.posix` 或 `path.win32`。
