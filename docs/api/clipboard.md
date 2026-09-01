---
title: Clipboard API
description: OpenDesk JavaScript Runtime 的文本与富格式系统剪贴板 API。
order: 8
---

# Clipboard API

`clipboard` 是 Runtime 注入的同步系统剪贴板对象，不需要 `import`，也不能通过
`new Clipboard()` 创建。

- `copy` / `paste` / `clear`：**Stable** 文本兼容接口。
- `read` / `write` / `getFormats`：**Experimental / macOS** 富格式接口，当前使用
  `NSPasteboard`；其他平台会显式抛出 `NOT_SUPPORTED`，不会 silent no-op。

## clipboard：方法总表

| 方法 | 返回值 | 用途 |
| --- | --- | --- |
| `clipboard.copy(text)` | `void` | 写入剪贴板文本 |
| `clipboard.paste()` | `string` | 读取当前剪贴板文本 |
| `clipboard.clear()` | `void` | 真正清空剪贴板 |
| `clipboard.read(options?)` | `ClipboardReadResult` | 按 canonical format 读取内容与元数据 |
| `clipboard.write(payload)` | `ClipboardWriteResult` | 一次写入一种或多种表示 |
| `clipboard.getFormats()` | `string[]` | 仅返回当前可识别格式，不读取正文 |
| `clipboard.getCapabilities()` | `object` | 返回 backend、格式、限制与 watcher 契约 |

这些方法是同步调用；失败时会同步抛出错误。调用前不需要使用 `await`，但在异步函数
中使用 `await clipboard.paste()` 也只会等待它已经得到的字符串值。

## clipboard.copy(text)：写入文本

```js
clipboard.copy('hello');
```

Runtime 会对写入结果做读取校验。空字符串会保留为 `text/plain` 的空字符串表示；它
与无任何格式的空剪贴板不同。

## clipboard.paste()：读取文本

```js
const text = clipboard.paste();
console.log(text);
```

返回当前剪贴板的文本内容。平台读取失败且重试/fallback 都不能完成时会抛出错误。

## clipboard.clear()：清空剪贴板

```js
clipboard.clear();
```

`clear()` 移除当前格式，不再写入历史兼容用的单个空格：

```js
clipboard.clear();
console.log(clipboard.getFormats());             // []（macOS rich backend）
console.log(JSON.stringify(clipboard.paste())); // ""
```

## 富格式模型

公开 API 使用固定 canonical format，不直接要求脚本理解平台 UTI：

| format | payload / result 字段 | 表示 |
| --- | --- | --- |
| `text/plain` | `text` | UTF-8 JavaScript string |
| `text/html` | `html` | UTF-8 JavaScript string；不解析或消毒 |
| `text/rtf` | `rtfBase64` | 完整 RTF bytes 的 canonical base64 |
| `image/png` | `pngBase64` | 完整 PNG 文件 bytes 的 canonical base64 |
| `files` | `files` | clean、absolute、已存在的本地路径数组 |

二进制使用 base64，避免 Goja 与 JSON 之间的隐式 byte-array 转换。文件列表不返回
`file://` URL；macOS backend 在 API 边界将 file URL 转换为绝对路径。

### clipboard.write(payload)

```js
const result = clipboard.write({
  text: 'OpenDesk',
  html: '<strong>OpenDesk</strong>',
  files: [File.join(File.cwd(), 'README.md')],
});

console.log(result.formats, result.changeCount);
```

payload 必须至少包含一个受支持字段。一次调用可以写入多种表示；返回值只包含格式和
`changeCount`，不会回显正文。

### clipboard.read(options?)

```js
const all = clipboard.read({ formats: [] });
const selected = clipboard.read({
  formats: ['text/html', 'image/png'],
  maxBytes: 8 * 1024 * 1024,
});
```

省略 `formats` 或传入空数组会读取所有当前可识别格式。若只想探测格式，优先使用
`getFormats()`，因为它不会读取正文。结果包含：

- `formats`：canonical formats；
- `nativeFormats`：平台原始类型标识；
- `derivedNativeFormats`：已知的系统兼容 sidecar；恢复 canonical content 时由系统重新生成，
  不承诺 byte-for-byte 保留；
- `unsupportedNativeFormats`：OpenDesk 当前无法无损恢复的原始类型；
- `changeCount`：当前剪贴板变更计数；
- 请求且存在的 `text` / `html` / `rtfBase64` / `pngBase64` / `files`。

恢复操作者剪贴板前，应先检查 `unsupportedNativeFormats`。非空时，当前 API 不能保证
无损恢复这些私有格式，因此自动化脚本应在写入前停止或征得用户同意。

## 限制与错误

- 单次读写聚合上限：16 MiB；`read({maxBytes})` 可进一步收紧。
- 单个 `text` / `html` 上限：4 MiB。
- 文件最多 256 个；单路径最多 4096 bytes。
- PNG 会校验签名和可解码 header；RTF 必须有 RTF header。
- 错误带有 `code` 与 `operation`；代码包括 `INVALID_ARGUMENT`、
  `UNSUPPORTED_FORMAT`、`PAYLOAD_TOO_LARGE`、`NOT_SUPPORTED`、
  `BACKEND_FAILED`、`VERIFICATION_FAILED`。
- 错误信息、默认日志和正式 Evidence 不包含剪贴板正文、文件路径或设备私有数据。

## 变更事件

剪贴板没有第二套 `onChange` API。复用统一 [Desktop Events API](events.md)：

```js
const subscription = Events.on('clipboard.changed', (event) => {
  console.log(event.data.changeCount);       // 元数据
  console.log(event.data.contentIncluded);  // false
});

subscription.unsubscribe();
```

事件默认不读取或附带剪贴板正文。

## 可复制的真实 smoke

工作目录：仓库根目录。

```bash
go run ./cmd/opendesk -script examples/clipboard/rich-smoke.js -console-mode script
```

脚本会在确认原剪贴板没有无法恢复的私有格式后，验证文本、HTML、RTF、PNG、文件列表、
真实 clear 语义和 `clipboard.changed`，然后恢复原剪贴板。脱敏 Evidence 写入
`.runtime/tests/platform-primitives/task-005-clipboard/rich-smoke.json`。

## 全局快捷函数

只需要读写文本时，可使用全局 `copyToClipboard(text)` 和 `getClipboard()`。完整契约
见 [Global APIs](global-apis.md)；它们是兼容快捷入口，不是第二套剪贴板实现。
