# App Shell、Tray / Menu Bar 与 Single-Instance 设计

> 状态：App Shell P0 implemented / Localization L0 Native Language Menu implementation complete / platform-live language-switch qualification pending  
> Verification boundary：App Mode 单实例仍由平台 lease / activation transport 负责；Framework Runtime endpoint 分配与传播见 [Runtime Endpoint Allocation](runtime-endpoint-allocation.md)。  
> 日期：2026-09-15  
> 范围：OpenDesk 可分发桌面脚本应用（App Mode）的 App Shell、系统托盘 / 菜单栏、菜单 Action、窗口关闭行为、单实例生命周期、localized presentation 与 Native Language Menu refresh。  
> 兼容性：现有普通 JavaScript / CLI 执行路径必须保持不变。  
> 验证边界：macOS 已完成既有真实 Menu Bar、窗口与 single-instance live；本次 Localization L0 的语言切换真机 qualification 尚未执行；Windows 原生 Tray / IPC 已完成既有目标系统构建覆盖，语言切换真机 live 仍待本地阶段验证。

## 1. 结论

本设计冻结以下核心边界：

> **OpenDesk App 的系统托盘属于 App Shell；Manifest 定义初始菜单，Runtime 可以动态更新菜单状态；菜单点击只向当前应用 Execution 分发业务 Action，不因为菜单项而启动新的脚本 Runtime；产品语言动作由 App Shell 自己消费，不进入业务 JavaScript。**

OpenDesk 继续保留现有脚本运行方式，同时提供可打包、可双击启动的 App Mode。App Mode 不是第二套 JavaScript Runtime，而是在现有 Execution 外增加一个轻量 App Shell，负责操作系统级应用生命周期和入口。

Localization 不改变上述生命周期：App Shell 在构建 native menu 之前通过 `pkg/localization` 将 Manifest `labelKey` / OpenDesk-owned menu key 解析为普通字符串；macOS / Windows native backend 不读取 JSON catalog，也不拥有 locale fallback 规则。语言偏好与解析的正式 Source of Truth 见 [Product Localization Architecture](product-localization.md)。

Repository-owned OpenDesk product menu additionally owns a native Language submenu. Its stable locale IDs are intercepted inside App Shell, persisted through the same Locale Core, then used to refresh localization-owned presentation while preserving Runtime-owned menu state.

这里的 App Mode tray owner 与普通 `OpenDesk.app` HTTP 服务的 `cmd/opendesk-status` helper 不同。普通 macOS 服务状态项固定包含 Status、Scheduler、Developer 和 Quit；Developer 子菜单提供 **Open Inspector**、进程内 **Allow Inspector from LAN** checkbox 和 **Copy Inspector LAN URL**。helper 不持有 Inspector bearer/session，也不直接修改 server 内存；主进程启动时生成随机 control token，仅通过 helper argv 传入，helper 经 parent 注入的 Framework loopback endpoint 查询／切换状态。LAN 选项不持久化，OpenDesk 重启恢复关闭。这组框架 Developer 动作不进入 App Mode manifest/action namespace。

```text
OpenDesk App / executable
        |
        v
+---------------------------+
| App Shell                 |
| - manifest                |
| - localization bridge     |
| - native language actions |
| - single instance         |
| - tray / menu bar         |
| - app lifecycle           |
+-------------+-------------+
              |
              | business actionId / lifecycle event
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

如果直接把 Tray 做成 Recipe 内部对象，或者让每个菜单项重新启动脚本，会带来多个 Execution、状态复制、资源泄漏、重复任务、退出竞态和平台行为不一致。因此需要冻结职责边界。

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

Localization L0 additionally requires:

- OpenDesk-owned presentation and Manifest `labelKey` resolve through one Locale Core;
- official language submenu is translated into the active UI locale and exposes `auto / zh-CN / en-US` without extending the public manifest submenu contract;
- locale action IDs stay stable and never enter business JavaScript;
- a preference change persists first, then refreshes the current native menu without restart;
- locale refresh changes presentation only and preserves Runtime-owned state.

## 4. 非目标

P0 / Localization L0 不解决：

- 创建另一套 Recipe Runtime、Replay Runtime 或后台 Worker Runtime；
- 让菜单项直接指定另一个 `.js` 并启动独立 Execution；
- 用 Node.js `child_process` 作为 App Shell；
- 在 JS polyfill 中实现 OpenDesk 专用原生 Tray；
- Linux Tray；
- 对第三方 App 开放复杂 recursive submenu DSL；
- arbitrary checked/radio/accelerator/badge/reorder public menu API；
- 安装器、自动更新、代码签名、Protected Recipe Package 的完整分发流程；
- 浏览器式生命周期 API；
- 用环境变量作为正式应用 Manifest 的唯一配置载体；
- 在 native backend 中实现第二套 catalog loader / locale resolver；
- 在 L0 中全面迁移 AI Assistant、Scheduler、Recorder、Permissions、Runtime Log、Measurement 等 Custom UI 页面；
- 扩展超出 L0 固定的 `Language → auto / 简体中文 / English` 语言选项或为其引入另一套 preference store。

这些能力可以后续叠加，但不能改变 Execution 与 App Shell 边界。

## 5. 与当前仓库能力的关系

当前 Custom UI 已提供 `ui.createWindow()`、`show()`、`hide()`、`close()` 等窗口能力，并在 Windows 使用 WebView2、macOS 使用 WKWebView。页面 JavaScript 与 OpenDesk 自动化 Runtime 保持隔离。

本设计不复制这些窗口 API。App Shell 只决定应用级行为，例如窗口关闭后是隐藏还是退出；具体窗口仍由现有 `automation.ui` 管理。

按照仓库约束，原生 GUI / OS integration 由 Go `automation/` 与平台 native owner 持有，而不是为了 JS 可调用就在 `polyfills/` 复制同名 native global。

Localization Core 由 `pkg/localization` 持有；App Shell 只通过稳定 helper 消费最终文本。Native owner 继续只处理 platform UI，不获得 catalog 文件路径或 translation lookup 职责。

## 6. 三层菜单模型

菜单由三个层次组成：

1. **OpenDesk System Menu**：框架保留的系统动作，例如打开 / 显示应用、语言和退出；
2. **Manifest Business Menu**：`opendesk.app.json` 中声明的初始业务菜单；
3. **Runtime State**：当前 Execution 对已有菜单项进行动态状态更新。

普通 Script App 的 P0 merge 语义仍为：

```text
Open / Show
----------------
<business menu items from manifest>
----------------
Quit
```

Repository-owned OpenDesk product additionally composes Developer、Language、Help 等 recursive native items. This recursive shape is an internal `nativeMenuItem.Children` contract and is not added to third-party `opendesk.app.json`.

在 native backend 接收菜单树之前，presentation 经过 Localization Core：

```text
system presentation key / Manifest labelKey
        ↓
Locale Core
        ↓
resolved label string
        ↓
nativeMenuItem
        ↓
Windows / macOS backend
```

业务菜单不能通过错误配置让应用失去退出入口。`Quit` 为框架保留项。

保留 `opendesk.*` 作为系统 Action / Menu ID 前缀，应用 Manifest 不得声明该前缀。翻译只改变 label，不改变机器 ID。

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
  - 必填、稳定的 package identity；P0 使用小写 reverse-DNS 形式；
  - single-instance key 只来自规范化后的 `id` 的 SHA-256；
  - `id` 改变表示另一个应用身份。
- `entry: string`
  - App Mode JavaScript 入口；
  - 它是 App Mode 契约，不改变已有 `-script` 参数。
- `singleInstance: boolean`
  - P0 推荐默认 `true`；
  - `true` 时第二实例不得初始化新的业务 Execution。
- `window.closeBehavior: "hide" | "quit"`
  - `hide`：关闭主窗口仅隐藏，App Shell 保持运行；
  - `quit`：关闭行为进入应用退出流程。
- `window.mainId: string`
  - 必填；必须与入口脚本创建的稳定 Custom UI window `id` 一致；
  - `opendesk.open` 显示并聚焦这个现有窗口。
- `tray`
  - 托盘 / 菜单栏配置。

### 7.2 Tray 字段

- `enabled: boolean`：是否创建系统托盘 / 菜单栏入口；
- `icons.windows: string`：Windows Notification Area 使用的真实 `.ico` 包内相对路径；
- `icons.macos: string`：macOS Menu Bar 使用的真实正方形 PNG 包内相对路径；
- `tooltip: string`：平台支持时显示；
- `primaryAction: string`：托盘主激活动作对应的业务 Action ID；
- `menuMode: "merge"`：P0 只冻结 `merge`；
- `menu: array`：静态初始菜单。

两端 icon 均在创建 native host 前完成 package containment、格式和内容验证。Windows backend 按当前 DPI 的 small-icon metrics 选择 ICO frame；macOS 使用 18-point proportional-down template image 语义。

### 7.3 菜单项

Legacy label continues to work:

```json
{
  "id": "sync.now",
  "label": "Sync now",
  "action": "sync.now",
  "enabled": true,
  "visible": true
}
```

Localization L0 adds optional `labelKey`:

```json
{
  "id": "open-scheduler-center",
  "labelKey": "menu.schedulerCenter",
  "label": "计划中心",
  "action": "scheduler.center"
}
```

`labelKey` can also be used without `label`; a normal item requires at least one. `schemaVersion` remains `1`.

Separator:

```json
{ "type": "separator" }
```

Design requirements:

- Runtime-updateable items have stable unique `id`;
- `action` may be reused; `event.id` is the action, not the native item ID;
- `labelKey` is presentation only and cannot replace `id` / `action`;
- no-action status item must remain disabled;
- separator cannot carry `labelKey`, label, ID or action;
- app manifests cannot claim reserved `opendesk.*` IDs/actions except documented first-party resource exceptions;
- `primaryAction` resolves to a declared business action or `opendesk.open`;
- `closeBehavior=hide` requires a reliable tray reopen path.

Manifest presentation lookup order is:

```text
resolved locale
→ product fallback locale
→ legacy label
→ safe key representation
```

### 7.4 Package root 与资源边界

- package root is canonicalized with real-path semantics;
- `entry` and icon paths must stay inside the package root;
- reject absolute paths, traversal, missing resources and symlink escapes;
- icons are validated before business Execution/native host creation;
- both platform resources are explicit; L0 does not promise automatic PNG↔ICO conversion.

### 7.5 App Mode CLI 边界

- unique entry is `-app <directory>`;
- `-app` is mutually exclusive with direct script/HTTP/vision/native/helper modes;
- ordinary Script/inline/stdin/HTTP modes do not auto-discover app manifests;
- App Mode owns a separate execution request without changing process cwd;
- single-instance acquire/activation decision occurs before `execution.Run`.

## 8. App Runtime API

Formal ownership is native `automation.app`. Existing global `App` continues to mean external desktop-application control. Ordinary Script Mode may expose disabled capability metadata but does not create tray or persistent App Mode semantics.

### 8.1 Action 订阅

```js
automation.app.onAction((event) => {
  if (event.id === "sync.now") {
    runSync();
  }
});
```

P0 event includes at least:

```js
{
  id: "sync.now",
  source: "tray-menu"
}
```

Business code does not depend on platform selector/click names.

### 8.2 动态菜单更新

```js
await automation.app.updateMenuItem("status", {
  label: "Status: Running",
  enabled: false
});
```

Core principle: **use stable menu IDs for local state patches; normal business state changes do not rebuild the whole tree.**

P0 patch fields remain:

- `label`
- `enabled`
- `visible`

Unknown fields fail explicitly. Public checked/radio/submenu/accelerator/badge/reorder remain outside this API.

Localization L0 does not widen that public patch contract. A locale change uses the product-owned App Shell path and updates only localization-owned labels. Existing `enabled` / `visible` values are not reset; arbitrary Runtime-owned dynamic labels remain Runtime-owned. Debug `Normal/Detailed` selection is preserved while its base text is retranslated.

### 8.3 应用退出

```js
await automation.app.quit();
```

It enters the unified App Shell / Execution shutdown path and must not bypass cleanup via a platform `exit()`.

## 9. Action 分发链路

Business actions:

```text
Native tray/menu callback
        |
        v
App Shell
        |
        | stable business actionId
        v
Runtime-safe Action Dispatcher
        |
        v
CURRENT Execution
        |
        v
main.js registered handler
```

Locale actions are intentionally different product-system actions:

```text
Native Language menu callback
        |
        v
App Shell NativeHost localization adapter
        |
        +--> SetLocalePreference + persist
        +--> resolve new presentation
        `--> refresh native menu labels

(no JavaScript business dispatch)
```

Stable locale IDs:

```text
opendesk.locale.auto
opendesk.locale.zh-CN
opendesk.locale.en-US
```

Strong constraints:

- one App Shell corresponds to one current business Execution;
- business menu actions do not create Goja runtimes or relaunch the CLI;
- Native UI thread does not execute JavaScript;
- callbacks safely cross to Runtime-owned event mechanisms;
- shutdown rejects new actions;
- locale action IDs never enter business handlers and are never localized.

## 10. Tray 主激活语义

Cross-platform semantics use `primaryAction`, not public left/right-click details.

`opendesk.open` first shows/focuses `window.mainId`, then exposes the same open event to the current Runtime for observation; business code cannot replace the system reopen behavior.

Platform mapping remains native:

- Windows Notification Area icon + context menu;
- macOS `NSStatusItem` / menu;
- platform click details do not leak into ordinary Recipe code.

## 11. 窗口关闭生命周期

### 11.1 `closeBehavior=hide`

```text
User closes main window
→ App Shell intercepts app-level close intent
→ hide existing Custom UI window
→ Execution + Tray remain alive
```

Tray Open restores the original window.

### 11.2 `closeBehavior=quit`

```text
User closes main window
→ App Shell begin shutdown
→ existing Execution cancellation / cleanup
→ Native UI + Tray teardown
→ process exit
```

P0 does not create a third ambiguous state.

## 12. Single Instance

When `singleInstance=true`:

```text
First launch
  -> acquire app-instance identity
  -> initialize App Shell
  -> initialize current Execution
  -> run main.js

Second launch
  -> detect existing primary instance
  -> send activate/reopen intent
  -> exit before business Runtime initialization

Primary instance
  -> receive activate/reopen
  -> show/activate current app
  -> DO NOT rerun main.js
```

Platform mechanisms differ, but product semantics do not:

- Windows: per-user named mutex + current-user-only named pipe;
- macOS: user-private `flock` lease + Unix domain socket;
- primary acquires identity before creating the one business Execution;
- secondary waits for activation ACK and exits before `execution.Run`;
- `QUITTING` primary rejects activation and never resurrects Runtime.

## 13. Shutdown 顺序

Shutdown is one-way and idempotent:

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

Formal path:

```text
AppShell.RequestQuit
  -> CAS RUNNING -> QUITTING
  -> cancel App Mode parent context
  -> RuntimeLifecycle.CancelAsync
  -> EventLoop.Terminate
  -> RuntimeLifecycle.Wait
  -> release single-instance IPC / lease
  -> process exit
```

AppShell is a formal `RuntimeLifecycle` resource and participates in async/resource counts, cancellation and wait. It does not own a second task-termination system.

Locale refresh work is serialized with native menu updates; teardown stops accepting new locale callbacks and joins in-flight refresh before destroying native resources.

## 14. 错误与校验策略

Manifest structural errors fail early. P0 checks include JSON syntax, entry/resources, duplicate menu IDs, reserved namespace conflicts, action types, missing `label`/`labelKey`, invalid `labelKey`, primary action, menu mode, close behavior, reopen requirements, icon containment/content and native tray creation.

Do not silently downgrade structural errors to “no menu”. Translation-resource errors are different: Locale Core follows its fail-soft fallback/diagnostic contract.

A locale preference persistence failure prevents that locale change from being treated as committed; it does not dispatch the locale ID as a business action. A native presentation refresh error is diagnosed instead of corrupting action identity.

## 15. P0 / Localization L0 boundary

### 15.1 Implemented platform-neutral / repository contracts

- App Manifest parsing/validation and App Mode entry;
- Windows Tray and macOS Menu Bar/status item;
- Open/Show + Quit system menu;
- manifest business-menu merge;
- stable-ID runtime label/enabled/visible patching;
- same-Execution business action dispatch;
- hide/quit lifecycle and single-instance behavior;
- idempotent shutdown;
- Manifest `labelKey` and shared Locale Core;
- official OpenDesk recursive Developer / Language / Help product menu;
- stable `auto / zh-CN / en-US` locale actions;
- persisted locale switching and native label refresh;
- runtime state preservation during locale refresh;
- release packaging of both L0 catalogs.

### 15.2 Later / outside L0

- public third-party recursive submenu API;
- public checked/radio/badge/accelerator/menu-reorder abstractions;
- Linux tray;
- installer/self-update/login startup;
- full localization of non-native official Custom UI surfaces (L1);
- broader language set / advanced localization formatting.

## 16. 向后兼容

These are non-regression requirements:

- non-App Mode does not require `opendesk.app.json`;
- `./dist/opendesk -script xxx.js` keeps the existing Execution path;
- ordinary `.js` does not become persistent because App Shell exists;
- existing `automation.ui.*`, notification, Recorder and desktop APIs do not depend on Tray;
- App Menu Action is never implemented by relaunching CLI;
- old `label`-only manifest remains valid;
- locale switching does not change menu/action machine IDs;
- UI locale does not change AI conversation language.

## 17. 平台实现原则

P0 does not use the legacy indirect `fyne.io/systray` dependency for App Shell. Both platforms use native backends.

Both native backends consume already-resolved strings. They do not read `locales/*.json`, infer OS locale, persist preference or implement translation fallback.

### Windows

The main `opendesk` Go process owns Notification Area icon/menu/single-instance. The backend uses a dedicated Windows message-loop owner. User close with `hide` is intercepted before real form close; programmatic/session close remains real close.

For locale switching, the callback returns from the Win32 message-loop handler before App Shell performs `UpdateMenuItem` operations, preventing the message loop from synchronously waiting on itself. The visible tree is reconstructed from current localized presentation and native state when the menu opens.

Qualification must verify WebView2 STA/COM coexistence, Explorer tray recreation, single-instance IPC responsiveness, real language switching and restart persistence.

### macOS

The main `opendesk` Go process owns `NSStatusItem` / `NSMenu` and single-instance. AppKit mutation stays on the primordial main thread while Execution may run in a goroutine. User close/hide and programmatic/session close retain their existing origin semantics.

Product submenu parents receive stable internal native IDs and are registered in the AppKit menu-item index, so `Developer`, `Language`, `Debug`, `Help` and leaf labels can update in place without giving Objective-C any catalog responsibility.

Qualification must verify status-item lifecycle, callback safety, WKWebView coexistence, single-instance activation, real language switching and restart persistence.

## 18. 测试矩阵

| 场景 | Windows | macOS | 必须结果 |
| --- | --- | --- | --- |
| 无 App Manifest 的 `-script` | Yes | Yes | 行为与当前版本一致 |
| 有效 Manifest 启动 | Yes | Yes | 一个 App Shell + 一个业务 Execution |
| 无效 Manifest | Yes | Yes | 启动阶段明确失败 |
| 默认系统菜单 | Yes | Yes | Open / Show 与 Quit 存在 |
| 业务菜单 merge | Yes | Yes | 顺序和 actionId 正确 |
| legacy `label` only | Yes | Yes | 兼容 |
| `labelKey + label` | Yes | Yes | current → fallback → legacy |
| `labelKey` missing translation | Yes | Yes | safe fallback，action 不变 |
| Language submenu | Yes | Yes | active-UI-language title and choices; automatic state explains system/default/English-fallback resolution |
| 选择 English | Yes | Yes | persist `en-US`，当前 native menu 立即英文化 |
| 选择简体中文 | Yes | Yes | persist `zh-CN`，当前 native menu 立即中文化 |
| 选择 Automatic | Yes | Yes | persist `auto`，重新读取 OS locale；无对应 catalog 时以 English fallback 明示 |
| locale action dispatch | Yes | Yes | 不进入 JavaScript business sink |
| locale refresh state merge | Yes | Yes | enabled/visible/runtime labels/debug mode 保持 |
| restart persistence | Yes | Yes | 重启后仍使用 persisted preference |
| 点击业务菜单 | Yes | Yes | 当前 Execution 收到一次 Action |
| 连续点击菜单 | Yes | Yes | 不创建额外 Runtime，事件有序 |
| 动态更新菜单 label | Yes | Yes | 原菜单项原位更新 |
| `closeBehavior=hide` | Yes | Yes | 窗口隐藏，Runtime / Tray 存活 |
| `closeBehavior=quit` | Yes | Yes | 统一 shutdown |
| 第二次启动 | Yes | Yes | 激活已有实例，不 rerun `main.js` |
| 退出中的菜单点击 | Yes | Yes | 被拒绝 / 忽略且不崩溃 |
| 重复 quit | Yes | Yes | 幂等 |
| Custom UI coexistence | Yes | Yes | UI 与 Tray 生命周期无死锁 |
| icon invalid / escape | Yes | Yes | Execution 创建前明确失败 |
| icon scaling / template tint | N/A | Yes | 真机视觉验证 |
| ICO common DPI frames | Yes | N/A | portable test + real DPI verification |

Repository automated tests prove contracts and fake-native runtime switching. Real platform rows that depend on clicking native UI remain qualification tasks until corresponding local evidence exists.

## 19. 实现分层

```text
CLI / app-mode bootstrap
        |
        v
Manifest parser + validator
        |
        +--> Locale Core / preference persistence
        |
        v
AppShell (platform-neutral state/lifecycle)
        |\
        | +--> SingleInstance bridge
        | +--> Product locale-action adapter
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

Constraints:

- no OpenDesk-specific App API duplicate in `polyfills`;
- one Locale Core only;
- native backends do not duplicate localization logic;
- no second window object or Execution manager;
- no large framework/Event Bus solely for language switching.

## 20. Localization implementation sequence

Current L0 chain is:

```text
Locale Core
→ Manifest labelKey
→ ResolveMenuLabel
→ official catalogs + release closure
→ nativeMenuForManifest resolved strings
→ Language submenu with stable locale IDs
→ App Shell locale-action adapter
→ SetLocalePreference + persistence
→ native label refresh preserving Runtime state
→ automated contract tests
→ platform-live qualification
```

Language switching never bypasses `SetLocalePreference` and platforms never maintain their own preference.

## 21. P0 / L0 acceptance boundary

Core App Shell P0 contracts remain implemented. Localization L0 repository implementation additionally has:

- [x] shared Locale Core and OS resolver;
- [x] `labelKey` + legacy-label compatibility;
- [x] official zh-CN / en-US catalogs in release payload;
- [x] official language submenu localized to the active UI locale;
- [x] stable `opendesk.locale.auto / zh-CN / en-US` actions;
- [x] locale actions consumed outside business JavaScript;
- [x] preference persistence and immediate native presentation refresh;
- [x] selected-language presentation;
- [x] runtime `enabled` / `visible` / dynamic-label / debug-selection preservation contracts;
- [x] fake NativeHost automated coverage;
- [ ] macOS live switching / restart / release-package qualification;
- [ ] Windows live switching / restart / release-package qualification.

The unchecked platform-live items are intentionally delegated to the local qualification stage and must not be described as verified in this repository-only implementation pass.

## 22. 冻结决定

1. Tray / Menu Bar is **App Shell** capability, not a Recipe-created second Runtime.
2. Business menu actions target the app's **current Execution** only.
3. Manifest owns initial business structure; Runtime owns limited dynamic state.
4. Dynamic business state uses stable-ID local patches, not routine whole-tree replacement.
5. System Quit stays reachable.
6. `closeBehavior` remains `hide | quit`.
7. Single-instance secondary launch activates the existing instance and does not rerun `main.js`.
8. Windows/macOS expose unified product semantics; platform click details remain native.
9. App Shell joins existing Runtime/Native UI shutdown.
10. Ordinary `-script` remains compatible.
11. Native App Shell is not implemented through repository-specific JS polyfills.
12. Complex public menu APIs, installers and updates remain later work.
13. Manifest `labelKey` and OpenDesk-owned menu presentation resolve through `pkg/localization`; native backends never own a second locale/catalog system.
14. `id` / `action` are never localized and UI locale does not alter business dispatch.
15. Native Language Menu consumes the existing `SetLocalePreference` / resolved presentation and does not create a second preference store.
16. Locale action IDs are App Shell product-system actions and never enter JavaScript business handlers.
17. Locale refresh is presentation-only and preserves Runtime-owned state.

---

本文件是 App Shell / Tray P0 与 Localization L0 Native Menu 的实现基线。后续代码审查应优先检查“一个 App Shell、一个当前业务 Execution、业务 Action 不重启 Runtime、语言 Action 不进入 JS、Native backend 不复制 Localization Core、locale refresh 不丢 Runtime state”这些不变量，而不是只检查 Tray 图标或翻译文本是否能够显示。
