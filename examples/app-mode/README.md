# App Mode examples

`basic/` 是 P0 App Shell 的最小可运行示例：一个 Custom UI 主窗口、原生 tray / menu bar、动态菜单状态、用户关闭后隐藏并由系统 Open 重新显示，以及统一退出。

该示例 Manifest 使用正式 `schemaVersion: 1`，并分别声明 App Package `version` 与 OpenDesk `runtime.minVersion`。这两个版本都不等于 Manifest schema version；可选 `capabilities` 也只表示声明/前置条件元数据，不是权限或 sandbox。

## Repository contributor 路径

下面首先展示的是 **OpenDesk 源码仓库维护者 / contributor 路径**。这些命令从仓库根目录运行，并先用 `make build` 生成与当前源码配套的 `dist/opendesk` 和 UI host。示例同时携带 macOS template PNG 与 Windows ICO：两者都在启动前校验且没有跨平台 fallback。

```bash
make build
./dist/opendesk app validate examples/app-mode/basic
./dist/opendesk app doctor examples/app-mode/basic
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

结构化 package validation / doctor：

```bash
./dist/opendesk app validate examples/app-mode/basic --json
./dist/opendesk app doctor examples/app-mode/basic --json
```

以上 `./dist/opendesk` 与 `make build` 只表示你正在维护当前 checkout 中的 OpenDesk Runtime；它们不是普通 App 开发者使用这个示例的前置条件。

JSON Schema 位于 `schemas/app-package/opendesk.app.schema.json`，仓库已通过 editor workspace configuration 关联 `opendesk.app.json`。不要在 manifest 中加入 `$schema`；它不是 strict schema v1 的字段。

若要从该 App Mode 菜单打开并实际录制 Recorder，请在受信任的本机仓库验收命令中显式加入全局输入采集授权：

```bash
./dist/opendesk -app examples/app-mode/basic -allow-recorder-capture -console-mode script
```

这条命令是开发态 repository example 入口；`examples/app-mode/basic` 不是发布应用。Finder / Launchpad、Windows Explorer 及可选默认 App Mode 包的发布入口见 [App Mode desktop launch contract](../../docs/architecture/app-mode-desktop-launch.md)。

## 已安装 Runtime 的普通 App 开发者路径

如果你只是安装了 OpenDesk Runtime，不需要 checkout 本仓库、安装 Go 或运行 `make build`。可以把 `basic/` package 复制到任意工作目录，然后直接使用已安装 Runtime。

macOS / Linux 风格：

```bash
opendesk app validate ./basic
opendesk app doctor ./basic
opendesk -app ./basic -console-mode script
```

如果 macOS Runtime 未加入 PATH，可使用安装包中的真实 executable：

```bash
/Applications/OpenDesk.app/Contents/MacOS/opendesk app validate ./basic
/Applications/OpenDesk.app/Contents/MacOS/opendesk app doctor ./basic
/Applications/OpenDesk.app/Contents/MacOS/opendesk -app ./basic -console-mode script
```

Windows PowerShell：

```powershell
$opendesk = 'C:\OpenDesk\opendesk.exe'
& $opendesk app validate .\basic
& $opendesk app doctor .\basic
& $opendesk -app .\basic -console-mode script
```

需要把自己的 package 构建成可分发 artifact 时，继续使用 [Installed Runtime App Builder](../../docs/api/app-builder.md)：macOS Runtime 构建 `.app`，Windows Runtime 构建必须整体搬移的 portable directory。Builder 不会执行本示例的 `main.js`，也不是 cross compiler。

左键点击 tray / menu bar icon 会显示合并菜单；右键（macOS 也可 Control-click）继续兼容。菜单中的 “Open / Show” 执行系统 `opendesk.open`，选择 “Run sample action” 会在当前 Runtime 更新 status item；选择系统 Quit 或窗口内 “Quit app” 会进入统一 shutdown。

普通 Script Mode 不会读取这个目录的 Manifest，也不会自动进入 App Mode。
