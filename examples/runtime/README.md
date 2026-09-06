# 基础 Runtime 示例

本目录收纳第一批基础示例。所有命令从仓库根目录运行，使用当前 OpenDesk 构建，不用 Node
执行这些脚本。这里只归拢目录和说明，不改变示例逻辑。

| 示例 | 根目录直接运行命令 | 输入、输出及副作用 |
| --- | --- | --- |
| [api-quickstart.js](api-quickstart.js) | `./opendesk -script examples/runtime/api-quickstart.js -console-mode script` | 无业务输入；短暂等待后打印说明，不点击桌面。 |
| [environment.js](environment.js) | `./opendesk -script examples/runtime/environment.js -console-mode script` | 按需读取平台及环境键；只打印白名单摘要，不输出完整环境或凭据。 |
| [path.js](path.js) | `./dist/opendesk -script examples/runtime/path.js -console-mode script` | 读取当前 Execution 来源；在 `Execution.artifactDir` 写入 `path-example.json`。 |
| [file-json.js](file-json.js) | `./opendesk -script examples/runtime/file-json.js -console-mode script` | 相对根目录读取可选的 `config/settings.json`；缺失用默认值，在 `Execution.artifactDir/file-json-example/` 写副本。 |

这些示例不需要桌面输入或屏幕录制权限。文件、路径语义和平台可用性以
[`docs/api/`](../../docs/api/README.md) 为准；目录整理不构成新的跨平台验证结论。

Windows PowerShell 的当前 `dist` 构建可使用：

```powershell
.\dist\opendesk.exe -script examples/runtime/api-quickstart.js -console-mode script
.\dist\opendesk.exe -script examples/runtime/environment.js -console-mode script
.\dist\opendesk.exe -script examples/runtime/path.js -console-mode script
.\dist\opendesk.exe -script examples/runtime/file-json.js -console-mode script
```

原来的 `examples/<同名文件>.js` 暂时保留为兼容转发。通过旧入口运行时，Execution 来源仍是
旧入口；通过本目录运行时才是本目录的路径。两个入口共用一个实现，不产生独立子 Execution。
兼容退出条件、测试归属和验证方式见
[目录与迁移规则](../../docs/quality/example-test-layout.md)。
