# Blindspot Checklist

用于审查桌面自动化链路中会直接伤害“定位目标 → 输入 → 执行动作 → 验证结果 → 恢复”的高风险盲区。

本文件是可复用检查表，不记录一次性项目状态。

## 感知与结构

- [ ] 是否把 compare / visual diff 错当成唯一主 gate？
- [ ] 是否存在稳定、可解释的 `layout_model` 或等价结构模型？
- [ ] 是否只依赖整窗 OCR，而没有 zone-aware / local OCR？
- [ ] 是否把历史 region report 当作当前动作真相？
- [ ] 主题、缩放、窗口尺寸变化后，zone / target 是否仍可验证？
- [ ] 多显示器、DPI、遮挡、浮窗是否进入环境证据？

## 语义与目标

- [ ] `appClass` / `pageType` 是否被显式判断？
- [ ] blocking page、详情页、预览页或弹窗是否可能被误判为目标页面？
- [ ] 是否存在结构化 `action_targets`，而不是运行时临时猜坐标？
- [ ] 同名/相似目标是否有消歧证据？
- [ ] target 是否有 preconditions / postconditions / fallbacks？

## 输入与高风险动作

- [ ] 输入焦点是否在动作前后被验证？
- [ ] draft 内容是否在发送/提交前被验证？
- [ ] 多种动作路径（按钮、Enter、快捷键等）是否显式配置，而不是随机 fallback？
- [ ] clipboard 是否只是实现手段，而不是未经验证的状态真相？
- [ ] send / submit / delete / payment 等高风险动作是否拥有独立 gate？

## Replay / Recovery

- [ ] replay 是否有实际 executor，而不只是 schema / contract？
- [ ] 是否存在 checkpoint / resume 语义？
- [ ] 失败后是否优先局部恢复，而不是从头重跑完整链路？
- [ ] 状态漂移是否被记录并可比较？

## Evidence / Audit

- [ ] evidence 是否细化到动作级 before / after？
- [ ] 是否记录 target candidate trace？
- [ ] OCR 是否同时保留 raw 与 normalized evidence？
- [ ] failure 是否能映射到稳定 taxonomy？
- [ ] 连续失败是否能区分环境、感知、语义、动作、验证和恢复根因？

## 安全与对抗

- [ ] UI 中不可信文本是否可能被当成系统指令或动作指令？
- [ ] prompt injection / deceptive UI 是否进入 red-team 测试？
- [ ] 外部页面、聊天消息、文档内容是否和系统控制信息隔离？
- [ ] 高风险动作是否要求运行时 fresh evidence，而不是仅依赖 golden sample？

## 场景扩展检查

以聊天类应用为例，还要覆盖：

- 群聊、服务号、置顶、折叠分组等列表结构变化；
- 输入法候选框、系统通知、浮窗遮挡；
- UI 大版本变化导致 column topology 改变；
- 会话列表中同名目标和多账号环境。

## 使用方式

每次新增应用适配、动作类型、识别方式或重大 UI 版本时，至少执行一次本清单。

发现问题后：

```text
blindspot
-> failure taxonomy
-> test / red-team case
-> gate / implementation fix
-> replay evidence
```

一次性审计原始结果应进入 `.runtime/runs/<run-id>/`；确认后的审计结论进入 `docs/quality/review/`，不要继续堆到本文件。
