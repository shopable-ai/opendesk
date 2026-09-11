---
title: Script App Packaging
description: 把已有 OpenDesk JavaScript 与 opendesk.app.json 组织为 App Mode package，并生成可从 Finder、Launchpad 或 Windows Explorer 启动的桌面发布产物。
order: 32
---

# Script App Packaging

Script App Packaging 用于把已经写好并验证过的 OpenDesk JavaScript 组织成一个 **App Mode package**，再按目标平台装入 OpenDesk 的桌面发布产物，使用户可以像普通桌面应用一样启动它。

它解决的是：

```text
已有 JavaScript 自动化
→ App Mode package
→ opendesk.app.json
→ 开发态 -app 验证
→ macOS .app / Windows portable distribution
→ 用户双击启动
```

它不负责 Recorder 脚本精炼，不等于 `.odpkg` 受保护包，也不自动提供 MSI/MSIX、安装器、代码签名证书或 License 服务。需要脚本加密、Publisher 签名和授权时，使用 [受保护包 CLI](protected-packages.md)。

`automation.app`、tray/menu action、菜单状态和退出 API 的完整 Reference 见 [automation.app](app-shell.md)。

## 能力边界

| 能力 | 当前公开入口 | 说明 |
| --- | --- | --- |
| 开发态运行 App Mode package | `opendesk -app <directory>` | 显式读取该目录中的 `opendesk.app.json` |
| App Manifest | `opendesk.app.json` | 定义 package identity、entry、single instance、主窗口与 tray/menu |
| macOS 桌面发布 | `scripts/build_macos_app.sh` + `APP_MODE_PACKAGE` | 把 package staging 到 `OpenDesk.app/Contents/Resources/AppMode/` |
| Windows 桌面发布 | `scripts/build_windows_distribution.ps1 -AppModePackage ...` | 把 package staging 到 portable distribution 的 `app-mode/` |
| App 内生命周期 | `automation.app` | 当前 App Mode application 的 action、菜单更新与退出 |
| 受保护脚本包 | `opendesk package ...` | 独立能力；输出 `.odpkg`，不等于 App Mode package |

## Package 目录

最小目录建议：

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/
    ├── tray.ico
    └── tray-template.png
```

`entry`、Windows `.ico` 和 macOS PNG 都使用 package 内相对路径。不要把机器相关的绝对路径写进 Manifest。

最小 Manifest：

```json
{
  "id": "com.example.my-app",
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
    "menu": [
      { "id": "run", "label": "Run", "action": "run" },
      { "type": "separator" },
      { "id": "status", "label": "Status: ready", "enabled": false }
    ]
  }
}
```

`window.mainId` 必须与入口脚本创建的 Custom UI 主窗口 `id` 一致。`id` 应使用稳定的小写 reverse-DNS identity。

## 开发态验证

以下命令均从仓库根目录执行。先构建与当前源码匹配的 OpenDesk：

```bash
make build
```

然后运行 package：

```bash
./dist/opendesk -app /absolute/path/to/my-app -console-mode script
```

仓库内最小示例：

```bash
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

开发态的 `-app` 是显式 package 入口。普通 `-script`、`-script-text`、HTTP、MCP 或 Scheduler execution 不会因为附近存在 `opendesk.app.json` 就自动进入 App Mode。

## macOS 发布

当前 macOS builder 接受绝对路径 `APP_MODE_PACKAGE`。用于检查 package staging 机制时，可以从仓库根目录执行：

```bash
APP_MODE_PACKAGE=/absolute/path/to/my-app SKIP_CODESIGN=1 ./scripts/build_macos_app.sh
```

`SKIP_CODESIGN=1` 只适合开发或 packaging 验证，不代表可向最终用户分发的签名产物。正式交付仍需要按发布流程完成正确的 bundle signing / notarization（如项目发布策略要求）。

Builder 会把 package 内容 staging 到：

```text
OpenDesk.app/Contents/Resources/AppMode/
```

发布产物启动时，如果用户没有传入命令行参数，OpenDesk 可以发现该默认 App Mode package；用户随后直接从 Finder 或 Launchpad 启动应用。

## Windows 发布

当前 Windows P0 发布形式是 portable directory，不是 MSI/MSIX installer。可从仓库根目录执行：

```powershell
pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64 -AppModePackage C:\absolute\path\to\my-app
```

Builder 会把 package staging 到发布目录的：

```text
app-mode\
```

用户可以从 Explorer 启动 `opendesk.exe`，也可以自行建立 Start Menu shortcut。当前公开能力不应描述为已经提供 MSI、MSIX、文件关联或自动创建开始菜单快捷方式。

## Single Instance 与多应用

`singleInstance: true` 表示同一个稳定 package identity 不应重复创建第二套应用 Runtime；第二次启动会沿现有 App Shell 语义激活已有实例。

不同 Script App 应使用不同的稳定 `id`。不要为了区分应用，在 Manifest 中虚构未公开字段。

尤其不要把固定本地服务端口作为 Script App identity。当前公开 `opendesk.app.json` 契约没有用于给每个 App Mode package 声明 Runtime service port 的字段。如果 Runtime 后续增加端口或 endpoint override，应先在实现、测试和 [Environment API](environment.md) / 对应 Runtime 文档中形成公开契约，再由本页引用；不要先在 package 文档中发明 `port`、`OPENDESK_APP_PORT` 等尚未实现的配置。

## 验证清单

发布前至少分别检查：

1. package 根目录存在严格有效的 `opendesk.app.json`；`entry` 与图标资源都留在 package root 内。
2. `./dist/opendesk -app <package> -console-mode script` 可以从仓库根目录按原命令启动。
3. 主窗口 `id` 与 `window.mainId` 一致；Tray/Menu Bar 的 Open、业务 action、Quit 使用同一个 Runtime。
4. `singleInstance` 行为符合预期；同一 package 的第二次启动不重复执行 `main.js`。
5. macOS 发布时检查实际 `.app` 中的 `Contents/Resources/AppMode/`；Windows 发布时检查实际 portable 目录中的 `app-mode/`。
6. cross-build / package layout 检查只证明构建和 staging，不等于目标系统 live UI 验证。
7. 若交付目标包含代码保密或客户授权，单独进入 `.odpkg` / License 流程；不要把 App Mode packaging 本身描述为源码保护。

## 相关入口

- [automation.app](app-shell.md)：App Mode lifecycle、tray/menu 与 Manifest Runtime 语义。
- [Examples: App Mode](../../examples/app-mode/README.md)：最小可运行示例。
- [App Mode desktop launch contract](../architecture/app-mode-desktop-launch.md)：开发与 release staging 的架构边界及验证证据。
- [受保护包 CLI](protected-packages.md)：`.js` → `.odpkg` 的源码保护与 License 流程。
- [`$build-script-app`](../../workflows/script-app-packaging/skills/build-script-app/SKILL.md)：面向开发者和 Agent 的 Script App Packaging 作业 Skill。
