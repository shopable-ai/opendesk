# ACTIVE_CONTEXT

- 更新时间：2026-04-03
- 项目：`testMonkey-go`
- 当前轮次：Round 2 / Compare Gate Baseline
- 当前目标：在冻结方案 D 的前提下，补齐最小 `compare/report.json + diff.png`，并据此决定是否允许进入后续业务链路。

## 1. 问题定义

本项目要建立的不是一次性脚本，而是一套可持续演进的微信自动化视觉识别与恢复框架，用于支持：

1. 截图采集
2. 关键区域识别（状态栏、搜索区、聊天列表、聊天区、输入区、发送按钮、关键图标/色块）
3. 结构化 JSON 输出（坐标、尺寸、颜色、OCR、布局关系、图标特征）
4. HTML/CSS 镜像恢复
5. 原图 vs 镜像图可视化对比
6. 偏差报告、回归验证、失败归类与 replay
7. 在通过 gate 后，再逐步扩展到自动发送、状态恢复、自我纠偏

## 2. 当前仓库事实（已核实）

当前主仓库已经有不少可复用基础，不需要从零开始：

- 截图能力：`automation/page.go`
- macOS 稳定运行脚本：`scripts/run_macos_stable.sh`
- OCR 统一入口：`automation/vision.go`
- PaddleOCR 本地服务：`scripts/paddle_ocr_server.py`
- 颜色/布局分割：`automation/image_layout.go`
- 区域标注：`automation/vision_layout.go`
- 微信区域探测示例：`examples/mac/wechat_agent_region_probe.js`
- 微信结构化发送示例：`examples/mac/wechat_structured_send.js`
- 相关测试：
  - `automation/image_layout_test.go`
  - `automation/vision_layout_test.go`
  - `automation/page_screenshot_test.go`

结论：**主仓库已经具备 perception primitive，但缺少围绕微信视觉恢复闭环的持续化工件层。**

## 3. Round 1 冻结范围

本轮只冻结以下目标：

- 读取仓库结构
- 输出问题定义
- 完成方案矩阵与选型
- 建立持续化目录与工件约定
- 建立 preflight / replay / failure taxonomy / gates + evidence 基线
- 规划最小闭环：`capture -> detect -> mirror -> compare`

### 明确不做

- 不在本轮直接做完整微信自动发送编排
- 不做重型控制面平台化
- 不做多账号/多设备/分布式调度
- 不把 Accessibility 作为唯一主路径
- 不追求“一次性高识别率”，优先追求“可验证、可回放、可迭代”

## 4. 主线选型（摘要）

主线方案选定为：

> **方案 D：Layout-first Hybrid**
> 
> 即：以截图与布局分割为骨架，以 OCR/目标文本检测为补充，以 HTML mirror + visual diff 作为验收与纠偏层。

其核心结构是：

1. `Capture`：固定截图 contract，先保证来源稳定
2. `Detect`：先做 coarse layout，再叠加 OCR 与 role inference
3. `Mirror`：从结构化 JSON 生成 deterministic HTML/CSS
4. `Compare`：用像素差异 + 结构差异 + OCR 差异输出报告
5. `Gate`：只有 diff 达标后才允许向自动发送/状态恢复扩展

### 执行分层补充（本轮确认）

- **JS**：优先承担微信窗口探测、流程编排、probe、dashboard 等快速试验层
- **Go**：优先承担 detect / artifact contract / replay / gate / mirror / compare 等稳定内核层
- 原则：**JS 先验证局部想法，Go 固化主链路与回归能力**

## 5. 最小工件契约（Round 1 起生效）

每次最小闭环 run 至少应输出：

```text
artifacts/runs/<run-id>/
  requirement.json
  preflight.json
  capture/source.png
  detect/regions.json
  mirror/index.html
  mirror/mirror.png
  compare/diff.png
  compare/report.json
  audit.ndjson
  decision.json
```

如果缺少 `preflight.json / detect/regions.json / compare/report.json / decision.json` 任一项，则不应判定为有效 run。

## 6. 当前阻塞

1. Round 1 中记录的 `TestLayoutWithTextNoise` 失败 **在当前代码树中已不再复现**；该失败保留为历史 evidence，但不再是现时 blocker。
2. `artifacts/runs/<run-id>/` 最小 bundle 已可生成，`capture -> detect -> regions.json` 也已打通到真实 run 工件。
3. 当前 detect 仍是 **layout-first baseline**：已有 `avgColor / bbox / confidence`，但 `ocrText` 仍为空串基线，role inference 仍未引入。
4. `HTML mirror` 最小 contract 已实现：Go 负责 deterministic `index.html + styles.css + meta.json`，Playwright 负责 `mirror.png` 渲染验证。
5. `visual compare + diff report` 最小产物已实现，但当前 compare gate 结果为 `fail`，说明 mirror fidelity 还不足以进入业务动作链路。
6. 真实微信截图样本还没有收敛成 golden/replay 集。
7. macOS 权限与 OCR 可用性仍然是 preflight 关键风险。

## 7. 本轮新增 / 已解决 / 进入 failure taxonomy

### 本轮新增

- 方案矩阵与评分基线
- 持续化目录：`artifacts/ prompts/ replays/ schemas/ tests/`
- `docs/ACTIVE_CONTEXT.md`
- `docs/SOLUTION_OPTIONS.md`
- `docs/RUNBOOK.md`
- `docs/FAILURE_TAXONOMY.md`
- `docs/GATES_AND_EVIDENCE.md`
- preflight schema + preflight 脚本
- replay case 基线
- `pkg/visionrun`：run-id artifact bundle 生成器
- `cmd/visionrun`：run bundle CLI smoke 入口
- `pkg/visionrun/detect.go`：最小 detect contract 生成器
- `pkg/visionrun/detect_test.go`：detect contract 回归测试
- `pkg/visionrun/mirror.go`：最小 mirror contract 生成器
- `pkg/visionrun/mirror_test.go`：mirror contract 最小回归测试
- `schemas/region-detect-report.schema.json`：收紧到 `id / role / bbox / avgColor / ocrText / confidence`
- `schemas/run-requirement.schema.json`
- `schemas/run-decision.schema.json`
- `artifacts/runs/round-01-bundle-smoke/` smoke 证据包
- `artifacts/bootstrap-round-01/verification-layout-fix.json`
- `artifacts/bootstrap-round-01/verification-phase-02-run-bundle.json`
- `artifacts/bootstrap-round-02/`：Round 2 验证日志与 CLI 输出
- `artifacts/runs/round-02-detect-contract/`：真实 detect contract 样例（含 `capture/source.png`、`detect/regions.json`、`detect/annotated.png`、`audit.ndjson`、`decision.json`）
- `artifacts/runs/round-01-mirror-smoke/`：mirror 样例（含 `mirror/index.html`、`mirror/styles.css`、`mirror/meta.json`、`mirror/mirror.png`）
- `artifacts/bootstrap-round-01/verification-phase-04-mirror.json`
- `pkg/visionrun/compare.go`：最小 compare 生成器
- `pkg/visionrun/compare_test.go`：compare 回归测试
- `artifacts/runs/round-01-mirror-smoke/compare/report.json`
- `artifacts/runs/round-01-mirror-smoke/compare/diff.png`
- `artifacts/bootstrap-round-01/verification-phase-05-compare.json`

### 已解决

- 明确第一阶段不是“全自动微信发送”，而是“最小闭环恢复框架”
- 明确主线不是单纯 CV，也不是单纯 HTML mirror，而是二者组合
- 明确关键结果必须落盘，不能只留在对话中
- `TestLayoutWithTextNoise` 在当前树中已稳定通过；Round 1 的失败被重新判定为历史失败证据，而非当前 blocker
- `capture -> detect -> regions.json` 已打通到 Go 主链路
- `decision.json` 与 `audit.ndjson` 已能在 detect 阶段同步更新
- `mirror/index.html + styles.css + meta.json` 已稳定生成
- `mirror.png` 已改为通过 Playwright/browser 进行渲染验证，而不是塞进 Go 视觉单测
- `compare/report.json + diff.png` 已实现，且报告具备 `pixelDiffRatio / majorDeviationRegions / recommendations`

### 已进入 failure taxonomy

- 权限未就绪导致截图或自动化失败
- OCR provider 不可用
- 区域分割过度合并/过度切分
- mirror 结构正确但视觉偏差过大
- diff 假阳性（主题/缩放/字体导致）
- `TestLevel7_MixedContent` 中 toolbar/content 的横向边界漂移（期望 `y≈60`，当前观测 `y≈90`），归入 `F2_LAYOUT_UNDERSEGMENTATION`
- detect 目前仍缺少 role inference，后续若 mirror 恢复阶段出现语义错位，归入 `F3_ROLE_MISCLASSIFIED`
- `round-01-mirror-smoke` compare gate 失败：`pixelDiffRatio=0.3521`，归入 `F4_HTML_MIRROR_LAYOUT_DRIFT`

## 8. 下一轮最高优先级

1. 修复 detect/mirror fidelity，降低 `pixelDiffRatio`
2. 把 `ocrText` 从空串基线升级为 best-effort OCR 回填
3. 基于 compare 报告收敛 majorDeviationRegions
4. 补 golden/replay 样本
5. 只有在 compare gate 通过后，才进入“找对话 / 发消息 / 回复”链路

## 9. 是否继续自动推进

### 可以继续自动推进的前提

- preflight 为 `pass` 或 `warn`（不能为 `fail`）
- 能稳定生成截图和最小 schema 的 `regions.json`
- 在 mirror / compare 缺失前，不进入发送/恢复链路

### 需要人工判断的场景

- TCC 权限无法自行修复
- 微信 UI 大改导致 role inference 明显漂移
- 2 轮迭代后 diff 无显著改善（<5%）
- Accessibility tree 意外可用且质量显著高于当前 CV 路线，需要重新评审选型
