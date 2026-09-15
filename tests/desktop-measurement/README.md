# 桌面测量：验证资产

标准中文交互样机位于 OpenDesk 产品所有权域：

- [`apps/opendesk/prototypes/desktop-measurement/index.html`](../../apps/opendesk/prototypes/desktop-measurement/index.html)
- [`apps/opendesk/prototypes/desktop-measurement/template.html`](../../apps/opendesk/prototypes/desktop-measurement/template.html)
- [`apps/opendesk/prototypes/desktop-measurement/model.js`](../../apps/opendesk/prototypes/desktop-measurement/model.js)

本目录保存 Prototype 验证、跨平台 qualification manifest、fixtures 与资格说明。Prototype 是 UI / Interaction Oracle，不是 Native PASS。

## 权威入口

- [产品与交互设计](../../docs/architecture/desktop-automation/desktop-measurement.md)
- [P0–P4 实现架构](../../docs/architecture/desktop-automation/desktop-measurement-implementation.md)
- [Prototype 历史验证](../../docs/quality/desktop-measurement-prototype.md)
- [Prototype → Native → OS Qualification Matrix](../../docs/quality/desktop-measurement-qualification.md)
- [`qualification-manifest.json`](./qualification-manifest.json)：真实平台状态；未运行必须保持 `NOT_RUN`。

## Prototype Oracle

从仓库根目录运行：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

浏览器测试需要 Python Playwright 和 Chromium。它证明合成 UI/Interaction 行为，不证明系统权限、native focus、剪切板、Recorder 隔离或 DPI。

## Production automated proof

核心生产测试分散在实际 owner package 中：

```sh
go test ./pkg/measurement/...
go test ./pkg/customui/...
go test ./pkg/recorder/...
```

重点覆盖：

```text
pkg/measurement/model*_test.go
pkg/measurement/session*_test.go
pkg/measurement/interaction_test.go
pkg/measurement/surface_overlay_test.go
pkg/measurement/structured_test.go
pkg/measurement/evidence_test.go
pkg/measurement/provenance_test.go
pkg/measurement/capture_mapping_matrix_test.go
pkg/measurement/qualification_test.go
pkg/measurement/authoring_test.go
pkg/measurement/repair_test.go
pkg/measurement/repair_workflow_test.go
pkg/customui/measurement_host_contract_test.go
pkg/recorder/measurement_evidence_test.go
```

若环境允许，最后运行：

```sh
go test ./...
```

## OS Qualification

真实 macOS / Windows 验收至少覆盖：

```text
macOS: native overlay, keyboard, clipboard, Accessibility, global shortcut,
       Recorder entry, Retina, physical multi-display

Windows: native host, UIA, 100/125/150/200%, mixed DPI, clipboard,
         keyboard, global shortcut, physical multi-display

P3: Recorder → Measurement evidence/artifact
P4: real failure → Measurement repair → retry → business verification
```

完成一项真实资格验证后，更新 `qualification-manifest.json` 的对应 case：

- `status`: `PASS` / `FAIL`
- `evidence`: 日志、截图、artifact 等仓库内或测试输出引用

不得因为 Prototype 或纯 Go geometry test 通过而将物理 OS 行改为 PASS。

## 样机边界

网页顶部模拟入口、场景选择器和合成桌面只用于样机控制；正式产品由开发者菜单、Recorder 工具栏与全局快捷键进入同一个 Native Measurement Session。

背景、窗口、候选、显示器均为合成数据。网页不读取真实桌面，也不注册系统级快捷键。取色来自合成 Canvas；正式实现的 Point RGB 必须来自 Frozen Native Capture Pixel。
