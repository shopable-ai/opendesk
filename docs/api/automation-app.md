---
title: automation.app API
description: 当前 App Mode 应用的 Shell action、菜单状态、退出与 capability introspection API。
order: 210
---

# automation.app

`automation.app` 是**当前 App Mode execution 与自己的 App Shell 交互**的 JavaScript API。

它只有在 `opendesk -app <package-dir>` 启动的应用上下文中具有完整能力。普通 `-script`、`-script-text`、HTTP、MCP、Scheduler 等 execution 可以查询 `getCapabilities()`，但不能使用 App Mode 专属的 action、菜单 mutation 和 quit 能力。

先读 [App Mode 与 App Shell](app-shell.md) 可以快速理解 `-app`、Manifest、App Shell、`automation.app` 与大写 `App` 的关系。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `automation.app.onAction(handler)` | 接收当前 App Shell 分发的 Tray/Menu、activation 与 second-instance action。 |
| `automation.app.updateMenuItem(id, patch)` | 更新 Manifest 中一个已经存在的菜单项显示状态。 |
| `automation.app.quit()` | 请求当前 App Mode 应用沿统一 Execution 生命周期退出。 |
| `automation.app.getCapabilities()` | 可选的 execution-context / capability 探测；主要用于共享代码和兼容性判断。 |

## 公共约定

### 主业务链路

`automation.app` 的主业务关系是：

```text
App Shell action
      |
      v
automation.app.onAction(handler)
      |
      +--> ordinary OpenDesk business APIs
      |
      +--> automation.app.updateMenuItem(...)
      |
      +--> automation.app.quit()
```

`getCapabilities()` 不在这条 action 主链路里。它是只读探测接口，用于判断当前 execution 是否拥有 App Shell，以及读取当前 package identity 等宿主信息。

### App Mode 与普通 Script Mode

App Mode：

```bash
opendesk -app ./my-app
```

普通脚本：

```bash
opendesk -script task.js
```

两者都可以运行普通 OpenDesk JavaScript，但只有前者由 App Shell 拥有。

在非 App Mode execution 中：

- `getCapabilities()` 返回 disabled / unavailable capability 信息，不触发 App Mode；
- `onAction()`、`updateMenuItem()`、`quit()` 失败并返回/抛出 `APP_MODE_DISABLED`。

### Action id 与 menu item id

Manifest 中：

```json
{
  "id": "sync.menu",
  "label": "Sync now",
  "action": "sync.now"
}
```

这里有两个不同 identity：

- `id`：Native menu item 的稳定定位键，传给 `updateMenuItem(id, patch)`；
- `action`：业务 action，点击后作为 `event.id` 传给 `onAction(handler)`。

多个菜单项可以复用同一个业务 `action`，但可更新的 menu item `id` 必须稳定且唯一。

## automation.app.onAction(handler)

在当前 App Mode JavaScript Runtime 中订阅 App Shell action。

**签名**

```ts
automation.app.onAction(
  handler: (event: OpenDeskAppActionEvent) => void | Promise<void>,
): () => void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `handler` | `(event) => void \| Promise<void>` | 是 | 无 | 当前 Runtime 的 action handler。 |

当前 `event` 至少包含：

```ts
interface OpenDeskAppActionEvent {
  id: string;
  source: string;
}
```

当前 source 包括 `tray-primary`、`tray-menu`、`second-instance` 与 `app-activation`。

**返回值**

同步返回一个幂等 unsubscribe 函数。调用后不再向该 handler 分发后续 action。

**行为与错误**

- Handler 按注册顺序进入当前 Execution 的事件循环；不会为一个 Tray/Menu action 创建新的 Runtime。
- Handler 返回 Promise 时 Runtime 会观察 rejection；同步抛错或 Promise rejection 进入当前 execution 的异步错误处理。
- shutdown 开始后拒绝新的 listener，尚未进入 Runtime 的待分发 action 会停止继续进入业务代码。
- 非函数参数抛 `INVALID_ARGUMENT`。
- 非 App Mode execution 抛 `APP_MODE_DISABLED`。
- 应用已进入退出阶段时抛 `APP_QUITTING`。

**示例**

```js
const unsubscribe = automation.app.onAction(async event => {
  if (event.id === 'sync.now') {
    await automation.app.updateMenuItem('sync.menu', {
      label: 'Syncing…',
      enabled: false,
    });

    // 继续调用普通 OpenDesk API 完成业务任务。
  }
});
```

## automation.app.updateMenuItem(id, patch)

更新 Manifest 中一个已经存在的业务菜单项。

**签名**

```ts
automation.app.updateMenuItem(
  id: string,
  patch: OpenDeskAppMenuItemPatch,
): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 是 | 无 | Manifest menu item 的稳定 `id`；不是业务 `action`。 |
| `patch` | `OpenDeskAppMenuItemPatch` | 是 | 无 | `label`、`enabled`、`visible` 中至少提供一个字段。 |

`patch`：

```ts
interface OpenDeskAppMenuItemPatch {
  label?: string;
  enabled?: boolean;
  visible?: boolean;
}
```

**返回值**

Native menu mutation 完成后 resolve `undefined` 的 Promise。

**行为与错误**

- 只更新 Manifest 已声明的既有 menu item；P0 不通过这个 API 创建、删除或重排菜单结构。
- 空 patch、未知字段、无效类型或非法 label 返回参数错误。
- 未知 `id`、Shell backend 更新失败或应用正在退出时拒绝更新。
- 没有 action 的 status-only item 必须由 Manifest 明确为不可交互状态，不能通过 Runtime mutation 把它变成新的业务入口。
- 非 App Mode execution 返回/抛出 `APP_MODE_DISABLED`。

**示例**

```js
await automation.app.updateMenuItem('sync.menu', {
  label: 'Syncing…',
  enabled: false,
});
```

## automation.app.quit()

请求当前 App Mode 应用正常退出。

**签名**

```ts
automation.app.quit(): Promise<void>;
```

**参数**

无。

**返回值**

退出请求交给当前 App Mode 生命周期后 resolve `undefined`。随后当前 execution 进入统一 shutdown / cleanup。

**行为与错误**

- quit 请求是幂等的；它不启动另一个进程来“关闭当前应用”。
- 退出开始后不应再注册 action handler、更新菜单或启动新的业务工作。
- App Shell、Custom UI、Tray/Menu、single-instance lease 和当前 Execution 沿统一生命周期释放；平台具体 teardown 顺序属于架构实现，不在 API Reference 展开。
- 非 App Mode execution 返回/抛出 `APP_MODE_DISABLED`。

**示例**

```js
automation.app.onAction(event => {
  if (event.id === 'session.finish') {
    return automation.app.quit();
  }
});
```

## automation.app.getCapabilities()

返回当前 execution 的 App Shell capability 与 package identity。

这个接口是**可选只读探测**，不是 App Mode 的启动函数，也不是调用其他 `automation.app` 方法前必须重复执行的 handshake。

典型用途是共享代码：同一个模块既可能由 `-app` 加载，也可能被普通 `-script`、Scheduler 或其他 execution 复用，此时可以显式判断当前上下文。

**签名**

```ts
automation.app.getCapabilities(): OpenDeskAppShellCapabilities;
```

**参数**

无。

**返回值**

App Mode 中返回当前 App Shell / package 信息，当前契约包括：

```js
{
  enabled: true,
  available: true,
  packageId: 'com.example.my-app',
  mainWindowId: 'main',
  closeBehavior: 'hide'
}
```

非 App Mode execution 返回 disabled / unavailable capability 信息，例如：

```js
{
  enabled: false,
  available: false,
  reason: 'APP_MODE_DISABLED'
}
```

调用方应以 `enabled` / `available` 作为能力判断，不要通过 package path、process title 或其他实现细节猜测当前 execution 类型。

**行为与错误**

同步、只读；不创建 Tray、Window、第二个 Execution，不读取附近目录来“自动进入” App Mode，也不触发系统权限请求。

**示例**

```js
const caps = automation.app.getCapabilities();

if (caps.enabled) {
  console.log('App Mode package:', caps.packageId);
}
```

对于确定只会作为 App Mode `main.js` 运行的业务代码，通常可以直接注册 `onAction()`；不需要把 `getCapabilities()` 当成每个业务动作的前置步骤。

## 错误

| 错误 | 含义 |
| --- | --- |
| `APP_MODE_DISABLED` | 当前 execution 不是 App Mode，不能使用 Shell mutation / lifecycle API。 |
| `APP_QUITTING` | 当前 App Mode 已进入退出阶段，不再接受新的 Shell 工作。 |
| `INVALID_ARGUMENT` | handler、menu id 或 patch 等参数不合法。 |
| `APP_SHELL_ERROR` | App Shell / native backend 无法完成请求。 |

具体错误字段以 Runtime 返回的结构化错误为准。

## 相关文档

- [App Mode 与 App Shell](app-shell.md)：从 `-app` 入口理解完整运行关系。
- [Script App Packaging](script-app-packaging.md)：普通 App 开发者从 package 到可运行/可发布应用的主线。
- [App API](app.md)：操作 Calculator、Browser 等外部桌面应用；不要与 `automation.app` 混淆。
- [App Package CLI](app-package-cli.md)：`validate`、`doctor`、`build` 等 package CLI。
- [App Package Format](../architecture/app-package-format.md)：Manifest schema、版本、兼容性和资源边界。
- [App Shell、Tray / Menu Bar 与 Single-Instance](../architecture/app-shell-tray-menu.md)：平台宿主与生命周期架构。