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

`Dialog.alert()` / `Dialog.confirm()` / `Dialog.prompt()` 与全局 `alert()` / `confirm()` /
`prompt()` 是等价入口，使用相同的参数、返回值和错误语义。

## 异步控制流：只返回 Promise

`Dialog.alert()`、`Dialog.confirm()` 和 `Dialog.prompt()` **只**接受本页列出的消息或
options 参数，且**只**返回 Promise。没有 `onConfirm`、`onCancel` 或其他 options callback；
不要把浏览器同步 dialog 的控制流习惯带到 OpenDesk。

- 调用立即返回，不会同步阻塞 Runtime EventLoop；`await` 只暂停当前 `async` 函数。
- 使用 `await` 接收结果，或使用 `.then()` / `.catch()` / `.finally()` 注册 continuation。
  这些 continuation 和 Dialog settlement 都在该 execution 的 owner EventLoop 上运行。
- 文件脚本把异步入口命名为 `main()` 时，应写顶层 `await main()`；单独的
  `main().catch(...)` 不会让 Runtime 把该外层用户 Promise 当作 execution completion。
- 一个 Dialog 只会 settle 一次：用户选择、Esc、标题栏关闭、execution cancel、deadline
  和 native host failure 竞争时，以先到的终态为准；后续 native event 会被忽略。
- 如果脚本调用 Dialog 后结束、但没有 `await`、`.then()`、`.catch()` 或 `.finally()` 观察
  返回的 Promise，Runtime 会关闭原生窗口并结束 execution；它不会为了一个被遗忘的 Dialog
  无限保持 execution 存活。

仓库提供两个互不屏蔽、可分别直接运行的完整示例：

- [`examples/dialog.js`](https://github.com/shopable-ai/opendesk/blob/master/examples/dialog.js)：`async` / `await` 写法；
- [`examples/dialog-promise-chain.js`](https://github.com/shopable-ai/opendesk/blob/master/examples/dialog-promise-chain.js)：等价的
  `.then()` / `.catch()` / `.finally()` 写法。

### 从仓库根目录运行公开示例

在已具备当前版本 `./opendesk` 和同级 `./opendesk-ui-host` 的仓库根目录中，任选一条命令：

```bash
./opendesk -ui -script examples/dialog.js -console-mode script
./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script
```

普通手动运行只有这一条启动命令，后续直接操作真实 Dialog。不要切换到 `dist/` 后再使用
`../examples/...`，也不需要手工运行 AX controller。若源码已经更新但根目录构建物较旧，应由
维护者先同时刷新主程序与 UI host；正式自动化、构建新鲜度规则和预期打印见
[`examples/README.md`](../../examples/README.md)。

手动验收不仅要确认 Promise 返回值：还应观察 alert 打开期间终端已打印
`returned-promise` 与 `event-loop-continuation`，确认第二个结果窗口显示输入值或明确的 `null`
取消路径，并确认窗口紧凑适配内容、没有异常拉宽、大面积空白、裁切或控件错位。

```js
async function main() {
  console.log('alert 调用前');
  const pending = Dialog.alert({
    message: '这个原生窗口打开时，EventLoop 仍可继续运行',
    okText: '继续'
  });
  console.log('alert 已立即返回 Promise', pending instanceof Promise);
  await Promise.resolve();
  console.log('alert settle 前的 EventLoop continuation 已运行');
  await pending;
  console.log('alert 已 settle');

  const value = await Dialog.prompt({
    message: '输入非敏感标签',
    placeholder: '标签',
    confirmText: '显示结果',
    cancelText: '取消'
  });
  await Dialog.alert({
    title: 'Prompt 结果',
    message: value === null
      ? 'Prompt 结果：null（用户取消）'
      : `Prompt 结果：${value}`
  });
}

try {
  await main();
} catch (error) {
  console.error(error.code, error.message);
  throw error;
}
```

`await` 以外的等价写法是链式 Promise；仍需在文件顶层 `await flow`，让 Runtime
观察整条用户 Promise：

```js
console.log('alert 调用前');
const pending = Dialog.alert({ message: 'EventLoop 仍可继续运行', okText: '继续' });
console.log('alert 已立即返回 Promise', pending instanceof Promise);

const flow = Promise.resolve()
  .then(() => console.log('alert settle 前的 EventLoop continuation 已运行'))
  .then(() => pending)
  .then(() => Dialog.prompt({
    message: '输入非敏感标签',
    placeholder: '标签',
    confirmText: '显示结果',
    cancelText: '取消'
  }))
  .then(value => Dialog.alert({
    title: 'Prompt 结果',
    message: value === null
      ? 'Prompt 结果：null（用户取消）'
      : `Prompt 结果：${value}`
  }))
  .catch(error => {
    console.error(error.code, error.message);
    throw error;
  })
  .finally(() => console.log('Dialog flow finished'));

await flow;
```

上例为了演示结果窗口，只回显明确属于非敏感数据的标签。不要回显密码、token 或其他秘密；
`secure: true` 的 prompt 返回值尤其不应写入日志、通知或后续 Dialog。

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
await Dialog.alert({
  title: "输入结果",
  message: name === null ? "输入结果：null（用户取消）" : `输入结果：${name}`
});
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

用户取消不是异常：`confirm` resolve `false`，`prompt` resolve `null`，`alert` resolve
`undefined`。只有 execution/native failure 才 reject。`catch` 可处理 reject；`finally`
总会在该 Promise 已 settle 后执行。

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

Dialog 固定使用 host 根据结构化参数生成的布局；复杂、持续交互的界面请使用
[Custom UI v1](custom-ui.md)，不要把 Dialog 当 HTML container。

## Dialog：实现边界

`alert`、`confirm`、`prompt` 三个全局函数由薄 polyfill alias 提供；参数校验、能力检查、
窗口创建和清理由同一个 host-owned `Dialog` binding 完成。脚本只应依赖本页描述的公开
调用契约，不应依赖内部 binding 或 polyfill 文件。
