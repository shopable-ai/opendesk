---
title: Custom UI
description: 使用 ui、FloatingWindow 与受限 HTML/CSS 创建 OpenDesk 自己的桌面界面。
order: 130
docType: reference
---

# Custom UI

`ui`（小写）只创建和管理 **OpenDesk 自己的 UI surface**。它与用于操作外部桌面应用的大写 [UI](desktop-ui.md) 是两套不同的 API，JavaScript 大小写敏感。

选择入口：

| 需求 | 推荐 API |
| --- | --- |
| 瞬时成功/失败/进度反馈 | `ui.toast()` |
| 一次性确认或短文本输入 | [Dialog](dialog.md) |
| 紧凑、原生、图标/状态工具栏 | `new FloatingWindow()` |
| 表单、受限 HTML/CSS、动态控件树 | `ui.createWindow()` |
| 操作系统通知中心 | 全局 [notify()](notify.md) |
| 外部桌面应用 OCR/图像/点击 | 大写 [UI](desktop-ui.md) |

`ui.toast()` 是当前 canonical 的 OpenDesk-owned transient feedback API；历史 `ui.notify()` 仅保留为兼容别名。不要把两者与全局 `notify()` 系统通知混为一谈。

## 平台、授权与运行模式

`ui` 全局始终存在，但默认 dormant。CLI 可用 `-ui` 显式授权当前 execution，也可以由严格项目配置声明：

```json
{
  "schemaVersion": 1,
  "runtime": {
    "capabilities": ["ui"]
  }
}
```

从仓库根目录的典型开发命令：

```bash
./opendesk -ui -script examples/custom-ui/panel.js -console-mode script
```

授权优先级：

1. `-no-ui`
2. `-ui`
3. `-config <path>`
4. 脚本目录中的 `opendesk.runtime.json`（旧项目缺失时兼容回退 `clawdesk.runtime.json`）
5. 默认禁用

HTTP UI 还要求 server 已启用 UI、单次请求声明 `"capabilities":["ui"]` 且 socket 来自 loopback；详见 [HTTP Server API](http-server.md)。

平台边界：

- macOS：AppKit；受限 HTML surface 使用 WKWebView。
- Windows：FloatingWindow 与 `ui.toast()` 使用 native WinForms/Win32 host，不要求 WebView2；`ui.createWindow()` 与 Dialog 的 HTML surface 需要 WebView2 Runtime。
- Linux：当前 `available:false`，创建 UI 明确失败，不静默成功。

`ui.notify()` 兼容别名复用与 `ui.toast()` 相同的 native backend，不形成第二套 UI implementation。

共享 `enabled / supported / available / reason` 语义见 [Capability 状态模型](capabilities.md)。

## API 一览

**ui**

| 方法 | 用途 |
| --- | --- |
| `ui.toast(messageOrOptions)` | 推荐的 transient feedback；返回可更新 `ToastHandle`。 |
| `ui.getCapabilities()` | 读取当前 execution 的 UI 授权、平台和 driver 能力。 |
| `ui.createWindow(spec)` | 创建受限 HTML/CSS `WindowHandle`。 |
| `ui.closeAll()` | 幂等关闭当前 execution 的所有 Custom UI 窗口。 |
| `ui.on(type, listener)` | 监听当前 execution 的 Custom UI 事件。 |
| `ui.notify(messageOrOptions)` | Deprecated/Compatibility：`ui.toast()` 的历史名称。 |

**WindowHandle**

| 方法 | 用途 |
| --- | --- |
| `controls()` | 返回稳定公开控件顺序。 |
| `show()` / `hide()` / `close()` | 显示、隐藏或终止窗口。 |
| `getState()` | 读取实际 `WindowState`。 |
| `setBounds()` / `setPosition()` / `setPlacement()` / `setRelativeTo()` / `setSize()` | 调整窗口 frame。 |
| `setAlwaysOnTop()` / `setDraggable()` | 更新 native 窗口行为。 |
| `waitUntilClosed()` | 显式等待窗口关闭。 |
| `control(id)` | 获取 `ControlHandle`。 |
| `on(type, listener)` | 监听本窗口事件。 |

**ControlHandle**

| 方法 | 用途 |
| --- | --- |
| `getState()` | 读取控件状态。 |
| `update(patch)` | 更新允许的非结构字段。 |
| `on(type, listener)` | 监听控件事件。 |

**FloatingWindow**

`FloatingWindow` 是同一 Custom UI driver 上的 typed native toolbar。公开方法以本页各自 H2 为准；完整 TypeScript shape 还可参照 `types/FloatingWindow.d.ts`。

## 公共状态与事件

`WindowState` 主要包含：

```ts
interface WindowState {
  id: string;
  sessionId: string;
  status: 'creating' | 'hidden' | 'visible' | 'closing' | 'closed' | 'failed';
  visible: boolean;
  bounds: {x:number; y:number; width:number; height:number};
  alwaysOnTop: boolean;
  draggable: boolean;
  revision: number;
  lastSequence: number;
  hostPid?: number;
  nativeWindowId?: number;
  onScreen: boolean;
  layer: number;
  alpha: number;
  toast?: ToastState;
  /** compatibility */
  notification?: ToastState;
}
```

公开事件为 `click`、`change`、`input`、`move`、`resize`、`key`、`interactionOutside`、`close`。事件带 `sessionId`、`windowId`、可选 `targetId`、`type`、单调 `sequence`、`timestamp` 以及相应的 `value` / `checked` / `bounds` / `reason`；`key` 的 `fields` 带按键及修饰键事实。

事件队列有界；仅高频 `input` / `move` / `resize` 可以在不越过 click/change/close 屏障时合并。溢出以 `UI_EVENT_QUEUE_OVERFLOW` 失败，不伪装成完整事件历史。

## ui.toast(messageOrOptions)

显示 execution-owned 原生 transient feedback。它不是操作系统通知。

**签名**

```ts
ui.toast(messageOrOptions: string | ToastOptions): Promise<ToastHandle>
```

**参数**

字符串等价于只提供 `message`。对象字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `message` | string | 是 | 无 | 1–1024 个 Unicode 字符，不能全空白或包含 NUL。 |
| `caption` | string | 否 | `""` | 次要说明，最多 2048 字符。 |
| `level` | `info \| success \| warning \| error` | 否 | `info` | 语义级别。 |
| `timeoutMs` | integer | 否 | `3000` | `0..86400000`；0 表示持续显示并保证可关闭。 |
| `timeoutProgress` | boolean | 否 | `false` | 显示剩余展示时间，不代表业务进度。 |
| `closable` | boolean | 否 | `false` | 是否显示关闭入口；`timeoutMs:0` 会规范化为 true。 |
| `progress` | object / `null` | 否 | 无 | `{min,max,value}` 或 `{indeterminate:true}`；`null` 用于更新时清除。 |
| `position` | object | 否 | `{mode:"auto"}` | `auto`、`absolute`、`anchor` 或同 execution FloatingWindow 的 `relative`。 |

**返回值**

`Promise<ToastHandle>`。创建成功不代表用户已经阅读。`getState().toast` 是首选状态视图；历史 `getState().notification` 仅用于兼容旧代码。

**行为与错误**

- 沿用当前 execution 的 UI capability；未授权抛 `UI_DISABLED`。
- 不激活应用、不抢键盘焦点，也不代表业务成功。
- 每个 execution 最多同时存在 3 个 Toast；长任务应更新同一个句柄。
- Toast 本身不独立延长已经完成的业务脚本；需要等待展示结束时显式 `await toast.waitUntilClosed()`。
- 关闭 Toast 不取消业务任务。
- `relative` target 必须属于同一 execution；非法字段、位置和进度返回 `INVALID_SPEC`。

**示例**

```js
const toast = await ui.toast({
  message: '正在处理…',
  timeoutMs: 0,
  closable: true,
  progress: { min: 0, max: 10, value: 2 }
});

await toast.update({
  message: '已完成',
  level: 'success',
  progress: { min: 0, max: 10, value: 10 },
  timeoutMs: 1200
});

await toast.waitUntilClosed();
```

## ToastHandle.update(patch)

原位更新 Toast，不创建第二个提示。

**签名**

```ts
toast.update(patch: Partial<ToastOptions>): Promise<{
  applied: boolean;
  reason?: 'closed';
  state: WindowState;
}>
```

**参数**

`patch` 至少包含一个受支持字段。`progress` 与 `position` 完整替换，不深层 merge；`progress:null` 清除进度。只有显式更新 `timeoutMs` 才重新计时。

**返回值**

成功为 `{applied:true,state}`；已经关闭时合法更新返回 `{applied:false,reason:'closed',state}`。

**行为与错误**

非法 patch 仍明确失败；所有 mutation 在句柄内串行。业务依赖顺序时应 `await` 每次更新。

**示例**

```js
await toast.update({ message: '第 3 / 12 步', progress: {min:0, max:12, value:3} });
```

## ToastHandle.close()

幂等关闭 Toast，不取消业务任务。

**签名**

```ts
toast.close(): Promise<WindowState>
```

**参数**

无。

**返回值**

关闭后的 `WindowState`。

**行为与错误**

与 timeout/用户关闭竞争时返回最终状态；真实 driver 故障仍明确报错。

**示例**

```js
await toast.close();
```

## ToastHandle.getState()

读取当前 Toast 与 native 窗口状态。

**签名**

```ts
toast.getState(): Promise<WindowState>
```

**参数**

无。

**返回值**

`WindowState`；首选读取 `state.toast`。`state.notification` 是 deprecated compatibility view。

**行为与错误**

可见状态只能证明 host 当前 surface 状态，不能证明用户已阅读。

**示例**

```js
console.log((await toast.getState()).toast?.remainingMs);
```

## ToastHandle.waitUntilClosed()

显式等待 Toast 被脚本、用户或 timeout 关闭。

**签名**

```ts
toast.waitUntilClosed(): Promise<WindowState>
```

**参数**

无。

**返回值**

关闭终态；execution 被取消时拒绝并清理资源。

**行为与错误**

只有明确观察这个 Promise 才让该等待参与 execution 生命周期；创建 Toast 本身不会让已结束业务无限存活。

**示例**

```js
await toast.waitUntilClosed();
```

## ui.notify(messageOrOptions)

**Compatibility / Deprecated**。这是 `ui.toast()` 的历史名称；Runtime、类型声明与 native backend 都不把它当成第二套发送机制。

**签名**

```ts
ui.notify(messageOrOptions: string | NotificationOptions): Promise<NotificationHandle>
```

`NotificationOptions` / `NotificationHandle` 是 `ToastOptions` / `ToastHandle` 的 deprecated 类型别名。现有脚本继续工作，新代码与新文档统一使用 `ui.toast()`。

系统通知不是这个方法；需要通知中心使用全局 [notify()](notify.md)。

## ui.getCapabilities()

同步读取当前 execution 的 UI 授权和 host 能力，不创建窗口、不打开权限提示。

**签名**

```ts
ui.getCapabilities(): Capabilities
```

**参数**

无。

**返回值**

关键字段：

| 字段 | 说明 |
| --- | --- |
| `enabled` | 当前 execution 是否获得 UI capability。 |
| `available` | 当前平台/host 是否已知可用。 |
| `activationSource` | `disabled` / `cli` / `projectConfig` / `httpRequest`。 |
| `platform` / `driver` | 当前平台与 native driver。 |
| `window` | position/size/lifecycle/`toast` 等窗口能力；迁移期仍可能包含内部 `notify` 兼容位。 |
| `controls` | `ui.createWindow()` HTML surface 的公开控件类型。 |
| `reason` | 不可用时的可选原因。 |

共享字段语义见 [Capability 状态模型](capabilities.md)。

**行为与错误**

这是诊断读取，不是调用 `ui.toast()` / `ui.createWindow()` 前的强制握手。

**示例**

```js
console.log(ui.getCapabilities());
```

## ui.createWindow(spec)

创建隐藏的受限 HTML/CSS 窗口，返回 `WindowHandle`。业务 JavaScript 仍在外层 Runtime listener 中运行，HTML 不能直接取得 `mouse`、`File`、`http` 等全局能力。

**签名**

```ts
ui.createWindow(spec: WindowSpec): Promise<WindowHandle>
```

**参数**

核心字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填；同 execution 唯一。已关闭 id 也不复用。 |
| `kind` | `normal \| floating` | 默认 `normal`。 |
| `title` | string | native window title。 |
| `position` | discriminated union | 推荐：absolute `{mode:'absolute',bounds}` 或 anchor `{mode:'anchor',size,horizontal,vertical,margin?,display?}`。 |
| `bounds` | bounds | 已发布的 absolute compatibility 写法；新代码优先 `position`。 |
| `alwaysOnTop` | boolean | native 置顶。 |
| `draggable` | boolean | 是否允许声明 `data-opendesk-drag` 区域；旧内容中的 `data-clawdesk-drag` 仍作为兼容别名读取。 |
| `keyEvents` | boolean | 仅 normal HTML surface：由固定 bridge 发送 `key` 事件；不会开放 document script。 |
| `interactionGroup` | string | 同一 execution 内相关 surface 的稳定组名；组内切换不产生 `interactionOutside`。 |
| `theme` | `system \| dark` | 默认 `system`。 |
| `content` | object | 受限 HTML/CSS 与本地资源声明。 |

`content`：

| 字段 | 说明 |
| --- | --- |
| `file` | 推荐文件入口；脚本目录内 HTML 路径。 |
| `html` | 受限内联 HTML，或相对 `.html/.htm` 简写。与 `file` 二选一。 |
| `css` | 受限 inline CSS。 |
| `cssFile` | 脚本目录内 CSS 文件。 |
| `basePath` | 本地 `img` 资源根目录。 |

CSS 层叠顺序是 HTML `<style>` → `content.css` → `content.cssFile`。

明确禁止：业务 `<script>`、inline event handler、`autofocus`、远程 URL、`javascript:` / `file:` navigation、CSS `url()` / `@import` / `image-set()`、越出脚本目录的资源路径，以及未支持的 input 类型。

**返回值**

`Promise<WindowHandle>`；创建后默认隐藏，必须显式 `show()`。

**行为与错误**

未知字段、重复 id、非法资源、冲突 position 写法会 fail closed。Windows HTML surface 缺少 WebView2 时抛 `UNSUPPORTED_CAPABILITY`。

**示例**

```js
const panel = await ui.createWindow({
  id: 'statusPanel',
  position: {
    mode: 'anchor',
    size: {width: 420, height: 180},
    horizontal: 'right',
    vertical: 'bottom',
    margin: 16
  },
  content: {
    html: '<main id="main"><button id="run">Run</button><span id="status">Ready</span></main>',
    css: 'main{padding:16px}'
  }
});
await panel.show();
```

## ui.closeAll()

幂等关闭当前 execution 所有 Custom UI surface。

**签名**

```ts
ui.closeAll(): Promise<void>
```

**参数**

无。

**返回值**

`Promise<void>`。

**行为与错误**

只影响当前 execution 拥有的窗口；不会停止业务子进程或其他 execution。

**示例**

```js
await ui.closeAll();
```

## ui.on(type, listener)

监听当前 execution 的全部 Custom UI 事件。

**签名**

```ts
ui.on(type: EventType | '*', listener: (event: UIEvent) => void | Promise<void>): () => void
```

**参数**

`type` 为公开事件或 `*`；`listener` 在当前 EventLoop owner 上执行。

**返回值**

取消订阅函数。

**行为与错误**

未知事件类型失败；listener rejection 进入 Runtime async error 路径，不由 native goroutine 直接调用 Goja。

**示例**

```js
const off = ui.on('close', event => console.log(event.windowId));
off();
```

## WindowHandle.controls()

返回创建时解析出的公开控件稳定顺序。

**签名**

```ts
window.controls(): Array<{id:string; type:string; order:number}>
```

**参数**

无。

**返回值**

控件描述数组。

**行为与错误**

不暴露 `<style>` / `<meta>` / `<option>` 等内部节点。

**示例**

```js
console.log(panel.controls());
```

## WindowHandle.show()

显示 native 窗口。

**签名**

```ts
window.show(): Promise<WindowState>
```

**参数**

无。

**返回值**

可见后的 `WindowState`。

**行为与错误**

Floating kind 不主动抢焦点；只有 host 确认真正 on-screen 后才 resolve。

**示例**

```js
await panel.show();
```

## WindowHandle.hide()

暂时隐藏窗口，可用同一句柄再次 `show()`。

**签名**

```ts
window.hide(): Promise<WindowState>
```

**参数**

无。

**返回值**

隐藏后的状态。

**行为与错误**

`hide()` 不是终止；与 `close()` 语义不同。

**示例**

```js
await panel.hide();
```

## WindowHandle.close()

终止窗口并释放其资源。

**签名**

```ts
window.close(): Promise<WindowState>
```

**参数**

无。

**返回值**

关闭终态。

**行为与错误**

关闭后原 WindowHandle/ControlHandle 不再可用于重新显示或更新；同 execution 的 window id 也不复用。

**示例**

```js
await panel.close();
```

## WindowHandle.getState()

读取当前窗口状态。

**签名**

```ts
window.getState(): Promise<WindowState>
```

**参数**

无。

**返回值**

`WindowState`。

**行为与错误**

返回 host 已确认状态，不把声明值伪装成 native readback。

**示例**

```js
console.log(await panel.getState());
```

## WindowHandle.setBounds(bounds)

同时设置窗口位置和尺寸。

**签名**

```ts
window.setBounds(bounds: {x:number; y:number; width:number; height:number}): Promise<WindowState>
```

**参数**

宽高必须为正，坐标使用 OpenDesk logical desktop coordinate space。

**返回值**

应用后的状态。

**行为与错误**

失败不伪装成成功；混合 DPI 由 native host 做平台映射。

**示例**

```js
await panel.setBounds({x:100, y:100, width:480, height:300});
```

## WindowHandle.setPosition(x, y)

移动窗口而不改变尺寸。

**签名**

```ts
window.setPosition(x: number, y: number): Promise<WindowState>
```

**参数**

`x`、`y` 为有限 logical coordinates。

**返回值**

应用后的状态。

**行为与错误**

一次明确移动，不建立持续 anchor constraint。

**示例**

```js
await panel.setPosition(120, 80);
```

## WindowHandle.setPlacement(placement)

按目标显示器 work area 重新停靠窗口。

**签名**

```ts
window.setPlacement({horizontal, vertical, margin?, display?}): Promise<WindowState>
```

**参数**

`horizontal`: left/center/right；`vertical`: top/center/bottom；`display`: active/current/primary。`current` 只适用于已经创建的窗口。

**返回值**

应用后的状态。

**行为与错误**

Anchor 是一次重新定位动作；用户拖动或显示器拓扑变化不会偷偷自动重锚。

**示例**

```js
await panel.setPlacement({horizontal:'right', vertical:'bottom', margin:16, display:'current'});
```

## WindowHandle.setRelativeTo(anchor, options)

把窗口放在当前控件或其他已核验 surface 的真实 logical bounds 附近。

**签名**

```ts
window.setRelativeTo(anchor: Bounds, options: {preferredSides: Array<'above'|'below'|'left'|'right'>, align?: 'start'|'center'|'end', gap?: number}): Promise<WindowState>
```

**参数**

`anchor` 为正 finite logical desktop bounds。`preferredSides` 按优先级列出 1–4 个不重复方向；`align` 默认为 `center`；`gap` 默认为 `0`。

**返回值**

应用后的 host readback `WindowState`。

**行为与错误**

native host 从 anchor 选择显示器 work area，按优先方向放置；没有一侧完整容纳时会在首选方向内夹紧，绝不把窗口放到 work area 外。该操作是一次性定位，后续 anchor 移动需要调用方以新的 bounds 重调。非法 bounds、方向或不能容纳窗口时以 `INVALID_SPEC` 失败。

**示例**

```js
const listBounds = (await toolbar.getButtonState('list')).screenBounds;
await panel.setRelativeTo(listBounds, {preferredSides: ['above', 'below'], align: 'end', gap: 8});
```

## WindowHandle.setSize(width, height)

改变窗口尺寸。

**签名**

```ts
window.setSize(width: number, height: number): Promise<WindowState>
```

**参数**

正有限 number。

**返回值**

应用后的状态。

**行为与错误**

不隐式恢复先前 anchor。

**示例**

```js
await panel.setSize(500, 320);
```

## WindowHandle.setAlwaysOnTop(enabled)

更新 native 置顶状态。

**签名**

```ts
window.setAlwaysOnTop(enabled: boolean): Promise<WindowState>
```

**参数**

`enabled` boolean。

**返回值**

host readback。

**行为与错误**

只影响当前窗口层级。

**示例**

```js
await panel.setAlwaysOnTop(true);
```

## WindowHandle.setDraggable(enabled)

运行时切换声明的 native dragging 行为。

**签名**

```ts
window.setDraggable(enabled: boolean): Promise<WindowState>
```

**参数**

`enabled` boolean。

**返回值**

host readback。

**行为与错误**

HTML 中只有允许的 `data-opendesk-drag` 区域参与拖动；旧内容的 `data-clawdesk-drag` 仅作为兼容别名读取。

**示例**

```js
await panel.setDraggable(false);
```

## WindowHandle.waitUntilClosed()

显式等待窗口终结。

**签名**

```ts
window.waitUntilClosed(): Promise<WindowState>
```

**参数**

无。

**返回值**

关闭终态。

**行为与错误**

参与 execution 生命周期；不要用长 sleep 代替。

**示例**

```js
await panel.waitUntilClosed();
```

## WindowHandle.control(id)

获取一个稳定控件句柄。

**签名**

```ts
window.control(id: string): ControlHandle
```

**参数**

`id` 为公开控件 id。

**返回值**

`ControlHandle`。

**行为与错误**

未知 id 返回 `NOT_FOUND`。

**示例**

```js
const save = panel.control('save');
```

## WindowHandle.on(type, listener)

监听本窗口事件。

**签名**

```ts
window.on(type: EventType | '*', listener: UIEventListener): () => void
```

**参数**

公开事件类型与 listener。

**返回值**

取消订阅函数。

**行为与错误**

只接收本窗口事件。

**示例**

```js
const off = panel.on('move', event => console.log(event.bounds));
```

## ControlHandle.getState()

读取控件的实际状态。

**签名**

```ts
control.getState(): Promise<ControlState>
```

**参数**

无。

**返回值**

包含 id、type、值/checked/active/disabled/busy/error、localBounds/screenBounds 等当前公开状态。

**行为与错误**

关闭窗口后的句柄不可继续使用。

**示例**

```js
console.log(await save.getState());
```

## ControlHandle.update(patch)

更新允许的非结构控件状态。

**签名**

```ts
control.update(patch: ControlPatch): Promise<ControlState>
```

**参数**

按控件类型允许 `text`、内置 `icon`、`active`、`busy`、`error`、`value`、`checked`、`disabled`、`visible`、`classes`、`source`、`options` 的相应子集。

**返回值**

host 已应用的 `ControlState`。

**行为与错误**

空 patch、未知字段或控件类型不支持字段返回 `INVALID_SPEC` / `UNSUPPORTED_CAPABILITY`；不会静默忽略。

**示例**

```js
await save.update({text:'Saving…', disabled:true});
```

## ControlHandle.on(type, listener)

监听当前控件事件。

**签名**

```ts
control.on(type: EventType | '*', listener: UIEventListener): () => void
```

**参数**

事件类型与 listener。

**返回值**

取消订阅函数。

**行为与错误**

只接收该控件关联事件。

**示例**

```js
const off = save.on('click', () => console.log('save'));
```

## new FloatingWindow(options?)

创建 compact typed native toolbar；只有当前 execution 已授权 UI 时可用。

**签名**

```ts
new FloatingWindow(options?: FloatingWindowOptions): FloatingWindow
```

**参数**

核心选项：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `position` | 无 | `{mode:'absolute',x,y}` 或 `{mode:'anchor',horizontal,vertical,margin?,display?}`。 |
| `x` / `y` | `100 / 100` | 旧 absolute compatibility 写法；必须成对，不与 `position` 混用。 |
| `theme` | `dark` | 当前只支持 dark。 |
| `title` | `Toolbar` | native title。 |
| `alwaysOnTop` | `true` | native 置顶。 |
| `draggable` | `true` | 是否允许 native dragging。 |
| `orientation` | `horizontal` | horizontal 最多 32 个 content item；vertical 最多 5 个。 |
| `toolbar.maxWidth` | `960` | horizontal 最大 outer width，60–960。 |
| `toolbar.maxColumns` | `19` | 每行最大 content item 数。 |
| `toolbar.maxRows` | 自动 | 1–32；与其他限制共同计算 capacity。 |

**返回值**

`FloatingWindow` 实例。

**行为与错误**

Button/Label/control 固定 40pt 高，结构项不占 content quota；布局超限或冲突 position 返回 `INVALID_SPEC`。显示前声明结构，显示后只允许非结构状态更新。

**示例**

```js
const toolbar = new FloatingWindow({
  position: {mode:'anchor', horizontal:'right', vertical:'center', margin:16},
  toolbar: {maxColumns: 6}
});
```

## FloatingWindow.addButton(id, label, icon, callback?)

显示前增加 icon-only native Button。

**签名**

```ts
addButton(id: string, label: string, icon: IconSource, callback?: ButtonCallback): void
```

**参数**

`id` 稳定且唯一；`label` 同时是 tooltip 和 Accessibility name。`icon` 可以是审核过的内置 key，或 `{path, renderingMode?}` 的脚本目录内 PNG/JPEG。bare string 永远解释为内置 icon key。

内置目录见 [图标图鉴](../custom-ui/icon-list.html)。`ai.*` 与 `automation.*` 语义键用于业务意图，不要求业务代码知道 macOS SF Symbol / Windows glyph 映射。

**返回值**

`undefined`。

**行为与错误**

只能首次 show 前增加；callback single-flight，执行期间按钮进入 busy；失败产生 `UI_CALLBACK_FAILED` 并可由 `onError()` 观察。

**示例**

```js
toolbar.addButton('run', '运行', 'automation.run', async () => runRecipe());
```

## FloatingWindow.addLabel(id, text, options?)

显示前增加固定宽度 native status text。

**签名**

```ts
addLabel(id: string, text: string, options?: {
  width?: number;
  alignment?: 'leading'|'center'|'trailing';
  verticalAlignment?: 'top'|'center'|'bottom';
  tone?: 'primary'|'secondary'|'success'|'warning'|'error';
}): void
```

**参数**

宽度默认 120、范围 48–240；固定 40pt 高。

**返回值**

`undefined`。

**行为与错误**

显示后可更新文字/对齐/tone，但 width 不变。

**示例**

```js
toolbar.addLabel('status', 'Ready', {width:144, alignment:'center'});
```

## FloatingWindow.addSwitch(id, label, options?, callback?)

增加立即生效的 boolean Switch。

**签名**

```ts
addSwitch(id, label, {value?, disabled?, width?}?, callback?): void
```

**参数**

`value` 默认 false；`width` 默认 140，48–79 为紧凑 tooltip-only 可见标签模式。

**返回值**

`undefined`。

**行为与错误**

交互产生 `change`，event 提供 `value/checked`。

**示例**

```js
toolbar.addSwitch('live', '实时同步', {value:true}, e => console.log(e.checked));
```

## FloatingWindow.addCheckbox(id, label, options?, callback?)

增加独立选择 Checkbox。

**签名**

```ts
addCheckbox(id, label, {value?, disabled?, width?}?, callback?): void
```

**参数**

`value` 默认 false；Checkbox 之间不自动互斥。

**返回值**

`undefined`。

**行为与错误**

互斥选择请使用 `addSegmentedControl()`。

**示例**

```js
toolbar.addCheckbox('includeLogs', '包含日志', {value:true});
```

## FloatingWindow.addInput(id, label, options?, callback?)

增加单行原生输入。

**签名**

```ts
addInput(id, label, {value?, placeholder?, maxLength?, disabled?, width?}?, callback?): void
```

**参数**

`maxLength` 默认 256；width 默认 180。Input 不支持 autofocus。

**返回值**

`undefined`。

**行为与错误**

`show()` 保持 nonactivating；只有用户直接点击真实 input 才允许 host 激活并取得键盘焦点。事件类型为 `input`。

**示例**

```js
toolbar.addInput('query', '搜索', {maxLength:64, width:200}, e => console.log(e.value));
```

## FloatingWindow.addSelect(id, label, options, callback?)

增加固定 options 单选 Select。

**签名**

```ts
addSelect(id, label, {options, value?, disabled?, width?}, callback?): void
```

**参数**

`options` 为 2–12 个唯一 `{value,label}`；value 默认首项。

**返回值**

`undefined`。

**行为与错误**

Options 与 width 声明后不可变，运行时只更新 value/disabled。

**示例**

```js
toolbar.addSelect('quality', '质量', {options:[{value:'fast',label:'快速'},{value:'best',label:'最佳'}]});
```

## FloatingWindow.addSlider(id, label, options?, callback?)

增加按 step 吸附的有界数值 Slider。

**签名**

```ts
addSlider(id, label, {min?, max?, value?, step?, disabled?, width?}?, callback?): void
```

**参数**

默认 `min:0,max:100,step:1`；value 必须位于范围内。

**返回值**

`undefined`。

**行为与错误**

范围/step/width 创建后不可变。

**示例**

```js
toolbar.addSlider('volume', '音量', {min:0,max:10,value:4,step:1});
```

## FloatingWindow.addSegmentedControl(id, label, options, callback?)

增加 first-class 互斥选择组。

**签名**

```ts
addSegmentedControl(id, label, {options, value?, disabled?, width?}, callback?): void
```

**参数**

与 Select 相同的 2–12 个唯一 options。

**返回值**

`undefined`。

**行为与错误**

native Accessibility 以 group/radio-group 语义呈现；不提供零散 Radio/ButtonGroup 伪语义。

**示例**

```js
toolbar.addSegmentedControl('scope', '范围', {options:[{value:'page',label:'页面'},{value:'app',label:'应用'}]});
```

## FloatingWindow.addProgress(id, label, options?)

增加 determinate 或 indeterminate Progress。

**签名**

```ts
addProgress(id, label, {min?, max?, value?, indeterminate?, width?}?): void
```

**参数**

默认 `min:0,max:1,value:min`；width 默认 160。

**返回值**

`undefined`。

**行为与错误**

不可交互，没有 callback；可用 `updateControl()` 更新 value/indeterminate。

**示例**

```js
toolbar.addProgress('upload', '上传进度', {value:0.25});
```

## FloatingWindow.addSeparator(id)

显示前在相邻内容组之间增加 native divider。

**签名**

```ts
addSeparator(id: string): void
```

**参数**

唯一 item id。

**返回值**

`undefined`。

**行为与错误**

不能位于首尾、不能连续；没有 callback、focus 或 Accessibility element。

**示例**

```js
toolbar.addSeparator('main-help-divider');
```

## FloatingWindow.addSpacer(id)

显示前增加固定标准 group gap，不是 flexible space。

**签名**

```ts
addSpacer(id: string): void
```

**参数**

唯一 item id。

**返回值**

`undefined`。

**行为与错误**

与 Separator 一样只能位于两个 content group 之间。

**示例**

```js
toolbar.addSpacer('status-help-space');
```

## FloatingWindow.removeButton(id)

首次 show 前删除 Button 及需要清理的相邻结构边界。

**签名**

```ts
removeButton(id: string): void
```

**参数**

Button id。

**返回值**

`undefined`。

**行为与错误**

show 后返回 `INVALID_STATE`；不存在返回 `NOT_FOUND`。

**示例**

```js
toolbar.removeButton('temporary');
```

## FloatingWindow.removeLabel(id)

首次 show 前删除 Label。

**签名**

```ts
removeLabel(id: string): void
```

**参数**

Label id。

**返回值**

`undefined`。

**行为与错误**

遵循与 removeButton 相同的生命周期限制。

**示例**

```js
toolbar.removeLabel('temporaryStatus');
```

## FloatingWindow.removeControl(id)

首次 show 前删除 Switch/Checkbox/Input/Select/Slider/SegmentedControl/Progress。

**签名**

```ts
removeControl(id: string): void
```

**参数**

control id。

**返回值**

`undefined`。

**行为与错误**

show 后返回 `INVALID_STATE`。

**示例**

```js
toolbar.removeControl('temporaryFilter');
```

## FloatingWindow.updateButton(id, patch)

更新 Button 的非结构状态。

**签名**

```ts
updateButton(id: string, patch: {
  icon?: IconSource;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  badge?: string | number | null;
}): Promise<ButtonState>
```

**参数**

`active` 是持久业务状态，不是 pressed；普通一次性动作通常保持 false。badge string 为 1–4 Unicode 字符，number 为 0–999，null 清除。

**返回值**

native readback `ButtonState`。

**行为与错误**

更新不改变 40×40pt 外框；未知字段或非法资源 fail closed。

**示例**

```js
await toolbar.updateButton('inbox', {badge:12, active:true});
```

## FloatingWindow.updateLabel(id, patch)

更新 Label text/alignment/verticalAlignment/tone。

**签名**

```ts
updateLabel(id: string, patch: LabelPatch): Promise<LabelState>
```

**参数**

至少一个可更新字段；width 不可更新。

**返回值**

native readback `LabelState`。

**行为与错误**

固定几何不变。

**示例**

```js
await toolbar.updateLabel('status', {text:'Completed', tone:'success'});
```

## FloatingWindow.updateControl(id, patch)

按 control kind 更新允许的运行时字段。

**签名**

```ts
updateControl(id: string, patch: ControlPatch): Promise<ControlState>
```

**参数**

Toggle: `checked/disabled`；Input: `value/placeholder/disabled`；Select/Segmented: `value/disabled`；Slider: `value/disabled`；Progress: `value/indeterminate`。

**返回值**

native readback `ControlState`。

**行为与错误**

width、choice options、范围/step、maxLength 等结构字段不可更新。

**示例**

```js
await toolbar.updateControl('upload', {value:0.6});
```

## FloatingWindow.getButtonState(id)

读取 Button 逻辑/native/Accessibility/bounds 状态。

**签名**

```ts
getButtonState(id: string): Promise<ButtonState>
```

**参数**

Button id。

**返回值**

包含 label/icon/active/disabled/busy/error/badge/revision/tooltip/Accessibility/localBounds/screenBounds 等。

**行为与错误**

未知或非 Button id 返回 `NOT_FOUND`。

**示例**

```js
console.log(await toolbar.getButtonState('run'));
```

## FloatingWindow.getLabelState(id)

读取 Label native 布局与 Accessibility 状态。

**签名**

```ts
getLabelState(id: string): Promise<LabelState>
```

**参数**

Label id。

**返回值**

包含完整 text、alignment、tone、truncated、renderedTextBounds、Accessibility 与 bounds。

**行为与错误**

显示前 native-only bounds 为零值。

**示例**

```js
console.log(await toolbar.getLabelState('status'));
```

## FloatingWindow.getControlState(id)

读取 typed control 的 value/native/Accessibility/bounds 状态。

**签名**

```ts
getControlState(id: string): Promise<ControlState>
```

**参数**

control id。

**返回值**

根据 `type` 返回 toggle/input/choice/slider/progress discriminated state。

**行为与错误**

未知或错误 item kind 返回 `NOT_FOUND`。

**示例**

```js
console.log(await toolbar.getControlState('scope'));
```

## FloatingWindow.show()

创建或显示 native toolbar。

**签名**

```ts
show(): Promise<WindowState>
```

**参数**

无。

**返回值**

显示后的共享 `WindowState`。

**行为与错误**

首次 show 前必须至少有一个 content item，且结构边界闭合合法。

**示例**

```js
await toolbar.show();
```

## FloatingWindow.hide()

隐藏 toolbar，但不终止实例。

**签名**

```ts
hide(): Promise<WindowState | null>
```

**参数**

无。

**返回值**

隐藏状态或兼容 null。

**行为与错误**

之后可以再次 show。

**示例**

```js
await toolbar.hide();
```

## FloatingWindow.close()

关闭 toolbar 并释放 native 资源。

**签名**

```ts
close(): Promise<WindowState | null>
```

**参数**

无。

**返回值**

关闭状态或兼容 null。

**行为与错误**

终结后不可继续修改。

**示例**

```js
await toolbar.close();
```

## FloatingWindow.getState()

读取共享 WindowState；首次 show 前可返回完整声明的 hidden state。

**签名**

```ts
getState(): Promise<WindowState>
```

**参数**

无。

**返回值**

当前状态。

**行为与错误**

host-only identity/bounds 在尚未创建时为零值/未提供。

**示例**

```js
console.log(await toolbar.getState());
```

## FloatingWindow.setPosition(x, y)

按 absolute logical coordinate 移动 toolbar。

**签名**

```ts
setPosition(x: number, y: number): Promise<Bounds | WindowState>
```

**参数**

有限 number。

**返回值**

兼容返回形状由现有类型声明约束。

**行为与错误**

成功后当前位置成为 absolute 结果。

**示例**

```js
await toolbar.setPosition(100, 100);
```

## FloatingWindow.setPlacement(placement)

按显示器 work area 重新锚定 toolbar。

**签名**

```ts
setPlacement(placement: WindowPlacement): Promise<WindowPlacement | WindowState>
```

**参数**

left/center/right × top/center/bottom，可选 margin/display。

**返回值**

兼容返回形状由现有类型声明约束。

**行为与错误**

一次性明确重定位，不是持续布局约束。

**示例**

```js
await toolbar.setPlacement({horizontal:'right', vertical:'center', margin:16, display:'current'});
```

## FloatingWindow.onButtonClick(buttonID, callback)

为已声明 Button 绑定或替换 callback。

**签名**

```ts
onButtonClick(buttonID: string, callback: ButtonCallback): void
```

**参数**

Button id 与 callback。

**返回值**

`undefined`。

**行为与错误**

callback 在所属 EventLoop owner 上执行，并按按钮 single-flight 处理。

**示例**

```js
toolbar.onButtonClick('run', async () => runRecipe());
```

## FloatingWindow.onControlChange(controlID, callback)

为交互 control 绑定或替换 callback。

**签名**

```ts
onControlChange(controlID: string, callback: ControlCallback): void
```

**参数**

control id 与 callback。

**返回值**

`undefined`。

**行为与错误**

Input 发 `input`；其余可交互 control 发 `change`。Progress 不可绑定。

**示例**

```js
toolbar.onControlChange('live', e => console.log(e.value));
```

## FloatingWindow.onError(callback)

接收 toolbar callback failure。

**签名**

```ts
onError(callback: (error: UIError) => unknown | Promise<unknown>): void
```

**参数**

error callback。

**返回值**

`undefined`。

**行为与错误**

用于显式处理 `UI_CALLBACK_FAILED`；不吞掉 native driver 事实。

**示例**

```js
toolbar.onError(error => console.error(error.code, error.targetId));
```

## FloatingWindow.setAlwaysOnTop(alwaysOnTop)

切换 native window level。

**签名**

```ts
setAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean | WindowState>
```

**参数**

boolean。

**返回值**

兼容返回形状由当前类型声明约束。

**行为与错误**

不改变业务状态。

**示例**

```js
await toolbar.setAlwaysOnTop(true);
```

## FloatingWindow.setDraggable(enabled)

运行时切换 native dragging。

**签名**

```ts
setDraggable(enabled: boolean): Promise<WindowState>
```

**参数**

boolean。

**返回值**

host readback。

**行为与错误**

不重新创建 toolbar。

**示例**

```js
await toolbar.setDraggable(false);
```

## FloatingWindow.on(type, listener)

监听 toolbar 的 `move` / `close` 生命周期。

**签名**

```ts
on(type: 'move'|'close', listener: UIEventListener): () => void
```

**参数**

生命周期类型和 listener。

**返回值**

取消订阅函数。

**行为与错误**

Button activation 仍由 addButton/onButtonClick 管理，不走这个 lifecycle listener。

**示例**

```js
const off = toolbar.on('move', e => console.log(e.bounds));
```

## FloatingWindow.waitUntilClosed()

等待 toolbar 关闭并保持当前 execution 的这段异步工作存活。

**签名**

```ts
waitUntilClosed(): Promise<WindowState>
```

**参数**

无。

**返回值**

关闭终态。

**行为与错误**

推荐的生命周期等待方法。

**示例**

```js
await toolbar.waitUntilClosed();
```

## FloatingWindow.run()

**Deprecated / Compatibility**。等价于 `waitUntilClosed()`；新代码不要继续扩散这个名称。

**签名**

```ts
run(): Promise<WindowState>
```

**参数**

无。

**返回值**

与 `waitUntilClosed()` 相同。

**行为与错误**

没有独立 run loop，也不会创建第二个 Runtime。

**示例**

```js
await toolbar.waitUntilClosed();
```

## 错误

Custom UI 常见结构化错误：

| code | 含义 |
| --- | --- |
| `UI_DISABLED` | 当前 execution 未获得 UI capability。 |
| `UNSUPPORTED_PLATFORM` / `UNSUPPORTED_CAPABILITY` | 平台、host 或具体能力不支持。 |
| `INVALID_SPEC` | Window/Toolbar/Toast/control/icon/update 参数非法。 |
| `DUPLICATE_ID` / `NOT_FOUND` | id 重复或目标不存在。 |
| `INVALID_STATE` / `UI_BUSY` / `UI_CANCELED` | 生命周期阶段错误、资源忙或 execution 取消。 |
| `UI_EVENT_QUEUE_OVERFLOW` / `UI_DRIVER_FAILURE` / `UI_HOST_NOT_FOUND` | event queue、driver 或 host 故障。 |
| `UI_CALLBACK_FAILED` | Button/control callback 抛错或 rejection。 |

错误可带 `operation`、`windowId`、`targetId`、`capability`。不要用 UI 可见性当业务成功证据。

## 主题、图标与详细设计规范

### 主题与 CSS surface

`ui.createWindow(spec).theme` 只接受 `system` 或 `dark`，默认 `system`；
`FloatingWindow` 固定使用 `dark`。主题在创建时声明，不能通过
`ControlHandle.update()` 切换；切换时应关闭旧窗口并用新的 window id 创建新窗口。

主题不会生成设计 token，也不会把任意 CSS 颜色自动换成另一套颜色。HTML/CSS surface 的背景、文字、边框、焦点环和状态色必须由脚本明确声明。需要稳定截图和跨平台示例时，优先 `theme: "dark"` 加显式 CSS token；跟随系统时使用 `theme: "system"`，并声明合适的 `color-scheme`、测试浅色与深色外观。

文件型内容的 CSS 层叠顺序固定为 HTML 内的 `<style>`、`content.css`、`content.cssFile`；CSS 只作用于当前窗口内容，不是全局样式表。HTML、CSS 与图片资源必须位于脚本目录内；不支持 CSS `url()`、`image-set()`、`@import`、CSS escape、远程 stylesheet 或远程图片，HTML 也不能包含 `<script>` 或 inline event handler。交互逻辑由外层 JavaScript 通过 `panel.control(id).on(...)` 注册。

`ui.createWindow()` 的 `button`、`input`、`textarea`、`select` 由 WKWebView 或 WebView2 绘制并通过 Custom UI bridge 提供稳定 id、状态 readback 与事件；它们不是 `FloatingWindow` 的 AppKit/WinForms 控件。`FloatingWindow` 没有 CSS surface，宽度、选项和状态必须通过对应声明以及 `updateButton()` / `updateControl()` 更新。

本 Reference 维护公共 API contract；视觉设计、token、平台差异和图标选型工具单独维护：

- [Custom UI 主题与控件规范](../custom-ui/theme-guide.md)
- [内置图标图鉴](../custom-ui/icon-list.html)
- `pkg/customui/assets/toolbar-icons-v1.json`：内置 icon registry 的源码事实源
- `types/FloatingWindowIconKey.generated.d.ts`：由同一 registry 生成的类型补全

FloatingWindow 的 string icon 只表示内置 key；自定义 PNG/JPEG 必须使用 `{path, renderingMode?}` 对象形式，并被限制在执行脚本目录内。`original` 保留原色，`template` 使用 native state tint。

## 生命周期与实现边界

用户事件内部链路是：

```text
DOM / WKWebView / WebView2 / native control
→ native host
→ bounded Go event queue
→ EventLoop.RunOnLoop
→ Goja listener
```

普通脚本只依赖本页公共对象，不依赖内部 bridge 名称。`close()`、`closeAll()`、execution timeout/cancel/teardown 都会释放当前 execution 拥有的窗口、listener 与 pending callback。Custom UI 不保存业务成功事实；需要验收时仍应使用日志、Execution artifact 或业务 postcondition。
