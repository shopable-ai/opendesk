---
title: Desktop Events API
description: Subscribe to external window, application, clipboard, and display state changes from JavaScript.
order: 13
---

# Desktop Events API

`Events` 是 JavaScript Runtime 中的实验性外部桌面状态 watcher。它与执行日志、Scheduler、
Custom UI 事件和 `globalShortcut` 是不同的能力：

- `Events`：桌面状态变化；
- Scheduler：时间触发；
- execution events：OpenDesk 自己的执行日志；
- Custom UI events：OpenDesk 创建的窗口控件事件；
- `globalShortcut`：用户明确按下已注册快捷键。

当前 backend 是明确标注的 `polling` fallback，不会伪装成 native notification。订阅前可用
`Events.getCapabilities()` 检查当前平台支持情况和轮询间隔。

固定声音模式监听不属于本 API。声音 reference、source、threshold 和 cooldown 都是参数化的持续
native 资源，应使用 [Audio API](audio.md) 的 `Audio.watchSound()` / `Audio.waitForSound()`。
它们会投递形状相似但独立的 `audio.pattern.matched` match envelope；该类型不能传给
`Events.on()` / `Events.once()`，也不会与桌面 polling 事件一起 coalesce。

## API

```js
const subscription = Events.on('window.focused', async event => {
  console.log(event.type, event.backend, event.data.window.pid);
});

subscription.unsubscribe();

const changed = await Events.once('clipboard.changed', { timeout: 5000 });
console.log(changed.data.changeCount);
```

方法：

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `Events.on(type, callback)` | subscription | 持续订阅；`unsubscribe()` 幂等 |
| `Events.once(type, options?)` | `Promise<Event>` | 等待一个事件；默认 30 秒，最长 10 分钟 |
| `Events.getCapabilities()` | capability object | 返回每种事件的 supported/backend/platform/interval |

## 事件类型

| 事件 | 当前数据 | 当前 backend |
| --- | --- | --- |
| `window.focused` | `data.window` | polling existing `window` facade |
| `window.created` / `window.closed` | `data.window` | polling existing `window` facade |
| `window.moved` / `window.resized` | `data.window`, `data.previousBounds` | polling existing `window` facade |
| `app.launched` / `app.terminated` | `data.app` | macOS NSWorkspace snapshot；其他平台 process snapshot |
| `clipboard.changed` | `changeCount` 或 revision-change marker；不含内容 | macOS NSPasteboard changeCount；其他平台文本 revision |
| `display.changed` | `data.displays` | polling `Screen.getDisplays()` metadata |

macOS 的 window watcher 复用当前窗口 facade，因此可能需要 Accessibility / Automation 权限，且
无权限、JXA 超时或无法识别窗口时会 fail closed 为 `BACKEND_FAILED`，不会静默改成坐标或 OCR。

## Event schema

```json
{
  "schemaVersion": 1,
  "type": "clipboard.changed",
  "backend": "polling",
  "timestamp": "2026-09-02T02:30:00Z",
  "sequence": 1,
  "coalesced": 0,
  "data": {
    "changeCount": 42,
    "contentIncluded": false
  }
}
```

同类型事件在 callback 尚未完成或 owner EventLoop 尚未消费时会保留最新值并增加
`coalesced`，不会建立无界队列。单个 subscription 的 callback 保持 single-flight；callback
返回 Promise 时，下一次 delivery 会等待它 settle。

## 生命周期与错误

- subscription 属于当前 execution；正常结束、异常、超时或取消都会关闭 backend handle；
- `Events.once()` 超时以 `TIMEOUT` reject；
- 未知事件为 `INVALID_EVENT`；无效 callback/options 为 `INVALID_ARGUMENT`；
- 当前平台不支持为 `NOT_SUPPORTED`；backend 失败为 `BACKEND_FAILED`；
- callback throw/reject 为 `CALLBACK_FAILED`，进入现有 execution async-error 路径；
- `Events.on()` 会让 execution 保持活动，直到 unsubscribe、取消或 execution timeout。

## 可复制 smoke

工作目录必须是仓库根目录。该脚本暂时写入一个 marker、等待真实 macOS
`NSPasteboard.changeCount` 变化、恢复先前文本，并把不含剪贴板内容的 evidence 写入 `.runtime/`：

```bash
go run ./cmd/opendesk -script examples/events/clipboard-changed.js -console-mode script
```

输出路径：

```text
.runtime/tests/platform-primitives/task-003-events/clipboard-changed.json
```

## 当前限制

- API 状态为 Experimental；当前没有把 polling 描述为 native watcher。
- 窗口列表在无法获得完整 macOS AX/JXA 枚举时可能只有 active-window fallback；此时
  created/closed/moved/resized 的覆盖不完整。
- polling 会合并短时间内的同类型变化；需要每一个底层通知的审计场景不应使用当前版本。
- 本轮没有增加 MCP 或 HTTP surface；脚本 Runtime 是当前唯一公共入口。
- 本 API 没有复制、重命名或修改 `globalShortcut`。
