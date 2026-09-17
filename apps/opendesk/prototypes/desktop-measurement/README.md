# Desktop Measurement Prototype

本目录是长期 UI / Interaction Oracle，不是 Production Runtime，不读取真实桌面，不替代 AX/UIA、Native Host、Geometry 或 Recorder。

## 直接体验

```bash
open apps/opendesk/prototypes/desktop-measurement/index.html
```

无需 npm install 或 HTTP Server。当前主链：

```text
进入 Live 窗口选择
→ Hover 聊天窗口 / 备忘录窗口，仅预选
→ primary click 确认 Reference
→ 可观察 FREEZING
→ 成功后才出现 Frozen Snapshot 与正式 Measurement Toolbar
→ Hover / Tab / 点击锁定 Target
→ Enter / 记录
→ 在同一 Snapshot 上继续下一条测量
```

选择阶段提示固定为：

```text
移动鼠标选择窗口 · 单击开始测量 · Esc 取消
```

页面左下角 `LIVE source` 和底部 `Prototype observer` 是原型观测器：用于看见 Live source 继续变化，以及成功确认后 `frozenAt` / snapshotId 固定。它们不是 Production Toolbar。

“Live”场景、窗口、UI Tree、故障注入和源像素全部是浏览器合成测试替身，不是实际 macOS / Windows 桌面。

## 唯一维护关系

- `index.html`：DOM、统一入口和 Prototype observer。
- `prototype.css`：共享样式。
- `model.js`：数学 / geometry model。
- `interaction-core.js`：既有 Snapshot、Measurement、Records 交互主实现。
- `selection-lifecycle.js`：仅补充 `REFERENCE_SELECTING → FREEZING → MEASURING` 的确认输入门、取消/迟到结果保护、失败恢复和 test-only fixture；不建立第二套 Measurement Runtime。
- `visual-resolver.js`：Frozen Snapshot 内有预算的局部像素分析。
- `records.js`：Session Records。
- `template.html`：仅跳转，不维护第二套页面。

当前唯一合同入口是 `ORACLE.md`。`ORACLE.baseline-2026-09-16.md` 只用于历史追溯，不能恢复旧“打开即冻结 / foreground 自动 Reference”等语义。

## 关键边界

进入不截图；Hover 建议不是确认；Hover 不激活、置顶、锁定或截图。有效 Reference Confirmation 必须是 primary、同 pointerId、同 window identity、稳定 bounds、完整 down/up 且在 click tolerance 内。右键、中键、拖动、跨窗口 down/up、pointercancel、blur、window move/close 均不得确认。

Reference click 只消费“选择窗口”意图，不触发底层业务，也不成为第一条 Measurement 输入。只有确认成功、更新画面、调整界面后继续测量才创建新 Snapshot。正式颜色、坐标、区域与边距绑定 Frozen Snapshot。

点击锁定 Target ≠ Record ≠ Save。Enter／记录只追加已确认结果到内存；Update/Adjust/重选不删除历史。退出会销毁未保存内存，先复制全部或保存。浏览器下载请求不冒充文件已落盘。

## 测试与正式实现

基础模型与既有回归：

```bash
node --test tests/desktop-measurement/model.test.js tests/desktop-measurement/amendment.test.js
python tests/desktop-measurement/browser.test.py
```

本轮 Reference Selection 聚焦回归：

```bash
python tests/desktop-measurement/reference-selection.test.py
```

`browser.test.py` 继续覆盖既有 Measurement/Records/Geometry 主链；`reference-selection.test.py` 会把 `selection-lifecycle.js` 与其余 Prototype modules 一起内联，并用 Playwright 的真实 mouse/pointer/keyboard 事件验证确认链。window move/close 与 freeze failure 通过显式 test-only fixture 注入，只代表 synthetic Oracle。

Browser PASS 不代替 Native 权限、真实 topmost/z-order、窗口移动/关闭、输入、截图、overlay exclusion、多屏/DPI、Recorder 隔离或实际加载产物验收。最新实施/资格边界见：

`docs/architecture/desktop-automation/desktop-measurement-contract-coverage.md`

正式实现仍由 `pkg/measurement/**`、`pkg/customui/**`、`cmd/opendesk/**measurement**` 和现有 Recorder 集成承担。本 Prototype 变更不等于这些 Native 能力已同步。

截图、日志、导出的 JSON 和测试报告只放 `.runtime/`。生产任务产物优先复用 `.runtime/automation-authoring/<task-id>/measurement/`，不得写入 `apps/opendesk/**`。
