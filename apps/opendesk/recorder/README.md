# Recorder 工具栏

`controller-core.js` 负责录制、暂停、停止、生成和测量动作；`controller.js` 负责产品工具栏组合与历史记录集成。

## 录制产物目录

新录制采用扁平的顶层产物合同。`raw/` 与 `generated/` 不再作为新 Session 的目录层级；它们只是旧录制的历史结构，不应继续出现在新写入路径、提示词或产品文档中。

```text
.runtime/recordings/<recording-id>/
├── manifest.json
├── events.ndjson
├── flow.js
├── replay-config.json
├── observations/
├── distilled/
└── runs/
```

顶层文件是用户最常查看的核心产物：`events.ndjson` 为原始录制事实，`flow.js` 为最终生成脚本。`observations/`、`distilled/`、`runs/` 仍保留，因为它们分别表达采集证据、整理结果和执行结果，具有真实语义边界。

兼容策略为“新写入只使用新结构，旧结构只读兼容”。读取历史录制时仍允许回退到 `raw/events.ndjson`；涉及旧生成脚本的入口可继续识别 `<recording>/generated/*.js`，但不得为新录制重新创建 `raw/` 或 `generated/`。

## 桌面测量入口

正式 Recorder 工具栏右侧依次为：详情、文件夹、分隔线、测量、历史记录。测量是常驻的独立图标按钮，不必打开开发者菜单。悬停提示沿用按钮的本地化 label，并附上当前平台的默认全局快捷键：macOS `⌘⇧M`，Windows / Linux `Ctrl+Shift+M`。

开发者菜单仍保留“桌面测量”，并直接展示相同快捷键，不依赖菜单悬停气泡。默认按键定义只有一份，位于 `internal/measurementshortcut/shortcut.go`；App 生命周期负责注册，菜单和 Recorder 只呈现，不重复注册。提示表示默认绑定，不是快捷键注册成功的状态指示器；注册冲突仍由现有启动日志报告。

按钮复用 core 的 `measure(event)`，不绕过录制控制点击排除、暂停、并发保护和失败处理。录制中进入测量会暂停录制，退出测量后不会自动恢复。未接入测量回调的独立运行环境保留 core 的禁用状态；未传入 App 快捷键信息时不显示快捷键提示。

## 维护与验证

修改 `controller.js` 或 `controller-core.js` 后，使用现有同步入口 `go generate ./internal/recorderbundle` 更新内嵌资源，不允许发布源码与 `internal/recorderbundle/assets/` 不一致的版本。

在仓库根目录执行目录合同与工具栏组合回归：

```sh
./dist/opendesk -script tests/runtime-api/recorder-artifact-layout.js -console-mode script
node --test tests/custom-ui/recording-measurement-entry.test.js
```

这些是宿主侧组合测试，不代表真实桌面验收。发布前仍需使用同一版本的 OpenDesk 主程序和 UI host，核对右侧按钮可见性、悬停文字、菜单快捷键、实际打开同一个 Measurement Session、录制暂停与退出恢复行为。Recorder 使用编译内嵌资源，仅拉取 JavaScript 源文件不会更新正在运行的旧程序。
