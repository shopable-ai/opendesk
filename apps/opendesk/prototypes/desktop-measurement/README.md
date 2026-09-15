# Desktop Measurement Prototype

本目录保存 OpenDesk「桌面测量」已经确认的长期 **UI / Interaction Oracle**。

它用于验证产品交互、信息层级、状态转换和几何语义；**不是生产 Runtime，不读取真实桌面，不替代 `pkg/measurement`、Accessibility / UIA、OCR、Perception Resolver 或 Native Host。**

## 直接体验

从仓库根目录直接执行：

```bash
open apps/opendesk/prototypes/desktop-measurement/index.html
```

不需要 `npm install`、HTTP Server 或运行 OpenDesk。

## 单一维护关系

```text
index.html
  ├─ prototype.css
  ├─ model.js
  └─ interaction-core.js
```

- `index.html`：唯一可执行样机页面，只保留 DOM 骨架与相对资源引用，不再内联第二套 CSS / Model / Interaction。
- `prototype.css`：Oracle 的唯一样式源。
- `model.js`：仅用于样机与合同验证的数学模型；不得复制为第二套 Runtime Geometry。
- `interaction-core.js`：Oracle 的唯一交互实现，包含冻结 Snapshot、磁吸候选、三级坐标、两级参照、两组边距、ADJUSTING / refreeze、结构化导出等合成交互。
- `template.html`：历史兼容入口，只跳转到 `index.html`；禁止再次复制实现。

`tests/desktop-measurement/browser.test.py` 会同时检查：

1. `index.html` 只引用上述外部资源；
2. `template.html` 不再包含第二套交互；
3. Chromium 使用这些同一源码完成产品交互验证。

因此 Prototype 不再允许出现“旧单文件样机”和“新模块化样机”同时维护的分叉状态。

## 当前 Oracle 合同

样机当前覆盖：

- 默认冻结 Snapshot；目标应用没有被“暂停”，只是测量基于同一帧。
- `更新画面`：保持同一 session，生成新的 `generation + snapshotId`。
- `调整界面`：进入 `ADJUSTING`，旧 Snapshot 立即失去当前身份；冻结层、蒙版、Overlay、HUD、工具条、Inspector 全部隐藏，恢复合成真实桌面交互。
- `继续测量`：重新冻结并生成新 Snapshot；旧异步候选 token 不得污染新 Snapshot。
- 鼠标旁显示屏幕 / 窗口 / 当前可靠区域三级坐标与冻结源像素颜色；没有可靠区域时必须显示 `区域 —`。
- 磁吸定位默认开启；Tab / Shift+Tab 只切换当前候选层级，Alt / Option 临时暂停。
- 候选来源诚实区分 `synthetic-ui-tree` 与 `pixel-region-growing`；视觉候选只能是 estimated visual evidence，不能冒充 `textField` 等真实语义控件。
- Target 最多同时保留两级有效参照：整个目标窗口 + 一个有布局价值的 Local Reference。
- HUD 最多显示两组有符号边距：`Target → Window`、`Target → Local Reference`。
- Overlay 一次只重点绘制一组四边距线，不同时绘制八条线。
- Inspector 默认关闭；结构化数据区分 stable relocation evidence 与 runtime evidence，绝对坐标不会自动升级为长期 Locator。
- 三个模拟入口复用同一个 session；退出后清理 Snapshot、Overlay、候选和临时交互状态。

## 真实性边界

Prototype 中的：

- 微信界面；
- synthetic UI tree；
- Canvas 像素；
- 多屏 fixture；
- 浏览器 clipboard；

全部都是测试替身。

以下结论必须由生产代码和真机验收提供，不能由本样机冒充：

- macOS / Windows 真实窗口与显示器几何；
- 真实截图排除 Measurement Surface；
- Accessibility / UIA / OCR / Vision 候选；
- Native Surface 焦点、输入路由和 Dock / Taskbar 行为；
- Recorder 真实输入隔离；
- 系统级剪切板；
- 多显示器 / Retina / DPI 真机体验。

## 正式实现与文档

- 正式产品设计正文：`docs/architecture/desktop-automation/desktop-measurement.md`
- 正式 Framework：`pkg/measurement/**`
- Native / Custom UI host contract：`pkg/customui/**`
- App Mode 三入口 owner：`cmd/opendesk/**measurement**`
- Recorder 集成：`apps/opendesk/recorder/**`、`pkg/recorder/measurement_evidence.go`
- Oracle / qualification tests：`tests/desktop-measurement/**`

运行截图、日志、下载结果和测试证据统一写入 `.runtime/`，不提交到本目录。
