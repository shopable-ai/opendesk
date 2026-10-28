# FloatingWindow tooltip 定位

## 本轮需求与设计

来源：用户要求纵栏 tooltip 通常显示右侧，接近屏幕右缘时可显示左侧，并允许指定首选方向。保持已确认的 40×40pt 居中纯文字按钮、独立 label/Accessibility 语义和 copy-only 行为。

公开契约只增加构造选项 `tooltipPosition: 'auto' | 'right' | 'left' | 'top' | 'bottom'`。省略为 auto；配置是首选方向，不能覆盖屏幕安全边界。macOS 自动纵栏依次 right/left/bottom/top，横栏 bottom/top/right/left；显式方向先尝试该方向和反方向，再尝试另一轴。Windows 本轮保留 WinForms 默认 tooltip，显式配置返回 UNSUPPORTED_CAPABILITY。

以按钮或 Switch 的当前屏幕锚点选择屏幕：优先包含锚点中心的屏幕，否则选择距离锚点最近的屏幕。所有几何使用 AppKit logical points，保留多屏负坐标，不混入 Retina 像素。工作区取该屏幕 visibleFrame，内缩 6pt。避让区为整条栏体，提示面板距离栏体外缘 8pt。仅垂直于出示方向的轴允许夹取，不能把提示推回栏内。

先按固定次序尝试正常宽度（文字至多 300pt）的完整提示；四个方向都无法容纳时，再逐方向按可用宽度重新测量与换行。测量额外验证每个不可分割字形簇的自然宽度与 CoreText 实际墨迹边界，避免受约束测量把宽字形误报为可容纳。叠加音标或 fallback 字形的墨迹超出原生文本框安全行盒时，抑制本次提示。始终完整测量文本，不截去尾部，不压缩字体；确实无法完整放下则抑制本次提示，完整 label 仍保留在 Accessibility。没有“持续翻转”记忆或每帧试探，避免抖动。

复用已有非激活、忽略鼠标的原生 NSPanel owner。Button 与 Switch 共用策略。显示前再次核对窗口可见、当前鼠标仍在锚点内；移动、尺寸变化、屏幕拓扑变化、移出、隐藏和关闭均销毁提示并取消延迟展示。label 更新取消旧提示，仍在控件内时重新延迟测量；重开需新的 hover，不复活旧提示。

不增加每按钮配置、HTML 提示层或仅供测试的公开几何 API。正式 JS Runtime 测试覆盖公开契约，内部几何回归直接编译生产 seam；当前自有窗口截图与独立 WindowServer bounds 读回证明实际方向、间隙、边界和清理。多屏如无设备只报告模拟几何覆盖。

## 验证记录

2026-10-27，在既有 master 的 `39ff3eebad34de5c020ebe699909129600d76d56` 基础上修改；本轮未提交、未推送，未创建分支或 worktree。正式运行产物在 `.runtime/tests/floating-tooltip/`，不进入版本控制。旧轮截图和分数不作为本轮证据。

### 代码已修改

- Runtime、ToolbarSpec、core 校验、类型与 canonical Reference 同步一个不可变 `tooltipPosition`。配置值要求 primitive string；null、undefined、装箱字符串、空值与未知枚举拒绝。配置 getter 只读取一次，验证与导出的值保持一致；getter 删除后续配置字段时明确返回 INVALID_SPEC，避免 nil 异常。
- AppKit Button 与 Switch 复用非激活 NSPanel，使用整栏外框、当前锚点屏幕和确定性回退。几何与文本测量是内部 seam，不新增公共诊断字段。
- WinForms owner 对显式配置明确拒绝；省略配置保留旧行为。本机无 dotnet，C# 修改仅静态审查，没有 Windows 构建或实机证明。

### 实际已加载

从仓库根运行 `GO_BIN=/Users/shopme/native-client-validation/r8.4b/toolchains/go/bin/go scripts/build_macos_app.sh`，使用固定 `dist/OpenDesk.app`、原 Bundle ID `com.opendesk.cli` 与现有 ad-hoc 开发签名流程。`codesign --verify --deep --strict` 通过；这不是 Developer ID 或公证发行。

最终 candidate9 的主程序 PID 90300、配套 UI host PID 90301，均由进程命令读回确认加载本仓库 `dist/OpenDesk.app/Contents/` 下的产物；不使用 `/Applications/OpenDesk.app`。`.runtime/tests/floating-tooltip/candidate9/provenance.json` 保留路径、时间、源码与二进制 SHA-256，Runtime `logs/` 保留实际加载的 probe 快照和摘要。PID 仅代表本次运行，验收结束后窗口及进程已正常退出。

### 功能已验证

| 验证 | 当前结果 |
| --- | --- |
| 内部生产几何与测量 seam | 303,528 条断言、13,440 个实际放置通过；包括四角、所有回退次序、负坐标、小区域、fractional logical points、超大文字拒绝、﷽ 宽字形拒绝、上下堆叠音标抑制、普通重音字符与 ZWJ emoji |
| 正式 JS tooltip contract | 16 类非法配置拒绝，getter 只读一次、删除后续字段安全拒绝；两种 orientation × 省略/五种配置共 12 组创建、readback、label 更新、text/icon 兼容与非法 patch 原子拒绝通过 |
| 正式 JS 文字 Runtime 回归 | 7 类非法声明、4 类非法更新、busy 实际文字、旧图标兼容与 192 个并发响应一致性通过 |
| 自有窗口现场 | candidate9 共 32 个场景通过；WindowServer 独立核对实际侧向、完整工作区内缩、8pt 栏体间距和隐藏/关闭后零提示窗口 |
| Node 回归 | 112 项：110 通过，2 项既有可选 Browser oracle 跳过 |
| Go | `go test ./pkg/customui ./tests/custom-ui`、既有 `TestFloatingWindow`（`-vet=off`）通过；`go vet ./pkg/customui/toolbar ./pkg/customui/machost` 通过 |
| API 文档 | `node scripts/api-docs.js check` 与 `node scripts/check_api_docs_contract.js` 通过；导航的 29 个既有正文缺口不是本轮接口语义认证 |

正式 JS 命令均从仓库根直接运行，使用本轮配套构建：

```sh
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-tooltip.js -console-mode script -log-dir .runtime/tests/floating-tooltip/contract-run
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-text.js -console-mode script -log-dir .runtime/tests/floating-tooltip/text-run
```

现场覆盖普通纵栏右侧、右缘转左、上下缘和四角、中文自动换行、显式多行、连续英文、显示中更新 label、上下堆叠音标抑制并保留完整 AX 名称、正常重音文字恢复、移动销毁、移出销毁、hide/show 与新 hover、延迟展示前隐藏、close 清理、横栏默认下方/底缘翻上、四种显式首选侧及 Switch 左侧/隐藏清理。没有新增 HTML tooltip。截图通过 ScreenCaptureKit 仅包含当前自有 host PID 的窗口；WindowServer bounds 为独立观察来源。自身 host 的 AX focused-window 读回为 no value，提示 panel 明确拒绝成为 key/main window；未读取其他应用焦点或草稿。

### 视觉已确认

独立视觉评审重新实际查看最终 candidate9 的 02–32 共 31 张截图，并核对全部 32 阶段 JSON；五项平均 **96.6/100，达到 ≥95 要求**。图片编号、WindowServer 读回及截图范围见 `.runtime/tests/floating-tooltip/candidate9/observations.json`。

| 维度 | 分数 | 扣分依据 |
| --- | ---: | --- |
| 排版对齐 | 100 | 五个 40pt 按钮居中稳定，无可见错位、遮挡或裁切 |
| 文字可读性 | 96 | 长中文行距稍紧 −2；连续英文跨行阅读连续性较弱 −2 |
| 视觉一致性 | 98 | 相同提示侧向 113×30pt、上下 114×29pt，尺寸微差 −2 |
| 空间比例 | 95 | 长提示相对纵栏横向扩张明显 −3；英文末行留白不均 −2 |
| 交互状态 | 94 | 显式上下提示距中部触发按钮较远 −4；hover 明度差较轻 −2 |

平均为 `(100 + 96 + 98 + 95 + 94) / 5 = 96.6`。分数仅适用于本轮 macOS 单屏 2× Retina 自有窗口；不替代完整生产示例验收。静态截图不证明动画、闪烁或延迟质量，AX 名称读回也不替代屏幕阅读器实测。尚未覆盖其他缩放或复杂背景。

独立代码复核给出非阻断 COMMENT，getter 删除后续字段与字形裁切两项 MEDIUM 已关闭，无剩余请求修改项。原始两份最终评审保存于 `.runtime/tests/floating-tooltip/independent-final-reviews.json`，整体验证摘要为 `.runtime/tests/floating-tooltip/verification.json`。

### 现场边界

本机只有一个 2× Retina 显示器（1728×1117 logical points）；多屏、负坐标和极小工作区只取得内部几何证据，未声称多屏实机通过。屏幕拓扑变化/原生 resize 的取消路径已实现并审查，没有热插拔或原生 resize 现场证据。未运行独立 TypeScript compiler；类型声明由合同审查及 API gate 核对。Windows 未编译或实机验收。

本轮未执行访问 Codex 的生产示例一行命令，完整生产链路仍为 NOT_TESTED。保持 `COPY_ONLY_PENDING_AX_VALIDATION`；无粘贴、Enter、Codex 草稿读取、Browser 真实迁移或同步服务验证。未修改用户 library/config、安装目录、Browser 服务或模型路由。全仓 vet 的既有 Seek 告警与 Go 测试台账问题不在本轮范围内，不宣称全仓通过。
