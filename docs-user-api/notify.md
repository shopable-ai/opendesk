---
title: notify
description: OpenDesk JavaScript Runtime 的系统通知契约、平台边界与验证方式。
order: 5
---

# notify：系统通知

`notify()` 是 OpenDesk 提供的全局系统通知函数，适合报告脚本阶段完成、需要人工留意的提示。它是 **Secondary** 能力：通知显示不是业务成功、状态持久化或执行证据的替代品。

## notify：快速用法

```js
notify('任务完成');

notify({
  title: 'OpenDesk',
  message: '自动化已经完成',
  sound: false,
});
```

这是同步函数，不需要 `await`。成功时返回 `undefined`。

## notify：调用契约

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

`notify()`、`notify(null)`、数组以及其他非字符串/对象参数会同步抛出
`TypeError`。通知后端无法提交时会抛出包含 `notification failed` 的 `Error`。

### notify：结果与错误

- 成功提交到平台通知后端：返回 `undefined`。
- 参数类型不正确：同步抛出 `TypeError`。
- `osascript`、D-Bus、Windows toast 或其他平台通知后端不可用：同步抛出 `Error`。
- 返回成功只代表宿主已接受该请求，不代表用户已经看到通知。

## notify：平台与权限边界

- **macOS**：如果 Runtime 运行在 `OpenDesk.app` 内，会通过 AppKit 的 macOS 12 兼容本地通知后端提交，发送者是 OpenDesk bundle；独立 CLI（包括没有 `.app` 身份的 Scheduler 进程）使用 Apple 提供的 `osascript display notification` fallback。`sound: true` 使用对应后端的默认系统音效；没有可由脚本指定的显示时长。
- **Linux**：依赖 `beeep` 的桌面通知后端（通常是 D-Bus，必要时使用可用的命令行后端）。音效能力取决于后端；不是所有桌面环境都支持一致的声音行为。
- **Windows**：依赖 `beeep` 的 Windows toast/系统后端；显示时长和声音由 Windows 通知设置与后端决定。

通知不需要 `page.ensurePermissions()` 的屏幕截图或辅助功能权限。但操作系统的通知权限、应用通知开关、Focus/勿扰模式、屏幕共享/镜像的静默策略、静音设置以及桌面会话状态都可能使通知不显示或不发声。backend 的成功返回只证明宿主已把请求交给 OS；它不能作肉眼可见性证明，也不会绕过系统策略。

如果通知是工作流的一部分，请同时写入结构化日志、状态文件或其他可检查的执行证据；如果需要确认用户确实看到了提示，应另行做桌面截图或人工观察验证。

## notify：实现来源

用户调用链是：

```text
notify() polyfill -> notify____Inject -> automation.Notify -> macOS AppKit / osascript fallback (or beeep on other platforms)
```

CLI、HTTP 执行以及其他复用 JavaScript Execution 的入口都经过同一 Runtime 初始化链。`notify____Inject` 是宿主内部 bridge，不是用户脚本的稳定接口。
