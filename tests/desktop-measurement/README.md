# 桌面测量：样机验证资产

标准中文交互样机已经由测试目录迁移到 OpenDesk 产品所有权域：

- [`apps/opendesk/prototypes/desktop-measurement/index.html`](../../apps/opendesk/prototypes/desktop-measurement/index.html)
- [`apps/opendesk/prototypes/desktop-measurement/template.html`](../../apps/opendesk/prototypes/desktop-measurement/template.html)
- [`apps/opendesk/prototypes/desktop-measurement/model.js`](../../apps/opendesk/prototypes/desktop-measurement/model.js)

本目录只保留对样机与桌面测量合同的验证代码、fixtures 和历史导入记录。`tests/` 不是临时目录，但测试不再拥有产品交互基准。

## 直接打开

从仓库根目录在 macOS 上可执行：

```sh
open apps/opendesk/prototypes/desktop-measurement/index.html
```

Windows 可在文件管理器中双击同一文件，或运行：

```powershell
Start-Process .\apps\opendesk\prototypes\desktop-measurement\index.html
```

样机不需要运行 OpenDesk、安装前端依赖或启动 HTTP 服务。浏览器直接打开本地文件时可能限制剪切板；页面提供手工复制回退。

## 职责与入口

- [唯一产品设计](../../docs/architecture/desktop-automation/desktop-measurement.md)：用户流程、功能树、状态机、目标与参照、快照、几何和原生验收门槛。
- [长期交互样机](../../apps/opendesk/prototypes/desktop-measurement/README.md)：桌面测量原生实现的 UI / Interaction Oracle。
- [历史样机验证记录](../../docs/quality/desktop-measurement-prototype.md)：历史 16 项模型测试与 34 项浏览器检查的范围，不代表当前原生产品 PASS。
- [实施提示词](../../prompts/desktop-measurement-implementation.md)：推进真实 Measurement Session，而非重做网页样机。

正式实现继续使用已有产品 owner 和 native surface。样机不能成为 Runtime 发行入口，也不能复制出第二套 Runtime Geometry。

## 样机与正式设计的边界

中间画面上的参照虚线、目标实线、距离线、角落信息和小工具条是交互参照。页面顶部的模拟三入口、底部的场景／显示器切换器属于样机控制器，不能照搬进正式产品。

背景、窗口、吸附候选和显示器均为合成数据。页面不读取真实桌面，不连接 OpenDesk Runtime，也不从网页注册系统级快捷键。取色来自合成 Canvas 的冻结源像素；剪切板成功测试使用替身，不能替代系统剪切板验收。

建议体验顺序：区域相对窗口 → 点与颜色 → 两点 → 两区域 → 区域越界 → 四角避让 → 详情开关 → 三档复制 → 退出及再次进入。支持框选、拖动、八方向尺寸手柄、1–4 切换工具、Tab 切换候选、Alt 暂停吸附和方向键微调。

## 源文件与测试

`apps/opendesk/prototypes/desktop-measurement/template.html` 与 `model.js` 是原交付包的模板和模型；`index.html` 是单文件浏览器入口。三者的维护关系为将模板中的唯一 `/*__MODEL__*/` 替换为模型全文。若产品设计明确变更，应保持三者一致，不能分别发展成不同方案。

`model.test.js` 是 Node 宿主侧模型测试，`browser.test.py` 是 Python Playwright 浏览器测试；二者都不是 OpenDesk Runtime API 或真实桌面测试。`fixtures/export-example.json` 是历史合成导出的固定样例，包含 `prototypeOnly: true`。

从仓库根目录复验：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

浏览器测试需要 Python Playwright 和可用 Chromium。运行输出统一写入 `.runtime/tests/desktop-measurement/prototype/`，不写回样机、fixture 或历史证据目录。

原生权限、焦点、Recorder 隔离、物理多屏、系统剪切板和资源清理必须由真实 OpenDesk / OS 验收；网页 PASS 不能沿用为原生 PASS。

## Native parity 与真实桌面验收

Prototype 是长期 UI / Interaction Oracle，Native 是 Production；不要将 Prototype 的模型或合成 geometry 复制进 `pkg/measurement`。Production 继续以 `CaptureMapping`、`Reference`、`Result` 和冻结源 PNG 为唯一几何与取色来源。

从仓库根目录运行 Native contract 回归：

```sh
go test ./pkg/measurement/...
go test ./pkg/customui/...
node --test tests/custom-ui/measurement-keyboard-bridge.test.js
```

这些测试保护：single stable surface、显式刷新才 Capture、Source / Text / Visible / Classes / Value patch、默认隐藏 Inspector、四种测量模式、Region body drag 与八方向 resize、键盘词表与 Esc 层级、参照锁定、三档输出和清理／重入。它们不是 `strings.Contains` 的替代品：核心行为由 Session / MemoryDriver state 和事件结果断言。

macOS 真机应在完成 `make build` 与正式 App bundle 构建后，以真实 OpenDesk 的开发者菜单、Recorder 或全局快捷键启动；至少保留冻结 Snapshot、底部工具条与 HUD、`2`、`I`、Inspector 的 `Esc`、Session 的 `Esc` 和重新进入的实窗证据到 `.runtime/tests/desktop-measurement/macos/`。Windows Native、物理混合 DPI / 多显示器和未具备条件的真实 Recorder 场景要明确记录 **NOT_RUN**，不能由本 README 的浏览器测试补齐。
