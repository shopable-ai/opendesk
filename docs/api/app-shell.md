---
title: automation.app API
description: App Mode lifecycle, tray actions, menu state, and graceful application shutdown.
order: 210
---

# automation.app

`automation.app` 是显式 `-app <directory>` execution 的原生 App Shell API。它接收当前应用的 tray / menu bar action、更新 Manifest 已声明的菜单项，并通过当前 Execution 生命周期请求退出。

它不替代大写 [`App`](app.md)：`App` 控制外部桌面应用，`automation.app` 只控制当前 OpenDesk App Mode 应用。两者可以在同一个 Runtime 中同时存在。

普通 `-script`、`-script-text`、HTTP、MCP 与 Scheduler execution 不会读取或自动发现 `opendesk.app.json`；这些模式仍注入 fail-closed 的 `automation.app` capability handle，除 capability 查询外的方法抛出 `APP_MODE_DISABLED`。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `automation.app.getCapabilities()` | 返回当前 execution 是否由 App Mode App Shell 拥有。 |
| `automation.app.onAction(handler)` | 在当前 JavaScript Runtime 中订阅 tray 与 activation action。 |
| `automation.app.updateMenuItem(id, patch)` | 更新 Manifest 中一个既有菜单项的显示状态。 |
| `automation.app.quit()` | 请求当前 App Mode application 沿统一生命周期退出。 |

## 公共约定

### App Mode 启动

以下公开命令都从仓库根目录运行。先构建当前源码：

```bash
make build
```

再启动仓库中的最小示例：

```bash
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

应用包必须包含严格的 `opendesk.app.json`。`id` 使用小写 reverse-DNS identity；`entry`、Windows `.ico` 和 macOS template PNG 都是包内相对路径。`window.mainId` 必须与入口脚本创建的 Custom UI window `id` 一致。

`-app` 与 `-script`、`-script-text`、`-script-stdin`、`-http`、vision、native-extension 和内部 helper 模式互斥。App Mode 默认没有 30 分钟 deadline；操作系统信号、系统 Quit、主窗口的 `closeBehavior: "quit"` 或 `automation.app.quit()` 都进入同一 execution-owned shutdown。

### Tray 图标资源

`tray.enabled: true` 时，`tray.icons.windows` 与 `tray.icons.macos` 都必填并在所有 host OS 上启动前校验。OpenDesk 不在两个字段间 fallback，也不把 PNG 自动转换为 ICO、把 `.icns` 当作 menu bar template，或因为当前运行在 macOS 就忽略损坏的 Windows 资源。

| 字段 | 启动契约 | 推荐资源 |
| --- | --- | --- |
| `tray.icons.macos` | 真实 PNG；正方形；边长 16–1024 px；同时含可见像素与透明像素；文件不超过 16 MiB。AppKit 将其标为 template、固定为 18×18 point 并按比例缩小。 | 优先提供 36×36 px（18 point @2x）的高对比度 alpha mask；图形四周留透明边距。颜色不会按原色显示，系统会按菜单栏外观着色。 |
| `tray.icons.windows` | 真实 ICO；1–256 个正方形 frame；每个 frame 为 16–256 px；目录、offset、长度和重叠关系合法；嵌入 PNG 会完整解码，传统 DIB 会校验 header、planes、尺寸、compression、调色板和像素边界；文件不超过 16 MiB。 | 推荐透明背景，并包含 16、20、24、32、48、256 px 等常见 DPI 层级。Native loader 按当前 Windows DPI 的 small-icon metrics 选择最接近的 frame；固定帧集合不是硬要求，单帧 ICO 仍受支持但可能被缩放。 |

macOS template image 的 RGB 颜色不是品牌色通道；实际轮廓来自 alpha。全透明图会不可见，全不透明图会变成实心方块，因此两者都会在启动时被拒绝。Windows native backend 使用 ICO 文件创建 `HICON`，Explorer 重建时复用同一 handle，并在 teardown 时删除 Notification Area icon 后销毁 handle。

### Package 路径与安全边界

package root 是 `realpath(-app directory)`。Manifest 的 `entry` 和两个图标路径必须是 package 内相对路径；绝对路径、Windows drive path、NUL、`..` 逃逸、缺失文件、目录和解析 symlink 后越界都会让启动失败。校验使用真实目标与 `filepath.Rel` containment，不使用字符串前缀。

图标扩展名与内容都检查。空文件、损坏的 PNG/ICO、把 PNG 改名为 `.ico`、把 ICO 改名为 `.png`、越界 frame offset、嵌入 PNG 尺寸与 ICO directory 不一致等错误，不会静默退化为无图标；CLI 会指出 `tray.icons.windows` 或 `tray.icons.macos` 以及失败资源的规范绝对路径。

### 平台交互

| 操作 | macOS | Windows |
| --- | --- | --- |
| 主窗口入口 | 菜单中的 `Open / Show` 执行 `opendesk.open`，显示并聚焦同一主窗口。 | 同左。 |
| 打开菜单 | 左键打开；右键或 Control-click 继续兼容。 | 左键打开；右键或 context-menu gesture 继续兼容。 |
| 业务菜单 | 点击后按 Manifest item `action` 向当前 Execution 分发 `tray-menu` event。 | 同左；不会启动第二个 Runtime。 |
| 动态更新 | `updateMenuItem()` 在 AppKit main thread 更新既有 item。 | `updateMenuItem()` 投递到专属 Win32 message loop 更新既有 item。 |
| 用户关闭 | `closeBehavior: "hide"` 隐藏原窗口；系统 Open 或第二实例重新显示同一窗口。 | 同一语义；用户 X 被拦截后隐藏原窗口。 |
| 退出 | 系统 Quit 或 `automation.app.quit()` 进入统一 shutdown 并移除 `NSStatusItem`。 | 系统 Quit 或 `automation.app.quit()` 进入统一 shutdown，删除 notification icon 并销毁 `HICON`。 |

### Action identity

Manifest menu item 的 `id` 是 native 更新定位键，`action` 是发给 JavaScript 的业务 action。不同 menu item 可以复用同一个 `action`；回调收到的 `event.id` 始终是 action，不是 native item id。

系统 action `opendesk.open` 会先显示并聚焦 `window.mainId` 对应的同一个 native window，也会作为 action event 送入当前 Runtime。第二次启动 single-instance 应用时，primary 收到 `{ id: "opendesk.open", source: "second-instance" }`，而 `main.js` 不会再次执行。系统 `opendesk.quit` 直接进入 shutdown，不作为可延迟退出的业务回调。

### 生命周期和线程边界

Native callback 只提交纯 Go action 数据到有界队列，再通过当前 Execution 的 EventLoop 调用 handler。它不会创建第二个 Execution 或 Goja Runtime，也不会从 AppKit / Windows message thread 访问 Goja。

顶层 `main.js` 完成后，运行中的 App Shell 仍是正式 lifecycle resource；不需要 `setInterval`、sleep loop 或其他 JavaScript keep-alive。退出时 listener、queued action、Custom UI、tray / menu bar 和 single-instance lease 按统一 shutdown 顺序释放。

### Menu patch

```ts
interface OpenDeskAppMenuItemPatch {
  label?: string;
  enabled?: boolean;
  visible?: boolean;
}
```

Patch 至少包含一个字段。P0 不创建、删除或重排菜单项，也不支持 submenu、accelerator、radio、badge 或 arbitrary reorder。无 action 的 status-only item 必须在 Manifest 中显式 `enabled: false`，并且不能在 Runtime 中重新启用。

## automation.app.getCapabilities()

返回 App Shell capability 与当前 package identity。

**签名**

```ts
automation.app.getCapabilities(): OpenDeskAppShellCapabilities;
```

**参数**

无。

**返回值**

App Mode 中返回 `{ enabled: true, available: true, packageId, mainWindowId, closeBehavior }`。其他 execution 返回 `{ enabled: false, available: false, reason }`。

**行为与错误**

同步、只读，不创建 tray、window 或新的 execution，也不触发系统权限请求。

**示例**

```js
const appShell = automation.app.getCapabilities();
if (appShell.enabled) console.log(appShell.packageId, appShell.mainWindowId);
```

## automation.app.onAction(handler)

在当前 App Mode JavaScript Runtime 中订阅 action。

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

`event` 为 `{ id: string, source: string }`。当前系统 source 包括 `tray-primary`、`tray-menu`、`second-instance` 与 `app-activation`。

**返回值**

同步返回幂等 unsubscribe 函数。调用后不再向该 handler 分发后续 action。

**行为与错误**

Handler 按注册顺序运行；返回 Promise 时会观察 rejection。同步抛错或 Promise rejection 会作为当前 execution 的异步错误处理。shutdown 开始后拒绝新 listener，已排队但尚未进入 Runtime 的 action 被清除。

非函数参数抛 `INVALID_ARGUMENT`；普通 Script Mode 抛 `APP_MODE_DISABLED`；退出中抛 `APP_QUITTING`。

**示例**

```js
const unsubscribe = automation.app.onAction(async event => {
  if (event.id === 'sync.now') {
    await automation.app.updateMenuItem('status', { label: 'Status: running' });
  }
});
```

## automation.app.updateMenuItem(id, patch)

更新 Manifest 中一个既有业务菜单项。

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
| `id` | `string` | 是 | 无 | Manifest menu item 的稳定 native id；不是 action id。 |
| `patch` | `OpenDeskAppMenuItemPatch` | 是 | 无 | `label`、`enabled`、`visible` 中至少一个字段。 |

**返回值**

Native menu mutation 完成后 resolve `undefined` 的 Promise。

**行为与错误**

未知字段、空 patch、空 label 或无效类型抛/拒绝 `INVALID_ARGUMENT` 或 `APP_SHELL_ERROR`。未知 id、退出中更新、平台 backend 失败或尝试启用 status-only item 会拒绝。它不新增或删除菜单项。

**示例**

```js
await automation.app.updateMenuItem('sync.now', {
  label: 'Syncing…',
  enabled: false,
});
```

## automation.app.quit()

请求当前 App Mode application 正常退出。

**签名**

```ts
automation.app.quit(): Promise<void>;
```

**参数**

无。

**返回值**

退出请求已交给当前 EventLoop 后 resolve `undefined`。随后当前 App Mode context 被取消，execution 进入统一 cleanup。

**行为与错误**

退出是幂等的。状态先从 `RUNNING` 原子转换到 `QUITTING`，停止接收 action / activation，再取消当前 App Mode parent context；Runtime teardown 会清除 listener、关闭 Custom UI、移除 tray / menu bar、终止 EventLoop、join worker，最后释放 single-instance IPC / lock。

普通 Script Mode 抛 `APP_MODE_DISABLED`。调用方不应在 `await automation.app.quit()` 之后启动新工作。

**示例**

```js
automation.app.onAction(event => {
  if (event.id === 'session.finish') return automation.app.quit();
});
```

## Manifest 最小示例

```json
{
  "id": "com.example.sync-helper",
  "entry": "main.js",
  "singleInstance": true,
  "window": { "mainId": "main", "closeBehavior": "hide" },
  "tray": {
    "enabled": true,
    "icons": {
      "windows": "assets/tray.ico",
      "macos": "assets/tray-template.png"
    },
    "tooltip": "Sync Helper",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": [
      { "id": "sync.now", "label": "Sync now", "action": "sync.now" },
      { "type": "separator" },
      { "id": "status", "label": "Status: idle", "enabled": false }
    ]
  }
}
```

`window.closeBehavior: "hide"` 仅在 tray 启用且 `primaryAction` 为 `opendesk.open` 时合法。Windows 用户 X 在 `FormClosing` 被取消并隐藏原窗口；macOS 用户关闭在 `windowShouldClose` 中 `orderOut` 并返回 `NO`。脚本、session 和 shutdown 发起的 programmatic close 在两个平台都真正销毁窗口。

与上面 Manifest 配套的完整最小 `main.js`：

```js
const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error(`App Mode unavailable: ${JSON.stringify(capabilities)}`);
}

const main = await ui.createWindow({
  id: 'main',
  title: 'Sync Helper',
  position: {
    mode: 'anchor',
    size: { width: 420, height: 220 },
    horizontal: 'center',
    vertical: 'center',
    display: 'primary',
  },
  content: {
    html: '<main><p id="status">Status: idle</p><button id="quit">Quit</button></main>',
  },
});

main.control('quit').on('click', () => automation.app.quit());
automation.app.onAction(async event => {
  if (event.id !== 'sync.now') return;
  await automation.app.updateMenuItem('sync.now', {
    label: 'Syncing…',
    enabled: false,
  });
  await main.control('status').update({ text: `Action source: ${event.source}` });
});

await main.show();
```

顶层代码结束后不需要 keep-alive loop；App Shell 是当前 Execution 的 lifecycle resource。`onAction()` handler、窗口和菜单共用同一个 Runtime。

## 平台与能力

| 平台 | P0 backend | 当前验收边界 |
| --- | --- | --- |
| macOS | 原生 `NSStatusItem` / `NSMenu`，AppKit mutation 位于 primordial main thread | 需要当前构建的 live interaction 与截图 evidence。 |
| Windows | 原生 Notification Area icon、专属 Win32 message loop、per-user mutex / named pipe | macOS 开发机只做 cross-build / contract；GUI 与 IPC 真机状态必须标记 NOT RUN。 |
| Linux | 无 P0 tray backend | `-app` tray 应用 fail closed；不做 P0 支持声明。 |

Windows 目标机/CI 的非视觉 IPC contract 入口是：

```powershell
go test ./pkg/appshell -run 'TestWindows(SingleInstance|Tray|NativeHost)' -count=1
```

完整 Windows GUI 验收还必须在交互式用户会话中使用当前源码构建主程序与 `opendesk-ui-host`，实际检查 Notification Area primary click/context menu、动态 label/enabled/visible、用户 X hide、同一窗口 reopen、programmatic close 与 teardown。`GOOS=windows` 的 PE 交叉构建不能替代这些真机步骤。

## 错误

`automation.app` 错误对象包含 `name: "OpenDeskAppError"`、`code`、`operation` 与 `message`。常见 code：

| code | 含义 |
| --- | --- |
| `APP_MODE_DISABLED` | 当前 execution 不是显式 App Mode。 |
| `APP_QUITTING` | App Shell 已进入退出状态。 |
| `INVALID_ARGUMENT` | handler、menu id 或 patch 不合法。 |
| `APP_SHELL_ERROR` | native update 或 lifecycle operation 失败。 |

### 启动错误与排障

| 错误片段 | 原因 | 处理 |
| --- | --- | --- |
| `tray.icons.windows must reference an .ico file` | Windows 字段扩展名错误。 | 生成真正的多尺寸 `.ico`，不要只重命名 PNG。 |
| `invalid ICO header` / `ICO frame ...` | ICO directory、frame range 或嵌入图像损坏。 | 用图标编辑器重新导出；检查推荐 DPI 层级，不要手工拼接文件。 |
| `decode PNG` / `template PNG ...` | macOS 字段不是可完整解码的透明正方形 PNG，或尺寸越界。 | 导出 36×36 RGBA PNG，并确保既有可见 alpha 又有透明背景。 |
| `resolve tray.icons...` | 资源缺失、路径指向目录或 symlink 无法解析。 | 从 package root 检查 Manifest 相对路径及大小写。 |
| `escapes the app package through a symlink` | 真实目标位于 `realpath(-app directory)` 之外。 | 把资源复制到 package 内，避免指向外部的 symlink。 |
| `create macOS menu bar item` / `load Windows tray icon` | portable 校验已通过，但平台 native loader 或交互式桌面会话失败。 | 确认使用当前源码构建物，并在真实登录会话运行；保留 native 错误与截图。 |

## 验证与证据边界

从仓库根目录运行 portable Manifest/icon negatives 和 frame contract：

```bash
go test ./pkg/appshell -run 'Test(Manifest|LoadPackage|MacOSTemplateIcon|WindowsTrayIcon)' -count=1
```

macOS 的确定性 app icon、App Shell fixture 与 bundle gate：

```bash
./scripts/test_app_icons.sh
```

该脚本依赖 macOS 的 `iconutil`、`plutil` 和 `codesign`，会把产物写入 `.runtime/tests/app-icons/`。它能 portable 地解析 ICO frame，但不是 Windows Notification Area 真机验证。

在 macOS 从最终源码 cross-build Windows package test binary：

```bash
mkdir -p .runtime/tests/app-shell/windows-cross && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c ./pkg/appshell -o .runtime/tests/app-shell/windows-cross/pkg-appshell.test.exe
```

cross-build 只证明目标系统测试二进制可生成。Windows tray 的 DPI 选择、primary/context click、菜单视觉、Explorer 重建、hide/reopen、IPC 与资源 teardown 必须在 Windows 交互式真机用同一源码构建物另行验证，并标记为 live evidence；不得用 PE 文件或 macOS 截图替代。

macOS 视觉验收必须使用当前源码生成的 `dist/opendesk` 和配套 `dist/opendesk-ui-host`，实际观察 `NSStatusItem`。日志或 Promise 只能证明行为，不能证明 template tint、18-point 缩放、清晰度、留白和无裁切；视觉结论必须附真实菜单栏截图，并记录当时的浅色/深色 appearance。运行产物只写 `.runtime/tests/app-shell/`。
