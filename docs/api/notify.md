---
title: 通知与提示
description: OpenDesk 的轻量 Toast、系统通知与通知查询入口。
order: 150
---

# 通知与提示

OpenDesk 有两种常用的“提示用户”方式，语义不同：

| 需求 | API | 适合场景 |
| --- | --- | --- |
| 在当前 OpenDesk execution 附近显示几秒的成功、失败或进度反馈 | `ui.toast()` | 保存成功、处理中、失败原因、步骤进度 |
| 交给操作系统通知中心，即使用户已经切换到其他窗口也可收到 | `notify()` | 后台任务完成、需要稍后留意 |
| 查询或移除 OpenDesk 自身已经投递的系统通知 | `Notifications.*` | Experimental；见 [Notifications API](notifications.md) |

`ui.toast()` 是 OpenDesk 自己绘制的 execution-owned 原生轻量提示，不是操作系统通知；全局 `notify()` 才会把请求提交给 macOS / Windows / Linux 的系统通知后端。需要用户明确确认或输入时使用 [Dialog API](dialog.md)，不要用 Toast 模拟模态对话框。

## ui.toast()：轻量原生提示

**状态：Conditional / Native**

`ui.toast()` 是当前推荐的瞬时反馈 API。它支持状态级别、自动消失、进度、位置以及运行中更新，返回一个可操作的 `ToastHandle`。

```ts
ui.toast(messageOrOptions: string | ToastOptions): Promise<ToastHandle>
```

最简单的写法：

```js
await ui.toast("保存成功");
```

需要更新状态时保留句柄：

```js
const toast = await ui.toast({
  message: "正在处理…",
  timeoutMs: 0,
  progress: { min: 0, max: 10, value: 0 }
});

await toast.update({
  message: "已完成",
  level: "success",
  progress: { min: 0, max: 10, value: 10 },
  timeoutMs: 1200
});

await toast.waitUntilClosed();
```

### ToastOptions

字符串参数等价于只提供 `message`。对象形式支持：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `message` | string | 是 | 无 | 主文本，1–1024 个 Unicode 字符。 |
| `caption` | string | 否 | `""` | 补充文字，最多 2048 个 Unicode 字符。 |
| `level` | `info \| success \| warning \| error` | 否 | `info` | 语义级别。 |
| `timeoutMs` | integer | 否 | `3000` | 自动关闭时间，范围 `0..86400000`；`0` 表示持续显示。 |
| `timeoutProgress` | boolean | 否 | `false` | 是否显示超时倒计时进度。 |
| `closable` | boolean | 否 | `false` | 是否显示关闭入口；`timeoutMs: 0` 会强制为 `true`。 |
| `progress` | object / `null` | 否 | 无 | 任务进度；`null` 用于更新时清除进度。 |
| `position` | object | 否 | `{mode:"auto"}` | `auto`、`absolute`、`anchor` 或相对 FloatingWindow 的 `relative`。 |

最多同时存在 3 个 Toast。关闭 Toast 只关闭反馈界面，不取消业务任务；Toast 的显示也不能作为业务成功证据。

### progress

确定进度：

```js
progress: { min: 0, max: 100, value: 35 }
```

不确定进度：

```js
progress: { indeterminate: true }
```

未声明时 `min` 默认 `0`、`max` 默认 `1`、`value` 默认 `min`。确定进度要求 `min < max` 且 `value` 位于闭区间内。

### position

默认让 host 自动选择合适位置：

```js
position: { mode: "auto" }
```

明确屏幕 logical 坐标：

```js
position: { mode: "absolute", x: 1200, y: 80 }
```

停靠显示器工作区：

```js
position: {
  mode: "anchor",
  horizontal: "right",
  vertical: "top",
  margin: 24,
  display: "active"
}
```

相对同一 execution 的 `FloatingWindow`：

```js
position: {
  mode: "relative",
  target: toolbar,
  side: "bottom",
  align: "center",
  gap: 8,
  follow: true
}
```

四种模式不能混用成员。`relative` 只接受当前 execution 中的 FloatingWindow；默认 `side:"bottom"`、`align:"center"`、`gap:8`、`follow:true`。

## ToastHandle

`ui.toast()` 返回：

```ts
interface ToastHandle {
  readonly id: string;
  update(patch: Partial<ToastOptions>): Promise<{applied:boolean; reason?:"closed"; state:WindowState}>;
  close(): Promise<WindowState>;
  getState(): Promise<WindowState>;
  waitUntilClosed(): Promise<WindowState>;
}
```

### toast.update(patch)

更新当前 Toast。`progress` 与 `position` 是完整替换，不做深层合并；`progress:null` 清除任务进度。只有显式提供 `timeoutMs` 才会重新开始超时计时，`timeoutMs:0` 会取消倒计时并保证可关闭。

Toast 已关闭时，合法更新返回 `{applied:false,reason:"closed",state}`，不会重新弹出；非法 patch 仍会明确报错。业务脚本需要顺序时应 `await` 每次更新。

```js
await toast.update({
  message: "第 3 / 12 步",
  progress: { min: 0, max: 12, value: 3 }
});
```

### toast.close()

幂等关闭当前 Toast。与超时或用户关闭发生竞争时返回最终状态；真实 driver 故障仍会明确报错。

```js
await toast.close();
```

### toast.getState()

读取当前 WindowState。通过 `ui.toast()` 返回的句柄会提供首选 `state.toast` 状态视图，并继续保留历史 `state.notification` 兼容字段。

```js
const state = await toast.getState();
console.log(state.toast?.remainingMs);
```

### toast.waitUntilClosed()

显式等待 Toast 被脚本、用户或 timeout 关闭。只有明确观察这个 Promise 才会让该等待参与 execution 生命周期；仅创建一个 Toast 不会让已经结束的业务脚本无限存活。

```js
await toast.waitUntilClosed();
```

## ui.notify()：兼容别名

`ui.notify()` 是 `ui.toast()` 的历史名称。现有脚本继续可用，但新代码和新文档统一使用 `ui.toast()`：

```js
// 兼容旧脚本；新代码不要继续扩散这个名称。
await ui.notify("保存成功");
```

底层 native driver / protocol 仍可以使用 notification 内部术语；这不构成第二套用户 API。

## notify()：系统通知

`notify()` 是 OpenDesk 提供的全局系统通知函数，适合报告脚本阶段完成、需要人工留意的提示。它是 **Secondary** 能力：通知显示不是业务成功、状态持久化或执行证据的替代品。

### 快速用法

```js
notify('任务完成');

notify({
  title: 'OpenDesk',
  message: '自动化已经完成',
  sound: false,
});
```

这是同步函数，不需要 `await`。成功时返回 `undefined`。

### notify(message)：字符串形式

```js
notify(message: string): void;
```

字符串会转换为以下通知请求：

```js
{
  title: message,
  message: '',
  sound: true,
}
```

因此字符串形式会请求平台默认系统音效。

### notify(options)：对象形式

```js
notify(options: OpenDeskNotifyOptions): void;
```

字段如下：

| 字段 | 类型 | 缺省值 | 当前行为 |
| --- | --- | --- | --- |
| `title` | `string` | `OpenDesk Notification` | 通知标题；空字符串也使用缺省标题 |
| `message` | `string` | `''` | 通知正文 |
| `sound` | `boolean` | `false` | `true` 请求平台默认系统音效，`false` 使用静默通知路径 |
| `timeout` | `number` | 无 | 为兼容旧脚本而接受；当前平台后端不支持由脚本控制展示时长，因此不会产生行为 |

`notify()`、`notify(null)`、数组以及其他非字符串/对象参数会同步抛出 `TypeError`。对象字段也按上表严格校验：`title` / `message` 必须是字符串，`sound` 必须是布尔值，`timeout` 必须是有限数字。标题和正文不能包含 NUL，且必须是有效 UTF-8。通知后端无法提交时会抛出包含 `notification failed` 的 `Error`。

### notify：结果与错误

- 成功提交到平台通知后端：返回 `undefined`。
- 参数类型不正确：同步抛出 `TypeError`。
- macOS App 身份/通知权限、D-Bus、Windows toast 或其他平台通知后端不可用：同步抛出 `Error`。
- 返回成功只代表宿主已接受该请求，不代表用户已经看到通知。

## notify：平台与权限边界

- **macOS**：使用 macOS 12 支持的原生 UserNotifications backend。`OpenDesk.app` 内的 Runtime 直接以 OpenDesk bundle 提交；plain CLI 和 Scheduler 通过同一构建产物旁的 `OpenDesk.app` 进入私有、仅通知 helper 模式，因此发送者仍是 OpenDesk，不使用 `osascript` / `com.apple.ScriptEditor2`，也不创建第二套 JavaScript executor。若 plain binary 旁缺少 `scripts/build_macos_app.sh` 生成的 `OpenDesk.app`，`notify()` 会明确抛错。backend 会等待授权结果并检查 alert 权限，再等待系统接受本次 request；拒绝、超时和提交错误都会返回给 JavaScript。`sound: true` 会为 request 设置平台默认系统音效，但系统静音、Focus、共享显示和用户的声音设置仍可抑制实际声音。没有可由脚本指定的显示时长。
- **Linux**：依赖 `beeep` 的桌面通知后端（通常是 D-Bus，必要时使用可用的命令行后端）。从源码目录运行时会复用 `public/icons/opendesk-notification.png`；找不到图标不会阻止通知提交。音效能力取决于后端；不是所有桌面环境都支持一致的声音行为。
- **Windows**：依赖 `beeep` 的 Windows toast/系统后端。安装包应把通知图标放在可执行文件旁的 `resources/opendesk-notification.png`；源码运行会回退到 `public/icons/opendesk-notification.png`。找不到图标时仍提交无自定义图片的通知；显示时长和声音由 Windows 通知设置与后端决定。

通知不需要 `page.ensurePermissions()` 的屏幕截图或辅助功能权限。但操作系统的通知权限、应用通知开关、Focus/勿扰模式、屏幕共享/镜像的静默策略、静音设置以及桌面会话状态都可能使通知不显示或不发声。backend 的成功返回只证明宿主已把请求交给 OS；它不能作肉眼可见性证明，也不会绕过系统策略。

首次由 `OpenDesk.app` 提交本地通知时，macOS 可能先显示系统管理的授权提示，例如：

```text
“OpenDesk”通知
“通知”可能包括提醒、声音和图标标记。
```

这不是脚本传入的 `title` 或 `message`，而是 macOS 对通知能力的说明；其含义是该应用的通知可能包含提醒、声音和图标标记，文案由系统本地化控制。用户需要按系统提示允许通知，OpenDesk 不能通过 `notify()` 修改这段文字或绕过系统的静默策略。

如果通知是工作流的一部分，请同时写入结构化日志、状态文件或其他可检查的执行证据；如果需要确认用户确实看到了提示，应另行做桌面截图或人工观察验证。

## Notifications：已投递系统通知（Experimental）

需要观察、等待或移除 OpenDesk 自身已经投递到系统通知中心的通知时，使用受限的 [Notifications API](notifications.md)：

```js
await Notifications.list();
await Notifications.waitFor({ title: "OpenDesk", timeout: 10000 });
await Notifications.dismiss(notification.id);
```

`Notifications` 当前不是另一套发送 API，也不会读取任意应用通知。发送系统通知仍使用短的全局 `notify()`。

## 实现来源

系统通知调用链：

```text
notify() polyfill -> notify____Inject -> automation.Notify -> platform notification backend
```

Toast 的公开 `ui.toast()` 由 Runtime facade 复用现有 Custom UI native notification backend；`ui.notify()` 只作为兼容别名保留。底层内部名称不是用户脚本的稳定 API。
