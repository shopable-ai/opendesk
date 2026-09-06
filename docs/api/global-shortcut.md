---
title: Global Shortcut API
description: macOS 与 Windows 系统级 globalShortcut 注册、回调与生命周期。
order: 14
---

# globalShortcut

`globalShortcut` 把系统范围的按键事件带回当前 OpenDesk JavaScript Runtime。它与
`keyboard` 的方向相反：`keyboard` 是 OpenDesk 向操作系统发送输入，
`globalShortcut` 是操作系统向 OpenDesk 触发 callback。

**状态：Stable（macOS、Windows）**

Linux 当前会保留对象形状，但 `register()` 会抛出 `NOT_SUPPORTED`；它不是 Linux 的
全局快捷键实现声明。

```js
async function copyEmail() {
  await clipboard.copy('abc@example.com');
}

globalShortcut.register(
  'CommandOrControl+Shift+1',
  copyEmail,
);
```

注册成功后，即使 OpenDesk 不在前台，系统级快捷键仍会触发。callback 总是在它所属
Runtime 的 Goja EventLoop 中执行，因此可以直接组合 `clipboard`、`window`、
`FloatingWindow` 与其他现有 JavaScript API；原生按键线程不会直接触碰 JavaScript。

## `globalShortcut.register()` / `globalShortcut.unregister()` / `globalShortcut.unregisterAll()` / `globalShortcut.isRegistered()`：方法总览

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `globalShortcut.register(accelerator, callback)` | `void` | 注册一个快捷键；失败时抛出结构化错误。 |
| `globalShortcut.unregister(accelerator)` | `void` | 解除本 Runtime 的一个注册；不存在时无操作。 |
| `globalShortcut.isRegistered(accelerator)` | `boolean` | 仅检查当前 Runtime 所拥有的注册。 |
| `globalShortcut.unregisterAll()` | `void` | 解除当前 Runtime 的全部注册。 |

`register()` 返回 `void`，因为成功没有额外状态，失败会直接抛错；调用方可以用
`isRegistered()` 查询当前 Runtime 的本地 registry。

## Accelerator

公共 accelerator 不包含用户 ID。OpenDesk 会生成内部 ID，并把同一字符串在不同平台
映射为对应的原生注册。

支持的 modifier：

- `CommandOrControl`：macOS 为 `Command`，Windows 为 `Control`
- `Command`、`Control`、`Shift`、`Alt` / `Option`、`Meta`

支持的主键：`A-Z`、`0-9`、`F1-F24`、`Enter`、`Escape`、`Space`、`Tab`、
`Backspace`、`Delete`、`Up`、`Down`、`Left`、`Right`。

兼容别名包括 `Cmd`、`Ctrl`、`CmdOrCtrl`、`CommandOrCtrl`、`Esc`、`Opt`。大小写、
空格和 modifier 顺序都会归一化；例如以下都表示同一个 accelerator：

```js
'ctrl + shift + a'
'Control+Shift+A'
'CTRL+SHIFT+A'
```

重复 modifier、缺少主键、未知键，以及平台映射后冲突的 modifier 都是非法 accelerator。

## 错误

错误使用普通 JavaScript `Error`，并提供 `code`、`operation` 和 `accelerator` 属性。

| `error.code` | 含义 |
| --- | --- |
| `INVALID_ACCELERATOR` | 字符串、主键或 modifier 无效。 |
| `ALREADY_REGISTERED` | 当前 Runtime 或 macOS / 其他应用已有冲突注册。 |
| `REGISTRATION_FAILED` | 原生系统注册、权限或底层资源启动失败。 |
| `NOT_SUPPORTED` | 当前平台或构建没有 global shortcut backend。 |
| `CALLBACK_FAILED` | callback throw 或 Promise rejection；进入 Runtime 的既有异步错误路径。 |

同一 shortcut callback 是 single-flight：上一次返回的 Promise 尚未 settle 时，新的按键
触发会被忽略，避免重复执行剪贴板、窗口或自动化动作。

`isRegistered()` 只检查当前 Runtime，不能查询或注销其他 OpenDesk 进程、macOS 或另一应用
拥有的 shortcut。遇到 `ALREADY_REGISTERED` 时，先正常退出仍在运行的同一脚本；若当前
Runtime 并未注册该组合键，就在脚本中换用一个未被占用的 accelerator。不要用
`unregister()` 试图释放其他进程拥有的 shortcut。

从命令行以 `-script path/to/file.js` 直接运行时，OpenDesk 会按该文件的真实路径实行单实例
接管。再次启动同一个文件会通过仅本机、带随机令牌的控制通道请求上一次执行取消；旧 Runtime
完成 `unregisterAll()` 等清理并释放原生快捷键后，新执行才会开始注册。这只影响同一脚本文件，
不会终止其他脚本、OpenDesk HTTP 服务或其他应用，也不会强占它们持有的快捷键。`-script-text`
和 `-script-stdin` 没有稳定的文件身份，仍作为独立执行处理。被新调用接管的旧命令会在完成
清理后显示 informational replacement 消息并正常退出；用户手动 `Ctrl-C` 仍按取消处理。

## 生命周期与清理

已注册快捷键是 Runtime resource。只要仍有注册，execution 会保持可接收事件，无需 busy
loop 或手写永久 timer。`unregisterAll()` 后，如果没有其他异步资源，execution 可以自然结束。

在正常结束、throw、未处理 Promise rejection、timeout、context cancellation、HTTP execution
cancel、Runtime teardown 和应用退出路径，OpenDesk 都会解除该 Runtime 创建的全部原生注册、
callback 引用和待派发事件。脚本不应依赖进程退出来解除已不需要的快捷键；可提前调用
`unregister()` 或 `unregisterAll()`。

## 与 FloatingWindow 共用 callback

两者是平级 trigger，不会模拟点击工具栏：

```js
async function copyEmail() {
  await clipboard.copy('abc@example.com');
}

const toolbar = new FloatingWindow();
toolbar.addButton('email', 'Copy email', 'paperplane.fill', copyEmail);

globalShortcut.register('CommandOrControl+Shift+1', copyEmail);
```

## 最小示例

普通使用遵循仓库根目录的 `dist/` 可执行文件约定。源码更新后，先刷新一次：

```bash
make build
```

随后从仓库根目录运行这一条命令：

```bash
./dist/opendesk -script examples/global-shortcut.js -console-mode script
```

在 macOS 按 `Command+Shift+e`，终端应打印 `copied`，且 `Hello from OpenDesk` 会写入系统
剪贴板；在 Windows，相同 accelerator 对应 `Control+Shift+e`。按 `Ctrl-C` 正常结束进程会
自动注销已注册快捷键。完整示例见 [examples/global-shortcut.js](../../examples/global-shortcut.js)。
普通体验只需这条启动命令和一次真实系统按键；不要把 AX、WindowServer 或截图探针当成手动
使用步骤。

## macOS 安全与隐私授权

`globalShortcut` 监听的是系统范围的按键事件；它不会向其他应用发送按键，也不会读取屏幕或
控制其他应用。当前 macOS backend 使用只读的系统键盘事件监听，因此运行它的 **实际宿主**
必须由用户在系统设置中明确允许：

`globalShortcut` 不定义 `requestPermission()`，并且 `register()` 不会隐式显示权限提示或打开
系统设置。请只在首次配置或用户主动点击“配置快捷键权限”时调用通用的
`page.requestPermissions({ section: 'globalShortcut', openSettings: true, strict: false })`；正常注册
快捷键不需要 Screen Recording 或 Automation。该调用会先检查授权；两项都已授权时返回
`skipped: true`，不会再次拉起系统设置。

1. 从仓库根目录执行一次 `make build`，随后始终用 `./dist/opendesk ...` 运行。macOS 的
   授权与该可执行文件/应用身份关联；不要在 `go run`、不同副本或频繁变更路径之间混用。
2. 打开 **System Settings → Privacy & Security → Accessibility**，开启 `opendesk`（或列表中
   与 `./dist/opendesk` 对应的宿主）。未出现时用列表底部的 `+` 选择该可执行文件；修改后
   退出并重新启动 OpenDesk。
3. 也在 **Input Monitoring** 为同一宿主开启权限，然后重启 OpenDesk。当前 backend 为支持
   `F21`–`F24` 会使用系统 HID 监听；不同 macOS 版本可能在 listener 启动或特定键盘上要求
   此授权。macOS 10.15+ 的 `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` 可返回该进程的
   `granted` / `denied` / `unknown` 状态；OpenDesk 仅把 `granted` 视为通过。

不需要为普通 `globalShortcut` 注册授予 **Screen Recording** 或 **Automation**：前者只供截图
能力使用；后者只在脚本主动通过 AppleEvents 控制其他 App 时需要。维护者的 macOS smoke 会
通过 `System Events` 从另一个进程发出按键，因此它额外可能显示 Automation 提示；这不是普通
用户运行示例所需的权限。

脚本可以复用已有的通用权限 API。把下列调用放在首次配置或用户点击“配置快捷键权限”时；它会
先检查两个权限，全部已授权时不执行请求或打开窗口，缺少权限时只打开对应设置页。同一进程
默认只打开每个设置页一次。不需要增加 `globalShortcut.requestPermission()` 这样的重复 API：

```js
const permissions = await page.requestPermissions({
  section: 'globalShortcut',
  openSettings: true,
  strict: false,
});

if (!permissions.ok) {
  throw new Error('Allow OpenDesk in Accessibility and Input Monitoring, restart it, then run this script again.');
}

globalShortcut.register('CommandOrControl+Shift+9', copyText);
```

`checkPermissions({ capabilities: ['inputMonitoring'] })` 可用于显示该权限状态。只有
`state: 'granted'` / `granted: true` 是授权证明；`denied` 和 `unknown` 都保持 fail-closed。
如果产品提供明确的“重新打开系统设置”按钮，可传 `forceOpenSettings: true`；不要在普通启动
或重试循环中使用该参数。
注册因隐私设置或系统监听资源失败时，
`globalShortcut.register()` 会抛出 `REGISTRATION_FAILED`，其中保留底层原因；不会静默降级为
仅前台快捷键。

仓库还提供单独的首次配置脚本，避免把系统设置页混进正常示例：

```bash
./dist/opendesk -script examples/global-shortcut-permission-setup.js -console-mode script
```

它只为当前缺少的权限打开 Accessibility 或 Input Monitoring，并按需请求 macOS 显示授权提示；
如果两项已授权，则只输出状态而不打开窗口。

## 维护者专用：macOS 非前台真实 smoke

这不是普通用户的示例运行步骤。维护者的 smoke 位于
[tests/runtime-api/global-shortcut-smoke.js](../../tests/runtime-api/global-shortcut-smoke.js)。它会让
TextEdit 成为前台，使用独立的 System Events 进程发送 `CommandOrControl+Shift+9`，验证 callback
写入的剪贴板 token 与 `unregisterAll()` 清理，并把当前 run 的结构化 evidence 写入
`Execution.artifactDir`。从仓库根目录对已审计的可执行文件执行正式 macOS gate：

```bash
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./tests/runtime-api/global-shortcut-smoke-darwin.sh
```
