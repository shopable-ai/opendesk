# App Shell、Tray / Menu Bar 与 Single-Instance 设计

> 状态：Design Baseline / Implementation Pending  
> 基线：`master@38ba981f11a87dcdd059d106e1663c2aeb9fee99`  
> 日期：2026-09-10  
> 范围：OpenDesk 可分发桌面脚本应用（App Mode）的 App Shell、系统托盘 / 菜单栏、菜单 Action、窗口关闭行为与单实例生命周期。  
> 兼容性：现有普通 JavaScript / CLI 执行路径必须保持不变。

## 1. 结论

本设计冻结以下核心边界：

> **OpenDesk App 的系统托盘属于 App Shell；Manifest 定义初始菜单，Runtime 可以动态更新菜单状态；菜单点击只向当前应用 Execution 分发 Action，不因为菜单项而启动新的脚本 Runtime。**

OpenDesk 继续保留现有脚本运行方式，同时新增可打包、可双击启动的 App Mode。App Mode 不是第二套 JavaScript Runtime，而是在现有 Execution 外增加一个轻量 App Shell，负责操作系统级应用生命周期和入口。

这里的 App Mode tray owner 与普通 `OpenDesk.app` HTTP 服务的 `cmd/opendesk-status` helper 不同。普通 macOS 服务状态项固定包含
Status、Scheduler、Developer 和 Quit；Developer 子菜单提供 **Open Inspector**、进程内 **Allow Inspector from LAN** checkbox
和 **Copy Inspector LAN URL**。helper 不持有 Inspector bearer/session，也不直接修改 server 内存；主进程启动时生成随机 control
token，仅通过 helper argv 传入，helper 经 `127.0.0.1:60844` 的内部 endpoint 查询／切换状态。LAN 选项不持久化，OpenDesk 重启
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
- Runtime 能按稳定菜单 ID 更新 label / enabled / visible / checked 等受支持状态；
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

当前 Custom UI 已提供 `automation.ui.createWindow()`、`show()`、`hide()`、`close()` 等窗口能力，并在 Windows 使用 WebView2、macOS 使用 WKWebView。页面 JavaScript 与 OpenDesk 自动化 Runtime 保持隔离。

本设计不复制这些窗口 API。App Shell 只决定应用级行为，例如窗口关闭后是隐藏还是退出；具体窗口仍由现有 `automation.ui` 管理。

按照仓库约束，原生 GUI / OS integration 应进入原生自动化宿主的适当模块（优先遵循现有 `src/automation/*` 拆分方式），而不是为了 JS 可调用就增加仓库专用 polyfill。

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
  "entry": "main.js",
  "singleInstance": true,
  "window": {
    "closeBehavior": "hide"
  },
  "tray": {
    "enabled": true,
    "icon": "assets/tray.png",
    "tooltip": "Example App",
    "primaryAction": "app.open",
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
- `tray`
  - 托盘 / 菜单栏配置。

### 7.2 Tray 字段

- `enabled: boolean`：是否创建系统托盘 / 菜单栏入口；
- `icon: string`：相对于应用包的资源路径；
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
- `action` 是业务 Action ID，不是文件名、JS 代码或 shell command；
- `id` / `action` 不允许使用保留的 `opendesk.*` 前缀；
- 重复 ID、无效类型、非法资源路径必须在应用启动阶段尽早失败；
- `primaryAction` 必须引用有效的业务 Action 或受支持的系统 Action；
- `closeBehavior=hide` 时必须存在可靠的重新打开入口。P0 推荐要求 `tray.enabled=true`，否则启动校验失败。

## 8. App Runtime API

最终 API 名称必须在实现时先对照当前 native binding 风格确认；以下名称冻结的是**业务语义**，不是要求无视仓库风格硬加名称。

推荐归属：`automation.app`。

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

P0 可支持的 patch 字段按平台共同能力裁剪，至少考虑：

- `label`
- `enabled`
- `visible`
- `checked`（只有两端实现都稳定时进入 P0，否则下放 P1）

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
"primaryAction": "app.open"
```

对应应用可以在当前 Execution 中调用既有 `automation.ui.show(windowId)`。

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

实例 identity 应来源于稳定的应用包身份，而不是仅依赖入口文件的临时绝对路径。P0 实现时应结合当前打包 / 启动结构选择最小可靠 identity，并记录在实现文档和测试中。

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

实现应尽量接入现有 OpenDesk shutdown / cancellation 路径，不能在 App Shell 内复制一套任务终止系统。

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

### Windows

建议使用现有 native Windows host 技术栈实现 Notification Area icon 与 native menu，并与当前 GUI / message loop 做最小集成。

必须验证：

- 与 WebView2 STA / COM 生命周期兼容；
- Tray callback 不直接进入 Goja；
- Explorer / tray 重建场景至少不会导致应用崩溃；
- 单实例 IPC 不阻塞主 GUI loop。

### macOS

建议基于 Cocoa `NSStatusItem` / `NSMenu` 实现，并复用当前需要的主线程 / Cocoa 生命周期。

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

- [ ] Windows 与 macOS 都有真实 native Tray / Menu Bar 实现；
- [ ] App Manifest 能声明入口、single instance、close behavior、tray/menu；
- [ ] 配置错误有明确、可测试的失败；
- [ ] 默认系统菜单不能被错误配置移除 Quit；
- [ ] 菜单 Action 进入当前 Execution，而不是启动第二个 Runtime；
- [ ] `main.js` 在 single-instance 重复启动时不会再次运行；
- [ ] Runtime 可以通过稳定 menu ID 更新已有菜单项；
- [ ] `closeBehavior=hide` 能通过 Tray 可靠恢复窗口；
- [ ] `closeBehavior=quit` 和 `automation.app.quit()` 汇入同一 shutdown；
- [ ] shutdown 后没有 native callback 继续访问已销毁 Runtime；
- [ ] 普通 `-script` 路径回归通过；
- [ ] 至少有一个最小可运行 App Mode example；
- [ ] 正式 API / Manifest 文档与实现一致；
- [ ] 平台相关测试、静态构建检查和可执行 smoke test 结果被记录。

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