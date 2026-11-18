---
title: File API
docType: reference
description: File 对象提供面向脚本的文件系统读写、移动、复制、删除与路径处理能力。
order: 350
---

# File

File 是运行时注入的文件系统对象。原有 `read()`、`write()` 等方法保持同步语义；JSON
读写使用 execution-owned 的异步 owner，因此可直接 `await`，无需 `import`、`require`、`new`
或手工注册。

适用场景
- 读写脚本产物
- 保存截图、OCR 结果、调试日志
- 路径拼接与工作目录处理

工作目录规则
- File 和 `Execution.workdir` 在每次 execution 开始时共享同一个规范化绝对 `workingDir`
- 相对路径会解析到该 execution 工作目录；修改 JavaScript 的 `Execution.workdir` 属性不会改变后端
- 绝对路径会直接使用

## File：方法总表

| 方法 | 用途 |
| --- | --- |
| File.path(relativePath) | 获取绝对路径 |
| File.cwd() | 当前工作目录 |
| File.create(path) | 创建空文件 |
| File.createIfNotExists(path) | 不存在时创建 |
| File.createWithDirs(path) | 自动创建父目录后建文件 |
| File.exists(path) | 是否存在 |
| File.stat(path) | 查询跨平台稳定文件元数据 |
| File.ensureDir(path) | 确保目录存在 |
| File.read(path) | 读取文本 |
| File.readJSON(filePath, options?) | 异步读取并按 Runtime JSON.parse 解析 JSON |
| File.readBytes(path) | 读取字节 |
| File.write(path, text) | 写文本 |
| File.writeNew(path, text) | 独占创建一个新文本文件；目标或父目录别名存在风险时拒绝 |
| File.writeJSON(filePath, value, options?) | 异步、安全替换地写入 JSON |
| File.append(path, text) | 追加文本 |
| File.writeBytes(path, bytes) | 写字节 |
| File.appendBytes(path, bytes) | 追加字节 |
| File.copy(pathFrom, pathTo) | 复制文件 |
| File.renameWithoutExtension(path, newName) | 重命名但保留扩展名 |
| File.rename(path, newName) | 重命名 |
| File.move(path, newPath) | 移动 |
| File.getExtension(fileName) | 取扩展名 |
| File.getName(filePath) | 取文件名 |
| File.getNameWithoutExtension(filePath) | 取不带扩展名文件名 |
| File.remove(path) | 删除文件 |
| File.removeDir(path) | 删除目录 |
| File.listDir(path) | 列目录 |
| File.isFile(path) | 是否文件 |
| File.isDir(path) | 是否目录 |
| File.isEmptyDir(path) | 是否空目录 |
| File.getHumanReadableSize(bytes) | 人类可读大小 |
| File.getSimplifiedPath(path) | 路径规范化 |
| File.join(parent, ...children) | 拼路径 |
| File.open(path, mode) | 按模式打开文件 |
| FileHandle.tryLock() | 对已打开的普通文件尝试非阻塞独占锁 |

## 公共约定

同步 File 方法采用当前宿主的路径与文件系统语义。相对路径以不可变的 `Execution.workdir` 为基准；绝对路径直接使用。
File 不提供文件沙箱，也不要求额外 MCP capability flag；调用方仍须限定授权的数据范围。同步 I/O 没有独立的 `signal`、超时或取消参数，进入系统调用后不能承诺立即中断。
除另有说明，宿主 I/O 错误作为 JavaScript Error 抛出；不要依赖跨平台固定的错误文本或 `code`。JSON API 的结构化错误只适用于 JSON 方法。

## File.create(path)

创建空文件；已存在的普通文件会被截断为零字节。

**签名**

```ts
File.create(path: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 文件路径；父目录必须已存在。 |

**返回值**

返回 `undefined`。

**行为与错误**

同步调用宿主文件系统，不创建父目录。目标为目录、父目录缺失、权限拒绝或关闭文件失败时抛错。现有普通文件会立即被截断；会跟随文件符号链接，不提供独占创建或事务保证。需要避免覆盖时使用 `File.writeNew`。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.create('./.runtime/examples/file/empty.txt');
```

## File.createIfNotExists(path)

目标不存在时创建空文件；已存在时保持原内容。

**签名**

```ts
File.createIfNotExists(path: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 要检查或创建的文件路径；父目录必须已存在。 |

**返回值**

返回 `undefined`，不返回是否创建的标记。

**行为与错误**

同步先查询路径；存在的文件或目录均不修改。仅不存在时按 `File.create` 创建，其他查询错误直接抛出；父目录缺失或创建失败也抛错。检查与创建之间没有原子性：并发创建可能导致后续创建截断文件。会跟随符号链接，不是安全的独占创建；此需求使用 `File.writeNew`。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.createIfNotExists('./.runtime/examples/file/optional.txt');
```

## File.createWithDirs(path)

递归建立父目录，再创建或截断目标文件。

**签名**

```ts
File.createWithDirs(path: string): void
```

**参数**

`path` 为必填文件路径；相对路径按 `Execution.workdir` 解析。

**返回值**

`undefined`。

**行为与错误**

同步操作；父目录使用 0755 再受 umask 收紧。已有普通文件会被截断，跟随符号链接。目录创建、文件创建或关闭失败时抛错；前面已经建立的目录不回滚。无独占创建、事务或单次取消保证。

**示例**

```js
File.createWithDirs('./.runtime/examples/file/nested/empty.txt');
```

## File.appendBytes(path, bytes)

将字节追加到文件末尾；文件不存在时创建。

**签名**

```ts
File.appendBytes(path: string, bytes: OpenDeskByteInput): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 文件路径；父目录必须已存在。 |
| `bytes` | `ArrayBuffer \| Uint8Array \| number[]` | 是 | 无 | 要追加的字节。数组元素应为 0–255 的整数。 |

**返回值**

返回 `undefined`。

**行为与错误**

同步打开并追加，不创建父目录、不覆盖已有前缀。空字节输入也会打开文件，必要时创建空文件。字节转换失败或文件打开/写入失败时抛错；目录目标也会失败。可能已写入部分数据后才抛错，不提供回滚、原子追加块或独占锁；结果未知时不要自动重复追加。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.appendBytes('./.runtime/examples/file/bytes.bin', new Uint8Array([0, 128, 255]));
```

## File.rename(path, newName)

在源路径所在目录中重命名文件或目录。

**签名**

```ts
File.rename(path: string, newName: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 已存在的源路径。 |
| `newName` | `string` | 是 | 无 | 新的完整名称，包含所需扩展名。应传单个名称。 |

**返回值**

返回 `undefined`。

**行为与错误**

同步按源目录与 `newName` 拼接目标，再执行宿主 rename；不创建目标父目录。源不存在、权限拒绝或文件系统不允许重命名时抛错。不会自动保留原扩展名。目标冲突和覆盖行为受操作系统及文件系统约束，不保证拒绝覆盖。没有将 `newName` 限制为单个 basename，传入路径片段可能移动到其他位置；已知完整目标路径使用 `File.move`。没有后台任务、重试或回滚。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.create('./.runtime/examples/file/draft.txt');
File.rename('./.runtime/examples/file/draft.txt', 'final.json');
```

## File.renameWithoutExtension(path, newName)

重命名时保留源路径最后一段扩展名。

**签名**

```ts
File.renameWithoutExtension(path: string, newName: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 已存在的源路径。 |
| `newName` | `string` | 是 | 无 | 新的名称主体；原最后一段扩展名会直接追加到它后面。 |

**返回值**

返回 `undefined`。

**行为与错误**

同步执行宿主 rename。例如 `archive.tar.gz` 配合 `report` 得到 `report.gz`；传入 `report.txt` 得到 `report.txt.gz`。无扩展名时不追加；点文件的扩展名遵循 `File.getExtension`。不创建父目录、不校验 `newName` 是单个名称，路径片段可能改变目录。源不存在、权限或 rename 失败时抛错；目标冲突/覆盖受宿主系统约束，不承诺 no-clobber，也没有回滚。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.create('./.runtime/examples/file/draft.tar.gz');
File.renameWithoutExtension('./.runtime/examples/file/draft.tar.gz', 'final'); // final.gz
```

## File.getExtension(fileName)

从路径文本取得最后一段扩展名。

**签名**

```ts
File.getExtension(fileName: string): string
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `fileName` | `string` | 是 | 无 | 文件名或路径文本；不要求目标存在。 |

**返回值**

返回包含前导点的扩展名；无扩展名时为 `""`。

**行为与错误**

纯同步字符串处理，不访问文件系统。使用当前宿主的路径分隔规则，只检查最后一个路径元素的最后一个点。`archive.tar.gz` 返回 `.gz`，`.env` 返回 `.env`，`name.` 返回 `.`。不做 MIME、内容或文件存在性检查；合法字符串输入没有 I/O 错误。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
console.log(File.getExtension('archive.tar.gz')); // .gz
```

## File.getName(filePath)

从路径文本取得最后一个路径元素。

**签名**

```ts
File.getName(filePath: string): string
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `filePath` | `string` | 是 | 无 | 路径文本，不要求目标存在。 |

**返回值**

返回包含扩展名的最后一个元素；空文本返回 `"."`。

**行为与错误**

纯同步字符串处理，按当前宿主路径规则忽略末尾分隔符；根路径返回根分隔符。不访问文件系统，不解析符号链接，不检查路径存在性。合法字符串输入没有 I/O 错误。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
console.log(File.getName('reports/final.txt')); // final.txt
```

## File.getNameWithoutExtension(filePath)

取得路径最后一个元素并移除其最后一段扩展名。

**签名**

```ts
File.getNameWithoutExtension(filePath: string): string
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `filePath` | `string` | 是 | 无 | 路径文本，不要求目标存在。 |

**返回值**

返回名称主体；`archive.tar.gz` 返回 `archive.tar`，`.env` 返回空串。

**行为与错误**

纯同步字符串处理，组合宿主 basename 与最后扩展名语义。不会按内容识别多段扩展名，也不会查询或修改文件。合法字符串输入没有 I/O 错误。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
console.log(File.getNameWithoutExtension('reports/archive.tar.gz')); // archive.tar
```

## File.remove(path)

删除一个文件、符号链接或空目录。

**签名**

```ts
File.remove(path: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 要删除的单个文件系统路径。 |

**返回值**

返回 `undefined`。

**行为与错误**

同步删除，不递归。目标不存在、目录非空、权限拒绝或其他删除失败时抛错。最终目标为符号链接时删除链接自身；父路径仍按宿主文件系统解析。成功删除不能回滚；递归删除使用 `File.removeDir`。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file');
File.create('./.runtime/examples/file/disposable.txt');
File.remove('./.runtime/examples/file/disposable.txt');
```

## File.removeDir(path)

递归删除指定路径及其内容。

**签名**

```ts
File.removeDir(path: string): void
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 调用方已确认允许递归删除的精确路径。 |

**返回值**

返回 `undefined`；路径不存在时也成功。

**行为与错误**

同步递归删除，不移入废纸篓，不回滚。尽管名称含 Dir，也可以删除普通文件；最终目标为符号链接时仅移除链接，不遍历其指向的目录。父目录符号链接仍按宿主规则解析。权限或其他 I/O 失败时抛错，错误发生前可能已删除部分内容。没有工作目录隔离或危险路径保护；不要传空串、根目录或未经核对的业务路径。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
File.ensureDir('./.runtime/examples/file/disposable');
File.removeDir('./.runtime/examples/file/disposable');
```

## File.getHumanReadableSize(bytes)

把字节数格式化为以 1024 为基数的大小文本。

**签名**

```ts
File.getHumanReadableSize(bytes: number): string
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `bytes` | `number` | 是 | 无 | 可安全表示的整数字节数；不读取文件大小。 |

**返回值**

小于 1024 时返回整数加 ` B`；其他值用一位小数和 `KB`、`MB`、`GB`、`TB`、`PB` 或 `EB`。

**行为与错误**

纯同步计算，无 I/O。单位进位使用 1024，标签仍为 KB/MB 等；小数显示四舍五入。不额外校验非负数，负整数返回如 `-1 B`。不要依赖桥接层对非整数、非有限数或超出安全整数范围的转换；合法整数字节数没有 I/O 错误。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
console.log(File.getHumanReadableSize(1536)); // 1.5 KB
```

## File.getSimplifiedPath(path)

按宿主路径规则进行词法规范化。

**签名**

```ts
File.getSimplifiedPath(path: string): string
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 路径文本，不要求目标存在。 |

**返回值**

返回移除冗余分隔符、`.` 和可折叠 `..` 的文本；空串返回 `"."`。

**行为与错误**

纯同步字符串处理，不访问文件系统、不转为绝对路径、不展开 `~`、不解析符号链接。保留无法消除的相对 `..`；分隔规则由宿主平台决定。不能把词法结果当作真实路径或授权边界；真实存在路径使用 `File.realPath`。合法字符串输入没有 I/O 错误。

**示例**

以下片段在仓库根目录的普通 Runtime 脚本中运行；仅操作 `.runtime/examples/file/` 下的示例文件。

```js
console.log(File.getSimplifiedPath('reports/./draft/../final.txt')); // reports/final.txt
```


## File.realPath(path)

解析一个**已经存在**的文件或目录，跟随符号链接／Windows reparse point，并返回宿主文件系统的 canonical 绝对路径。它只做路径解析，不创建、删除或修改文件。

```js
const canonical = File.realPath('./assets/current');
console.log(canonical);
```

**签名**

```ts
File.realPath(path: string): string
```

- 相对路径先按当前 `Execution.workdir` 解释，然后执行宿主真实路径解析。
- 目标必须存在；不存在、权限拒绝或无法解析时直接抛出文件系统错误。
- `File.path()` 只做工作目录下的绝对路径拼接；需要判断 symlink/junction/reparse-point 是否改变真实位置时使用 `File.realPath()`。
- 返回值可以用于“期望路径”和“真实路径”比较，但它本身不是授权；调用方仍需按业务范围判断真实路径是否允许。
- 该 API 不创建 watcher、handle 或后台任务。

## File.cwd()

**签名**

```ts
File.cwd(): string
```

**参数**

无。

**返回值**

当前 execution 已规范化的绝对工作目录。

**行为与错误**

不查询后续进程 cwd，不改变目录，不创建资源。

**示例**

```js
console.log(File.cwd());
```

## File.path(relativePath)

**签名**

```ts
File.path(relativePath: string): string
```

**参数**

`relativePath` 必填字符串。

**返回值**

绝对路径原样返回；相对路径与当前 execution 工作目录拼接并清理。

**行为与错误**

只做路径运算，不检查存在性，不跟随符号链接，也不是文件授权边界。

**示例**

```js
console.log(File.path('./.runtime/examples/file/out.txt'));
```

## File.read(path)

**签名**

```ts
File.read(path: string, encoding?: string): string
```

**参数**

`path` 必填；`encoding` 兼容字段，当前忽略。

**返回值**

完整文件字节转成的字符串；空文件为 `''`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。没有大小上限，也不进行 UTF-8 合法性校验。不存在、目录或读取失败抛普通 Error。

**示例**

```js
const text = File.read('./README.md');
```

## File.readJSON(filePath, options?)

```js
const settings = await File.readJSON('config/settings.json', {
  defaultValue: { enabled: true, retryCount: 2 },
});
```

**签名**

```ts
File.readJSON(filePath: string, options?: {
  defaultValue?: unknown;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<unknown>
```

- 相对路径以 `Execution.workdir` 为基准；默认工作目录沿用入口既有 CLI 行为。
- 文件必须是普通本地文件、有效 UTF-8 JSON；可移除开头的一个 UTF-8 BOM。所有顶层 JSON 值都支持。
- 使用 Runtime 的 `JSON.parse` 语义；不支持 JSON5、注释、尾逗号或 schema 验证。
- 只有目标文件不存在且 `defaultValue` 是**自有属性**时才返回默认值。`false`、`0`、空串和 `null`
  均会如实返回；不会创建文件。损坏、空文件、权限、目录或编码错误不会回退默认值。
- `maxBytes` 是 1 到 8 MiB 的整数，默认和最大值均为 8 MiB。读取以限制+1 字节检测，不以 stat
  代替实际限制。

## File.writeJSON(filePath, value, options?)

```js
await File.writeJSON('output/settings-copy.json', settings);
```

**签名**

```ts
File.writeJSON(filePath: string, value: unknown, options?: {
  spaces?: number;
  createDirs?: boolean;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<void>
```

- 默认 UTF-8、无 BOM、`spaces: 2`、末尾一个 LF，`createDirs: true`。`spaces` 只能是 0 到 10
  的整数；`createDirs: false` 时缺失父目录会拒绝。
- 在任何 native I/O 前，Runtime 恰好执行一次 `JSON.stringify(value, null, spaces)` 生成固定快照。
  因此 `undefined` 顶层、循环引用和其他不可序列化值会拒绝且不改写旧文件；`NaN`、`Infinity`、
  `Date/toJSON` 与稀疏数组遵循该 JSON.stringify 语义。
- 预算针对包含格式和末尾 LF 的实际 UTF-8 输出；它不是 getter/toJSON 或进程总内存的硬沙箱。
- JSON 容器（对象与数组）最大嵌套 128 层；字符串内的括号不计入。读写均不合并对象、复制属性或将
  prototype 当作配置。

### 写入提交、取消与并发

写入只接受普通文件，拒绝目录、设备、管道和最终目标符号链接。顺序为：参数校验及序列化/预算检查、
同目录唯一独占临时文件、完整写入和关闭、经平台验证的替换提交、清理本次临时资源。它不会通过先截断
目标文件来降级。

macOS 与 Linux 当前使用同目录 Unix rename 的真实后端；这承诺受当前文件系统条件约束的名称替换，
不是断电持久性、事务、跨进程 CAS 或完整的路径竞争消除。Windows 当前明确返回
`ATOMIC_REPLACE_UNSUPPORTED`，不会截断回退；Windows/Linux 尚未做目标系统 live Runtime 验证。
已有文件尽力保留基本权限位，不承诺 owner、ACL 或 xattr。

`signal` 只能进一步收紧单次操作；execution 超时/取消仍会取消 owner。提交前取消保留旧文件并清理本次
临时文件；替换成功就是提交点，若取消恰在其后被观察到，rejection 的 `committed` 为 `true`，不会谎称
已回滚。并发同路径写入遵循最后成功提交覆盖，不提供合并、CAS 或 `updateJSON`。

每个 execution 最多同时进行 8 个 File JSON 操作；未 `await` 的操作仍由 Runtime 生命周期追踪并在脚本
主体结束后等待或在 teardown 中取消。没有 EventLoop 的直接内部初始化会返回 rejected Promise，而不伪装为
同步成功。

### 错误

所有正常预期失败均以 Promise rejection 给出 `FileJSONError`，至少带有 `code`、`operation`
（`File.readJSON` 或 `File.writeJSON`）、`message` 和 `committed`。稳定 code 为：
`INVALID_ARGUMENT`、`FILE_NOT_FOUND`、`PERMISSION_DENIED`、`UNSUPPORTED_FILE_TYPE`、
`INVALID_ENCODING`、`FILE_TOO_LARGE`、`JSON_DEPTH_EXCEEDED`、`JSON_PARSE_FAILED`、
`JSON_SERIALIZATION_FAILED`、`CANCELED`、`IO_FAILED`、`ATOMIC_REPLACE_UNSUPPORTED`。
错误不会持久化完整 JSON、默认值或任意 exception 文本。

## File.write(path, text)

**签名**

```ts
File.write(path: string, text: string, encoding?: string): void
```

**参数**

`path` 和 `text` 必填；`encoding` 当前忽略。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。创建或截断并覆盖文件；不创建父目录，不修改换行，不提供原子替换或回滚。创建权限为 0644 再受 umask 收紧，已有权限保留；跟随符号链接。I/O 失败抛错，可能已有部分副作用。

**示例**

```js
File.ensureDir('./.runtime/examples/file');
File.write('./.runtime/examples/file/out.txt', 'first line\n');
```

## File.writeNew(path, text)

安全另存一个**此前不存在**的新文本文件。它用于候选另存、不可覆盖的版本文件等场景，不是现有文件的替换 API。

```js
File.ensureDir('./.runtime/examples/candidates');
File.writeNew('./.runtime/examples/candidates/candidate.js', 'console.log("review me");\n');
```

**签名**

```ts
File.writeNew(path: string, text: string, encoding?: string): void
```

**行为与安全边界**

- 同步执行；相对路径继续以不可变的 `Execution.workdir` 为基准。
- 父目录必须已经存在。该方法不会隐式创建目录。
- 使用父目录 `os.Root`，先完整写入、flush 并关闭同目录私有临时文件，再通过不覆盖的硬链接原子发布；最终目标已经存在（包括普通文件或符号链接）就失败，不会截断或替换。文件系统需支持同目录硬链接，否则拒绝，不退回非原子的写入。
- Unix 新临时 inode 从创建起采用 `0600`（再受进程 umask 收紧）；硬链接发布及后续 rename 保持该权限，避免完整业务文本在临时阶段被其他本机用户读取。不修改父目录的既有权限；同账户进程不隔离。Windows 使用其目录继承 ACL，不把 Unix mode 当作 Windows 隔离承诺。
- 打开父目录句柄后，Runtime 会重新解析父目录的 symlink / Windows reparse-point 目标并核对目录文件身份；父目录是别名、被重定向，或授权检查期间被替换时失败。
- 写入、flush 或 close 在发布前失败时，最终目标不可见；Runtime 尽力清理私有临时文件。发布后绝不因临时文件清理失败删除最终目标。进程异常退出可能遗留 `.opendesk-new-*` 私有临时文件，它不代表已发布的业务文件。
- 它只保证“新文件独占创建”，**不**是对已有文件的 compare-and-swap，也不提供目录级多文件事务。需要修改已有 JSON 时仍按 `File.writeJSON` 的平台支持语义处理。
- 因为不会覆盖已有内容，适合保存需人工审阅的候选、不可变 revision 和证据文件；不能用“先 `exists` 再 `write`”替代它。

## File.append(path, text)

**签名**

```ts
File.append(path: string, text: string, encoding?: string): void
```

**参数**

`path` 和 `text` 必填；`encoding` 当前忽略。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。不存在时创建，存在时追加；父目录必须存在。不会自动增加换行；可能部分写入后抛错，没有回滚或多进程块级原子性承诺。

**示例**

```js
File.append('./.runtime/examples/file/out.txt', 'next line\n');
```

## File.readBytes(path)

**签名**

```ts
File.readBytes(path: string): ArrayBuffer
```

**参数**

`path` 必填字符串。

**返回值**

完整文件的 `ArrayBuffer`，空文件 byteLength 为 0。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。不设置大小上限；不存在或读取失败抛错。

**示例**

```js
const bytes = File.readBytes('./.runtime/examples/file/out.txt');
console.log(new Uint8Array(bytes));
```

## File.writeBytes(path, bytes)

**签名**

```ts
File.writeBytes(path: string, bytes: OpenDeskByteInput): void
```

**参数**

`path` 必填；`bytes` 为 ArrayBuffer、Uint8Array 或 0–255 整数数组。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。创建或截断，不创建父目录；空字节输入也会截断。字节转换或 I/O 错误抛错，部分写入不会回滚。

**示例**

```js
File.writeBytes('./.runtime/examples/file/bytes.bin', [0,128,255]);
```

## File.ensureDir(path)

**签名**

```ts
File.ensureDir(path: string): void
```

**参数**

`path` 必填字符串。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。递归创建缺失目录（0755 再受 umask 收紧）；已有目录保持不变。路径为文件、权限或创建失败时抛错。

**示例**

```js
File.ensureDir('./.runtime/examples/file/nested');
```

## File.exists(path)

**签名**

```ts
File.exists(path: string): boolean
```

**参数**

`path` 必填字符串。

**返回值**

宿主 stat 成功为 true，任何 stat 错误为 false。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。跟随符号链接；false 也可能表示权限或其他 I/O 错误，不能推断必然不存在。需要区分时使用 File.stat。

**示例**

```js
console.log(File.exists('./.runtime/examples/file/out.txt'));
```

## File.stat(path)

查询路径当前的稳定跨平台文件元数据。需要一次获得对象类型、普通文件大小和修改时间，或者需要区分“路径不存在”与其他文件系统错误时，优先使用该方法。

**签名**

```ts
File.stat(path: string): OpenDeskFileStat | null
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `string` | 是 | 无 | 文件系统路径；相对路径以当前 `Execution.workdir` 为基准，绝对路径直接使用。 |

**返回值**

路径不存在时返回 `null`。存在时返回：

```ts
interface OpenDeskFileStat {
  type: 'file' | 'directory' | 'other';
  size: number | null;
  modifiedAt: string;
}
```

| 字段 | 说明 |
| --- | --- |
| `type` | 普通文件为 `file`，目录为 `directory`，其他可被 stat 的对象为 `other`。 |
| `size` | 普通文件的字节数；目录和 `other` 返回 `null`，不暴露平台相关的目录 stat 大小。 |
| `modifiedAt` | 操作系统报告的最后修改时间，转换为 UTC RFC 3339 文本；实际精度取决于文件系统。 |

**行为与错误**

- `File.stat()` 是同步 metadata 查询，不创建 timer、listener、watcher，也没有 `timeout` 或 `signal` 选项。
- 最终路径使用与 Go `os.Stat` 相同的跟随符号链接语义；断开的最终符号链接按不存在处理并返回 `null`。
- 仅“路径不存在”返回 `null`；权限拒绝、非法路径和其他 stat 错误会直接抛出，不会压缩成 `null`。
- `type: 'file'` 只表示普通文件。历史兼容的 `File.isFile()` 语义保持不变，因此需要严格类型判断时使用 `File.stat()`。
- `modifiedAt` 和 `size` 只是一次 metadata 观察，不表示下载完成、导出成功、文件业务有效，也不提供稳定窗口判断。

**示例**

```js
const info = File.stat('./artifacts/result.json');
if (info === null) {
  console.log('missing');
} else if (info.type === 'file') {
  console.log(info.size, info.modifiedAt);
}
```

## File.copy(pathFrom, pathTo)

**签名**

```ts
File.copy(pathFrom: string, pathTo: string): void
```

**参数**

两个文件路径均必填；目标父目录必须存在。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。只复制普通文件的字节；目标可被创建或截断。跟随文件符号链接，不复制目录、权限或时间元数据。实际源、目标 descriptor 指向同一 inode（包括硬链接或符号链接别名）时，在截断前抛错并保留源内容。其他 I/O 失败可能留下截断或部分目标，不提供回滚。macOS/Linux 的打开步骤使用非阻塞 flag，避免 FIFO 替换竞争导致阻塞。

**示例**

```js
File.copy('./.runtime/examples/file/out.txt', './.runtime/examples/file/copy.txt');
```

## File.move(path, newPath)

**签名**

```ts
File.move(path: string, newPath: string): void
```

**参数**

源路径和完整目标路径均必填。

**返回值**

`undefined`。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。直接调用宿主 rename；不创建父目录，跨文件系统通常失败，不退回 copy/delete。目标覆盖语义由宿主决定；源/权限/rename 错误抛出。

**示例**

```js
File.move('./.runtime/examples/file/copy.txt', './.runtime/examples/file/moved.txt');
```

## File.listDir(path)

**签名**

```ts
File.listDir(path: string): string[]
```

**参数**

`path` 必填目录路径。

**返回值**

按文件名排序的直接子项名称数组（不含父路径）；空目录为 []。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。不递归；文件和目录都包含，跟随最终目录符号链接。不存在、不是目录或读取失败抛错。

**示例**

```js
console.log(File.listDir('./.runtime/examples/file'));
```

## File.isFile(path) / File.isDir(path)

**签名**

```ts
File.isFile(path: string): boolean;
File.isDir(path: string): boolean;
```

**参数**

`path` 必填字符串。

**返回值**

stat 失败均返回 false；isDir 返回是否目录，历史 isFile 返回“不是目录”，也可能包含特殊文件。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。跟随符号链接，不是严格普通文件判定；需要区分 file/directory/other 或 I/O 错误时用 File.stat。

**示例**

```js
console.log(File.isFile('./README.md'));
console.log(File.isDir('./.runtime/examples/file'));
```

## File.isEmptyDir(path)

**签名**

```ts
File.isEmptyDir(path: string): boolean
```

**参数**

`path` 必填目录路径。

**返回值**

直接子项为零时 true，否则 false。

**行为与错误**

同步执行，无独立 timeout/signal；相对路径使用 `Execution.workdir`。读取目录全部子项，不递归；不是目录、不存在或无权限时抛错。

**示例**

```js
console.log(File.isEmptyDir('./.runtime/examples/file'));
```

## File.join(parent, ...children)

**签名**

```ts
File.join(parent: string, ...children: string[]): string
```

**参数**

`parent` 必填，`children` 可省略；均为字符串。

**返回值**

按当前平台分隔符拼接并规范化的路径字符串。

**行为与错误**

纯宿主 filepath.Join 语义，不查询文件系统；不要套用 path.join 的保留末尾分隔符规则。空片段跳过，全部为空返回空字符串。

**示例**

```js
console.log(File.join('.runtime', 'examples', 'file', 'out.txt'));
```

## File.open(path, mode)

`File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、`File.write()` 和 `File.append()`。

```js
const file = File.open('artifacts/output.txt', 'w');
try {
  file.write('first line\n');
  file.writeBytes([65, 66]);
  file.sync();
} finally {
  file.close();
}
```

**签名**

```ts
File.open(path: string, mode: 'r' | 'w' | 'a'): OpenDeskFileHandle
```

| `FileHandle` 方法 | 说明 |
| --- | --- |
| `close()` | 关闭句柄；可重复调用 |
| `read(maxBytes?)` | 从当前位置读取剩余文本 |
| `readBytes(maxBytes?)` | 从当前位置读取剩余字节 |
| `write(text)` / `writeBytes(bytes)` | 从当前位置写入 |
| `seek(offset, whence?)` | 定位，`whence` 为 `start`（默认）、`current` 或 `end` |
| `truncate(size)` | 调整文件长度 |
| `sync()` | 请求操作系统刷新文件内容 |
| `tryLock()` | 尝试非阻塞独占锁；详见下面的独立合同 |

- `r` 为只读；`w` 会创建或截断文件；`a` 会创建文件并始终从末尾追加。父目录不会自动创建。
- `read` 与 `readBytes` 的默认和最大 `maxBytes` 都是 8 MiB；必须是 1 到 8 MiB 的整数。超过限制会报错并保持原句柄位置。
- `File.open()` 只接受普通文件；目录、设备、管道等特殊文件会被拒绝。
- macOS/Linux 打开时使用非阻塞 flag 防止 FIFO 替换竞争导致阻塞，并在实际 descriptor 上再次检查类型；`w` 的截断发生在类型检查之后。普通文件的读写仍同步，不承诺任意文件系统调用可硬中断。
- 句柄不暴露宿主 `os.File` 或文件描述符等未文档化能力。请使用 `try/finally` 显式关闭；Runtime teardown 也会自动关闭忘记关闭的句柄。
- 非法 mode 会报：`invalid file mode`。

## FileHandle.close()

**签名**

```ts
file.close(): void
```

**参数**

无。

**返回值**

undefined；重复关闭成功。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。释放 OS handle 和锁，关闭失败抛错。关闭后其余方法均抛错；Runtime teardown 也尝试关闭。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
file.close();
```

## FileHandle.read(maxBytes?)

**签名**

```ts
file.read(maxBytes?: number): string
```

**参数**

省略参数时使用 8 MiB；显式传值必须是 number 类型的有限整数 1..8388608。小数、字符串、null、undefined 或多个参数会在读取前抛错，不改变句柄位置。

**返回值**

当前位置到 EOF 的字符串；EOF 返回空字符串。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。超出上限拒绝并恢复原位置；读取失败抛错，不保证失败前未移动位置。文本不额外校验 UTF-8。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
console.log(file.read(1024));
```

## FileHandle.readBytes(maxBytes?)

**签名**

```ts
file.readBytes(maxBytes?: number): ArrayBuffer
```

**参数**

省略参数时使用 8 MiB；显式传值必须是 number 类型的有限整数 1..8388608。小数、字符串、null、undefined 或多个参数会在读取前抛错，不改变句柄位置。

**返回值**

当前位置到 EOF 的 ArrayBuffer；EOF 为零字节。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。超出上限拒绝并恢复原位置；读取或恢复位置失败抛错。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
console.log(file.readBytes(1024).byteLength);
```

## FileHandle.write(text)

**签名**

```ts
file.write(text: string): void
```

**参数**

必填字符串，不增加换行。

**返回值**

undefined。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。从当前位置写入；a 模式仍由 OS 强制追加。权限/I/O 错误抛错，可能已经部分写入。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
file.write('line\n');
```

## FileHandle.writeBytes(bytes)

**签名**

```ts
file.writeBytes(bytes: OpenDeskByteInput): void
```

**参数**

必填 ArrayBuffer、Uint8Array 或 0–255 整数数组。

**返回值**

undefined。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。从当前位置写入；a 模式追加，转换和 I/O 失败抛错。可能部分写入，没有回滚。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
file.writeBytes([0,128,255]);
```

## FileHandle.seek(offset, whence?)

**签名**

```ts
file.seek(offset: number, whence?: 'start' | 'current' | 'end'): number
```

**参数**

offset 为字节偏移；whence 省略或空字符串为 start，只接受一个 whence。

**返回值**

新的绝对字节偏移。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。非法 whence 或 OS seek 失败抛错；可以定位到 EOF 后，seek 本身不扩展文件。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
console.log(file.seek(0, 'start'));
```

## FileHandle.truncate(size)

**签名**

```ts
file.truncate(size: number): void
```

**参数**

恰好一个参数，必须是非负的安全整数（`0..Number.MAX_SAFE_INTEGER`），单位为字节。省略、小数或其他无效值会在调用文件系统前抛错。

**返回值**

undefined。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。缩短或扩展文件但不改变当前位置；OS truncate 失败抛错，只读句柄不能修改长度。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
file.truncate(0);
```

## FileHandle.sync()

**签名**

```ts
file.sync(): void
```

**参数**

无。

**返回值**

undefined。

**行为与错误**

同步方法，没有单独 timeout/signal；复用 File.open 所有权与已关闭检查。同步请求 OS 刷新文件；失败抛错，不保证跨断电、多文件事务或目录项持久性。

**示例**

```js
// file 是 File.open 返回的句柄；在 try/finally 内使用。
file.sync();
```

## FileHandle.tryLock()

对 `File.open()` 返回的句柄尝试取得操作系统的非阻塞独占 advisory lock，用于遵循同一协议的本地进程协调。

**签名**

```ts
file.tryLock(): boolean
```

**参数**

无。

**返回值**

`true` 表示当前句柄持有锁；`false` 表示另一个句柄持有锁，当前调用没有等待、写入或抢占。同一句柄再次调用是幂等的。

**行为与错误**

- macOS/Linux 使用非阻塞 `flock`。Windows 和其他平台目前抛出 unsupported 错误；Linux 仅有源码实现，不能据此声称目标系统 live 验证。
- 锁随 `file.close()`、execution teardown 或进程退出释放，不靠文件年龄或 PID 推断存活。应在 `finally` 显式关闭。
- 已关闭句柄、权限或文件系统不支持锁时抛错；不把错误压缩成“无人持锁”。
- 锁是 advisory：忽略该协议的进程仍可能修改文件。它不提供权限隔离、文件内容事务、原子 CAS 或网络文件系统保证。
- 所有参与者须打开同一个稳定文件；持锁期间及释放后均不要删除、重命名、替换或截断重建锁路径，否则新旧 inode 可以各自被锁定。更新元数据可通过已持锁句柄原位写入。
- `File.open(path, 'w')` 会在取得锁前截断，不能用作锁文件入口。锁文件应保持独立于原子替换的业务 JSON，使用 `a` 打开；它不是第二份业务数据源。

**示例**

从仓库根目录的本地脚本调用；产物在 `.runtime/`：

```js
File.ensureDir('.runtime/examples/file-lock');
const lease = File.open('.runtime/examples/file-lock/writer.lock', 'a');
try {
  if (!lease.tryLock()) throw new Error('另一实例正在保存，请稍后再操作');
  // 在此读取并核验业务版本，再写入；所有写入者必须遵守同一锁协议。
} finally {
  lease.close();
}
```

## File：实战示例

**文本示例（从仓库根目录运行）**

```bash
./opendesk -script examples/runtime/file.js -console-mode script
```

该示例使用跨行模板字符串写入并回读 `.runtime/examples/file-demo/test.txt`。

**JSON 示例（从仓库根目录运行）**

```bash
./dist/opendesk ai run examples/runtime/file-json.js
```

该示例只将输出写入本次 `Execution.artifactDir`。

**示例 1：保存 OCR 结果**

```js
const result = Vision.runOCR({
  imagePath: './.runtime/examples/screen.png',
  provider: 'local'
});

File.ensureDir('./.runtime/examples/ocr');
File.write('./.runtime/examples/ocr/result.json', JSON.stringify(result, null, 2));
```

**示例 2：保存截图字节**

```js
File.ensureDir('./artifacts');
const bytes = await page.screenshot({ returnType: 'bytes' });
File.writeBytes('./.runtime/examples/capture.png', bytes);
```

**示例 3：安全生成输出目录**

```js
const dir = File.join('./artifacts', 'run-001');
File.ensureDir(dir);
File.write(File.join(dir, 'summary.txt'), 'done');
```

## File：注意事项

- `File.write()` 不会自动建父目录
- `File.move()` 底层直接使用 rename，跨设备移动时可能失败
- `File.stat()` 只观察一次文件元数据，不是导出/下载/业务完成判定
- `File.open()` 返回受控 `FileHandle`；脚本层通常更推荐直接用 read/write/append 系列方法
- `File.readJSON()` 的返回类型是 `unknown`；读取后应由脚本自行验证业务结构
