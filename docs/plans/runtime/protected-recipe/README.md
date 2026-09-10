# Protected Recipe 商业化路线

## 定位

本目录保存 Protected Recipe 从“可保护源码”到“可规模化商业授权”的实施路线与接续状态。

它不是 API Reference，也不替代长期架构设计。长期安全边界以 [`docs/architecture/execution/protected-recipe-package.md`](../../../architecture/execution/protected-recipe-package.md) 为准；当前真实能力必须以源码、可重复测试和用户文档为准。

```text
长期架构
→ 本目录阶段计划
→ 当前源码 / tests
→ docs/api（仅记录已验证的用户能力）
```

不要把聊天记录或完整 Codex Goal 当作长期事实来源。

## 文件地图

- [`STATUS.md`](STATUS.md)：唯一的可变“当前做到哪里 / 下一步做什么”入口。
- [`p0-foundation.md`](p0-foundation.md)：Protected Package Foundation。
- [`p1-device-bound-license.md`](p1-device-bound-license.md)：Device-bound Offline License MVP。
- [`p2-online-entitlement.md`](p2-online-entitlement.md)：Online Activation & Entitlement。
- [`p3-publisher-key-lifecycle.md`](p3-publisher-key-lifecycle.md)：Publisher & Key Lifecycle。
- [`p4-commercial-hardening.md`](p4-commercial-hardening.md)：Commercial Hardening & Scale。

完整、一次性的本地 Codex 执行提示词不保存到这里；每个阶段文件只保存稳定目标、边界、验收门禁和接续信息，避免提示词随实现变化后变成过期事实。

## P0–P4 总路线

| 阶段 | 目标 | 完成后的产品含义 |
| --- | --- | --- |
| P0 | Protected Package Foundation | `.odpkg`、AES-GCM、Ed25519、ScriptLoader、License/Key seam、防明文泄露与 CLI 基础成立；尚不等于商业授权闭环 |
| P1 | Device-bound Offline License | 指定设备可离线取得被包装的 DEK 并运行；形成第一版适合小规模收费交付的设备绑定授权 |
| P2 | Online Activation & Entitlement | 在线激活、设备数量、refresh/revoke、在线 entitlement 与受控离线缓存；形成可运营的在线授权服务 |
| P3 | Publisher & Key Lifecycle | 多 Publisher/产品的可信 key registry、rotation、版本迁移、审计和治理能力 |
| P4 | Commercial Hardening & Scale | 恢复/迁移、时间与回滚风险治理、运营观测、高价值算法服务端化等商业强化 |

## 与原 Phase A / B / C 的映射

现有架构文档中的 Phase A / B / C 是较粗的商业化分层；P0–P4 是实施批次，不应被理解为另一套冲突架构。

```text
Phase A｜核心包保护基础设施
└── P0｜Protected Package Foundation

Phase B｜商业可交付授权
├── P1｜Device-bound Offline License
└── P2｜Online Activation & Entitlement

Phase C｜规模化商业授权
├── P3｜Publisher & Key Lifecycle
└── P4｜Commercial Hardening & Scale
```

## Resume Protocol

任何新对话、Codex session 或中断恢复都先执行：

1. 读取仓库根目录 `AGENTS.md`。
2. 读取长期架构 `docs/architecture/execution/protected-recipe-package.md`。
3. 读取本文件和 [`STATUS.md`](STATUS.md)。
4. 读取当前 `master / HEAD`、`git status` 和相关源码；不得只依据 checkpoint commit 推断现状。
5. 找到 `STATUS.md` 中 `Current stage`，再读取对应 `pN-*.md`。
6. 继续该阶段尚未满足的 Acceptance Gates，不从 P0 重新设计。
7. 阶段结束前更新对应阶段文件和 `STATUS.md`。
8. 只有测试、构建和用户可观察行为达到该阶段 Definition of Done，才把状态改为 `Completed` 并切到下一阶段。

## 状态规则

统一使用：

```text
Planned
In progress
Blocked
Completed
```

`Implemented` 不等于 `Completed`。例如代码已写入但尚未编译/测试时，仍属于 `In progress`。

Checkpoint commit 只用于定位历史交付，不是恢复时的强制基线；恢复必须以当前 `master / HEAD` 为准。

## 不变量

所有阶段都必须保持：

- 普通 `.js` 继续直接运行，不要求 package、License 或设备激活。
- Protected Recipe 最终继续进入现有 `pkg/execution.Run()` 与现有 Goja，不创建第二套 Runtime。
- 不把 AES master key、DEK、Publisher private key 或万能 License 硬编码进客户 OpenDesk。
- 授权、取密钥或验签失败必须 fail closed，不 fallback 为普通脚本执行。
- Protected plaintext 默认不写磁盘、不进入 snapshot、日志、event、summary 或 debug preview。
- 客户端执行只能提高源码获取成本，不能承诺对本机管理员/调试器“绝对不可提取”；最高价值算法可在 P4 选择服务端化。