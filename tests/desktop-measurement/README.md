# Desktop Measurement：验证资产

Desktop Measurement 的标准 Interaction Oracle 位于产品所有权域：

- [`apps/opendesk/prototypes/desktop-measurement/index.html`](../../apps/opendesk/prototypes/desktop-measurement/index.html)
- [`apps/opendesk/prototypes/desktop-measurement/prototype.css`](../../apps/opendesk/prototypes/desktop-measurement/prototype.css)
- [`apps/opendesk/prototypes/desktop-measurement/model.js`](../../apps/opendesk/prototypes/desktop-measurement/model.js)
- [`apps/opendesk/prototypes/desktop-measurement/interaction-core.js`](../../apps/opendesk/prototypes/desktop-measurement/interaction-core.js)
- [`apps/opendesk/prototypes/desktop-measurement/template.html`](../../apps/opendesk/prototypes/desktop-measurement/template.html)（仅历史兼容入口）

本目录保存 Prototype 验证、跨平台 qualification manifest、fixtures 与资格说明；`tests/` 不拥有产品交互基准。Prototype 是 UI / Interaction Oracle，不是 Native PASS。

## 权威入口

- [唯一产品与 Framework 设计正文](../../docs/architecture/desktop-automation/desktop-measurement.md)
- [Prototype 历史验证](../../docs/quality/desktop-measurement-prototype.md)
- [Prototype → Native → OS Qualification Matrix](../../docs/quality/desktop-measurement-qualification.md)
- [`qualification-manifest.json`](./qualification-manifest.json)：真实平台状态；未运行必须保持 `NOT_RUN`。

曾用于推进 P0–P4 的阶段性 implementation 文档和执行 prompt 已完成使命并移除。P0–P4 中仍有效的能力已经落到上述 canonical 设计、`pkg/measurement/**`、Recorder 集成、自动测试和 qualification 资产中；后续不得再建立第二份 Measurement 总设计或用历史 prompt 覆盖 HTML Oracle。

## Prototype Oracle

从仓库根目录运行：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

也可以直接体验：

```sh
open apps/opendesk/prototypes/desktop-measurement/index.html
```

Windows 可在文件管理器中双击同一文件，或从仓库根目录运行：

```powershell
Start-Process .\apps\opendesk\prototypes\desktop-measurement\index.html
```

样机不需要运行 OpenDesk、安装前端依赖或启动 HTTP server。浏览器直接打开本地文件时可能限制剪切板；页面提供手工复制回退。

`browser.test.py` 先验证 `index.html` 只引用 `prototype.css + model.js + interaction-core.js`，并验证 `template.html` 不再复制第二套实现；随后在 Chromium 中使用这些同一份源码执行交互 Oracle。

当前浏览器合同重点覆盖：

```text
默认 MEASURING + 冻结 Snapshot
三入口复用同一 session
磁吸定位默认开启
屏幕 / 窗口 / 区域三级坐标
冻结源像素颜色
语义候选来源与 reliability
Tab / Shift+Tab 候选层级
Alt / Option 临时暂停磁吸
Target → Window signed margins
Target → Local Reference signed margins
HUD 最多两组边距
Overlay 一次只画四条当前边距线
稳定重定位线索 vs runtime evidence
点 / 两点 / 两区域
更新画面 → 新 generation / snapshotId
旧 Snapshot 异步候选失效
ADJUSTING 隐藏所有 Measurement 层并使旧 snapshotId 失去当前身份
继续测量 → 同 session 新 Snapshot
视觉候选不冒充语义控件
负坐标
1x + 2x 多屏映射 fixture
Inspector 按需
Toast 不截获输入
退出清理
```

这些全部是 synthetic browser proof，不证明系统权限、native focus、系统剪切板、真实 Recorder 输入隔离或物理 DPI。浏览器测试需要 Python Playwright 和 Chromium，运行输出写入 `.runtime/tests/desktop-measurement/prototype/`，不写回样机、fixture 或历史证据目录。

## Production automated proof

核心生产测试分散在实际 owner package 中：

```sh
go test ./pkg/measurement/...
go test ./pkg/customui/...
go test ./pkg/recorder/...
go test ./pkg/appshell/...
go test ./cmd/opendesk -run 'Measurement|Recorder'
go test ./internal/recorderbundle/...
```

专用 GitHub Actions：

```text
.github/workflows/desktop-measurement.yml
```

在 Ubuntu / macOS / Windows runner 上验证：

```text
Measurement core / Evidence / Authoring / Qualification / Repair
CustomUI Measurement host contracts
Recorder Measurement evidence
App Shell / App Mode Measurement owner 与 Recorder bridge
全局快捷键共享 Service 合同
Recorder pause / no-auto-resume 隔离合同
Recorder canonical source ↔ embedded bundle parity
```

重点 owner 测试包括：

```text
pkg/measurement/model*_test.go
pkg/measurement/product_contract_test.go
pkg/measurement/session*_test.go
pkg/measurement/interaction_test.go
pkg/measurement/surface_overlay_test.go
pkg/measurement/structured_test.go
pkg/measurement/evidence_test.go
pkg/measurement/provenance_test.go
pkg/measurement/capture_mapping_matrix_test.go
pkg/measurement/qualification_test.go
pkg/measurement/authoring_test.go
pkg/measurement/repair*_test.go
pkg/customui/measurement_host_contract_test.go
pkg/recorder/measurement_evidence_test.go
cmd/opendesk/app_measurement*_test.go
cmd/opendesk/app_recorder_test.go
internal/recorderbundle/measurement_contract_test.go
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

Authoring: Recorder → Measurement evidence/artifact
Repair: real failure → Measurement repair → retry → business verification
```

完成一项真实资格验证后，更新 `qualification-manifest.json`：

- `status`: `PASS` / `FAIL`
- `evidence`: 日志、截图、artifact 等实际证据引用

不得因为 Chromium、Go unit test 或 GitHub-hosted macOS / Windows runner contract test 通过，就将物理 OS 真机行改为 PASS。

## 样机边界

网页入口、合成桌面、synthetic UI tree、视觉像素候选和显示器 fixture 只用于样机控制。正式产品由开发者菜单、Recorder 工具栏与全局快捷键进入同一个 Native Measurement Service。

背景、窗口、候选、显示器均为合成数据。网页不读取真实桌面，也不注册系统级快捷键。取色来自冻结的合成 Canvas；正式实现的 RGB 必须来自 Frozen Native Capture Pixel。
