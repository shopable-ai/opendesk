---
name: build-script-app
description: 将已经写好并验证过的 OpenDesk JavaScript 组织为 App Mode package，建立或检查 opendesk.app.json，并按需生成 macOS .app 或 Windows portable distribution。用于“做成可双击桌面应用”“App Mode packaging”“opendesk.app.json”“APP_MODE_PACKAGE”等请求；不负责 Recorder 精炼、.odpkg 源码保护、License 或未实现的 installer 功能。
---

# 构建 Script App

通过 `$build-script-app` 调用本 Skill。

本 Skill 面向已经有可运行 OpenDesk JavaScript 的开发者。目标不是重新编写业务自动化，而是把现有脚本交付成一个有稳定 identity、App Shell、主窗口、Tray/Menu Bar 和桌面启动入口的 App Mode package，并在用户要求时继续装入 macOS / Windows 发布产物。

标准链路：

```text
ready JavaScript
→ package root
→ opendesk.app.json
→ development -app validation
→ platform distribution staging
→ desktop launch qualification
```

## 先读取什么

开始前读取：

1. 仓库根目录 `AGENTS.md`、本 Skill、当前 branch / HEAD / git status。
2. [Script App Packaging 用户文档](../../../../docs/api/script-app-packaging.md)。
3. [automation.app API](../../../../docs/api/app-shell.md)，确认 Manifest、Single Instance、Tray/Menu、生命周期与错误语义。
4. 需要做真实 desktop release staging 时，再读取 [App Mode desktop launch contract](../../../../docs/architecture/app-mode-desktop-launch.md)。
5. 需要参考最小结构时，读取 [`examples/app-mode/README.md`](../../../../examples/app-mode/README.md) 和 `examples/app-mode/basic/opendesk.app.json`。

不要为了 packaging 一次性加载 Agent-to-Recipe、Recorder、protected-package 或全部平台架构文档；只有当前请求跨入对应范围时才读取。

## 触发与边界

适用请求包括：

- “把这个 OpenDesk 脚本做成可以双击运行的应用”；
- “给这个项目增加 `opendesk.app.json`”；
- “把脚本做成 App Mode package”；
- “把 package 放进 macOS `.app` / Windows portable distribution”；
- “检查 App Mode package 为什么不能正常从桌面启动”；
- “给已有自动化增加 Tray/Menu Bar、Single Instance 和主窗口关闭策略”。

以下任务不由本 Skill 接管：

- Recorder generated script 的静态精炼或 Human/Agent-to-Recipe 业务工程化；
- `.js` → `.odpkg` 的加密、Publisher 签名、P1/P2 License；这些请求转到 `$build-odpkg`；
- MSI/MSIX、自动 Start Menu shortcut、文件关联、自动更新器等当前未实现 installer 产品能力；
- 为了“打包成功”而发明 Runtime API、Manifest 字段、环境变量或端口协议；
- 把 cross-build / package layout 检查描述成 Windows 或 macOS live UI 已验证。

## 输入合同

尽量从现有仓库和用户已有资料推导，只有缺少会改变产品身份或发布结果的必要信息时才请求补充。

至少固定：

| 输入 | 说明 |
| --- | --- |
| package root | App Mode package 目录；可以是现有目录，也可以从已有脚本旁建立 |
| entry | package 内主 JavaScript 文件，例如 `main.js` |
| app id | 稳定的小写 reverse-DNS identity，例如 `com.example.invoice-helper` |
| main window id | 与入口脚本 `ui.createWindow({ id })` 一致 |
| close behavior | 当前公开值及其前提必须以 `docs/api/app-shell.md` 为准 |
| tray assets | Windows `.ico` 与 macOS template PNG；启用 tray 时必须按当前 API 约束准备 |
| target | development package / macOS release / Windows release / 多平台 |
| validation scope | 只检查结构、运行开发态、构建 staging，还是要求目标 OS live launch |

不要自行把示例中的 `com.opendesk.example.basic`、标题、图标或业务 action 当作生产值。

## 作业路径

### 1. 冻结现有脚本

先确认 packaging 输入是当前要交付的脚本版本。除为接入 App Mode lifecycle 所必需的最小改动外，不在本 Skill 中重写业务算法、调整 Recorder 动作顺序或改变业务成功条件。

如果脚本本身还不能稳定完成任务，先返回上游作者工作流；不要用 package、Tray 或桌面壳掩盖业务脚本未完成的问题。

### 2. 建立 package root

推荐结构：

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/
    ├── tray.ico
    └── tray-template.png
```

保持 `entry` 和资源路径为 package 内相对路径。禁止把当前开发机的绝对脚本路径写进 Manifest。

如果用户已有目录结构，只做必要调整，不为了匹配示例而无意义移动全部业务文件。

### 3. 建立或审查 opendesk.app.json

以当前 `docs/api/app-shell.md` 为唯一公开 Runtime 契约。最小骨架可按当前示例建立：

```json
{
  "schemaVersion": 1,
  "id": "com.example.my-app",
  "version": "1.0.0",
  "runtime": {
    "minVersion": "0.1.0"
  },
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
    "tooltip": "My App",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": []
  },
  "capabilities": ["custom-ui"]
}
```

新 package 必须优先使用 `schemaVersion: 1`；缺失 schemaVersion 只用于读取既有 legacy package。Package `version`、`runtime.minVersion` 与 Manifest schema version 各自独立。`capabilities` 只是 declaration / prerequisite metadata，不代表 permission、sandbox 或 security boundary。

Manifest 只写公开字段。每次发现“希望通过加一个字段解决”的需求，先核对 `docs/api/app-shell.md`、实现和测试；没有公开契约就不得猜字段。

### 4. 接入 App Shell lifecycle

入口脚本需要 App Mode 行为时，优先使用当前 `automation.app`：

- `automation.app.getCapabilities()` 确认当前 execution 是否由 App Shell 拥有；
- `automation.app.onAction(handler)` 接收 tray/menu/second-instance action；
- `automation.app.updateMenuItem(id, patch)` 更新 Manifest 中已有菜单项；
- `automation.app.quit()` 进入统一 shutdown。

不要为了让应用驻留添加无意义的 `while(true)`、sleep loop 或 `setInterval` keep-alive；当前 App Shell lifecycle 本身是正式 resource。

### 5. 开发态验证

以下命令从仓库根目录运行。构建物必须与当前源码匹配：

```bash
make build
./dist/opendesk -app /absolute/path/to/my-app -console-mode script
```

仓库示例可用于确认框架能力：

```bash
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

验证至少区分：

- Manifest / package path 是否有效；
- 主窗口是否创建且 `window.mainId` 对得上；
- tray / menu 是否出现；
- primary open、业务 action、quit 是否仍在同一个 Runtime；
- `singleInstance` 开启时第二次启动是否激活已有实例而不是重复执行入口；
- 用户关闭窗口时 `closeBehavior` 是否符合公开语义。

只有结构检查时不得写“App 已运行通过”。

### 6. macOS release staging

用户明确要求 macOS desktop artifact 时，再执行/准备：

```bash
APP_MODE_PACKAGE=/absolute/path/to/my-app SKIP_CODESIGN=1 VERSION="$(tr -d '[:space:]' < VERSION)" ./scripts/build_macos_app.sh
```

上式只适合 packaging mechanism / layout 验证。`SKIP_CODESIGN=1` 不能作为最终发布签名方案。

检查 package 是否被 staging 到：

```text
OpenDesk.app/Contents/Resources/AppMode/
```

正式交付若要求签名、notarization 或发布渠道资格，分别报告实际状态；没有对应凭据或流程时写 `not qualified`，不要伪造通过。

### 7. Windows release staging

用户明确要求 Windows artifact 时，再执行/准备：

```powershell
pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64 -AppModePackage C:\absolute\path\to\my-app
```

当前 P0 是 portable distribution。检查 package 是否被 staging 到：

```text
app-mode\
```

不要声称当前命令自动创建 MSI/MSIX、开始菜单快捷方式或文件关联。cross-build / directory layout 检查也不能替代 Windows live session 验证。

## Runtime endpoint / 端口规则

Script App Packaging 不负责通过“给每个应用写不同固定端口”解决运行实例隔离。

固定规则：

1. `opendesk.app.json` 只使用当前公开 Manifest 字段；当前用户文档没有 per-app Runtime service port 字段。
2. 不得为了规避 `60844` 等固定端口冲突，在 Skill 中发明 `port`、`runtimePort`、`OPENDESK_APP_PORT` 或类似配置。
3. 如果当前 Runtime 的真实实现仍依赖一个会阻塞多个独立 Script App 的固定监听端口，把它记录为 Runtime/App Shell blocker，先修实现、测试和公开文档，再让 Packaging Skill 使用该能力。
4. Runtime 将来若提供 endpoint override，优先采用“默认自动分配 + 显式 override”的公共设计；但在源码和 API 文档真正落地之前，只能作为设计要求，不能写成当前可用命令。

这样可以避免 package 文档先承诺一个实际上不存在的配置接口。

## 与 .odpkg 的组合

App Mode packaging 与 protected package 是两个不同问题：

```text
桌面交付形态：Script App Packaging
源码保护/授权：Protected Package (.odpkg)
```

用户同时要求二者时，先分别确认两个契约，不要把 `.odpkg` 当作 `opendesk.app.json` 的替代品，也不要把 App Mode package 误称为加密包。

如果当前 App Mode entry 是否已经支持直接消费 `.odpkg` 没有公开实现/测试闭环，不得凭概念组合自行宣称支持；先核对当前 Runtime，再设计明确的组合路径。

## 完成条件

### development package

至少满足：

- package root 与 Manifest 已建立或审查；
- Manifest 只使用当前公开字段；
- entry、main window id、tray resources 一致；
- 若实际执行了 `-app`，报告真实运行结果；若没有运行，明确写 `not run`。

### release artifact

在 development package 条件之外，还要分别记录：

- 使用的 macOS / Windows staging 命令；
- 实际产物路径；
- App Mode package 是否出现在目标发布布局；
- build/cross-build 状态；
- 目标 OS live launch 状态；
- UI/Tray/Single Instance 验证状态；
- signing/notarization/installer 资格状态。

没有做过的层级不得用一个笼统的“打包成功”覆盖。

## 最终交付格式

最终报告优先给可执行结果：

```text
Package: <path>
App ID: <id>
Entry: <entry>
Mode: development | macOS release | Windows release | multi-platform
Manifest: pass | blocked
Development -app: pass | fail | not run
macOS staging: pass | fail | not run
Windows staging: pass | fail | not run
Live desktop: pass | fail | not qualified | not run
Signing / installer: qualified state
Blockers: <only real blockers>
```

同时列出用户接下来真正需要运行的一条命令或最终 artifact；不要把内部推理过程、长审计说明或未实现路线图当成交付结果。
