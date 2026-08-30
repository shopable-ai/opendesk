# WeChat Desktop Scenario

本目录定义 Clawdesk 对微信桌面版自动化的场景需求、架构边界、baseline/golden 规范和发送安全规则。

## 当前状态

当前仓库没有独立维护的 WeChat production workflow / adapter，也没有当前版本已冻结的 WeChat desktop golden fixture。

因此：

- 本目录是 scenario contract；
- 当前可执行基础来自 Clawdesk 通用 runtime / Vision / MCP；
- 历史 WeChat 研究和报告只作为输入；
- 是否“已实现/已验证”必须由当前源码、测试和真机 evidence 证明。

## 阅读顺序

```text
requirements.md
-> architecture.md
-> structured-send.md
-> baseline-compare-spec.md
-> golden-template.md
```

### `requirements.md`

定义目标能力、验收边界和当前明确不存在的能力。

### `architecture.md`

定义通用 Clawdesk 层和 WeChat-specific 场景层如何组合。

### `structured-send.md`

定义高风险 send 的独立安全 contract，不描述不存在的旧脚本。

### `baseline-compare-spec.md`

定义 future reference/runtime compare 语义，并明确 compare 不是唯一动作 Gate。

### `golden-template.md`

定义 candidate/frozen fixture 格式和 promotion 条件。

## 当前 Active Plan

```text
docs/plans/wechat/desktop-automation-backlog.md
```

## 支撑文档

```text
docs/quality/gates-and-evidence.md
docs/architecture/desktop-automation/
docs/integrations/mcp/
prompts/wechat/execution-master.md
```

## 历史材料

研究：

```text
docs/research/2026-05-18-wechat-desktop-automation-open-source-options.md
docs/research/wechat/
```

历史报告：

```text
artifacts/reports/wechat/
```

旧计划与旧实现叙事应在 `.archive/` / Git 历史中读取，不要反向覆盖本目录当前状态。
