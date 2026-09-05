---
title: Path API
description: 以当前平台规则组合、规范化和比较路径字符串，不访问文件系统。
order: 15
---

# Path

`path` 是每个 OpenDesk JavaScript execution 都会注入的同步、只读路径字符串工具。它以
Node.js 24.15.0 的 `node:path` 常用字符串行为为兼容基线，但不是 Node 模块，也不提供
`require()`、`process` 或完整 Node Runtime。

从仓库根目录运行公开示例：

```bash
./dist/opendesk -script examples/path.js -console-mode script
```

## 属性与方法

| 成员 | 返回 | 说明 |
| --- | --- | --- |
| `path.sep` | `string` | 当前平台目录分隔符：POSIX 为 `/`，Windows 为 `\\`。 |
| `path.delimiter` | `string` | 路径列表分隔符：POSIX 为 `:`，Windows 为 `;`。 |
| `path.join(...parts)` | `string` | 忽略空片段后连接并规范化；没有有效片段时返回 `.`。 |
| `path.resolve(...parts)` | `string` | 从右向左解析为绝对路径；缺少绝对片段时以 `Execution.workdir` 为基准。 |
| `path.normalize(value)` | `string` | 消除重复分隔符、`.` 和可折叠的 `..`，保留有意义的尾部分隔符。 |
| `path.dirname(value)` | `string` | 返回父目录；空字符串返回 `.`。 |
| `path.basename(value, suffix?)` | `string` | 返回最后一个路径段，可移除精确匹配的后缀。 |
| `path.extname(value)` | `string` | 返回最后路径段的扩展名；`.index` 返回空字符串。 |
| `path.relative(from, to)` | `string` | 先按同一 WorkDir 解析两端，再返回平台原生相对路径。 |
| `path.isAbsolute(value)` | `boolean` | 判断字符串是否为当前平台的绝对路径。 |

所有路径参数必须是字符串；传入数字、对象、`null` 等值会抛出 `TypeError`。这些方法只计算
字符串：不会检查文件是否存在，不会读目录，不会展开 `~` 或环境变量，也不会解析符号链接、
快捷方式、挂载点或路径大小写。需要文件 I/O 时使用 [File API](file.md)。

```js
const config = path.resolve('config', 'app.json');
const log = path.join(Execution.artifactDir, 'result.log');
console.log(path.basename(config), path.relative(Execution.workdir, log));
```

## WorkDir 与来源路径

`path.resolve()` 和 `path.relative()` 唯一需要的基准是本次 execution 已规范化的
`Execution.workdir`；它与 `File.cwd()` 完全相同，并且不会调用或修改宿主进程 cwd。其他方法
不使用 WorkDir。

受信任的文件入口还提供 `Execution.scriptPath` 与 `Execution.scriptDir`。两者分别是实际执行
文件的规范化绝对路径及其父目录。`-script-text`、stdin、HTTP、MCP 和 Scheduler inline 等没有
可信文件身份的入口都返回 `null`；Runtime 不会从可伪造的 `Execution.source` 文本中猜测路径。

## 兼容边界

对照基线是 [Node.js v24.15.0 `path` 文档](https://nodejs.org/download/release/v24.15.0/docs/api/path.html)。
OpenDesk 保留当前目标系统的原生 POSIX/Windows 语义；相对 Node 的刻意差异只有 cwd 来源：
Node 使用进程 cwd，OpenDesk 使用 execution-owned `Execution.workdir`。

当前不提供 `path.parse()`、`path.format()`、`path.toNamespacedPath()`、`path.matchesGlob()`、
`path.posix` 或 `path.win32`。也不注入 `__filename`、`__dirname`、ES modules、npm 包解析或
Node `process` 全局对象。
