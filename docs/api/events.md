---
title: Desktop Events API
description: Subscribe to external window, application, clipboard, and display state changes from JavaScript.
order: 13
---

# Events

`Events` 是 JavaScript Runtime 的 **Experimental** 外部桌面状态 watcher。当前 backend 是明确标注的 polling fallback，不会伪装成 native notification。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Events.on(type, callback)` | 持续订阅桌面事件。 |
| `Events.once(type, options?)` | 等待下一次指定事件。 |
| `Events.getCapabilities()` | 查询各事件类型的支持、backend 与轮询能力。 |

## 公共约定

### 事件类型

| 事件 | 数据 | 当前 backend |
| --- | --- | --- |
| `window.focused` | `data.window` | polling window facade |
| `window.created` | `data.window` | polling window facade |
| `window.closed` | `data.window` | polling window facade |
| `window.moved` | `data.window`, `data.previousBounds` | polling window facade |
| `window.resized` | `data.window`, `data.previousBounds` | polling window facade |
| `app.launched` | `data.app` | app/process snapshot |
| `app.terminated` | `data.app` | app/process snapshot |
| `clipboard.changed` | revision / `changeCount`，不含正文 | clipboard backend |
| `display.changed` | `data.displays` | polling `Screen.getDisplays()` |

声音模式监听不属于本 API；使用 [`Audio.watchSound()` / `Audio.waitForSound()`](audio.md)。

### Event schema

```ts
interface OpenDeskDesktopEvent {
  schemaVersion: 1;
  type: string;
  backend: string;
  timestamp: string;
  sequence: number;
  coalesced: number;
  data: object;
}
```

同类型事件在 callback 尚未完成或 EventLoop 未消费时保留最新值并增加 `coalesced`，不建立无界队列。单 subscription callback 保持 single-flight。

### 生命周期

subscription 属于当前 execution；正常结束、异常、timeout、取消和 Runtime teardown 都会关闭 backend handle。`Events.on()` 会让 execution 保持活动，直到 unsubscribe、取消或 execution timeout。

## `Events.on(type, callback)`

持续订阅一个支持的桌面事件类型。

**签名**
```ts
Events.on(type: string, callback: (event: OpenDeskDesktopEvent) => unknown): OpenDeskEventSubscription;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `string` | 是 | 无 | 支持的事件类型。 |
| `callback` | `Function` | 是 | 无 | 事件回调。 |

**返回值**

`OpenDeskEventSubscription`，提供幂等 `unsubscribe()`。

**行为与错误**

未知类型抛 `INVALID_EVENT`；无效 callback 抛 `INVALID_ARGUMENT`；平台不支持抛 `NOT_SUPPORTED`；backend 失败抛 `BACKEND_FAILED`。callback throw/reject 以 `CALLBACK_FAILED` 进入 execution async-error 路径。

**示例**
```js
const subscription = Events.on('window.focused', event => {
  console.log(event.data.window.pid);
});
subscription.unsubscribe();
```

## `Events.once(type, options?)`

等待下一次指定事件并自动结束订阅。

**签名**
```ts
Events.once(type: string, options?: { timeout?: number }): Promise<OpenDeskDesktopEvent>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `string` | 是 | 无 | 要等待的事件类型。 |
| `options.timeout` | `number` | 否 | `30000` ms | 最长等待；最大 10 分钟。 |

**返回值**

`Promise<OpenDeskDesktopEvent>`。

**行为与错误**

超时抛 `TIMEOUT`；未知事件、平台不支持或 backend 失败使用与 `on()` 相同的结构化错误。

**示例**
```js
const changed = await Events.once('clipboard.changed', { timeout: 5000 });
console.log(changed.data.changeCount);
```

## `Events.getCapabilities()`

返回桌面事件 watcher 的机器可读能力摘要。

**签名**
```ts
Events.getCapabilities(): OpenDeskEventsCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskEventsCapabilities`，包含每种事件的 `supported`、`backend`、`platform` 和 interval 信息。

**行为与错误**

只读取 capability，不创建 subscription，也不访问剪贴板正文。

**示例**
```js
console.log(Events.getCapabilities());
```

## 错误

稳定错误 code 包括 `INVALID_EVENT`、`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`BACKEND_FAILED`、`CALLBACK_FAILED`、`TIMEOUT`。

## 平台与能力

当前实现明确报告 polling backend。窗口事件依赖现有 window facade；无法可靠枚举窗口时不会把不完整数据伪装成完整 native watcher。当前没有 MCP/HTTP event surface。
