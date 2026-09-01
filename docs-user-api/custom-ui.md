---
title: Custom UI v1
description: 使用受限 HTML/CSS 与 JavaScript controller 创建原生桌面窗口。
order: 13
---

# Custom UI v1

Custom UI 用受限 HTML/CSS 声明视图，用当前 JavaScript Runtime 作为 controller。HTML 不能直接取得 `mouse`、`File`、`http` 等全局能力；用户事件经过原生宿主、Go 事件队列和 Runtime EventLoop 后，才调用 JavaScript listener。

```text
DOM / WKWebView event
  -> native host
  -> bounded Go event queue
  -> EventLoop.RunOnLoop
  -> Goja listener
  -> Clawdesk Runtime API
```

v1 在 macOS 使用 AppKit + WKWebView。Windows 与 Linux 会报告 `available: false`；创建窗口明确抛出 `UNSUPPORTED_PLATFORM`，不会静默成功。需要固定的一次性确认/输入窗口时使用 [Dialog API](dialog.md)：Dialog 由 host 根据结构化参数生成，不能提交 HTML/CSS，也不会成为 Custom UI 的第二套 controller。

## ui：启用方式

`ui` 全局始终存在，但默认 dormant。未授权的 `createWindow()`、`closeAll()` 或 `on()` 会抛出 `UI_DISABLED`。

普通项目推荐把下面文件放在 JavaScript 脚本同目录，文件名固定为 `clawdesk.runtime.json`：

```json
{
  "schemaVersion": 1,
  "runtime": {
    "capabilities": ["ui"]
  }
}
```

配置采用严格 schema：未知字段、未知 capability、重复 capability、错误类型和不支持的 schemaVersion 都会让执行失败。项目配置不能提供 UI host 路径。

配置错误使用 `RUNTIME_CONFIG_INVALID`、`RUNTIME_CONFIG_NOT_FOUND` 或 `RUNTIME_CONFIG_UNSUPPORTED`，并在 CLI stderr 中包含配置路径和原因。

命令行入口：

```bash
# 强制启用
.runtime/bin/clawdesk-js-runtime -ui -script ./panel.js

# 强制禁用
.runtime/bin/clawdesk-js-runtime -no-ui -script ./panel.js

# 使用指定配置
.runtime/bin/clawdesk-js-runtime -config ./clawdesk.runtime.json -script ./panel.js
```

优先级从高到低为：

1. `-no-ui`
2. `-ui`
3. `-config <path>`
4. 本地脚本同目录的 `clawdesk.runtime.json`
5. 默认禁用

双击 / `tm.config.js` 模式改为从工作目录查找固定配置。`-ui-host` 只用于内部开发验收，不属于项目配置或普通用户 API。

可以同时从两个位置观察启用来源：

```js
console.log(ui.getCapabilities().activationSource);
console.log(Execution.activationSource);
```

值为 `disabled`、`cli`、`projectConfig` 或 `httpRequest`。

## ui.createWindow：最小示例

```js
async function main() {
  const panel = await ui.createWindow({
    id: "helloPanel",
    kind: "floating",
    title: "Hello",
    bounds: { x: 160, y: 160, width: 440, height: 180 },
    alwaysOnTop: true,
    draggable: true,
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <header id="drag" data-clawdesk-drag>Custom UI</header>
        <button id="refresh">Refresh</button>
        <p id="status">Ready</p>
      </body></html>`,
      css: `body{font:14px -apple-system,sans-serif}button{padding:8px 12px}`
    }
  });

  panel.control("refresh").on("click", async () => {
    const info = System.getSystemInfo();
    await panel.control("status").update({ text: JSON.stringify(info) });
  });

  await panel.show();
  await panel.waitUntilClosed();
}

await main();
```

必须等待 `show()`。需要窗口继续存活时，再等待 `waitUntilClosed()`；不要用长时间 timer 或 sleep 维持示例。

简单的 1–32 按钮图标工具栏优先使用 `new FloatingWindow(...)`，它负责可信图标、自动布局、Accessibility、按钮级 single-flight 和 callback Promise。任意表单、受限 HTML/CSS 或运行时控件树则使用 `ui.createWindow()`。完整五按钮示例见 `examples/custom-ui/five-button-toolbar.js`。

## ui.createWindow：窗口声明

`ui.createWindow(spec)` 返回 `Promise<WindowHandle>`。声明的未知字段会被拒绝。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填；同一 execution 内唯一，匹配 `[A-Za-z][A-Za-z0-9_-]{0,63}` |
| `kind` | `normal` / `floating` | 默认 `normal` |
| `title` | string | 原生窗口标题 |
| `bounds` | `{x,y,width,height}` | 必填；宽高必须为正数 |
| `alwaysOnTop` | boolean | 是否使用真实置顶层级 |
| `draggable` | boolean | 是否启用带 `data-clawdesk-drag` 的拖动区；拖动区必须是带稳定 `id` 的受支持容器 |
| `theme` | `system` / `dark` | 默认 `system`；FloatingWindow 固定使用 `dark` |
| `content` | object | HTML/CSS 内容 |

`content` 必须恰好提供一个：

- `html`：内联受限 HTML；
- `file`：脚本目录内的本地 HTML 文件。

可附加 `css` 或脚本目录内的 `cssFile`。`basePath` 只能指向脚本目录内部，用于解析本地图片。相对路径或绝对路径都必须留在脚本目录内；`..` 和 symlink 越界都会被拒绝。

## ui.createWindow：HTML 与资源边界

允许的主要元素包括布局容器、文本、`button`、`input`、`select`、`option` 和 `img`。所有交互元素必须有稳定 `id`；可公开为七类控件的带 ID 元素按 DOM 前序形成稳定 `controls()` 顺序，重复 ID 返回 `DUPLICATE_ID`。`style`、`meta`、`option` 等非公开节点不能借 `id` 进入控件树。

公开拖动区使用 `data-clawdesk-drag`，且只能声明在带稳定 `id` 的 `div`、`section`、`main`、`header` 或 `footer` 容器上；属性值只能为空或 `true`。按钮、输入框等交互控件不能兼作拖动区。`data-opendesk-drag` 仅供旧 `FloatingWindow` facade 内部迁移兼容，不是新代码入口。

v1 明确禁止：

- `<script>` 和 HTML 内业务 JavaScript；
- `onclick` 等 inline event handler；
- `autofocus`；
- meta refresh 和除 `<meta charset="utf-8">` 以外的 meta；
- 后续 document navigation；
- 远程 URL、`file:`、`javascript:`、协议相对 URL；
- CSS `url()`、`image-set()`、`@import`、CSS escape 和 `</style` 注入；
- `srcset`；
- file/color/date 等未纳入 v1 的 input type，以及 multiple select；
- 脚本目录 / `basePath` 之外的本地资源。

图片可使用 `basePath` 内存在的 PNG、JPEG、GIF、WebP、BMP、ICO，或受限的 base64 raster data image。动态 `update({source})` 采用相同策略。

## ui：API 方法

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `ui.getCapabilities()` | object | 同步返回启用、平台、driver、activationSource、控件和窗口能力 |
| `ui.createWindow(spec)` | Promise<WindowHandle> | 校验声明并创建隐藏窗口 |
| `ui.closeAll()` | Promise<void> | 幂等关闭当前 execution 的所有窗口 |
| `ui.on(type, listener)` | unsubscribe function | 监听当前 execution 的所有 UI 事件 |

macOS 上 `available` 还要求随包的 `clawdesk-ui-host` 可发现；缺失时创建窗口抛出 `UI_HOST_NOT_FOUND`。

## WindowHandle：窗口句柄

| 方法 | 说明 |
| --- | --- |
| `controls()` | 返回稳定 `{id,type,order}` 数组 |
| `show()` / `hide()` / `close()` | 原生状态变更；均返回 Promise<WindowState> |
| `getState()` | 获取实际窗口状态 |
| `setBounds(bounds)` | 同时设置位置和尺寸 |
| `setPosition(x,y)` | 设置位置 |
| `setSize(width,height)` | 设置尺寸 |
| `setAlwaysOnTop(enabled)` | 改变真实原生层级 |
| `setDraggable(enabled)` | 动态启用 / 禁用拖动 |
| `waitUntilClosed()` | 保持 Runtime 生命周期，直到用户或 controller 关闭窗口 |
| `control(id)` | 获取 ControlHandle；未知 ID 抛出 `NOT_FOUND` |
| `on(type, listener)` | 监听该窗口事件，返回取消订阅函数 |

`floating` 窗口使用 nonactivating panel。`show()` 只有在 WindowServer 报告 `onScreen=true` 且 `alpha>0` 后 resolve，并且不会主动取得键盘焦点。`setBounds()` 只有在 WindowServer 的实际边界匹配后 resolve。

`WindowState` 的关键字段包括：

```js
{
  id, sessionId, status, visible, bounds,
  alwaysOnTop, draggable,
  hostPid, nativeWindowId,
  onScreen, layer, alpha,
  revision, lastSequence
}
```

## ControlHandle：控件句柄

```js
const save = panel.control("save");
const state = await save.getState();
await save.update({ text: "Saving...", disabled: true });
const unsubscribe = save.on("click", event => console.log(event));
unsubscribe();
```

支持的更新：

- `text`：button / text；容器文本更新会破坏稳定控件树，因此 v1 明确不支持；
- `icon`：button；仅接受 FloatingWindow 内置注册表中的六个名字；
- `active`、`busy`、`error`：button；同步更新 Accessibility 属性和视觉状态；
- `value`：input / select；
- `checked`：checkbox input / switch；
- `disabled`：button / input / select / switch；
- `visible`、`classes`：公开控件；
- `source`：img；
- `options`：select。

空 patch、未知字段或控件类型不支持的字段不会静默忽略；会返回 `INVALID_SPEC` 或 `UNSUPPORTED_CAPABILITY`。

## ui.on：事件

公开事件为 `click`、`change`、`input`、`move`、`resize`、`close`，监听器也可以用 `*`。未知拼写会立即返回 `INVALID_SPEC`。

事件包含 `sessionId`、`windowId`、可选 `targetId`、`type`、单调 `sequence`、`timestamp`，以及相应的 `value`、`checked`、`bounds` 或 `reason`。

事件队列有界。只有 `input`、`move`、`resize` 可以在不跨越 click/change/close 屏障时合并；click/change/close 不会静默丢失。队列满时 execution 以 `UI_EVENT_QUEUE_OVERFLOW` 失败。

## ui / WindowHandle：错误

Custom UI 错误保留下列字段：

```js
try {
  await panel.control("photo").update({ source: "https://example.com/a.png" });
} catch (error) {
  console.error(JSON.stringify({
    code: error.code,
    operation: error.operation,
    windowId: error.windowId,
    targetId: error.targetId,
    capability: error.capability,
    message: error.message
  }));
}
```

稳定错误码包括 `UI_DISABLED`、`UNSUPPORTED_PLATFORM`、`UNSUPPORTED_CAPABILITY`、`INVALID_SPEC`、`DUPLICATE_ID`、`NOT_FOUND`、`INVALID_STATE`、`UI_EVENT_QUEUE_OVERFLOW`、`UI_DRIVER_FAILURE`、`UI_HOST_NOT_FOUND`、`UI_BUSY`、`UI_CANCELED`、`UI_CALLBACK_FAILED`。

## ui / WindowHandle：生命周期

- 所有 JavaScript callback 只在 EventLoop owner 上调用；原生 / driver goroutine 不直接触碰 Goja。
- FloatingWindow callback 的同步值和 Promise 都在 owner loop 中接续；每个按钮有独立 single-flight，其他按钮不会被锁住。
- `waitUntilClosed()` 会保持 execution 存活。
- 脚本异常、timeout、HTTP cancel、server shutdown 和未等待的脚本结束都会清理窗口、listener、pending callback 与 host process。
- `close()`、`closeAll()` 和 execution teardown 是幂等的。

## ui：HTTP 模式

HTTP UI 必须同时满足：服务器用 `-ui` 或可信本地配置启用、单次请求包含 `"capabilities":["ui"]`、请求来自 loopback。任一条件失败都会返回明确 403；`X-Forwarded-For` 不会绕过 socket 来源检查。详见 [HTTP server API](http-server.md)。

## ui：示例与兼容入口

- `examples/custom-ui/panel.js`
- `examples/custom-ui/form.js`
- `examples/custom-ui/floating-recording-toolbar.js`
- `examples/custom-ui/five-button-toolbar.js`：推荐的 Button-first 五按钮示例
- `examples/floatwindow.js`：旧静态 FloatingWindow 入口的迁移示例

`FloatingWindow` 不再初始化 Fyne。推荐构造独立实例，首次 `show()` 前配置 1–32 个稳定有序按钮；show 后禁止结构变更，但允许 icon、label、active、disabled、busy、error 更新。窗口按按钮和完整标签自动调整宽高，超宽时换行且保持 x/y。仅 `run()` 已 deprecated，它是 `waitUntilClosed()` 的兼容别名。
