---
title: File API
description: File 对象提供面向脚本的文件系统读写、移动、复制、删除与路径处理能力。
order: 7
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
| File.ensureDir(path) | 确保目录存在 |
| File.read(path) | 读取文本 |
| File.readJSON(filePath, options?) | 异步读取并按 Runtime JSON.parse 解析 JSON |
| File.readBytes(path) | 读取字节 |
| File.write(path, text) | 写文本 |
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

## File：常用方法

## File.cwd()

```js
console.log(File.cwd());
```

## File.path(relativePath)

```js
const abs = File.path('./.runtime/examples/out.txt');
console.log(abs);
```

## File.read(path)

```js
const text = File.read('./README.md');
console.log(text.slice(0, 200));
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

```js
const text = `first line
second line
`;
File.write('./.runtime/examples/result.txt', text);
```

**注意**
- `File.write()` 会按传入内容保留模板字符串中的换行；不会自动增加或删除末尾换行
- 当前实现不会自动创建父目录
- 若目录可能不存在，先用 `File.ensureDir()` 或 `File.createWithDirs()`

## File.append(path, text)

```js
File.append('./.runtime/examples/log.txt', 'line 1\n');
File.append('./.runtime/examples/log.txt', 'line 2\n');
```

## File.readBytes(path)

```js
const bytes = File.readBytes('./.runtime/examples/image.png');
console.log(bytes.length);
```

## File.writeBytes(path, bytes)

```js
const shot = await page.screenshot({ returnType: 'bytes' });
File.writeBytes('./.runtime/examples/shot.png', shot);
```

## File.ensureDir(path)

```js
File.ensureDir('./.runtime/examples/reports');
```

## File.exists(path)

```js
if (!File.exists('./.runtime/examples/result.json')) {
  console.log('missing');
}
```

## File.copy(pathFrom, pathTo)

```js
File.copy('./.runtime/examples/a.txt', './.runtime/examples/b.txt');
```

## File.move(path, newPath)

```js
File.move('./.runtime/examples/tmp.txt', './.runtime/examples/archive/tmp.txt');
```

## File.listDir(path)

```js
console.log(File.listDir('./artifacts'));
```

## File.isFile(path) / File.isDir(path)

```js
console.log(File.isFile('./README.md'));
console.log(File.isDir('./artifacts'));
```

## File.isEmptyDir(path)

```js
console.log(File.isEmptyDir('./.runtime/examples/empty-dir'));
```

## File.join(parent, ...children)

```js
const path = File.join('./artifacts', 'vision', 'result.json');
console.log(path);
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
File.open(path: string, mode: 'r' | 'w' | 'a'): FileHandle
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

- `r` 为只读；`w` 会创建或截断文件；`a` 会创建文件并始终从末尾追加。父目录不会自动创建。
- `read` 与 `readBytes` 的默认和最大 `maxBytes` 都是 8 MiB；必须是 1 到 8 MiB 的整数。超过限制会报错并保持原句柄位置。
- `File.open()` 只接受普通文件；目录、设备、管道等特殊文件会被拒绝。
- 句柄不暴露宿主 `os.File` 或文件描述符等未文档化能力。请使用 `try/finally` 显式关闭；Runtime teardown 也会自动关闭忘记关闭的句柄。
- 非法 mode 会报：`invalid file mode`。

## File：实战示例

**文本示例（从仓库根目录运行）**

```bash
./opendesk -script examples/file.js -console-mode script
```

该示例使用跨行模板字符串写入并回读 `.runtime/examples/file-demo/test.txt`。

**JSON 示例（从仓库根目录运行）**

```bash
./dist/opendesk ai run examples/file-json.js
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
- `File.open()` 返回受控 `FileHandle`；脚本层通常更推荐直接用 read/write/append 系列方法
- `File.readJSON()` 的返回类型是 `unknown`；读取后应由脚本自行验证业务结构
