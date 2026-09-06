# ImageColor 示例

本目录集中保存 `ImageColor` 的可运行示例和固定输入图片。

## ImageColor.findImage / findImages

从仓库根目录运行：

```bash
./opendesk -script examples/image-color/template-match.js
```

`template-match.js` 直接读取版本化、可视化查看的输入图片：

- [`fixtures/template-match/scene_color_blocks.png`](fixtures/template-match/scene_color_blocks.png)：320×240 的 source 图片；
- [`fixtures/template-match/template_blue-panel.png`](fixtures/template-match/template_blue-panel.png)：source 中坐标 `(202, 132)` 的 88×64 template。
- [`fixtures/wechat-panel.png`](fixtures/wechat-panel.png)：微信左侧栏的静态截图；它提供八个不同按钮的 source。
- [`fixtures/wechat-sidebar-states.png`](fixtures/wechat-sidebar-states.png)：由提供的侧栏截图去除头像后保留的 62×200 状态 source；其中消息为灰色未选中、联系人为绿色已选中。
- [`fixtures/wechat-message/`](fixtures/wechat-message/README.md)：真实的绿色已选中和灰色未选中“消息”状态模板。
- [`fixtures/wechat-contacts/`](fixtures/wechat-contacts/README.md)：绿色已选中联系人模板；其灰色 counterpart 是 `wechat-sidebar/contacts.png`。
- [`fixtures/wechat-sidebar/`](fixtures/wechat-sidebar/README.md)：联系人、收藏、视频号、小程序、看一看、手机与设置菜单的真实模板与裁剪坐标。

示例断言 `findImage` 的坐标、尺寸、中心点、置信度、ROI、scale 和 `templateIndex`，并同时覆盖
`findImages` 与旧版 `findPos`。针对八个不同侧栏按钮，每张模板都从主截图逐像素裁剪，并且分别执行
全图与紧凑 ROI 匹配；它们不是状态数组。消息与联系人各自的灰/绿真实模板则作为同一控件的状态数组
额外验证，结果会回显正确的 `templateIndex` 并拒绝反向状态。

提供截图中的灰色“消息”和绿色“联系人”是两个不同控件，即使同时出现也绝不能拼进同一个状态数组；分别使用
消息或联系人的 `[unselected, selected]` 模板与各自的单行 ROI。

业务默认先用状态数组进行一次分类：`templateIndex: 0` 是未选中、`1` 是已选中。只有“必须从未选中
切到已选中”时，才额外用未选中模板单独查找，并把命中作为允许点击的条件；未命中不等于已选中，必须由
状态数组复核。真实桌面点击不要把状态数组直接传给 `UI.tapImage`，否则已选中时也会被点击。完整的
“分类 → 仅点击未选中 → 新截图复核”流程见 [Desktop UI 文档](../../docs/api/desktop-ui.md)。

### 可视化人工验收

在 macOS 上，从仓库根目录运行下面这一条命令：

```bash
./opendesk -ui -script examples/image-color/wechat-template-match-visual.js -console-mode script
```

它会打开一个真实 Custom UI 窗口，并保持到关闭窗口为止。无需阅读 JSON 或以耗时判断：

- 左侧同时展示两个 source：完整微信面板中的绿色已选中消息，以及放大的 62×200 侧栏 source 中的灰色未选中消息；每张图都有自己的蓝色 ROI 和红色命中框；
- 右侧并排放大 `#0 未选中`、`#1 已选中`模板，明确显示状态数组顺序、全图/ROI 的坐标、中心点、置信度、模板下标和候选数；
- 每个状态独立显示七个通过条件：裁剪一致、状态数组下标、全图/ROI 一致、相反模板在 0.95 下被拒绝、未选中 action gate、ROI 候选更少，以及模板本身不同；灰色未选中显示“只允许点未选中模板”，绿色已选中显示“不点击”。

红色在这个窗口中只表示**命中标注**，不是失败；绿色“通过”或红色“失败”仅用于验收判据。灰/绿状态模板
来自各自的真实截图，不会由颜色变换或缩放占位图伪造。它们用于 fixture 契约验证；生产运行仍应从同一微信
版本、主题、DPI 和缩放下采集两态模板。`0.95` 只是真实截图标定的起点；还应校验 `templateIndex`、命中
中心点和业务状态。关闭窗口后，任一判据失败会让命令失败。

### 自动化 ROI 一致性验证

`template-match.js` 与下面的 Runtime API 场景保留机器可读的确定性验证：

- `sidebarEvidence[]` 中每个按钮的 `full.result` 与 `roi.result` 必须在 found、坐标、尺寸、中心点、置信度、scale 和 `templateIndex` 上完全相同；不同即失败。
- `stateEvidence[]` 以同一控件的 `[unselected, selected]` 模板数组分别匹配两个真实 source，必须命中对应的 `templateIndex` 0/1，且相反状态在 `threshold: 0.95` 的单行 ROI 内不命中。
- `candidatePositions` 是根据 source、ROI 和该按钮模板尺寸计算出的确定性搜索位置数。每个 fixture 的 ROI 都必须严格更少，并由 `candidateReductionFactor` 显示缩减倍数。
- `durationMs` 是这次运行的端到端诊断耗时，包含图片解码和运行时负载；它帮助人工观察趋势，但不作为通过条件，因为墙钟时间会受机器负载影响。

需要一个只包含该场景、便于人工复跑的 Runtime API 验收时，从仓库根目录运行：

```bash
./opendesk -script tests/runtime-api/image-color-wechat-roi.js -console-mode script
```

它会输出 `WECHAT_TEMPLATE_ROI_TEST_RESULT`：八项 `sidebarEvidence`、消息和联系人的四项真实 `stateEvidence`、稳定 fixture 路径、`stateFixtureAudit`、全图/ROI 的精确结果、确定性搜索空间计数、缩减倍数，以及 `uiStateWorkflow` 的四个业务 seam（已选中零点击、未选中只点未选中模板并复核、未知状态零点击、点击后未变状态不可报成功）。每个按钮和每个状态必须全图/ROI 一致且 ROI 搜索空间更小；状态 case 还必须回显正确的数组下标和 action gate；`waits` 必须为 `0`。`durationMs` 只作为诊断信息。

`ImageColor.findImage` 是静态图片分析，没有轮询或时间间隔参数。`UI.findImage([unselected, selected])` 在一次截图中识别当前状态；`UI.tapImage(unselected)` 才是安全的 toggle 动作 gate。`UI.tapImage` 的 `timeout`、`polling` 目前只保留统一 options 合同：正式 unit 测试同时验证了稳定成功路径仅截图/匹配一次、零等待、最多一次点击，以及未命中时仍只截图/匹配一次并立即报 `TARGET_NOT_FOUND`。当前没有 `UI.waitImage`；需要“等图片出现”时，必须由调用方明确安排后续重试或等待策略，不能把一次 `tapImage` 的 `polling` 误解为等待。

## ImageColor.diff

从仓库根目录运行：

```bash
./opendesk -script examples/image-color/diff.js
```

`diff.js` 读取 `fixtures/actual-rgb.png` 与 `fixtures/expected.png`，校验确定的像素差结果。测试输入永久保存在 `fixtures/`；执行产生的差异图写入 `.runtime/examples/image-color/diff.png`。

`fixtures/` 中还包含完全相同、仅 Alpha 变化、交叠忽略区域和尺寸不一致等 black-box 测试数据。精确预期值由 `tests/runtime-api/unit/image-color.test.js` 断言，避免维护第二份会漂移的 oracle。

## 重新生成图片

默认命令只生成预览到 `.runtime/`：

```bash
go run ./cmd/generate-image-diff-fixtures
```

确认结果无误后，显式更新本目录中的版本化输入图片：

```bash
go run ./cmd/generate-image-diff-fixtures \
  --output examples/image-color/fixtures
```

`.runtime/` 只保存可清理的生成预览、差异图和运行日志，不保存正式测试输入。
