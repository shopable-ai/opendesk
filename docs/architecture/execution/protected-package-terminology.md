# 受保护包术语与公共信息架构

## 决策

面向用户的主名称统一为**受保护包**（protected package），扩展名保持 `.odpkg`。公共 CLI Reference 使用
`docs/api/protected-packages.md`；Package Publisher 的作业名称使用“受保护包发布”或“打包并验签”。

“Recipe”只用于以下两类既有含义：一是可复用的普通 JavaScript 自动化；二是已经冻结的兼容标识，例如
Human-to-Recipe / Agent-to-Recipe 工作流名、既有架构与阶段目录、`opendesk-protected-recipe` format 和
`OPENDESK_PROTECTED_RECIPE_ROOT`。这些标识不因展示语言调整而重命名。新发布作业使用
`$build-odpkg`，不再把 Recipe 写进新 Skill identifier。

## 用户任务地图

| 用户任务 | 建议用语 | 权威入口 | 不应混入 |
| --- | --- | --- | --- |
| 编写或录制自动化 | JavaScript automation / Recipe | JavaScript API、Human-to-Recipe、Agent-to-Recipe | `.odpkg` 打包、License、activation |
| 保护并打包脚本 | 受保护包发布 | `opendesk package protect/inspect/verify` | 业务意图推导、Recorder 精炼、客户授权 |
| 管理发布材料 | Package Publisher material / License issuer material | 发布系统和对应 CLI 文件参数 | 把 package signing key、issuer key、DEK 合并为一种 key |
| 授权客户 | P1 offline License / P2 online activation | `opendesk license ...` | 把 `package verify` 当成客户已获授权 |
| 运行交付物 | 执行受保护包 | `opendesk -script *.odpkg` / `opendesk ai run *.odpkg` | 第二套 Runtime、明文 snapshot、HTTP/MCP/Scheduler fallback |

这五步是顺序相关但职责独立的边界。作者工作流通常交付普通 `.js`；只有明确进入发布流程后才产生 `.odpkg`。
Package Publisher 证明包的来源与完整性，License issuer / entitlement service 决定客户授权，Runtime 只消费已验证
结果并在内存中解密。

## 文件名备选

| 文件名 | 结论 | 理由 |
| --- | --- | --- |
| `protected-packages.md` | 采用 | 直接命名用户拿到的 `.odpkg`，能够覆盖打包、验签、授权和执行完整生命周期，并与 `package` CLI 对齐 |
| `script-packaging.md` | 不采用 | 对 `.js` → `.odpkg` 很清楚，但范围过窄，容易让 License、activation 和执行再次散落到其他页面 |
| `commercial-script-packaging.md` | 不采用 | “commercial”会排除企业内部或非收费保护场景，并暗示尚未完成的 P3/P4 商业运营能力 |
| `protected-recipe.md` | 不采用为公共页 | 与冻结 format/架构名一致，但会把作者侧 Recipe 与分发侧 package 混成一种对象 |
| `package-protection.md` | 不采用 | 强调动作而不是交付物，作为完整 CLI Reference 的导航名称不如 artifact 名稳定 |

`docs/api/protected-recipe.md` 只曾是本轮未提交草稿，没有已发布兼容承诺，因此迁移到新文件名而不保留第二份别名页，
避免产生重复 Reference。

## Skill 名称评分

用户明确提出调用名过长后，按调用简洁度 30%、交付物唯一性 25%、动作准确度 20%、发现与作用域 15%、
生命周期覆盖 10% 重新评分：

| Skill identifier | 得分 | 结论 |
| --- | ---: | --- |
| `build-odpkg` | **97** | 采用；11 个字符、动作导向，稳定扩展名同时唯一限定 OpenDesk 交付物 |
| `publish-odpkg` | 92 | 简短清楚，但容易暗示上传、分发或 registry 操作，而当前 Skill 不执行这些动作 |
| `odpkg-builder` | 90 | 交付物明确，但工具名词不如 `build-odpkg` 的调用语气自然 |
| `protected-package` | 88 | 与公共对象名一致，但更像文档主题，不直接表达要执行的动作 |
| `build-protected-package` | 86 | 准确且自然，但 `protected-package` 已由更短、更唯一的 `odpkg` 完整表达 |
| `protected-script-packager` | 76 | 可理解成打包已经受保护的 script，也弱化最终 `.odpkg` 交付物 |
| `opendesk-protected-package-builder` | 68 | 信息完整但重复限定过多，调用名过长 |
| `packager-script` | 40 | 英文词序不自然，既像一段脚本又像角色名称，无法稳定指向 `.odpkg` 作业 |

最高分方案同时用于 frontmatter `name`、目录名、仓库路由和用户调用语法。先前两个候选
`protected-recipe-packager`、`opendesk-protected-package-builder` 都只曾是本轮未提交草稿，没有安装或发布兼容
承诺，因此不创建内容重复的别名 Skill。

## 兼容边界

本次只改公共展示文字、文档文件名/导航和 Skill 正文，不修改：

- `.odpkg`、`.odlicense`；
- `opendesk package protect/inspect/verify`；
- `opendesk license device/issue/inspect/verify/install/activate/status/refresh/deactivate`；
- CLI JSON 字段、错误码、退出码；
- package / License / online cache 的序列化字段、加密或签名 domain；
- `OPENDESK_PROTECTED_RECIPE_ROOT`、Go package/type/interface 名、架构和阶段目录；
- 既有架构、阶段和序列化标识中的 `protected-recipe` 名称。

未来若要重命名任何上述稳定面，必须先定义迁移期、双读/别名策略、版本协商和移除条件，不能借术语清理直接破坏。

## Entitlement 协议边界

当前公开且有用户文档承诺的是本地 `opendesk license activate/status/refresh/deactivate` CLI。源码中的
`pkg/entitlement`、`pkg/entitlementservice`、Go owner interfaces、request/response structs、HTTP paths 和
`tests/protected-recipe/tools/entitlement-server` 服务于当前实现与验收；仓库没有独立、版本化的公共 entitlement
HTTP Reference，也没有第三方客户端兼容承诺。

因此当前不把这些 endpoints 或 Go interfaces 导航为公共 SDK/API。若未来冻结协议，应另行定义认证、请求/响应、
错误、重试/幂等、版本支持、密钥轮换和兼容窗口，并为非参考服务提供互操作验收。
