---
title: OpenDesk productization roadmap
description: Cross-session engineering baseline for turning OpenDesk from an automation runtime into a releasable desktop product platform.
---

# OpenDesk 产品化推进路线

> 状态：living coordination baseline  
> 日期：2026-09-12  
> 用途：跨对话、跨 Codex 会话记录产品化进度、下一阶段顺序、owner 边界和并行修改约束。  
> 注意：本文件不是任何子系统的详细设计文档；具体 contract 仍以对应 architecture 文档和当前源码为准。

## 1. 当前目标

OpenDesk 当前已经不只是“能运行 JavaScript 自动化脚本”的 Runtime。产品化目标是逐步形成：

```text
可安装/启动的桌面产品
    +
稳定 App Package Contract
    +
明确的用户数据与配置边界
    +
Recorder / Script Runner / Custom UI 等正式产品入口
    +
可诊断、可升级、可分发、可商业化的运行环境
```

当前推进原则：优先完成会影响所有后续产品能力的基础 contract，再叠加 Marketplace、License、Auto Update 等商业层能力。

## 2. 状态定义

本文使用以下状态：

- `IMPLEMENTED BASELINE`：已有源码/正式设计进入 master，但仍可能需要真实平台回归或后续增强；
- `IN VALIDATION`：实现已存在，正在做本地 build、live UI、回归和缺陷收口；
- `IN PROGRESS`：独立任务正在设计或实施，不能因为有会话在执行就提前标记完成；
- `NEXT`：推荐的下一项独立产品化任务；
- `LATER`：依赖前置 contract，不应现在提前做复杂实现。

## 3. 已形成的产品化基线

### 3.1 App Shell / Tray / Single Instance — IMPLEMENTED BASELINE

已形成正式 App Shell、系统 Tray/Menu Bar、action dispatch、single-instance 等基础设施。

相关设计：

- `docs/architecture/app-shell-tray-menu.md`
- `docs/architecture/app-mode-desktop-launch.md`

Owner 边界保持：

```text
pkg/appshell
= native tray/menu
+ manifest dispatch
+ shell lifecycle
+ single-instance infrastructure
```

产品业务 controller 不进入 `pkg/appshell`。

### 3.2 正式 OpenDesk App Mode 产品包 — IMPLEMENTED BASELINE

产品化迁移基线提交：

```text
6b64c03ab4cfbd70d2bfefd4e0a6245d99406eb3
feat(app): productize recorder and script runner
```

正式产品 owner：

```text
apps/opendesk/
```

`examples/app-mode/basic` 继续只是开发 fixture，不是最终发行产品。

### 3.3 Built-in Recorder ownership — IMPLEMENTED BASELINE

Recorder 已从 `examples/` 的 Runtime owner 中移出。

当前结构：

```text
internal/recorderbundle/
├── bundle.go
└── ui/
    ├── controller.js
    ├── controller-core.js
    ├── recording-history.js
    └── icons/
```

边界：

```text
bundle.go
= Go embed / materialize release resources

ui/*.js
= Recorder UI 正式 JavaScript 实现
```

不要重新把 `assets.go` 放回 `workflows/human-to-recipe/recording-console-simple/`，也不要把 Recorder JavaScript 改写为 Go。

Recorder process model 继续保持：

```text
main OpenDesk process
└── Recorder secondary execution
    └── shared Custom UI ProcessDriver
```

不是独立 child OpenDesk process。

### 3.4 Script Runner ownership — IMPLEMENTED BASELINE

正式 Script Runner controller owner：

```text
apps/opendesk/script-runner/controller.js
```

`apps/opendesk/script-runner-simple.js` 是产品层的启动适配器，不重新拥有 Script Runner 业务 controller；controller owner 仍是 `apps/opendesk/script-runner/`。

Recipe 执行模型继续保持：

```text
Script Runner UI
→ Command.run(System.getExecutablePath(), ["-script", ...])
→ child OpenDesk process
```

不要在没有专项设计的情况下改成 main-process recipe execution。

### 3.5 Official Shell commercial entrypoints — IMPLEMENTED BASELINE

官方发行产品已经开始区分：

```text
Official Shell
Application UI
Future Extension Actions
```

相关设计：

- `docs/architecture/official-shell-commercial-entrypoints.md`

当前优先保留 `帮助`、`定制` 等官方入口；Marketplace / Upgrade 只有在真实能力存在后再显示，不提前制造空商业入口。

### 3.6 Desktop launch / release staging — IMPLEMENTED BASELINE

当前已经形成：

- macOS `APP_MODE_PACKAGE` → `OpenDesk.app/Contents/Resources/AppMode/`；
- Windows portable `-AppModePackage` → `app-mode/`；
- Finder/Launchpad 或 Explorer 普通启动不要求用户手写 `-app`；
- Windows 当前是 portable distribution，不自动声称 MSI/MSIX。

相关设计：

- `docs/architecture/app-mode-desktop-launch.md`
- `docs/architecture/windows-build-distribution.md`

## 4. 当前正在推进的任务

### 4.1 App Mode / Recorder / Script Runner 真实验证 — IN VALIDATION

独立本地 Codex 会话正在完成：

```text
static checks
→ Go/Node tests
→ macOS bundle build
→ real OpenDesk.app launch
→ Tray interaction
→ Recorder live regression
→ Script Runner Run/Stop child-process evidence
→ discovered defect fixes
```

在真实 evidence 和最终修复 commit 出现以前，不把该项升级为 fully validated。

并行任务应避免修改：

```text
apps/opendesk/**
internal/recorderbundle/**
cmd/opendesk/app_recorder.go
Script Runner / Recorder lifecycle implementation
```

除非先重新读取最新 master 并确认不会覆盖该验证会话的修改。

### 4.2 App Package Schema / Runtime Compatibility Contract — IN PROGRESS

当前推荐并已单独启动的下一条主线：

```text
opendesk.app.json
→ schemaVersion
→ package identity/version
→ runtime compatibility
→ package-relative path validation
→ loader validation/error model
```

目标是让 `opendesk.app.json` 从“当前能读取的配置”升级成长期正式 App Package Contract。

优先 owner：

```text
pkg/appshell package loader / manifest validation
architecture documentation
tests
```

尽量不要与正在验证的 Recorder / Script Runner UI 文件重叠。

### 4.3 Scheduler DB / Multiple Runtime Ownership — IN PROGRESS

Endpoint isolation 之后必须继续确认：

```text
多个 Runtime
→ Scheduler DB 是否共享
→ 谁拥有调度权
→ 是否重复执行
→ SQLite lock / migration race
→ crash takeover / lease
```

这是 Runtime concurrency 主线，不应被 App Package 或 App UI 任务顺手重写。

## 5. 下一阶段优先级

### P0-A｜Application Data / State Directory Contract — NEXT

当前已经出现：

```text
~/.opendesk/apps/<package-id>/
OPENDESK_APP_DATA_DIR
```

但整个产品仍需要统一回答以下数据分别保存在哪里：

```text
App user data
Recipe
Recorder history
Runtime logs
Scheduler DB
Config
Secret
Cache
Crash state
Support evidence
Temporary execution artifacts
```

目标不是只增加一个路径 helper，而是形成统一的：

```text
OpenDesk Data Directory Contract
```

原则：package resources、persistent user data、runtime temp/evidence、secret storage 必须分层，不能由各模块自行决定路径。

建议在 App Package Contract 稳定后推进，因为 package ID 会成为 app data namespace 的重要组成部分。

### P0-B｜Crash / Orphan Execution Recovery — NEXT

需要正式回答：

```text
App Mode main process crash
Script Runner child process orphan
Custom UI host orphan
single-instance lease release
Recorder secondary execution cleanup
Scheduler ownership recovery
```

目标形成进程/execution ownership 和 crash cleanup contract。

该项与 Scheduler ownership 有交叉，应在 Scheduler 基线清楚后实施，避免两套 lease/recovery 机制。

### P1-A｜First Run / Permission / Diagnostics

将当前平台权限从“某个功能失败后才知道”升级为明确 capability state：

```text
Ready
Missing Permission
Unavailable
Unsupported
Repair Action
```

优先覆盖：

- macOS Accessibility；
- 屏幕捕获相关权限；
- Notifications；
- Windows UI Automation/相关平台能力；
- Recorder capture authorization。

最终可以形成 Tray / 主窗口的 `诊断 / 权限` 入口。

### P1-B｜App Config / Secret / Environment Contract

正式区分：

```text
package manifest
application config
user config
environment override
secret
runtime injected values
```

明确：`opendesk.app.json` 不是 Secret store。

该项应建立在 App Package Contract + Data Directory Contract 之上。

### P1-C｜Diagnostics / Support Bundle

面向真实用户和外包交付，提供可导出的 support bundle：

```text
Runtime version
OS/platform
package identity/version
capabilities
selected execution logs
manifest snapshot
failure summary
```

同时：

- 默认移除/遮蔽 Secret；
- 控制个人路径和敏感数据；
- 不要求用户直接打包整个 `.runtime`。

### P1-D｜Install / Upgrade / Uninstall Contract

统一：

```text
macOS app replacement/update
Windows portable → future installer
user data preservation
package/resource replacement
upgrade compatibility
downgrade behavior
uninstall data policy
```

此阶段再决定 Windows Installer 的长期形式，不预设 PowerShell、MSI 或 MSIX 一定是最终方案。

### P1-E｜Code Signing / Notarization / Release Pipeline

建立真正的 release gate：

```text
build provenance
artifact signing
macOS notarization
Windows signing
release metadata
platform evidence
```

Cross-build 不能替代目标 OS live evidence。

### P2｜Auto Update / Marketplace / License / Paid Distribution

依赖前面的 package、data、upgrade、identity contract，再逐步加入：

```text
Auto Update
Marketplace
Recipe / Plugin / Template distribution
License / entitlement
Premium capability
publisher signing / trust
```

不要在基础 package/update/data contract 未稳定时优先实现复杂商业层。

## 6. 推荐主链路

当前推荐顺序：

```text
App Mode / Recorder / Script Runner live validation
        +
App Package Schema / Compatibility
        ↓
Application Data / State Directory Contract
        ↓
Scheduler ownership + Crash / Orphan Recovery
        ↓
First Run / Permission / Diagnostics
        ↓
Config / Secret / Environment Contract
        ↓
Diagnostics / Support Bundle
        ↓
Install / Upgrade / Uninstall
        ↓
Signing / Notarization / Release
        ↓
Auto Update
        ↓
Marketplace / License / Paid Distribution
```

其中 Scheduler concurrency 属于 Runtime 基础设施主线，可以和 Package Contract 并行，但不要重复修改同一 ownership/recovery 代码。

## 7. 并行会话规则

多个网页/Codex 会话允许并行，但必须遵守：

1. 每轮开始重新读取最新 `master / origin/master`，历史 SHA 只用于定位；
2. 不创建不必要的新分支；当前项目以直接推进 master 为主；
3. 不 force push，不 reset/rollback 其他会话的新提交；
4. 提交前再次 `git fetch origin`；
5. 如果 `master` 前进，先检查新提交修改的 owner，再做语义合并；
6. 尽量让并行任务按 owner 分离，例如：

```text
App Package Contract
→ pkg/appshell manifest/package loader

Recorder/Runner validation
→ apps/opendesk + internal/recorderbundle

Scheduler ownership
→ scheduler/storage/runtime lifecycle

Windows distribution
→ scripts/build_windows* + Windows packaging docs
```

7. 一个任务处于 `IN PROGRESS` 不等于已经完成；只有源码、测试、evidence 和 commit 与声明一致后才能更新状态。

## 8. 更新本文件的规则

本文件只记录跨模块产品化状态，不复制子系统详细设计。

当某个阶段完成时：

- 将对应状态从 `IN PROGRESS / IN VALIDATION` 更新为 `IMPLEMENTED BASELINE` 或明确的 `VALIDATED`；
- 写入关键 commit SHA；
- 链接正式 architecture 文档；
- 把新暴露出的跨模块缺口加入下一阶段；
- 不在这里维护大量 API 参数、算法或 UI 细节。

每次开始新的产品化对话时，优先读取本文件，再读取对应子系统设计和当前源码。
