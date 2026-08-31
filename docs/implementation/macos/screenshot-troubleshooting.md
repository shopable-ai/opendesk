# macOS 截图排障手册（App/CLI/Agent）

本文整理 OpenDesk 在 macOS 下截图能力的稳定调用经验，以及常见失败模式和处理方式。

适用场景：
- 通过 `OpenDesk.app` 调用脚本
- 通过 `dist/opendesk` 调用脚本
- 通过 Agent/Codex CLI 间接调用脚本

## 1. 成功路径（推荐）

核心原则：
- 调用主体固定：长期使用同一个 `.app` 或固定二进制。
- 脚本路径固定：尽量使用绝对路径，避免工作目录变化。
- 先做权限预检：`checkScreenshotPermissions()`。

推荐命令（App 模式）：

```bash
./scripts/build_macos_app.sh
./scripts/open_macos_app.sh -script examples/mac/screenshot_multi_display_test.js -timeout 20
```

该示例会把时间戳命名的截图写入 `.runtime/temp/mac/`，并在终端列出
每一个输出路径。它不替代当前场景的真实验收；需要时应单独保存截图、
日志和验证结论。

## 2. 日志怎么看

截图链路关键日志（`automation/page.go`）：

1. 请求日志：

```text
Screenshot request: target=... source=... displayIndex=... resolved=(x=... y=... width=... height=...)
```

2. 结果日志：

```text
Screenshot result: backend=... source=... displayIndex=... output=(width=... height=... bytes=...)
```

判读要点：
- `request` 里的 `resolved` 是“输入/解析后的目标区域”。
- `result` 里的 `output(width,height)` 是“实际输出图片像素尺寸”，更可靠。
- Retina 屏常见现象：逻辑尺寸与像素尺寸不同，例如逻辑 `1710x1107`，输出像素 `3420x2214`（2x）。

## 3. 常见失败模式

### A. 权限失败（屏幕录制/辅助功能）

典型表现：
- 图片为空、黑屏、报错 `failed to capture`。
- `checkScreenshotPermissions()` 返回 `ok=false`。

处理：
- 运行 `examples/mac/screenshot_permission_check.js`。
- 在系统设置里确认：
  - 屏幕录制
  - 辅助功能
  - 输入监控（按需）
  - 自动化（按需）

说明：
- 权限绑定到“调用主体身份”，不是绑定到脚本。
- 若权限授予给 `OpenDesk.app`，就应该由 `OpenDesk.app` 运行。

### B. 截图成功，但识别失败（最常见）

典型表现：
- 图片尺寸正常，内容也有，但 OCR/定位不到目标。
- 截图区域有浮层、提示框、透明遮挡，或文字太少。

处理：
- 不要只依赖固定右上角 `800x600`，优先用 `activeWindow` 或更大区域。
- 识别流程做回退：区域识别失败后，自动改为整屏识别再裁剪。
- 避免在弹层动画过程中截图（加等待）。

### C. 多屏坐标错位

典型表现：
- 截到了别的屏幕或区域偏移。

处理：
- 先跑 `examples/mac/screen_displays_inspect.js` 看屏幕元数据。
- 用 `displayIndex` + `clip`（局部坐标）：
  - `displayIndex: 1` 主屏，`2` 第二屏
  - `x < 0` 可从右边缘反向偏移（例如 `x: -800`）

### D. 重编译后偶发权限漂移

典型表现：
- 之前同命令可用，重编译后偶发不可用。

处理：
- 通常不需要每次重置权限。
- 若使用 ad-hoc 签名（`codesign -`）且系统判定身份变化，可能出现漂移。
- 建议使用固定签名身份：

```bash
CODESIGN_IDENTITY="Apple Development: Your Name (TEAMID)" ./scripts/build_macos_app.sh
```

## 4. Agent/Codex CLI 调用规范

当最终由 Agent 调度时，建议固定为：

1. 构建阶段（必要时）：

```bash
./scripts/build_macos_app.sh
```

2. 执行阶段（始终通过同一入口）：

```bash
./scripts/open_macos_app.sh -script /absolute/path/to/your_script.js -timeout 20
```

3. 验证阶段（排障时）：检查本次生成的 `.runtime/temp/mac/` 截图及运行日志，
并记录实际输出尺寸；不要把它们放入源码或 fixture 目录。

不要在同一条业务链路里混用：
- `go run ./cmd/opendesk ...`
- `./dist/opendesk ...`
- `open dist/OpenDesk.app ...`

混用会增加权限主体变化和时序不一致风险。

## 5. 什么时候需要重置权限

仅在以下情况建议重置：
- `checkScreenshotPermissions()` 持续 `ok=false`
- 明确换了调用主体（例如从 Terminal 切到 `.app`）
- 系统权限页显示状态异常

常用重置命令示例：

```bash
tccutil reset AppleEvents com.opendesk.cli
tccutil reset AppleEvents com.apple.Terminal
tccutil reset AppleEvents com.googlecode.iterm2
```

重置后再走一次权限触发脚本：

```bash
open dist/OpenDesk.app --args -script examples/mac/request-macos-permissions.js -timeout 2
```
