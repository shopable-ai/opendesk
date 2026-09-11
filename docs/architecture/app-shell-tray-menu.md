# App Shell、Tray / Menu Bar 与 Single-Instance 设计

> 状态：App Shell P0 implemented / macOS local evidence verified / Windows main Runtime cross-build and live verification are not claimed in this workspace
> Verification boundary：App Mode 单实例仍由平台 lease / activation transport 负责；Framework Runtime endpoint 分配与传播见 [Runtime Endpoint Allocation](runtime-endpoint-allocation.md)。
> 日期：2026-09-11
> 范围：OpenDesk 可分发桌面脚本应用（App Mode）的 App Shell、系统托盘 / 菜单栏、菜单 Action、窗口关闭行为与单实例生命周期。  
> 兼容性：现有普通 JavaScript / CLI 执行路径必须保持不变。
> 验证边界：macOS 已完成真实 Menu Bar、窗口与 single-instance live；Windows 原生 Tray / IPC 已完成目标系统测试二进制 cross-build，真机 live 留待具备 Windows 设备时执行。

## 1. 结论

本设计冻结以下核心边界：

> **OpenDesk App 的系统托盘属于 App Shell；Manifest 定义初始菜单，Runtime 可以动态更新菜单状态；菜单点击只向当前应用 Execution 分发 Action，不因为菜单项而启动新的脚本 Runtime。**

OpenDesk 继续保留现有脚本运行方式，同时新增可打包、可双击启动的 App Mode。App Mode 不是第二套 JavaScript Runtime，而是在现有 Execution 外增加一个轻量 App Shell，负责操作系统级应用生命周期和入口。

这里的 App Mode tray owner 与普通 `OpenDesk.app` HTTP 服务的 `cmd/opendesk-status` helper 不同。普通 macOS 服务状态项固定包含
Status、Scheduler、Developer 和 Quit；Developer 子菜单提供 **Open Inspector**、进程内 **Allow Inspector from LAN** checkbox
和 **Copy Inspector LAN URL**。helper 不持有 Inspector bearer/session，也不直接修改 server 内存；主进程启动时生成随机 control
token，仅通过 helper argv 传入，helper 经 parent 注入的 Framework loopback endpoint 查询／切换状态。LAN 选项不持久化，OpenDesk 重启
恢复关闭。这组框架 Developer 动作不进入 App Mode manifest/action namespace。

```text
OpenDesk App / executable
        |
        v
+---------------------------+
| App Shell                 |
| - manifest                |
| - single instance         |
| - tray / menu bar         |
| - app lifecycle           |
+-------------+-------------+
              |
              | actionId / lifecycle event
              v
+---------------------------+
| Current Execution         |
| main.js / existing Goja   |
+-------------+-------------+
              |
              v
+---------------------------+
| automation.*              |
| Custom UI / Desktop / ... |
+---------------------------+
```

## 2. 背景与问题

OpenDesk 已经能够让用户编写 JavaScript，通过 Native / Custom UI 创建简单桌面界面并调用自动化能力。商业化和交付场景进一步需要：

- 将一组脚本、配置和资源复制到其他电脑后即可使用；
- Windows / macOS 用户可以通过双击应用入口启动，而不是先学习命令行；
- 常驻型小工具在关闭主窗口后可以继续运行，并从系统托盘 / macOS 菜单栏重新打开；
- 托盘菜单可以触发脚本业务 Action，并实时显示运行状态；
- 同一个应用不能因为重复双击而重复启动多份 Runtime 或重复执行自动化任务；
- 退出必须沿用并收敛到 OpenDesk 现有生命周期，而不是形成一套独立、不可取消的后台执行系统。

如果直接把 Tray 做成 Recipe 内部对象，或者让每个菜单项重新启动脚本，会带来多个 Execution、状态复制、资源泄漏、重复任务、退出竞态和平台行为不一致。因此需要在实现前先冻结职责边界。

## 3. 目标

P0 目标：

- 在 Windows Notification Area 与 macOS Menu Bar 提供一致的 App Shell 业务语义；
- 使用应用 Manifest 描述入口脚本、托盘初始菜单、窗口关闭行为与单实例策略；
- 菜单点击以稳定 `actionId` 分发给当前 Execution；
- Runtime 能按稳定菜单 ID 更新 P0 共同能力 `label` / `enabled` / `visible`；
- `closeBehavior=hide` 时关闭窗口不等于退出应用；
- `singleInstance=true` 时第二次启动只激活已有实例，不再次运行 `main.js`；
- 应用退出时安全停止 Action 分发、销毁 Tray / Menu、关闭 Native UI，并进入已有 Execution 取消 / 退出路径；
- 不破坏现有 `./dist/opendesk -script xxx.js` 行为。

## 4. 非目标

P0 不解决：

- 创建另一套 Recipe Runtime、Replay Runtime 或后台 Worker Runtime；
- 让菜单项直接指定另一个 `.js` 并启动独立 Execution；
- 用 Node.js `child_process` 作为 App Shell；
- 在 JS polyfill 中实现 OpenDesk 专用原生 Tray；
- Linux Tray；
- 复杂菜单 DSL、任意平台专属菜单能力、菜单模板语言；
- 安装器、自动更新、代码签名、Protected Recipe Package 的完整分发流程；
- 浏览器式生命周期 API；
- 用环境变量作为正式应用 Manifest 的唯一配置载体。

这些能力可以后续叠加，但不能改变本设计的 Execution 与 App Shell 边界。

## 5. 与当前仓库能力的关系

当前 Custom UI 已提供 `ui.createWindow()`、`show()`、`hide()`、`close()` 等窗口能力，并在 Windows 使用 WebView2、macOS 使用 WKWebView。页面 JavaScript 与 OpenDesk 自动化 Runtime 保持隔离。

本设计不复制这些窗口 API。App Shell 只决定应用级行为，例如窗口关闭后是隐藏还是退出；具体窗口仍由现有 `automation.ui` 管理。

按照仓库约束，原生 GUI / OS integration 由 Go `automation/` 与平台 native owner 持有，而不是为了 JS 可调用就在 `polyfills/` 复制同名 native global。

## 6. 三层菜单模型

菜单由三个层次组成：

1. **OpenDesk System Menu**：框架保留的系统动作，例如打开 / 显示应用、退出；
2. **Manifest Business Menu**：`opendesk.app.json` 中声明的初始业务菜单；
3. **Runtime State**：当前 Execution 对已有菜单项进行动态状态更新。

P0 默认采用 merge 语义：

```text
Open / Show
----------------
<business menu items from manifest>
----------------
Quit
```

业务菜单不能通过错误配置让应用失去退出入口。P0 的 `Quit` 为框架保留项。

保留 `opendesk.*` 作为系统 Action / Menu ID 前缀，应用 Manifest 不得声明该前缀。

## 7. App Manifest 契约

建议应用包根目录使用：

```text
opendesk.app.json
main.js
assets/
...
```

P0 Manifest 示例：

```json
{
  "id": "com.example.sync-helper",
  "entry": "main.js",
  "singleInstance": true,
  "window": {
    "mainId": "main",
    "closeBehavior": "hide"
  },
  "tray": {
    "enabled": true,
    "icons": {
      "windows": "assets/tray.ico",
      "macos": "assets/tray-template.png"
    },
    "tooltip": "Example App",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": [
      {
        "id": "sync.now",
        "label": "Sync now",
        "action": "sync.now"
      },
      {
        "type": "separator"
      },
      {
        "id": "status",
        "label": "Status: Idle",
        "enabled": false
      }
    ]
  }
}
```

### 7.1 顶层字段

- `id: string`
  - 必填、稳定的 package identity；P0 使用小写 reverse-DNS 形式，例如 `com.example.sync-helper`；
  - single-instance key 只来自规范化后的 `id` 的 SHA-256，不使用绝对 `entry` 路径或当前工作目录；
  - `id` 改变表示另一个应用身份。
- `entry: string`
  - App Mode 的 JavaScript 入口；
  - P0 默认可为 `main.js`，但实现必须显式解析并验证；
  - 它是 App Mode 契约，不改变已有 `-script` 参数。
- `singleInstance: boolean`
  - P0 推荐默认 `true`；
  - `true` 时第二实例不得初始化新的业务 Execution。
- `window.closeBehavior: "hide" | "quit"`
  - `hide`：关闭主窗口仅隐藏，App Shell 保持运行；
  - `quit`：关闭行为进入应用退出流程。
- `window.mainId: string`
  - 必填；必须与入口脚本传给 `automation.ui.createWindow()` 的稳定 Custom UI window `id` 一致；
  - 系统动作 `opendesk.open` 显示并聚焦这个现有窗口；不会新建窗口，也不会向业务层改写成另一个 action。
- `tray`
  - 托盘 / 菜单栏配置。

### 7.2 Tray 字段

- `enabled: boolean`：是否创建系统托盘 / 菜单栏入口；
- `icons.windows: string`：Windows Notification Area 使用的真实 `.ico` 包内相对路径；tray 启用时必填；ICO directory/frame 在所有 host 上启动前验证，native loader 按当前 DPI 的 small-icon metrics 选择 frame；推荐包含 16/20/24/32/48/256 px，但 P0 不把固定帧集合设为硬要求；
- `icons.macos: string`：macOS Menu Bar 使用的真实正方形 PNG 包内相对路径；tray 启用时必填，必须同时含可见与透明 alpha，作为 18-point template image 按比例渲染；推荐 36×36 px；
- `tooltip: string`：平台支持时显示；
- `primaryAction: string`：托盘主激活动作对应的业务 Action ID；
- `menuMode: "merge"`：P0 只冻结 `merge`；
- `menu: array`：静态初始菜单。

### 7.3 菜单项

普通菜单项 P0 至少支持：

```json
{
  "id": "sync.now",
  "label": "Sync now",
  "action": "sync.now",
  "enabled": true,
  "visible": true
}
```

分隔符：

```json
{ "type": "separator" }
```

设计要求：

- 可被 Runtime 更新的菜单项必须具有稳定且唯一的 `id`；
- 普通 menu item 的 `id` 在整个 menu 中全局唯一；`action` 可以由多个 item 复用；native item `id` 只用于更新定位，发给 JavaScript 的 `event.id` 始终是 `action`；
- `action` 是业务 Action ID，不是文件名、JS 代码或 shell command；
- 没有 `action` 的 status-only item 只允许显式且永久 `enabled:false`；Runtime 不得把它重新启用；
- separator 的唯一合法结构是 `{ "type": "separator" }`；
- `id` / `action` 不允许使用保留的 `opendesk.*` 前缀；
- 重复 ID、无效类型、非法资源路径必须在应用启动阶段尽早失败；
- `primaryAction` 必须引用已声明的业务 Action 或系统动作 `opendesk.open`；`opendesk.quit` 只保留给系统 Quit menu，不允许作为 primary action；
- `closeBehavior=hide` 时必须有 `tray.enabled=true`，且 `primaryAction` 必须是 `opendesk.open`，否则启动校验失败。

### 7.4 Package root 与资源边界

- package root 是 `realpath(-app directory)`；启动前必须确认它是目录；
- `entry` 与两端 icon 都必须是 package root 内的相对路径，拒绝绝对路径、`..` 逃逸、缺失文件、目录和 symlink escape；
- 路径校验使用解析 symlink 后的真实目标，而不是只做字符串前缀比较；
- 两端 icon 都在创建 Execution/native host 前验证且单文件限制为 16 MiB：macOS PNG 边长 16–1024 px，必须完整解码；Windows ICO 每帧为 16–256 px 正方形，验证 frame count、offset/range/overlap 与尺寸，嵌入 PNG 完整解码，传统 DIB 验证 header 与常见未压缩 payload；
- 两个图标字段没有平台 fallback；P0 不承诺把任意单一 PNG 自动转换为 Windows ICO 或 macOS template image，manifest 必须分别提供上述平台资源；
- Windows backend 在 message-loop owner 上加载一个 `HICON`，Explorer taskbar 重建复用该 handle，统一 teardown 先 `NIM_DELETE` 再 `DestroyIcon`；macOS backend 显式使用 proportional-down scaling，避免高分辨率源被当作同等 point size 拉宽或裁切。

### 7.5 App Mode CLI 边界

- 唯一入口是 `-app <directory>`；它在 helper/native/flags/console 处理后、无参数 HTTP、vision、direct script 与 HTTP 分支前进入独立 startup pipeline；
- `-app` 与 `-script`、`-script-text`、`-script-stdin`、`-http`、vision/native/helper 模式严格互斥；
- 普通 Script、inline、stdin 和 HTTP 模式不读取或自动发现 `opendesk.app.json`；
- App Mode 创建独立 `execution.Request`，不使用 direct-script replacement lease、不修改 process cwd、默认没有 30 分钟 deadline；`WorkDir` 与 `CustomUIBaseDir` 都是 package root；
- single-instance 必须在 `execution.Run` 前完成 acquire/activation ACK 决策。

## 8. App Runtime API

最终 API 名称必须在实现时先对照当前 native binding 风格确认；以下名称冻结的是**业务语义**，不是要求无视仓库风格硬加名称。

正式归属：native `automation.app`。现有 global `App` 继续表示外部桌面应用控制，保持兼容；生命周期结构字段命名 `AppShell`，不得与该 `App` 混用。普通 Script Mode 可以看到 disabled capability，但不会读取 manifest、创建 tray 或获得常驻语义。

### 8.1 Action 订阅

建议：

```js
automation.app.onAction((event) => {
  if (event.id === "sync.now") {
    runSync();
  }
});
```

P0 Action Event 至少包含：

```js
{
  id: "sync.now",
  source: "tray-menu"
}
```

必要时可后续扩展 `timestamp`、平台来源等，但业务代码不应依赖 Windows 左 / 右键或 macOS selector 名称。

### 8.2 动态菜单更新

推荐：

```js
await automation.app.updateMenuItem("status", {
  label: "Status: Running",
  enabled: false
});
```

核心原则：**使用稳定菜单 ID 更新局部状态，不要求业务状态每次变化都重建整棵菜单树。**

P0 patch 字段按平台共同能力冻结为：

- `label`
- `enabled`
- `visible`

`checked`、radio、submenu、accelerator、badge 与 arbitrary reorder 均不进入 P0。

未知字段必须返回明确错误，不静默忽略。

### 8.3 应用退出

推荐：

```js
await automation.app.quit();
```

它必须进入统一 App Shell / Execution shutdown 流程，不能直接绕开资源释放调用平台 `exit()`。

## 9. Action 分发链路

正确链路：

```text
Native tray/menu callback
        |
        v
App Shell
        |
        | stable actionId
        v
Runtime-safe Action Dispatcher
        |
        v
CURRENT Execution
        |
        v
main.js registered handler
```

强约束：

- 一个 App Shell 对应当前应用的一个业务 Execution；
- 菜单 Action 不创建新的 Goja Runtime；
- 不通过 `Command.run()`、进程启动或再次调用 OpenDesk CLI 来执行同一个 App 的 Action；
- Native UI thread 不直接执行 JS；
- native callback 必须切换 / 投递到当前 Runtime 允许的线程和事件机制；
- 应保持 Action 的可解释顺序，避免并发回调直接进入同一个 JS Runtime；
- Execution 已进入 shutdown 后必须拒绝新 Action。

## 10. Tray 主激活语义

跨平台业务语义使用 `primaryAction`，而不是把 left-click / right-click 暴露为主要公共契约。

例如：

```json
"primaryAction": "opendesk.open"
```

`opendesk.open` 是 App Shell 保留的系统动作：它先显示并聚焦 `window.mainId` 对应的现有 Custom UI window，再把同一个 `{id:"opendesk.open", source}` event 投递给当前 Runtime，使业务能够观测 tray primary click 与 second-instance activation，但不能覆盖系统 reopen 行为。业务 `primaryAction` 则按普通 action 分发。

平台实现可映射为：

- Windows：Notification Area icon 的主激活动作 + context menu；
- macOS：`NSStatusItem` / menu bar item 的激活与 menu；
- 平台差异留在 native backend，不扩散到普通 Recipe。

## 11. 窗口关闭生命周期

### 11.1 `closeBehavior=hide`

```text
User closes main window
        |
        v
App Shell intercepts app-level close intent
        |
        v
hide existing Custom UI window
        |
        v
Execution + Tray remain alive
```

再次通过 Tray `primaryAction` / Open 菜单显示原窗口。

### 11.2 `closeBehavior=quit`

```text
User closes main window
        |
        v
App Shell begin shutdown
        |
        v
existing Execution cancellation / cleanup
        |
        v
Native UI + Tray teardown
        |
        v
process exit
```

P0 不创建第三种模糊状态。

## 12. Single Instance

当 `singleInstance=true`：

```text
First launch
  -> acquire app-instance identity
  -> initialize App Shell
  -> initialize current Execution
  -> run main.js

Second launch
  -> detect existing primary instance
  -> send activate/reopen intent to primary App Shell
  -> exit before business Runtime initialization

Primary instance
  -> receive activate/reopen
  -> show/activate current app
  -> DO NOT rerun main.js
```

平台锁 / IPC 机制可以不同，但产品语义必须相同。

实例 identity 固定来自规范化 manifest `id` 的 SHA-256：

- Windows：每用户 `Local\\OpenDesk.App.<hash>` named mutex + current-user-only ACL named pipe；
- macOS：用户私有状态目录中的 `flock` lease + Unix domain socket，目录、lock、socket 均拒绝扩大到其他用户；
- primary 必须先取得 identity，随后且只创建一次业务 Execution；secondary 发送 activation 并收到 ACK 后，在 `execution.Run` 之前退出；
- primary 进入 `QUITTING` 后拒绝并 NACK activation，绝不复活或重建 Runtime。

## 13. Shutdown 顺序

退出必须是单向、幂等的生命周期：

```text
RUNNING
   |
   v
QUITTING
   |- stop accepting new tray/menu actions
   |- detach / disable native callbacks
   |- request cancellation of current execution/tasks
   |- close Custom UI/native windows through existing lifecycle
   |- destroy tray/menu resources
   |- release single-instance resources / IPC
   v
STOPPED
```

正式 shutdown 只使用现有 Execution 生命周期：

```text
AppShell.RequestQuit
  -> CAS RUNNING -> QUITTING；拒绝 action / activation
  -> cancel App Mode parent context
  -> RuntimeLifecycle.CancelAsync（含 AppShell listener/queue、Custom UI、native tray teardown）
  -> EventLoop.Terminate
  -> RuntimeLifecycle.Wait join workers
  -> release single-instance IPC / lease
  -> process exit
```

AppShell 是 `RuntimeLifecycle` 的正式资源，必须进入 `AsyncCounts`、`ResourceCounts`、`CancelAsync` 与 `Wait`。监听器本身使 App Mode 顶层脚本完成后继续存活；资源变化必须通过 completion wake/gate 通知 runner 重新检查，禁止永久 `setInterval`、sleep loop 或 1ms polling。不能在 App Shell 内复制一套任务终止系统。

至少保证：

- 重复 `quit()` 不崩溃；
- Tray 回调不能在 Execution 销毁后进入 JS；
- Native UI 关闭与 Runtime 退出不存在明显 use-after-free；
- 第二实例的 IPC / activation 不会在主实例退出中途复活 Runtime。

## 14. 错误与校验策略

Manifest 属于应用启动契约，应尽早校验并给出可定位错误。

P0 至少检查：

- JSON 语法；
- 缺失 / 无效 `entry`；
- 重复 menu ID；
- 保留 `opendesk.*` 前缀冲突；
- 菜单 `action` 类型错误；
- `primaryAction` 无法解析；
- `menuMode` 不受支持；
- `closeBehavior` 不受支持；
- `closeBehavior=hide` 但没有可靠 reopen 路径；
- tray icon 路径逃逸应用包或资源不存在；
- tray icon 空文件、错格式、损坏内容、非法尺寸/透明度或 ICO frame range；
- 平台创建 Tray / Menu 失败。

不要把结构性配置错误静默降级成“没有菜单”。

## 15. P0 / P1 边界

### 15.1 P0 必须完成

- App Manifest 解析与校验；
- App Mode 的入口解析；
- Windows Tray；
- macOS Menu Bar / status item；
- 默认 Open / Show + Quit 系统菜单；
- Manifest 静态业务菜单 merge；
- 稳定 ID 的动态菜单更新；
- Tray / Menu Action 分发到同一个当前 Execution；
- `closeBehavior=hide|quit`；
- `singleInstance=true|false` 的明确行为；
- 幂等 shutdown；
- Windows / macOS 测试或平台可执行 smoke coverage；
- JS API 文档、Manifest 文档、可运行 example；
- 现有 CLI / Custom UI 回归验证。

### 15.2 P1 再考虑

- 多级 submenu；
- accelerator / keyboard shortcut；
- Runtime 任意 insert / remove / reorder menu item；
- richer checked / radio / badge / icon-per-item；
- 平台专属高级菜单能力；
- Linux；
- richer lifecycle events；
- installer / self-update；
- OS login startup；
- manifest schema versioning 的复杂迁移机制；
- environment-variable based deployment defaults。

## 16. 向后兼容

以下行为属于不可回归项：

- 没有进入 App Mode 时，不要求存在 `opendesk.app.json`；
- `./dist/opendesk -script xxx.js` 继续按照现有 Execution 路径运行；
- 普通 `.js` 不因为加入 App Shell 自动变成常驻进程；
- 现有 `automation.ui.*` API 不因 App Shell 改名或复制；
- 当前通知、Recorder、桌面自动化 API 不依赖 Tray 才能工作；
- App Menu Action 不能通过再次启动 CLI 来实现。

## 17. 平台实现原则

P0 不使用当前 `fyne.io/systray v1.11.0` indirect legacy dependency：其 primary-click、错误传播、丢事件和全局 loop/delegate 契约无法满足本设计。两端使用平台原生 backend。

### Windows

由 `opendesk` 主 Go process 的 App Shell 持有 Notification Area icon、menu 和 single-instance，而不是 Custom UI sidecar 或 `cmd/opendesk-status`。backend 使用专属 Windows message-loop owner；窗口 user close 在 `FormClosing` / `NativeForm.OnFormClosing` 阶段拦截，`hide` 时设 `Cancel=true` 并隐藏原窗口。script/session/programmatic close 带明确 origin 并真正关闭。

必须验证：

- 与 WebView2 STA / COM 生命周期兼容；
- Tray callback 不直接进入 Goja；
- Explorer / tray 重建场景至少不会导致应用崩溃；
- 单实例 IPC 不阻塞主 GUI loop。

### macOS

由 `opendesk` 主 Go process 的 App Shell 持有 `NSStatusItem` / `NSMenu` 与 single-instance，不依赖 Custom UI sidecar。AppKit 状态栏和 UI mutation 必须位于 primordial main thread，Execution 可在 goroutine。窗口在 `windowShouldClose` 区分 origin：用户关闭且 `hide` 时 `orderOut` 并返回 `NO`；programmatic/session close 返回 `YES`；`windowWillClose` 只负责最终清理。

必须验证：

- `NSStatusItem` 生命周期与应用退出一致；
- callback 安全投递到 Runtime；
- 与 WKWebView / Custom UI 共存；
- 第二实例 activation 不重复运行入口脚本。

## 18. 测试矩阵

| 场景 | Windows | macOS | 必须结果 |
| --- | --- | --- | --- |
| 无 App Manifest 的 `-script` | Yes | Yes | 行为与当前版本一致 |
| 有效 Manifest 启动 | Yes | Yes | 创建一个 App Shell + 一个业务 Execution |
| 无效 Manifest | Yes | Yes | 启动阶段明确失败 |
| 默认系统菜单 | Yes | Yes | Open / Show 与 Quit 存在 |
| 业务菜单 merge | Yes | Yes | 顺序和 actionId 正确 |
| 点击业务菜单 | Yes | Yes | 当前 Execution 收到一次 Action |
| 连续点击菜单 | Yes | Yes | 不创建额外 Runtime，事件有序 |
| 动态更新菜单 label | Yes | Yes | 原菜单项原位更新 |
| `closeBehavior=hide` | Yes | Yes | 窗口隐藏，Runtime / Tray 存活 |
| `closeBehavior=quit` | Yes | Yes | 进入统一 shutdown |
| 第二次启动 | Yes | Yes | 激活已有实例，不 rerun `main.js` |
| 退出中的菜单点击 | Yes | Yes | 被拒绝 / 忽略且不崩溃 |
| 重复 quit | Yes | Yes | 幂等 |
| Custom UI coexistence | Yes | Yes | UI 与 Tray 生命周期无死锁 |
| icon missing / empty / wrong-format / corrupt | Yes | Yes | Execution 创建前指出具体 `tray.icons.*` 字段并失败 |
| icon traversal / symlink escape | Yes | Yes | 解析真实路径后拒绝 package 越界 |
| icon scaling / template tint | N/A | Yes | 18-point 比例缩放；真实浅色/深色菜单栏截图检查清晰、留白与无裁切 |
| ICO common DPI frames | Yes | N/A | portable 结构/解码测试；真机检查 Windows 实际 DPI 选择与显示 |

测试必须覆盖“Action 执行次数 / Runtime 实例数量”，不能只验证图标是否出现。

## 19. 建议实现分层

最终文件名应以当前源码组织为准，但职责建议保持：

```text
CLI / app-mode bootstrap
        |
        v
Manifest parser + validator
        |
        v
AppShell (platform-neutral state/lifecycle)
        |\
        | +--> SingleInstance bridge
        |
        +--> Tray/Menu abstraction
                 |-- Windows backend
                 `-- macOS backend
        |
        v
Runtime Action Dispatcher
        |
        v
automation.app binding
```

实现约束：

- 原生 App Shell / Tray 代码优先按仓库现有约束放在 `src/automation/*` 或与其一致的原生模块边界；
- 不把 OpenDesk 专用 App API 做成 `js/polyfills`；
- 先检查当前 CLI / Execution / binding / Custom UI 生命周期，再选择最小落点；
- 不为了抽象完整性创建新的大型 framework；
- 不创建第二套窗口对象；
- 不创建第二套 Execution 管理器。

## 20. 实施顺序

```text
current master / HEAD
        |
        v
read AGENTS.md + CLI + Execution + Custom UI/native UI baseline
        |
        v
freeze this design baseline
        |
        v
App Manifest parser / validator
        |
        v
platform-neutral App Shell lifecycle
        |
        +--> Windows Tray
        +--> macOS Menu Bar
        +--> Single Instance
        |
        v
same-Execution Action Dispatcher
        |
        v
JS Runtime binding / dynamic menu updates
        |
        v
closeBehavior + shutdown integration
        |
        v
tests + example + docs
        |
        v
Windows/macOS validation + CLI regression
```

实现过程中只有在当前真实代码与本设计发生硬冲突时才能调整公共契约；调整必须保持核心不变量，并在本文件记录原因和最终决定。

## 21. P0 验收标准

P0 完成必须同时满足：

- [x] Windows 与 macOS 都有真实 native Tray / Menu Bar 实现；
- [x] App Manifest 能声明入口、single instance、close behavior、tray/menu；
- [x] 配置错误有明确、可测试的失败；
- [x] 两端图标在 native host 启动前完成路径、格式、尺寸与损坏校验；
- [x] 默认系统菜单不能被错误配置移除 Quit；
- [x] 菜单 Action 进入当前 Execution，而不是启动第二个 Runtime；
- [x] `main.js` 在 single-instance 重复启动时不会再次运行；
- [x] Runtime 可以通过稳定 menu ID 更新已有菜单项；
- [x] `closeBehavior=hide` 能通过 Tray 可靠恢复窗口；
- [x] `closeBehavior=quit` 和 `automation.app.quit()` 汇入同一 shutdown；
- [x] shutdown 后没有 native callback 继续访问已销毁 Runtime；
- [x] 普通 `-script` 路径回归通过；
- [x] 至少有一个最小可运行 App Mode example；
- [x] 正式 API / Manifest 文档与实现一致；
- [x] 平台相关测试、静态构建检查和可执行 smoke test 结果被记录。

## 22. 冻结决定

以下决定在 P0 实施中视为冻结：

1. Tray / Menu Bar 是 **App Shell** 能力，不是 Recipe 自己创建的第二套 Runtime；
2. 一个 App 的菜单 Action 只分发给该 App 的**当前 Execution**；
3. Manifest 负责**初始结构**，Runtime 负责**有限动态状态**；
4. 动态菜单优先使用稳定 ID 的局部更新，不把整树重建作为常规业务 API；
5. 系统 Quit 必须始终可达；
6. `closeBehavior` 只冻结 `hide` 与 `quit`；
7. single-instance 的第二次启动只激活已有实例，不 rerun `main.js`；
8. Windows / macOS 对外提供统一业务语义，平台点击细节留在 native backend；
9. App Shell 必须接入已有 Runtime / Native UI shutdown，而不是另造生命周期；
10. 普通 JavaScript `-script` 执行路径保持兼容；
11. 原生 App Shell 能力不通过仓库专用 JS polyfill 实现；
12. P0 先实现最小可靠闭环，复杂菜单、安装器、自动更新等进入后续阶段。

---

本文件是 App Shell / Tray P0 的实现基线。后续代码审查应优先检查是否保持“一个 App Shell、一个当前业务 Execution、Action 不重启 Runtime”这一核心不变量，而不是仅检查 Tray 图标是否能够显示。
