# 桌面测量中文样机：历史验证与入库记录

> 2026-09-14，保存已确认方案的验证资产。本页记录上传交付包中的历史结果，不是本轮重新运行测试的报告，也不是 OpenDesk 原生产品验收。

## 入口与本次保存范围

[唯一产品设计](../architecture/desktop-automation/desktop-measurement.md) · [中文 HTML 样机](../../apps/opendesk/prototypes/desktop-measurement/index.html) · [样机资产说明](../../apps/opendesk/prototypes/desktop-measurement/README.md) · [验证说明](../../tests/desktop-measurement/README.md) · [Qualification Matrix](./desktop-measurement-qualification.md)。

设计正文继续只维护 canonical 文件。样机现由 `apps/opendesk/prototypes/desktop-measurement/` 长期保存，作为 OpenDesk 产品的 UI / Interaction Oracle；这表示产品所有权，不表示它是正式应用入口，也不表示样机会进入 Runtime 生产执行链路。Node / Playwright 验证、fixtures 与导入清单继续留在 `tests/desktop-measurement/`。

曾用于推进 Native P0–P4 的阶段性 implementation 文档与执行 prompt 已完成使命并移除。它们产生的有效 Geometry / Evidence / Authoring / Qualification / Repair 能力保留在正式代码、canonical 设计和 qualification 资产中；其中任何旧 UI/Interaction 描述都不得覆盖当前 HTML Oracle。

2026-09-15 仅进行了目录职责调整：`index.html`、`template.html`、`model.js` 复用原 Git blob 迁移，样机内容没有因目录迁移而修改。导入时旧路径与当前路径同时记录在 [`import-manifest.json`](../../tests/desktop-measurement/import-manifest.json)，避免重写历史。

源文件一致性：原单文件 HTML 和交付包中的 `prototype/index.html` 字节相同，SHA-256 为 `8ff69e481d09778e7870228bba143c5b90a123af414f97503e424784082a34c5`。模板插入模型全文与单文件 HTML 一致。

原始 PNG 截图、完整 ZIP 和逐次运行日志不作为维护源码入库；来源清单保留各文件校验值，不能把清单等同于原始图像证据。后续截图、日志和下载结果统一写入 `.runtime/tests/desktop-measurement/prototype/`。新对话可直接打开已入库 HTML 理解交互，不依赖原对话附件；若要复查当时的原始截图，则仍需原始交付包。

## 历史验证记录（原报告内容）

范围：独立 HTML 样机，不是 OpenDesk Runtime 或原生桌面验收。下表保留 2026-09-14 原报告事实，不再作为当前模块化 Oracle 的 UI 合同；当前交互合同必须以仓库中的 `index.html + interaction-core.js` 及 `browser.test.py` 为准。

### 几何模型

16 项 / 16 项通过。详细 TAP 输出见原交付证据 `evidence/model-tests.txt`；其中一项包含 1000 组矩形恒等式。

### 浏览器交互

34 项 / 34 项通过。浏览器脚本异常：0。

| 检查 | 状态 | 证据边界 |
| --- | --- | --- |
| 默认测量界面不打开详情 | PASS | 浏览器合成样机 |
| 默认同时绘制参照与目标 | PASS | 浏览器合成样机 |
| 三个网页模拟入口复用同一会话 | PASS | 浏览器合成样机 |
| 鼠标移动不会切换锁定参照 | PASS | 浏览器合成样机 |
| 2x冻结源蓝色像素取色 | PASS | 浏览器合成样机 |
| 像素色包含源图坐标与显示器 | PASS | 浏览器合成样机 |
| 详情只在用户请求时打开 | PASS | 浏览器合成样机 |
| Esc关闭详情而非结束会话 | PASS | 浏览器合成样机 |
| 打开关闭详情不污染原始取色 | PASS | 浏览器合成样机 |
| 两点真实样机数据导出距离 | PASS | 浏览器合成样机 |
| 两区域间距与重叠分别导出 | PASS | 浏览器合成样机 |
| 越过参照右边缘显示负44 | PASS | 浏览器合成样机 |
| 距离标签不藏在角落信息下 | PASS | 浏览器合成样机 |
| 角落避让 top-left | PASS | 浏览器合成样机 |
| 角落避让 top-right | PASS | 浏览器合成样机 |
| 角落避让 bottom-left | PASS | 浏览器合成样机 |
| 角落避让 bottom-right | PASS | 浏览器合成样机 |
| 负逻辑坐标仍正确取色 | PASS | 浏览器合成样机 |
| 双屏模拟保留不同像素映射 | PASS | 浏览器合成样机 |
| 拖动区域更新位置不改变大小 | PASS | 浏览器合成样机 |
| 拖动尺寸手柄可调整区域 | PASS | 浏览器合成样机 |
| 方向键微调区域一个逻辑单位 | PASS | 浏览器合成样机 |
| Tab可切换更大候选 | PASS | 浏览器合成样机 |
| 按住Alt暂停吸附 | PASS | 浏览器合成样机 |
| 第1档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 第2档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 第3档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 剪切板不可用时显示手动复制而非虚报成功 | PASS | 浏览器合成样机 |
| 保存可解析结构化JSON | PASS | 浏览器合成样机 |
| 更换参照需显式确认且不更换源快照 | PASS | 浏览器合成样机 |
| 退出移除所有测量层并清理样机会话引用 | PASS | 浏览器合成样机 |
| 退出后测量快捷键不产生结果 | PASS | 浏览器合成样机 |
| 退出后可通过Recorder模拟入口新建会话 | PASS | 浏览器合成样机 |
| 没有浏览器脚本异常 | PASS | [] |

### 真实环境待验收

所有系统级结论仍为 NOT_RUN：macOS 与 Windows 原生 surface、窗口焦点、全局快捷键、真实 Recorder 事件、系统剪切板、多物理显示器、真实 Retina／混合 DPI、进程异常后的 topmost／hook／快照清理。

设计覆盖自评 96/100，不是独立专家评分，不是原生发布评分。设计审查与真机验收分别记录，不能平均分掩盖任一 P0 缺口。

## 2026-09-15 Native Measurement 验收增补

本节覆盖当时本地 `master` 的 Production 实现，取代上节“所有系统级结论均 NOT_RUN”的泛化表述；历史样机报告本身仍只描述 Prototype。当前发布资格状态继续以 `desktop-measurement-qualification.md` 与 `qualification-manifest.json` 为准。

- Oracle 未进入生产：`apps/opendesk/prototypes/desktop-measurement/index.html` 继续定义 UI / Interaction，Native 继续使用 `pkg/measurement` 的 CaptureMapping、Reference、Result 和冻结源 PNG。
- Stable surface：首次 Capture 后创建一个 Measurement Window；状态变化 patch 已有 DOM control，重复入口复用 Session，显式刷新才重新 Capture；测试断言 window ID、capture count 和 event sink 数量稳定。
- Native UI：冻结桌面之上显示 Target / Reference outline、底部居中小工具条和约 268 logical-unit 的 corner HUD；Inspector 默认隐藏，并由 `I` / 详情打开。
- Native keyboard：当前产品键盘合同以 HTML Oracle 为准：`1–4`、Tab / Shift+Tab、Alt / Option 临时暂停、`I` 与 Esc；区域编辑所需 Arrow / Shift+Arrow 作为 Native 编辑能力继续由生产测试覆盖。旧 P0 文档曾列出的 `R` 与三档复制组合不再作为当前 UI 合同。
- Control patch：MemoryDriver 现在保存并暴露 `img Source`，连同 Text、Visible、Classes、Value 支持增量渲染的合同测试。

本机 macOS 真实 OpenDesk 证据：`23-frozen-snapshot-assets-retry.png`（真实冻结画面与底部工具条）、`24-key-2-relay.png`（真实键盘切换区域）、`25-inspector-key-i.png` / `26-inspector-escape.png`（Inspector 的 Esc 层级）、`30-session-exit.png` / `31-session-reenter.png`（退出清理与再次进入）。这些本地运行产物位于 `.runtime/tests/desktop-measurement/macos/`，不纳入版本控制。

仍为 **NOT_RUN**：Windows Native、物理 mixed-DPI / 多显示器、真实 Recorder 隔离、系统剪切板粘贴和宿主崩溃路径。它们没有被浏览器或内存驱动测试表述为 PASS。
