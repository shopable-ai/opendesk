---
title: Dialog API
description: OpenDesk 的异步原生 alert、confirm 与 prompt。
order: 10
---

# Dialog API：原生对话框

`Dialog` 显示由 OpenDesk native host 创建的真实原生顶层模态窗口。它是 **异步 Promise API**：和浏览器的同步、阻塞式 `window.alert()` / `confirm()` / `prompt()` 不同，OpenDesk 不会阻塞 JavaScript EventLoop。

```js
await alert("任务完成");

const accepted = await Dialog.confirm({
  title: "确认操作",
  message: "是否继续？",
  confirmText: "继续",
  cancelText: "取消",
  level: "warning"
});
```

`alert`、`confirm`、`prompt` 三个全局函数只是 `Dialog` 的薄 polyfill alias；参数校验、能力检查、窗口创建和清理由同一 host-owned `Dialog` binding 完成。

## Dialog：启用与能力

Dialog 属于 `ui` 显式交互能力。默认注入 `Dialog`，但调用会以 `DIALOG_DISABLED` fail closed，不能因为全局名称存在而弹窗。

- CLI：`-ui` 或严格、可信的项目 `clawdesk.runtime.json` 中 `runtime.capabilities: ["ui"]`。
- `-no-ui` 优先级最高，必定拒绝 Dialog。
- HTTP：服务端先用 `-ui` 启动，单次请求声明 `"capabilities":["ui"]`，并且 socket 来源是 `127.0.0.1` 或 `::1`。不满足任何一项都不会开始 execution 内的 Dialog。
- MCP、Scheduler 和其他 transport 当前没有 Dialog capability opt-in；其中调用会得到 `DIALOG_DISABLED`。定时提示应继续使用 `notify()`。

```js
const capabilities = Dialog.getCapabilities();
// { enabled, available, activationSource, platform, driver, maxConcurrent: 1,
//   alert, confirm, prompt, securePrompt, reason? }
```

同一 execution 最多同时显示一个 Dialog；第二个并发调用稳定返回 `DIALOG_BUSY`，而不是排队或抢占当前用户输入。

## Dialog：API 方法

```ts
type DialogLevel = "info" | "success" | "warning" | "error";

interface DialogBaseOptions {
  title?: string;
  message: string;
  level?: DialogLevel;
}

interface AlertOptions extends DialogBaseOptions { okText?: string; }

interface ConfirmOptions extends DialogBaseOptions {
  confirmText?: string;
  cancelText?: string;
  defaultAction?: "confirm" | "cancel";
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
  secure?: boolean;
  maxLength?: number;
}
```

### Dialog.alert / alert：提示框

`Dialog.alert(message | AlertOptions): Promise<void>`。一个确认按钮的模态提示。点击确认后 resolve。关闭标题栏或按 Esc 也视为 acknowledgement，并 resolve `undefined`；这项选择避免 `Promise<void>` 有第二种返回值。

```js
await alert({ title: "OpenDesk", message: "任务已经完成", level: "success", okText: "知道了" });
```

### Dialog.confirm / confirm：确认框

`Dialog.confirm(message | ConfirmOptions): Promise<boolean>`。确认返回 `true`；取消、关闭标题栏或 Esc 返回 `false`。Enter 执行 `defaultAction`（默认 `confirm`）。选择只作为该 Promise 的返回值，不写入全局状态。

```js
const proceed = await confirm({ title: "删除前确认", message: "是否继续？", confirmText: "继续", cancelText: "取消", defaultAction: "cancel", level: "warning" });
```

### Dialog.prompt / prompt：输入框

`Dialog.prompt(message | PromptOptions): Promise<string | null>`。确认返回输入字符串；取消、关闭标题栏或 Esc 返回 `null`。Enter 执行 `defaultAction`。`secure: true` 使用 native host 的密码输入控件，输入不会进入普通日志、错误、事件、summary 或 HTTP 响应；脚本作者仍应避免自己 `console.log()` 返回值。

```js
const name = await prompt({ title: "输入名称", message: "请输入任务名称", defaultValue: "", placeholder: "任务名称", confirmText: "确定", cancelText: "取消", secure: false });
```

## Dialog：严格输入边界

仅接受字符串或列出的 plain options 字段。未知字段、数组、`null`、非法类型、`NaN`、非整数 `maxLength`、空 message 和超长文本都会返回 `DIALOG_INVALID_OPTIONS`。

- title：最多 200 Unicode 字符；默认 `OpenDesk`。
- message：必填、非空、最多 4096 Unicode 字符。
- 按钮文字：非空、最多 60 Unicode 字符。
- prompt：默认最多 4096 字符；`maxLength` 必须是 1–16384 的整数；`placeholder` 最多 512 字符，`defaultValue` 不得超过 `maxLength`。

调用者不能传 HTML、CSS、URL、script、native host path 或其他 executable 参数。文本中的 HTML / script 字符只会作为文本渲染，绝不执行。

## Dialog：取消、超时和错误

execution cancel、timeout、HTTP server shutdown、native host crash 和 Runtime teardown 都会幂等地关闭窗口。非成功完成会 reject，并保留 `code`、`operation`、`dialogId`、`capability`、`message` 字段。错误绝不携带 prompt 输入值。

稳定 code：`DIALOG_DISABLED`、`DIALOG_INVALID_OPTIONS`、`DIALOG_BUSY`、`DIALOG_CANCELED`、`DIALOG_TIMEOUT`、`DIALOG_HOST_NOT_FOUND`、`DIALOG_HOST_FAILURE`、`DIALOG_UNSUPPORTED_PLATFORM`。

## Dialog / notify / ui：选择合适的提示能力

| 能力 | 用途 |
| --- | --- |
| `notify()` | 系统通知，非模态；系统不保证横幅一定可见。 |
| `alert()` | 需要用户确认的模态提示。 |
| `confirm()` | 二选一确认。 |
| `prompt()` | 简短文本输入。 |
| `ui.createWindow()` | 自定义持久面板和复杂表单。 |
| `Sound` | 音频提示。 |

Dialog 固定使用 host 根据结构化参数生成的布局；复杂、持续交互的界面请使用 [Custom UI](custom-ui.md)，不要把 Dialog 当 HTML container。
