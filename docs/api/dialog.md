---
title: Dialog API
description: OpenDesk 的异步原生 alert、confirm 与 prompt。
order: 10
---

# Dialog

`Dialog` 显示由 OpenDesk native host 创建的异步原生模态窗口。它不是浏览器同步 dialog：所有操作都返回 Promise，不阻塞 JavaScript EventLoop。

全局 `alert()` / `confirm()` / `prompt()` 是对应 `Dialog.*` 方法的兼容 alias。

## API 一览

| 接口 | Canonical method | 用途 |
| --- | --- | --- |
| `Dialog.getCapabilities()` | — | 查询 Dialog capability。 |
| `Dialog.alert(messageOrOptions)` | `Dialog.alert()` | 显示单按钮提示框。 |
| `alert(messageOrOptions)` | `Dialog.alert()` | 全局兼容 alias。 |
| `Dialog.confirm(messageOrOptions)` | `Dialog.confirm()` | 显示确认/取消对话框。 |
| `confirm(messageOrOptions)` | `Dialog.confirm()` | 全局兼容 alias。 |
| `Dialog.prompt(messageOrOptions)` | `Dialog.prompt()` | 显示文本输入对话框。 |
| `prompt(messageOrOptions)` | `Dialog.prompt()` | 全局兼容 alias。 |

## 公共约定

### Capability

Dialog 使用 `ui` capability。CLI 可通过 `-ui` 或可信项目配置启用；`-no-ui` 优先级最高并强制禁用。HTTP 还要求 server 与单次 request 都声明 `ui` 且来源为 loopback。MCP 与 Scheduler 当前不提供 Dialog opt-in。

同一 execution 最多同时显示一个 Dialog；第二个并发调用以 `DIALOG_BUSY` 拒绝。

### Options

```ts
type DialogLevel = 'info' | 'success' | 'warning' | 'error';

interface DialogBaseOptions {
  title?: string;
  message: string;
  level?: DialogLevel;
}

interface AlertOptions extends DialogBaseOptions {
  okText?: string;
}

interface ConfirmOptions extends DialogBaseOptions {
  confirmText?: string;
  cancelText?: string;
  defaultAction?: 'confirm' | 'cancel';
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
  secure?: boolean;
  maxLength?: number;
}
```

限制：`title` 最多 200 Unicode 字符；`message` 必填、非空、最多 4096；按钮文字非空、最多 60；`placeholder` 最多 512；`maxLength` 必须是 `1..16384` 整数，默认输入上限 4096。

未知字段、数组、`null`、非法类型、空 message 等以 `DIALOG_INVALID_OPTIONS` 拒绝。HTML/script 字符只作为文本渲染，不执行。

### Promise 与取消

用户取消不是异常：`alert` resolve `undefined`；`confirm` resolve `false`；`prompt` resolve `null`。execution cancel、deadline、host failure 等才 reject。

Dialog 只 settle 一次；用户动作、关闭、Esc、取消和 host failure 竞争时以第一个终态为准。未观察的 Dialog Promise 不会让 execution 无限存活。

## `Dialog.getCapabilities()`

返回当前 Dialog host 与授权能力摘要。

**签名**
```ts
Dialog.getCapabilities(): OpenDeskDialogCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskDialogCapabilities`，包含 `enabled`、`available`、`activationSource`、`platform`、`driver`、`maxConcurrent` 以及 alert/confirm/prompt/securePrompt 能力。

**行为与错误**

只读取 capability，不显示窗口。

**示例**
```js
console.log(Dialog.getCapabilities());
```

## `Dialog.alert(messageOrOptions)`

显示一个需要 acknowledgement 的原生提示框。

**签名**
```ts
Dialog.alert(messageOrOptions: string | AlertOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| AlertOptions` | 是 | 无 | 消息字符串或 alert options。 |

**返回值**

`Promise<void>`；确认、标题栏关闭或 Esc resolve `undefined`。

**行为与错误**

调用立即返回 Promise。能力禁用、参数无效、并发冲突、取消、timeout 或 host failure 使用结构化 Dialog error。

**示例**
```js
await Dialog.alert({
  title: 'OpenDesk',
  message: '任务已经完成',
  level: 'success',
  okText: '知道了',
});
```

## `alert(messageOrOptions)`

`Dialog.alert()` 的全局兼容 alias。

**签名**
```ts
alert(messageOrOptions: string | AlertOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| AlertOptions` | 是 | 无 | 与 `Dialog.alert()` 相同。 |

**返回值**

`Promise<void>`。

**行为与错误**

Canonical method：`Dialog.alert()`；参数、返回值与错误完全一致。

**示例**
```js
await alert('任务完成');
```

## `Dialog.confirm(messageOrOptions)`

显示确认/取消原生对话框。

**签名**
```ts
Dialog.confirm(messageOrOptions: string | ConfirmOptions): Promise<boolean>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| ConfirmOptions` | 是 | 无 | 消息字符串或 confirm options。 |

**返回值**

`Promise<boolean>`；确认 `true`，取消/关闭/Esc `false`。

**行为与错误**

Enter 执行 `defaultAction`，默认 `confirm`。用户取消不是 rejection。

**示例**
```js
const proceed = await Dialog.confirm({
  title: '确认操作',
  message: '是否继续？',
  confirmText: '继续',
  cancelText: '取消',
});
```

## `confirm(messageOrOptions)`

`Dialog.confirm()` 的全局兼容 alias。

**签名**
```ts
confirm(messageOrOptions: string | ConfirmOptions): Promise<boolean>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| ConfirmOptions` | 是 | 无 | 与 `Dialog.confirm()` 相同。 |

**返回值**

`Promise<boolean>`。

**行为与错误**

Canonical method：`Dialog.confirm()`。

**示例**
```js
const accepted = await confirm('是否继续？');
```

## `Dialog.prompt(messageOrOptions)`

显示原生文本输入对话框。

**签名**
```ts
Dialog.prompt(messageOrOptions: string | PromptOptions): Promise<string | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| PromptOptions` | 是 | 无 | 消息字符串或 prompt options。 |

**返回值**

`Promise<string | null>`；确认返回输入字符串，取消/关闭/Esc 返回 `null`。

**行为与错误**

`secure:true` 使用 native password input。Runtime 不把输入写入普通日志或结构化错误；脚本也不应自行记录敏感返回值。

**示例**
```js
const name = await Dialog.prompt({
  message: '请输入任务名称',
  placeholder: '任务名称',
  secure: false,
});
```

## `prompt(messageOrOptions)`

`Dialog.prompt()` 的全局兼容 alias。

**签名**
```ts
prompt(messageOrOptions: string | PromptOptions): Promise<string | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `messageOrOptions` | `string \| PromptOptions` | 是 | 无 | 与 `Dialog.prompt()` 相同。 |

**返回值**

`Promise<string | null>`。

**行为与错误**

Canonical method：`Dialog.prompt()`。

**示例**
```js
const value = await prompt('请输入标签');
```

## 错误

稳定错误 code：`DIALOG_DISABLED`、`DIALOG_INVALID_OPTIONS`、`DIALOG_BUSY`、`DIALOG_CANCELED`、`DIALOG_TIMEOUT`、`DIALOG_HOST_NOT_FOUND`、`DIALOG_HOST_FAILURE`、`DIALOG_UNSUPPORTED_PLATFORM`。错误不会携带 prompt 输入值。

## 平台与能力

Dialog 需要可用 native UI host 与 `ui` capability。定时/后台提示使用 [`notify()`](notify.md)，复杂持久界面使用 [`ui`](custom-ui.md)。
