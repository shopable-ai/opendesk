# OpenDesk Desktop Product Shell

> 状态：Design frozen / implementation pending
> 日期：2026-09-12
> 范围：OpenDesk 官方桌面应用的启动语义、统一 Tray/Menu、主界面产品命名、运行日志、Developer surface、Console presentation 与 Windows/macOS distribution entry。
> 依赖：`docs/architecture/app-shell-tray-menu.md` 继续作为 App Shell/framework contract；本文只定义 OpenDesk 官方产品如何组合这些能力。

## 1. 结论

OpenDesk 官方桌面应用收口为一个产品壳：

```text
OpenDesk Desktop App
├── App Shell / Tray
├── OpenDesk main UI
├── Recorder
├── Scheduler Center
├── Runtime Log
├── Developer tools
└── Official Shell
    ├── Homepage
    ├── Help
    └── Customize
```

冻结以下产品原则：

1. **双击正式 OpenDesk 图标即启动内置 App Mode。** 用户不需要知道 `-app`、`-allow-recorder-capture` 或 `-console-mode`。
2. **正式桌面启动默认不创建或显示系统 Terminal。**
3. **Logging 与 Console Window 分离。** 没有 Terminal 不等于没有日志；所有运行仍持续产生 execution artifacts。
4. **OpenDesk 只有一个系统 Tray/Menu owner。** Recorder、Scheduler、Developer、Official Shell 不再各自形成独立产品入口。
5. **用户可见产品文案不使用 `Script Runner`。** `Script Runner` 仅保留为内部工程名和兼容 action/class/file 名称。
6. **Recipe、Recorder、Scheduler 等后台执行不得因为运行而弹出多个系统 Console 窗口。**
7. **运行信息通过 OpenDesk 自己的“运行日志”窗口展示。** Terminal 只属于显式 CLI / 开发调用场景。
8. **Windows 正式 GUI entry 与 CLI console entry 分离，但共享同一 Runtime 核心。** macOS 可以继续使用同一个 signed bundle executable，通过 launch context 区分 Finder/Launchpad 与 CLI。

## 2. 启动语义

### 2.1 正式桌面启动

正式发行包包含 bundled App Mode：

```text
macOS
OpenDesk.app/Contents/Resources/AppMode/

Windows
app-mode/
```

双击应用图标、Finder/Launchpad 或 Windows Start Menu 启动时，Runtime 自动发现 bundled App Mode，并进入 OpenDesk 官方主应用。

产品语义等价于：

```text
OpenDesk Desktop Launch
→ bundled App Mode
→ trusted Recorder capability
→ App Shell
→ OpenDesk main UI
→ Scheduler runtime
→ persistent logs
```

它**不等价于**强制执行：

```text
-console-mode script
```

因为 `console-mode` 只控制终端输出选择，不决定是否显示系统 Terminal，也不决定日志是否落盘。

### 2.2 开发 / CLI 启动

开发者仍可以显式运行：

```bash
./dist/opendesk -app "$PWD/apps/opendesk" -allow-recorder-capture -console-mode script
```

这条命令用于本地开发和验证：

- 使用当前调用者 Terminal；
- 允许直接看到 Script/Runtime 输出；
- 继续支持 `normal/full/script/meta/summary/quiet/agent`；
- 继续支持 `-debug` 与 console categories；
- 不改变正式桌面启动默认无 Terminal 的产品行为。

### 2.3 Launch Mode、Console Presentation、Log Selection 分离

三者必须独立：

```text
Launch Mode
  决定运行哪个 App/Script。

Console Presentation
  决定是否存在系统 Terminal/Console window。

Log Selection
  决定输出和展示哪些 framework/meta/script/summary/error 信息。
```

禁止使用“是否显示 Terminal”作为“是否保存日志”的代理开关。

## 3. OpenDesk 主界面产品命名

### 3.1 用户可见文案

正式产品不再向用户展示 `Script Runner`：

```text
Tray action:   打开 OpenDesk
Window title:  OpenDesk
Main section:  自动化
```

主界面承担：

```text
OpenDesk
├── 当前自动化
├── 运行
├── 停止
├── 自动化列表
└── 运行日志入口
```

### 3.2 内部兼容名称

以下工程名称可以继续保留，不因为产品文案变化做无意义重构：

```text
runner.open
OpenDeskProductScriptRunner
apps/opendesk/script-runner/**
apps/opendesk/script-runner-simple.js
```

`opendesk.open` 与旧 `runner.open` 可以继续路由到同一个 `main` window，以避免破坏兼容；但 `打开 Script Runner` 不再作为可见菜单项。

## 4. 统一 Tray / Menu

推荐正式产品菜单：

```text
打开 OpenDesk
────────────────────
录制自动化
计划中心
新建计划…
运行日志…
────────────────────
开发者 >
    运行状态…
    打开 Inspector
    ────────────────
    允许 Inspector 从局域网访问
    复制 Inspector LAN 地址
    ────────────────
    打开日志目录
    调试信息 >
        普通
        详细
────────────────────
帮助与服务 >
    OpenDesk 官网
    帮助
    定制
────────────────────
退出 OpenDesk
```

### 4.1 菜单 ownership

```text
App Shell / framework owned
├── 打开 OpenDesk
├── 录制自动化
├── Developer
└── Quit

App package business menu
├── 计划中心
└── 新建计划…

OpenDesk product shell
├── 运行日志…
└── 帮助与服务
    ├── 官网
    ├── 帮助
    └── 定制
```

约束：

- Recorder 继续由 framework 注入，不写进普通 App manifest；
- Quit 继续由 App Shell 持有；
- 普通 App manifest 不因为 OpenDesk 官方产品需要 Developer/Official Shell 而扩展成复杂 submenu DSL；
- `opendesk.*` 保持 framework/system namespace；
- OpenDesk 官方产品的 product-only menu composition 可以在 shell/product composition layer 完成。

### 4.2 Scheduler 去重

最终只保留一个普通用户入口：

```text
计划中心
```

旧 `Open Scheduler` Web/HTTP 入口不得与新的 Scheduler Center 并列出现。

若旧 Web Scheduler 仍有开发价值，只允许迁入 Developer/diagnostic surface。

### 4.3 Main window lifecycle

保持：

```text
window.mainId = "main"
window.closeBehavior = "hide"
tray.primaryAction = "opendesk.open"
```

关闭主窗口只隐藏，不退出 OpenDesk。

主窗口隐藏后仍必须可使用：

- Recorder；
- Scheduler Center；
- 新建计划；
- 运行日志；
- Developer tools；
- 官网 / 帮助 / 定制；
- 后台 Scheduler 与正在运行的 automation。

只有 `退出 OpenDesk` 才进入 App lifecycle cancel/teardown。

## 5. 运行日志

### 5.1 产品定位

新增单实例 `运行日志` 窗口，作为普通用户和开发者共享的 runtime observability surface。

它不是第二套 Runtime，也不是嵌入式系统 Terminal。

```text
Runtime / Executions
        │
        ├── stdout.log
        ├── stderr.log
        ├── events.ndjson
        ├── summary.json
        └── agent_summary.json
                │
                v
        OpenDesk 运行日志
```

### 5.2 P0 数据源

优先复用现有 execution artifacts：

```text
stdout.log
stderr.log
events.ndjson
summary.json
agent_summary.json
script_snapshot.js
```

不要为了 P0 先建设复杂中央 Log Hub。

### 5.3 P0 行为

必须支持：

- Tray `运行日志…`；
- 主界面/工具条可增加日志入口；
- 单实例 window；
- close 后 hide/reopen；
- 重复点击复用已有窗口；
- 当前运行名称、Execution ID、状态、开始时间、结束结果；
- 普通视图展示 script/error/summary 与关键运行状态；
- Developer 详细视图展示 framework/meta 与必要 Runtime 状态；
- 打开日志目录；
- 日志窗口关闭不能停止 execution；
- 日志持久化不能依赖窗口是否打开。

P1 再考虑：

- 多 Execution 实时聚合；
- 搜索；
- 过滤；
- 导出；
- Scheduler/Recorder 专用视图；
- 长期日志轮转策略 UI。

## 6. Developer surface

Developer menu 不再只是 Inspector 的容器，而是 OpenDesk runtime diagnostic surface：

```text
开发者
├── 运行状态…
├── 打开 Inspector
├── 允许 Inspector 从局域网访问
├── 复制 Inspector LAN 地址
├── 打开日志目录
└── 调试信息
    ├── 普通
    └── 详细
```

`运行状态` 建议展示：

```text
OpenDesk version
Package ID
PID
App execution ID
Runtime endpoint
Scheduler status / endpoint
Recorder availability / permission status
UI host status
App data root
Current automation execution
```

这些信息用于诊断，不应该成为普通用户主界面噪声。

## 7. Console / Terminal policy

### 7.1 正式桌面应用

默认：

```text
System Terminal window: OFF
Persistent logs:         ON
Runtime Log UI:          on demand
```

主应用、Recorder、Scheduler、Recipe child execution 不得各自弹出系统 Terminal。

### 7.2 CLI / 开发模式

默认：

```text
Caller Terminal:         ON
Persistent logs:         ON
Runtime Log UI:          optional
```

CLI 用户明确选择运行命令，因此 Terminal 输出继续是正式受支持界面。

## 8. Windows distribution entry

Windows 正式发行不应采用“启动 console executable，然后立即 hide console window”的方案。

目标结构：

```text
OpenDesk.exe
  desktop GUI entry
  no console window

opendesk.exe
  CLI/developer entry
  console subsystem
```

两者共享同一 Runtime core、App Mode contract、Scheduler、Recorder 与 execution system。

要求：

- Start Menu / desktop shortcut 使用 `OpenDesk.exe`；
- CLI 文档使用 `opendesk.exe`；
- GUI entry 自动发现 bundled `app-mode/`；
- child recipe 不弹额外 console window；
- stdout/stderr 继续通过 pipe/artifacts 捕获；
- 不复制两套 runtime business logic；
- Windows GUI/CLI entry 必须有真实 Windows build/live evidence 后才能标记完成。

如果实现阶段发现双 executable 会显著增加长期维护成本，可以采用一个共享 core + 极薄 GUI launcher 的方式；但用户可见结果仍必须满足“正式 GUI 无 console、CLI 有 console”。

## 9. macOS distribution entry

macOS 不需要两套 Runtime executable。

继续保持：

```text
OpenDesk.app/Contents/MacOS/opendesk
```

Finder/Launchpad：

```text
.app launch
→ bundled App Mode
→ no Terminal
```

CLI：

```text
./dist/opendesk ...
→ bundle 内同一 signed executable
→ 继承调用者 Terminal
```

这种设计同时保持稳定的 app identity / privacy permission identity 与 CLI 开发体验。

## 10. Logging 与 writable data

正式 bundle 是只读产品资源。

运行数据继续写入可写 App data root，例如：

```text
~/.opendesk/apps/com.opendesk.desktop/
```

运行日志与 artifacts 不得写回 `OpenDesk.app/Contents/Resources/AppMode` 或 Windows staged app-mode package。

显式 `-log-dir` 继续作为开发/CLI override。

## 11. 实施优先级

### P0

- 移除用户可见 `打开 Script Runner`；
- Tray system action 使用 `打开 OpenDesk`；
- Window title `OpenDesk Script Runner` → `OpenDesk`；
- 页面 `Script Runner` → `自动化`；
- 保留内部 `runner.open` 兼容；
- 统一 Tray menu composition；
- Recorder / Scheduler / Developer / Official Shell 不丢失；
- 新增单实例 `运行日志`；
- 正式桌面启动默认无 Terminal；
- child recipe 无额外 Console；
- Windows GUI/CLI entry 分离；
- macOS Finder/Launchpad 与 CLI launch context 正确；
- 完成真实 UI click-level acceptance。

### P1

- Runtime Log Hub；
- 更完整多 Execution 过滤；
- 日志搜索、复制、导出；
- Marketplace / Professional；
- 更完整 developer diagnostics。

## 12. 明确非目标

本轮不要：

- 重构 Recorder 目录；
- 重写 Script Runner controller；
- 因产品文案变化全仓重命名 `runner`；
- 新建第二套 execution/runtime；
- 新建第二个 Tray；
- 为普通 App manifest 增加复杂 submenu DSL；
- 建设完整 IDE Console；
- 重新设计 Scheduler backend；
- 重新设计 App Package Schema；
- 重新设计 Runtime Endpoint Allocation。

## 13. 验收标准

只有满足以下条件才能认为本设计完成：

1. 双击正式 OpenDesk 图标，无需 CLI flags，直接进入 bundled OpenDesk App Mode。
2. 正式桌面启动不出现系统 Terminal/Console window。
3. CLI `./dist/opendesk -app ...` 继续正常输出到调用者 Terminal。
4. Tray 只有一个 OpenDesk owner。
5. `打开 OpenDesk` 复用现有 `main` window，不创建第二 App execution。
6. 用户可见菜单/窗口不再出现 `Script Runner`。
7. Recorder 可打开、关闭、再次打开，capture permission 行为不回归。
8. Scheduler Center 可打开、关闭后重建/复用，并连接真实 Scheduler backend。
9. 运行日志可打开、关闭、再次打开，并展示真实 execution output/artifacts。
10. 主窗口隐藏后 Recorder、Scheduler、运行日志、帮助/定制仍可使用。
11. 执行 automation/recipe 不弹出新的系统 Console window。
12. stdout/stderr/events/summary 在无 Terminal 时仍正确落盘。
13. Developer Inspector/LAN controls/运行状态/日志目录入口正确。
14. Quit 能停止 App lifecycle，并正确 teardown Tray/UI/Scheduler/Recorder ownership。
15. Windows GUI entry 与 CLI entry 有真实 Windows evidence；macOS Finder/Launchpad 与 CLI 两条路径有真实 macOS evidence。
16. 不覆盖并行会话改动，不回退当前 master。

## 14. 与其他文档关系

- `docs/architecture/app-shell-tray-menu.md`：App Shell/framework menu、single-instance、manifest 基础契约；
- `apps/opendesk/README.md`：官方 App Mode package 当前实现和开发/发行使用说明；
- `docs/architecture/official-shell-commercial-entrypoints.md`：官网、帮助、定制、商店、专业版等官方商业入口；
- Runtime endpoint / Scheduler concurrency / App Package Schema 等已有设计继续独立，不在本文重复定义。

若本文与旧文档中的**OpenDesk 官方产品可见菜单或产品命名**冲突，以本文为新的产品级目标；若涉及普通 App Mode/framework contract，则仍以对应底层架构文档为准。
