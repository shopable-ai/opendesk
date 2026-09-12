# App Mode examples

`basic/` 是 P0 App Shell 的最小可运行示例：一个 Custom UI 主窗口、原生 tray / menu bar、动态菜单状态、用户关闭后隐藏并由系统 Open 重新显示，以及统一退出。

该示例 Manifest 使用正式 `schemaVersion: 1`，并分别声明 App Package `version` 与 OpenDesk `runtime.minVersion`。这两个版本都不等于 Manifest schema version；可选 `capabilities` 也只表示声明/前置条件元数据，不是权限或 sandbox。

以下命令从仓库根目录运行；先用 `make build` 生成与当前源码配套的 `dist/opendesk` 和 UI host。示例同时携带 macOS template PNG 与 Windows ICO：两者都在启动前校验且没有跨平台 fallback。

从仓库根目录运行当前正式构建：

```bash
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

若要从该 App Mode 菜单打开并实际录制 Recorder，请在受信任的本机验收命令中显式加入全局输入采集授权：

```bash
./dist/opendesk -app examples/app-mode/basic -allow-recorder-capture -console-mode script
```

这条命令是开发态示例入口；`examples/app-mode/basic` 不是发布应用。Finder / Launchpad、Windows 开始菜单及
可选默认 App Mode 包的发布入口见 [App Mode desktop launch contract](../../docs/architecture/app-mode-desktop-launch.md)。

左键点击 tray / menu bar icon 会显示合并菜单；右键（macOS 也可 Control-click）继续兼容。菜单中的 “Open / Show” 执行系统 `opendesk.open`，选择 “Run sample action” 会在当前 Runtime 更新 status item；选择系统 Quit 或窗口内 “Quit app” 会进入统一 shutdown。

普通 Script Mode 不会读取这个目录的 Manifest，也不会自动进入 App Mode。
