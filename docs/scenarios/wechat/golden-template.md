# WeChat Golden Sample Template

本文件定义未来 WeChat desktop golden fixture 的最小格式与 promotion 条件。

## 当前状态

截至 2026-08-31，当前仓库树中**没有已验证并冻结的 WeChat desktop golden fixture**。

因此：

- 本文件是模板/spec；
- 历史 candidate / run-scoped 产物只能作为研究或历史 evidence；
- 不得因为本模板存在，就声称 frozen golden 已存在。

## 生命周期

推荐状态：

```text
candidate
-> reviewed
-> frozen
-> deprecated
```

### Candidate

- 来自真实或受控环境采集；
- schema / provenance 可以仍不完整；
- 只能用于开发和验证。

### Frozen

只有满足 promotion gate 后才能作为稳定回归 reference。

### Deprecated

UI、版本、来源或 contract 已失效，不再用于当前 regression/action support。

## 推荐目录

```text
tests/wechat/fixtures/golden-samples/<sample-id>/
├── manifest.json
├── source/
│   └── provenance.json
├── capture/
│   └── source.png
├── detect/
│   ├── regions.json
│   └── layout-model.json
├── infer/
│   ├── app-classification.json
│   ├── zones.json
│   ├── action-targets.json
│   └── ocr-map.json
├── baseline/
│   ├── layout.json
│   └── semantic.json
├── verify/
│   ├── capture-contract.json
│   ├── actionability-report.json
│   └── send-safety-report.json
├── replay/
│   ├── replay-case.json
│   └── replay-result.json
├── evidence/
│   ├── index.json
│   └── human-review-summary.json
└── failure/
    └── taxonomy.json
```

当前仓库生命周期规则使用所属测试目录存放可复用 baseline，不恢复历史 `artifacts/` 作为新的平行根。

## `manifest.json`

最少建议：

```json
{
  "schemaVersion": "0.2.0",
  "sampleId": "",
  "scenario": "wechat-desktop-chat",
  "status": "candidate",
  "sourceKind": "desktop_reference",
  "createdAt": "",
  "reviewedAt": null,
  "reviewer": null,
  "promotionDecision": null,
  "artifactsComplete": false
}
```

不要预填假的 reviewer、reviewedAt 或 approved 状态。

## Provenance

必须能回答：

- 来自哪个 OpenDesk commit；
- macOS / WeChat 版本；
- window geometry / scale factor；
- capture 时间；
- theme / display 等影响结构的环境信息；
- 是否包含真实用户数据，是否已经脱敏；
- 采集方式和工具版本。

缺 provenance 的样本不能升级为 frozen。

## Layout Baseline

推荐至少包含：

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "",
  "status": "candidate",
  "screen": {"width": 0, "height": 0},
  "window": {
    "width": 0,
    "height": 0,
    "scaleFactor": 1,
    "geometryHash": ""
  },
  "criticalZones": [],
  "topology": {},
  "zones": []
}
```

不要把某一次 `1097x880` 或 scale factor 2 写成所有 WeChat 环境的固定真相。

## Semantic Baseline

推荐至少包含：

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "",
  "status": "candidate",
  "appClass": "wechat_desktop",
  "pageType": "chat_page",
  "stateFlags": {},
  "actionTargets": [],
  "guards": {
    "chatIdentityRequired": true,
    "focusVerificationRequired": true,
    "draftVerificationRequired": true,
    "sendDisabledByDefault": true,
    "sendNeedsDedicatedGate": true
  }
}
```

## Send Safety Report

Golden promotion 不能省略 send 状态。

即使样本只用于非发送动作，也应明确：

```json
{
  "sendAllowed": false,
  "reason": "send was not validated for this fixture"
}
```

Frozen reference **不能自动解冻发送能力**。

## Promotion Gate

至少满足：

1. provenance 完整；
2. source image / derived evidence 可追溯；
3. schema 关键字段非空；
4. critical zones / action targets 可解释；
5. capture/freshness contract 明确；
6. failure taxonomy / known limits 已记录；
7. replay 或等价 regression 验证可重复；
8. human review 已完成；
9. promotion decision 显式批准；
10. 没有 false-success / unresolved high-risk ambiguity。

质量总规则见：

```text
docs/quality/gates-and-evidence.md
```

## 拒绝 Promotion 的情况

任一满足即保持 candidate：

- 只有截图，没有结构化 evidence；
- 只有 HTML mirror / visual diff；
- 来源环境不明；
- baseline 关键字段为空；
- candidate 来自 web/dev reference，却想用于 desktop action geometry；
- send safety 未明确；
- human review 缺失；
- 样本中含无法合理保存的敏感数据；
- 当前 WeChat UI 已明显漂移。

## 使用边界

Frozen sample 可以支持：

- regression；
- layout / semantic compare；
- target discovery 调试；
- drift detection；
- replay fixture。

Frozen sample 不等于：

- 当前窗口身份；
- 当前联系人身份；
- 当前 click target；
- 当前 send authorization。

真实动作仍需 fresh runtime evidence。

## 首个新 Fixture 的正确顺序

```text
fresh macOS capture
-> candidate fixture
-> validate structure/semantic fields
-> run non-send scenario replay/smoke
-> review known limits
-> explicit promotion decision
-> frozen fixture
```

在完成这条链路前，不应在文档中写一个看似真实存在的 frozen sample ID。
