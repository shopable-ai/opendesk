---
title: Clipboard API
description: OpenDesk JavaScript Runtime 的文本与富格式系统剪贴板 API。
order: 8
---

# clipboard

`clipboard` 是 Runtime 注入的同步系统剪贴板对象，不需要 `import`，也不能通过构造器创建。

`copy()` / `paste()` / `clear()` 是 Stable 文本兼容接口；`read()` / `write()` / `getFormats()` / `getCapabilities()` 是 capability-gated 富格式接口，当前 macOS backend 使用 `NSPasteboard`。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `clipboard.copy(text)` | Stable | 写入纯文本。 |
| `clipboard.paste()` | Stable | 读取当前纯文本。 |
| `clipboard.clear()` | Stable | 清空剪贴板。 |
| `clipboard.read(options?)` | Experimental rich | 读取一致的内容与元数据快照。 |
| `clipboard.write(payload)` | Experimental rich | 一次写入一种或多种 canonical representation。 |
| `clipboard.getFormats()` | Experimental rich | 返回当前可识别格式，不读取正文。 |
| `clipboard.getCapabilities()` | Experimental rich | 返回 backend、格式、限制与 watcher 契约。 |

## 公共约定

### Canonical formats

| format | payload / result 字段 | 表示 |
| --- | --- | --- |
| `text/plain` | `text` | UTF-8 JavaScript string。 |
| `text/html` | `html` | UTF-8 JavaScript string；不解析或消毒。 |
| `text/rtf` | `rtfBase64` | 完整 RTF bytes 的 canonical base64。 |
| `image/png` | `pngBase64` | 完整 PNG 文件 bytes 的 canonical base64。 |
| `files` | `files` | 本地 file URL 对应的绝对路径数组。 |

二进制统一使用 base64。文件列表返回绝对路径，不返回 `file://` URL。

### Rich read options

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `formats` | `string[]` | 否 | 当前全部可识别格式 | 指定要读取正文的 canonical formats；`[]` 表示只读元数据。 |
| `maxBytes` | `number` | 否 | 16 MiB 上限内的默认值 | 进一步收紧本次读取总字节上限。 |

### Rich payload limits

| 限制 | 最大值 |
| --- | ---: |
| 单次聚合读写 | 16 MiB |
| 单个 `text` / `html` | 4 MiB |
| 文件数量 | 256 |
| 单个路径 | 4096 bytes |

RTF / PNG 按 base64 解码后的原始 bytes 计数；text / HTML / path 按 UTF-8 bytes 计数。PNG 校验签名和可解码 header；RTF 必须有 RTF header。

## `clipboard.copy(text)`

写入纯文本剪贴板内容。

**签名**

```ts
clipboard.copy(text: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 要写入的纯文本。 |

**返回值**

`undefined`。

**行为与错误**

Runtime 会验证文本写入结果。空字符串保留为 `text/plain` 的空字符串 representation，与完全无格式的空剪贴板不同。写入失败时同步抛结构化错误。

**示例**

```js
clipboard.copy('hello');
```

## `clipboard.paste()`

读取当前剪贴板的纯文本内容。

**签名**

```ts
clipboard.paste(): string;
```

**参数**

无。

**返回值**

`string`。没有文本表示时按兼容合同返回空字符串。

**行为与错误**

同步读取当前文本。平台读取失败且 fallback 无法完成时抛结构化错误。

**示例**

```js
const text = clipboard.paste();
console.log(text);
```

## `clipboard.clear()`

移除当前剪贴板内容和格式。

**签名**

```ts
clipboard.clear(): void;
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

真正清空剪贴板，不再写入历史兼容用的空格。清理失败时同步抛结构化错误。

**示例**

```js
clipboard.clear();
console.log(clipboard.paste()); // ''
```

## `clipboard.read(options?)`

读取一个 changeCount 一致的剪贴板内容与元数据快照。

**签名**

```ts
clipboard.read(
  options?: OpenDeskClipboardReadOptions,
): OpenDeskClipboardReadResult;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskClipboardReadOptions` | 否 | `{}` | 富格式读取选项。 |
| `options.formats` | `string[]` | 否 | 全部可识别格式 | 要读取正文的 canonical formats；空数组只读元数据。 |
| `options.maxBytes` | `number` | 否 | backend 默认 | 本次读取总字节上限。 |

**返回值**

`OpenDeskClipboardReadResult`。结果包含 `formats`、`nativeFormats`、`derivedNativeFormats`、`unsupportedNativeFormats`、`changeCount`，以及请求且存在的 `text` / `html` / `rtfBase64` / `pngBase64` / `files`。

**行为与错误**

Runtime 在读取前后核对 `changeCount`；剪贴板变化时自动重试一次，仍无法得到一致 snapshot 时抛 `CLIPBOARD_CHANGED`。`formats: []` 不读取正文，只返回元数据。恢复操作者剪贴板前应检查 `unsupportedNativeFormats`，非空时当前 API 不能保证无损恢复这些私有格式。

**示例**

```js
const metadata = clipboard.read({ formats: [] });
console.log(metadata.formats, metadata.changeCount);

const selected = clipboard.read({
  formats: ['text/html', 'image/png'],
  maxBytes: 8 * 1024 * 1024,
});
```

## `clipboard.write(payload)`

一次写入一种或多种 canonical representation。

**签名**

```ts
clipboard.write(
  payload: OpenDeskClipboardWritePayload,
): OpenDeskClipboardWriteResult;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `payload` | `OpenDeskClipboardWritePayload` | 是 | 无 | 至少包含一个受支持字段。 |
| `payload.text` | `string` | 否 | 未设置 | `text/plain` representation。 |
| `payload.html` | `string` | 否 | 未设置 | `text/html` representation。 |
| `payload.rtfBase64` | `string` | 否 | 未设置 | RTF bytes 的 canonical base64。 |
| `payload.pngBase64` | `string` | 否 | 未设置 | PNG bytes 的 canonical base64，不带 data URL 前缀。 |
| `payload.files` | `string[]` | 否 | 未设置 | 本地文件绝对路径数组。 |

**返回值**

`OpenDeskClipboardWriteResult`，包含写入后的 `formats` 与 `changeCount`，不回显正文。

**行为与错误**

Runtime 逐项读取并验证本次请求的 representation；只写入 format 标识但正文不一致时抛 `VERIFICATION_FAILED`。复制 HTML 时建议同时提供纯文本 fallback。未知格式、超限 payload 或 backend 不支持时明确抛错，不 silent ignore。

**示例**

```js
const result = clipboard.write({
  text: 'OpenDesk',
  html: '<strong>OpenDesk</strong>',
});
console.log(result.formats, result.changeCount);
```

## `clipboard.getFormats()`

返回当前可识别的 canonical formats，不读取正文。

**签名**

```ts
clipboard.getFormats(): string[];
```

**参数**

无。

**返回值**

`string[]`。

**行为与错误**

同步读取格式元数据。需要同时取得 changeCount 和 native format 分类时使用 `clipboard.read({ formats: [] })`。

**示例**

```js
console.log(clipboard.getFormats());
```

## `clipboard.getCapabilities()`

返回当前剪贴板 backend、格式和限制能力摘要。

**签名**

```ts
clipboard.getCapabilities(): OpenDeskClipboardCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskClipboardCapabilities`，包含 `rich`、canonical format 支持矩阵、backend、watcher 契约和 `limits`。

**行为与错误**

不读取剪贴板正文。富格式 capability 不改变其他平台上稳定文本 `copy()` / `paste()` 的合同。

**示例**

```js
const capabilities = clipboard.getCapabilities();
console.log(capabilities.rich, capabilities.formats);
```

## 错误

富格式与兼容文本接口使用结构化错误，常见 code：

```text
INVALID_ARGUMENT
UNSUPPORTED_FORMAT
PAYLOAD_TOO_LARGE
NOT_SUPPORTED
BACKEND_FAILED
VERIFICATION_FAILED
CLIPBOARD_CHANGED
```

错误信息和默认日志不应包含剪贴板正文、文件路径或其他私有内容。

## 平台与能力

稳定文本 `copy()` / `paste()` / `clear()` 面向支持的桌面平台。富文本、PNG 与 files 当前主要由 macOS NSPasteboard backend 提供；不支持的平台明确返回 `NOT_SUPPORTED`。

剪贴板变化事件统一通过 [`Events.on('clipboard.changed', ...)`](events.md) 订阅，不提供第二套 `clipboard.onChange()` API。只需要文本快捷入口时，也可使用 [`copyToClipboard()` / `getClipboard()`](global-apis.md)。
