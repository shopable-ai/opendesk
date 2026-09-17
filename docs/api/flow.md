---
title: Flow Context
description: 已安装 Flow 执行期间绑定的只读资源根与可写业务数据目录。
order: 305
docType: reference
---

# Flow

`Flow` 是已安装 Flow execution 的只读上下文。它由宿主从已验证的安装记录绑定，不从
`Execution.source`、当前 shell cwd 或脚本内容推导。

普通直接运行的 `.js/.mjs`、inline、HTTP、MCP、Scheduler 和 legacy execution 不注入
`Flow`；这些入口保持 `typeof Flow === "undefined"`。`.odflow` 是安装容器，不是第二套
JavaScript Runtime。

## API 一览

| 属性/方法 | 类型 | 用途 |
| --- | --- | --- |
| `Flow.root` | `string` | 当前安装 Flow 的只读资源根。 |
| `Flow.resolve(relativePath)` | `string` | 解析 Flow 内的一个合法相对资源路径。 |
| `Flow.dataDir` | `string` | 当前 Flow 独立的可写业务数据目录。 |

## 公共约定

`Flow` 对象被冻结；`root`、`dataDir` 与解析方法不能由脚本改写。资源根、业务数据根、
`Execution.artifactDir`、`Execution.scriptDir` 和 shell cwd 是不同位置。安装过程不会运行
业务 JavaScript；只有用户明确调用运行入口后才创建 execution。

`Flow.resolve()` 返回路径不等于所有通用 `File` 或 `Command` 操作都获得完整沙箱。Flow
脚本仍拥有该 Runtime 已授予的桌面、文件和命令能力；该方法只提供宿主绑定的资源路径解析
与路径安全检查。

## Flow.root

返回当前安装 Flow 的绝对资源根。

**签名**

```ts
Flow.root: string;
```

**参数**

无。

**返回值**

当前安装目录下的绝对路径；资源文件位于该目录内。

**行为与错误**

只读。运行中的更新或卸载不会改变本次 execution 已取得的运行租约和资源根。

**示例**

```js
const template = Flow.resolve('assets/export-template.xlsx');
```

## Flow.resolve(relativePath)

解析 Flow 资源根内的一个合法相对路径。

**签名**

```ts
Flow.resolve(relativePath: string): string;
```

**参数**

参数 | 类型 | 必填 | 默认值 | 说明
--- | --- | --- | --- | ---
`relativePath` | `string` | 是 | 无 | 使用 `/` 分隔的 canonical 相对资源路径；不能是绝对路径、包含 `..`、反斜杠、卷标、尾点或尾空格的路径。 |

**返回值**

资源根内的绝对路径。

**行为与错误**

路径不合法、资源不存在、路径组件是符号链接或特殊文件时抛出错误。该方法不会改变 cwd，
也不会执行资源文件。

**示例**

```js
const path = Flow.resolve('assets/export-template.xlsx');
const contents = File.read(path);
```

## Flow.dataDir

返回当前 Flow 独立的可写业务数据目录。

**签名**

```ts
Flow.dataDir: string;
```

**参数**

无。

**返回值**

绝对路径；该目录与 `Flow.root` 分离，并按安装标识隔离。

**行为与错误**

只读路径属性。宿主为可运行 Flow 创建该目录；卸载是否删除其中数据取决于用户明确选择。

**示例**

```js
File.write(File.join(Flow.dataDir, 'state.json'), JSON.stringify({updated: true}));
```

## 错误

未绑定 Flow context 时没有 `Flow` 全局。绑定后，非法或越界的 `Flow.resolve()` 输入抛出
Runtime 错误；该错误不能被用来推断宿主文件系统的其他路径。
