# WeChat Execution Master Prompt

用于启动或继续 OpenDesk 微信桌面自动化任务。

本提示词只负责**执行编排**，不复制架构、需求、Gate、Golden Sample 等正式知识。正式事实必须从当前仓库文档和源码读取。

## 开始前必须读取

按顺序读取：

```text
docs/scenarios/wechat/requirements.md
docs/scenarios/wechat/architecture.md
docs/scenarios/wechat/baseline-compare-spec.md
docs/scenarios/wechat/golden-template.md
docs/scenarios/wechat/structured-send.md
docs/quality/gates-and-evidence.md
docs/quality/golden-sample-strategy.md
docs/quality/failure-taxonomy.md
docs/quality/review/blindspot-checklist.md
docs/quality/review/red-team.md
```

需要了解历史研究时再读取：

```text
docs/research/wechat/
docs/quality/wechat/
docs/quality/review/
```

不要把历史报告或 Research 当成当前 Source of Truth。

## 执行原则

固定遵循：

```text
结构
-> 语义
-> action target
-> precondition
-> 单步动作
-> postcondition
-> evidence
-> replay / recovery
```

禁止：

- 整条 GUI 链路盲试错；
- 仅靠历史坐标或历史 region report 直接动作；
- 把 whole-window OCR 当唯一裁决；
- 把 compare 分数当唯一主 gate；
- open_chat / focus_input 成功后自动推导 send 可以执行；
- 缺少 fresh runtime evidence 时执行高风险动作。

## Golden Sample

Golden Sample 是算法验证和回归基线，不自动等于当前动作真相。

必须区分：

```text
dev_reference
desktop_reference
desktop_action
```

以及：

```text
candidate
frozen
```

只有满足 `docs/quality/gates-and-evidence.md` 的 Golden Promotion Gate，才能升级为 frozen baseline。

## Send

`send` 默认按高风险动作处理，并独立验证：

- 当前目标会话身份；
- 当前输入焦点；
- draft 内容；
- send target；
- blocking overlay；
- same-window / freshness；
- 动作后的 readback / postcondition。

任一关键证据不确定时停止发送，转 probe / recovery / 人工确认。

## 每轮输出

每一轮至少给出：

1. 当前 intent；
2. 当前状态与关键证据；
3. 当前通过/未通过的 gate；
4. 本轮只执行的最小动作；
5. 动作前验证；
6. 动作后验证；
7. 失败 taxonomy；
8. 新增 evidence；
9. 下一步是 continue / retry / recovery / escalate / stop。

不要只输出“成功/失败”。

## 变更规则

如果发现正式文档与当前源码、测试或真实运行证据冲突：

```text
source/runtime evidence
-> identify conflict
-> correct canonical doc
-> update tests/contracts if required
-> keep historical report as history only
```

不要为了让执行符合旧 Prompt 而修改当前实现。
