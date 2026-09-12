---
title: Script App Packaging
description: 使用已安装的 OpenDesk Runtime，把 JavaScript 与 opendesk.app.json 组织成 App Mode 应用，并生成可双击启动的桌面产物。
order: 600
---

# Script App Packaging

Script App Packaging 面向 **OpenDesk App 开发者**：你已经安装了可用的 OpenDesk Runtime，希望只编写 JavaScript、资源和 `opendesk.app.json`，把自动化做成一个可以长期运行、带主窗口和 Tray/Menu 的产品应用。

普通 App 开发者不需要 checkout OpenDesk 源码，也不需要 Go、`make build`、`go build` 或修改 Runtime。

最短路径是：

```text
安装 OpenDesk Runtime
→ 创建 my-app/
→ 编写 main.js / 其他 JavaScript 模块
→ 编写 opendesk.app.json
→ opendesk app validate ./my-app
→ opendesk app doctor ./my-app
→ opendesk -app ./my-app
→ opendesk app build ...
→ macOS .app / Windows portable application
```

本文把 **普通 App 开发者路径** 作为默认路径。只有最后的“OpenDesk 源码维护者”一节涉及 OpenDesk 自身源码、`apps/opendesk` 和 release builder。

先用 [App Mode 与 App Shell](app-shell.md) 理解 `-app`、Manifest、App Shell 与脚本的关系；`automation.app`、Tray/Menu action、菜单状态和退出方法的完整 Reference 见 [automation.app API](automation-app.md)。Manifest 的 schema、版本、兼容性、路径安全和错误模型见 [App Package Format](../architecture/app-package-format.md)。使用已安装 Runtime 生成发布产物的详细规则见 [Installed Runtime App Builder](app-builder.md)。

## 1. 两类开发者

### 1.1 普通 App 开发者

普通开发者只把 OpenDesk 当成已安装 Runtime / SDK 使用：

```text
OpenDesk Runtime
    +
my-app/
├── opendesk.app.json
├── main.js
├── modules/*.js or *.mjs
└── assets/*
```

通常只需要理解：

- OpenDesk JavaScript API；
- Custom UI；
- `opendesk.app.json`；
- `automation.app`；
- `opendesk -app <package-dir>`；
- `opendesk app validate / doctor / build`。

不需要理解或修改：

```text
cmd/opendesk/**
pkg/appshell/**
internal/**
apps/opendesk/**
scripts/build_macos_app.sh
scripts/build_windows_distribution.ps1
Go Runtime implementation
OpenDesk official Script Runner / Recorder internals
```

### 1.2 OpenDesk 官方源码维护者

只有维护 OpenDesk 官方桌面产品和 Runtime 的开发者才需要理解：

```text
OpenDesk executable
→ bundled App Mode
→ apps/opendesk/main.js
→ OpenDesk main UI
→ Recorder / Scheduler / Runtime Log / Permissions
→ App Shell
→ macOS / Windows release staging
```

官方产品的 Script Runner / Recorder 页面关系、Tray ownership 和生命周期属于 OpenDesk 产品架构，而不是普通第三方 App 开发者的必修知识。维护者从以下文档进入：

- [OpenDesk Desktop Product Shell](../architecture/opendesk-desktop-product-shell.md)
- [App Mode Desktop Launch Contract](../architecture/app-mode-desktop-launch.md)
- [apps/opendesk/README.md](../../apps/opendesk/README.md)

## 2. Package 目录

普通应用的最小目录建议：

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/
    ├── tray.ico
    └── tray-template.png
```

业务代码可以继续拆成相对模块；App Mode package 本质仍然是普通 OpenDesk JavaScript，只是增加了应用 identity、主窗口、Tray/Menu 和生命周期契约。

一个 schema v1 Manifest 示例：

```json
{
  "schemaVersion": 1,
  "id": "com.example.my-app",
  "version": "1.0.0",
  "name": "My App",
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
    "menu": [
      { "id": "run.menu", "label": "Run", "action": "run" },
      { "type": "separator" },
      { "id": "status", "label": "Status: ready", "enabled": false }
    ]
  }
}
```

`window.mainId` 必须与入口脚本创建的 Custom UI 主窗口 `id` 一致。`id` 使用稳定的小写 reverse-DNS identity。`entry`、图标和其他 package 资源使用 package 内相对路径。

Manifest menu item 的 `id` 是菜单项自身的稳定定位键，`action` 才是点击后交给业务代码的 action；两者可以相同，但不应把它们当成同一个概念。

`opendesk.app.json` 不是 Secret storage，不要写入 API key、password、access token 或客户凭据。

## 3. 开发态：只需要 -app

如果 `opendesk` 已经安装并可从 PATH 调用，普通开发者直接运行：

```bash
opendesk app validate ./my-app
opendesk app doctor ./my-app
opendesk -app ./my-app -console-mode script
```

如果安装包没有把 `opendesk` 放进 PATH，使用已安装 Runtime 的真实可执行文件即可。例如 macOS 可以使用：

```bash
/Applications/OpenDesk.app/Contents/MacOS/opendesk -app "$PWD/my-app" -console-mode script
```

Windows 则使用安装或解压目录中的 `opendesk.exe`：

```powershell
C:\OpenDesk\opendesk.exe -app C:\work\my-app -console-mode script
```

这里不需要 OpenDesk 源码目录，也不需要 `./dist/opendesk`。仓库开发者当然仍可以使用自己刚构建出来的 `./dist/opendesk`，但那只是同一 Runtime 的源码开发入口，不是 App 作者必须遵循的流程。

`-app` 是显式 App Mode package 入口。普通 `-script`、`-script-text`、HTTP、MCP 或 Scheduler execution 不会因为附近存在 `opendesk.app.json` 就自动进入 App Mode。

Package loader 会在业务代码执行前完成 schema / semantic validation、Runtime compatibility、entry/resource containment 检查。绝对路径、`../` 逃逸、Windows drive path、symlink escape、缺失文件和目录型 entry 都会 fail closed。

## 4. App 代码仍然是普通 JavaScript

App Mode 不要求开发者切换到另一种编程模型。入口仍然可以直接使用 OpenDesk Runtime API，例如：

```js
const mainWindow = await ui.createWindow({
  id: 'main',
  title: 'My App',
  width: 720,
  height: 520,
});

automation.app.onAction(async event => {
  if (event.id === 'run') {
    // 调用普通 OpenDesk JavaScript 自动化能力。
  }
});
```

对于明确只作为 App Mode `main.js` 运行的代码，不需要先调用 `automation.app.getCapabilities()` 才能使用 `onAction()`。`getCapabilities()` 主要用于同一模块还会被 `-script`、Scheduler 等其他 execution 复用时的 capability / context 探测。

业务逻辑、UI、文件、HTTP、桌面自动化、Scheduler 等能力继续按对应 `docs/api/` Reference 使用。App Mode 主要增加的是应用级生命周期和产品外壳。

## 5. 开发、验证、构建的职责分离

```text
opendesk -app ./my-app
    开发和真实运行

opendesk app validate ./my-app
    快速静态 schema/package gate

opendesk app doctor ./my-app
    分阶段诊断和修复提示

opendesk app build ./my-app ...
    使用已安装 Runtime 生成桌面发布产物
```

`validate` / `doctor` 不执行 `main.js`、不创建窗口和 Tray。只有 `-app` 才真实运行应用。

完整 CLI 参数、JSON envelope 和错误码见 [App Package CLI](app-package-cli.md)。

## 6. 从已安装 Runtime 生成桌面应用

普通 App 开发者发布时仍然不需要 OpenDesk 源码。

### macOS

例如 Runtime 安装在 `/Applications/OpenDesk.app`：

```bash
mkdir -p release
OPENDESK=/Applications/OpenDesk.app/Contents/MacOS/opendesk
"$OPENDESK" app validate ./my-app
"$OPENDESK" app doctor ./my-app
"$OPENDESK" app build ./my-app --target macos --output "$PWD/release/My App.app"
```

最终产物包含自己的 App Mode package：

```text
My App.app/
└── Contents/
    ├── MacOS/opendesk
    ├── Helpers/opendesk-ui-host
    └── Resources/
        └── AppMode/
            ├── opendesk.app.json
            ├── main.js
            └── ...
```

用户双击这个 `.app` 后，Runtime 自动发现 bundled App Mode，不需要再传 `-app`。

### Windows

```powershell
$opendesk = 'C:\OpenDesk\opendesk.exe'
& $opendesk app validate .\my-app
& $opendesk app doctor .\my-app
& $opendesk app build .\my-app --target windows --output (Join-Path $PWD 'release\MyApp')
```

最终 portable directory 中包含：

```text
MyApp/
├── opendesk.exe
├── ui-host/
└── app-mode/
    ├── opendesk.app.json
    ├── main.js
    └── ...
```

用户从 Explorer 启动 `opendesk.exe`，Runtime 自动发现 `app-mode/`。

Builder 的详细前置条件、签名边界、provenance 和 CI 规则见 [Installed Runtime App Builder](app-builder.md)。

## 7. Single Instance 与多应用

`singleInstance: true` 表示同一个稳定 package identity 不重复创建第二套应用 Runtime；第二次启动会激活已有实例。

不同 App 应使用不同稳定 `id`。不要使用固定 localhost 端口作为应用 identity，也不要在 Manifest 中发明未公开的 `port` 字段。Runtime endpoint ownership 与 App Mode 生命周期是不同层的能力。

## 8. 普通开发者发布前检查

至少确认：

1. `opendesk.app.json` 是有效 schema-v1 Manifest。
2. `entry` 和所有声明资源都在 package root 内。
3. `opendesk app validate ./my-app` 通过。
4. `opendesk app doctor ./my-app` 没有未处理的阻塞项。
5. `opendesk -app ./my-app` 可以真实打开主窗口和 Tray/Menu。
6. 主窗口 `id` 与 `window.mainId` 一致。
7. `singleInstance`、关闭/隐藏、重新打开和 Quit 行为符合预期。
8. 在目标 macOS / Windows 环境做真实桌面验收。
9. 发布产物从源码目录之外启动，不能偷偷依赖开发仓库路径。

## 9. OpenDesk 源码维护者专用路径

以下内容不是普通 App 开发者要求，而是 OpenDesk 官方 Runtime / Desktop 产品维护流程。

OpenDesk 官方产品源码位于：

```text
apps/opendesk/
```

开发态可以从源码仓库运行：

```bash
make build
./dist/opendesk -app "$PWD/apps/opendesk" -allow-recorder-capture -console-mode script
```

正式 OpenDesk Desktop 再由源码 release builder 将官方 package staging 到：

```text
macOS:
OpenDesk.app/Contents/Resources/AppMode/

Windows:
app-mode/
```

官方产品的主 UI、Recorder、Scheduler、Runtime Log、Permissions、Tray ownership、release allowlist 和 Recorder materialization 属于 OpenDesk 自身产品架构，不应暴露成第三方 App 开发的必需概念。

源码维护者继续阅读：

- [OpenDesk Desktop Product Shell](../architecture/opendesk-desktop-product-shell.md)
- [App Mode Desktop Launch Contract](../architecture/app-mode-desktop-launch.md)
- [App Package Format](../architecture/app-package-format.md)
- [apps/opendesk/README.md](../../apps/opendesk/README.md)

## 相关入口

- [App Mode 与 App Shell](app-shell.md)：`-app`、Manifest、App Shell 与脚本 API 的职责关系。
- [automation.app API](automation-app.md)：当前 App Mode 应用的 lifecycle、Tray/Menu action 与运行时菜单状态方法。
- [Installed Runtime App Builder](app-builder.md)：无源码/无 Go 的 artifact 构建、CI 与发布限制。
- [App Package CLI](app-package-cli.md)：`validate`、`doctor`、`build` Reference。
- [App Package Format](../architecture/app-package-format.md)：Manifest schema、compatibility 和 path security。
- [Examples: App Mode](../../examples/app-mode/README.md)：最小可运行示例。
- [受保护包 CLI](protected-packages.md)：`.odpkg` 源码保护与 License 流程。
