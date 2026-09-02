# Layout Recognition Improvement Plan

本文件记录当前仍未实现、但有明确实验依据的 layout separator 改进候选。它是 backlog / research-to-implementation 计划，不是当前能力说明。

当前能力事实见：

```text
docs/implementation/layout/layout-recognition.md
```

历史实验报告见：

```text
docs/quality/layout/
```

## 当前问题

历史验证显示，复杂文本区域可能产生额外 separator，主要问题是 false positive，而不是完全找不到真实边界。

当前源码已经包含：

- median cell color；
- multi-span region contrast；
- `0.40 / 0.25 / 0.35` boundary score；
- separator filtering。

以下候选在当前 `layoutAnalyzeOptions` 中尚未形成独立正式参数/实现，因此不得视为已完成能力。

## P1：Separator Span / Support 约束

Status: IN_PROGRESS (implementation complete; clean complex real-app acceptance pending)

目标：进一步过滤只覆盖局部文本行、而非真实大区域边界的候选。

候选方向：

- 显式评估 separator 在目标轴上的有效覆盖率；
- 将 span/support 约束纳入 candidate filtering；
- 避免固定应用坐标或应用名称。

验收：

- complex/text-heavy case precision 明显改善；
- 简单布局召回率不下降；
- 规则可由通用几何/视觉证据解释。

实现记录：

- `minSeparatorSpanRatio` 已成为正式 `0..1` 参数，默认 `0.30`，`0` 可恢复无 span gate 的对照基线；
- vertical/horizontal boundary 都计算最长连续支撑区间，并在 split-tree candidate filtering 前阻止局部短边界；
- `supportSpanRatio` 与像素级 `supportSpan` 随 candidate meta 输出；
- text-block synthetic precision 从 `1/5` 提升为 `1/1`，既有 7 级布局回归保留主要边界；
- 带 ground truth 的 simple WeChat fixture 过滤前后均为 precision/recall `1.0/1.0`；
- 原用于 real-app 对照的 `wechat_original.png` 被确认含第三方录音界面重叠，相关候选/区域数不得作为 WeChat 视觉精度或完成证据；P1 保持 `IN_PROGRESS`，等待无重叠、带明确期望边界的 complex/text-heavy fixture；
- 当前证据和限制见 `docs/quality/layout/separator-span-support-2026-09-02.md`。

## P2：Adaptive Thresholding

Status: IN_PROGRESS (implementation complete; clean real-app acceptance pending)

目标：根据区域噪声、文本密度或候选分布调整阈值，而不是所有区域使用同一固定阈值。

约束：

- 阈值变化必须输出 debug evidence；
- 不允许通过应用专用常量掩盖模型问题；
- 必须和固定阈值 baseline 对照测试。

实现记录：

- 将既有候选分布公式正式收敛为 `separatorThresholdMode: adaptive | fixed`，默认 `adaptive`，没有引入第二套评分算法；
- `fixed` 始终应用 `minSeparatorScore`，同时保留 adaptive 对照值；
- 每个递归区域和方向均输出 `mean/stdDev/percentile75/adaptiveThreshold/appliedThreshold` debug trace，候选 meta 同步携带阈值证据；
- deterministic weak-candidate case 中 adaptive 保留强边界并拒绝弱边界，fixed baseline 同时保留两者；
- simple ground-truth fixture 在两种模式下 precision/recall 均为 `1.0/1.0`；clean Calculator fixture 可验证阈值 trace 与无结构回归；
- 含第三方录音界面重叠的 `wechat_original.png` 已从视觉验收中排除，P2 等待干净 complex/text-heavy real-app fixture 后才能完成。

## P3：Multi-Scale Validation

目标：在多个 cell size 下重复分析，只提升跨尺度稳定出现的 separator 置信度。

主要风险：

- 计算量增加；
- 不同尺度结果的对齐/去重复杂；
- 可能降低窄边界召回。

只有在 P1/P2 仍无法解决主要 false positive 时再进入实现。

## 测试矩阵

至少覆盖：

- clean synthetic layouts；
- text-heavy synthetic layouts；
- Chrome / VS Code / Finder / WeChat 等真实应用样本；
- 不同窗口尺寸、缩放和主题；
- vertical / horizontal separators；
- 性能 benchmark。

指标至少包括：

- precision / recall / F1；
- separator 位置误差；
- candidate 数量；
- confidence 分布；
- 运行时间与内存开销。

## 实施顺序

```text
建立当前源码 baseline
-> 增加单一候选改进
-> unit / synthetic validation
-> real-app validation
-> regression comparison
-> 保留或回滚
```

一次只引入一个主要变量，避免同时改评分、threshold 和多尺度后无法判断收益来源。

## 完成条件

某个候选只有同时满足以下条件才能从本计划移入正式实现文档：

- 已进入当前源码；
- 有测试覆盖；
- 有真实场景证据；
- 没有明显简单场景回归；
- 文档默认值和源码一致；
- 相关历史实验报告已归档。
