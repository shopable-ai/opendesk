# OpenDesk：按开发批次推进订阅权益与商业 Flow

## 目标

在 `shopable-ai/opendesk` 的既有 `master` 上，按已接受架构和开发台账完成一个明确开发批次，**直接修改仓库中的生产代码、JS 测试及必要文档并提交**。不是重新做战略研究、只输出审计／规划、生成压缩包，或再给下一轮提示词。

首客户总目标：一个签名 `.odflow`，安装不执行业务；一次激活后获得购买确认起 30 天使用权；临时断网在签名离线窗口内继续；到硬截止禁止新运行并取消在途付费任务；不泄漏受保护源码，复用既有 Runtime。

仓库：`https://github.com/shopable-ai/opendesk`。目标分支：`master`。

## 本轮范围选择

默认推进开发计划的 **B0：包格式、构建／检查／验签 CLI 和真实 JS 测试**。

若用户明确指定其他批次，执行对应批次。如当前 master 已有 B0 或其中工作包，不要重写：先核验实际源码与已有证据，补本批缺口；已满足前置时沿台账接续下一未完成工作包。只有文档或文件名存在不等于实现／验收。

本轮不要求一次做完全部 B0～B6。固定当前批次的实际交付，不能以庞大总目标为由停止在计划层；批次确实较大时沿已有工作包完成可复用代码和测试，准确保留剩余工作。

## 仓库中的权威入口

1. `AGENTS.md`：完整读取，遵守实际 owner、测试、文件生命周期和 Git 约束。
2. `docs/plans/commercialization/subscription-entitlement-delivery.md`：读取总框架、当前批次／前置、执行循环和台账；这是唯一接续状态。
3. `docs/architecture/execution/subscription-entitlement.md`：商业权益目标合同，优先读取一页式结论、ID、时间、当前批次涉及的 JSON、模块／Gate、安全和测试部分；相关规则必须读全，不将研究章节当现有代码。
4. `docs/architecture/execution/flow-distribution-installation.md`：分发、单目录安装、信任、签名、资源和 FLOW-01～25 的原合同，不重新推翻。
5. 当前批次实际涉及的 `docs/api/` 文档与 `docs/api/.rules.md`；`protected-recipe-package.md`／`protected-package-security-model.md` 等按依赖读取。

触发 `.odpkg` 发布／protect／inspect／verify 或 P1/P2 交接时，先按 AGENTS 完整读取对应 `workflows/protected-packages/skills/build-odpkg/SKILL.md`。不要复制旧对话中的未知命令参数当作现有 API。

## 开始必须做

重新获取当前 master HEAD、目标文件和依赖，核对并行修改；有本地 checkout 才报告 git status，没有则报告远端快照，不编造。

先给出一个简短表：已完成可复用／需补充／证据阻塞，并标本轮批次、工作包和实际触达 owner。随后直接实现，不把本轮变成二次规划。

遵循单 owner：已有 `.odpkg`、LicenseVerifier、ContentKeyProvider、deviceidentity／securestore、HTTPS 激活客户端、execution.Run 都优先复用。新文件名是计划中的建议，不是要求不顾现有实现再建一套。

## 默认 B0 的具体交付

- 在 `pkg/flow` 新增或复用一个原生包 owner：严格 `flow.json` schema、ID／版本、显式文件清单、Runtime／平台要求、commercial 声明、原始字节签名和专用域、结构／大小／路径限制及错误码。
- 实现真实 `.odflow` writer/reader/verify，不解密／运行业务。清单覆盖入口、assets 和公开信任材料，不包含 Manifest 自身／签名文件；拒绝重复键、未知安全语义、缺／多文件、哈希错误、非法路径和超限；打包不静默覆盖旧输出，私钥在输入树外。
- 参照现有 `internal/packagecli`／`internal/licensecli` 组织接入真实 `flow pack / inspect / verify` 命令，main 只路由。具体参数由代码与公开文档一起冻结，不虚构已经可用的选项。
- 候选公钥验签不能自动把 key 写成客户的全局信任；inspect 不显示源码／秘密，也不把“签名正确”误报成“已认证发布者／已授权运行”。受保护入口复用内层 `.odpkg`，不造第二层加密。
- 新增或复用 `tests/runtime-api/flow-package.js`，让真实 OpenDesk 执行 JS 并通过已文档化的 Command／File 等能力调用真实 CLI；合法包成功，篡改 Manifest／entry／asset／signature 失败，所有检查都证明业务零执行。按正式测试机制注册；必要不可从 JS 观察的内部 seam 可补原生白盒测试，但不能仅交 Go／Node mock。
- 同步 authoring schema、必要 API 文档和 fixture；JSON 示例、CLI、reader、writer 与签名测试向量必须一致。没有本批实现的新 API 不能出现在可复制运行步骤里。
- 本批通用 proof v2 只校准与 Flow 的身份关联和兼容设计，真正完整权益校验归 B2；不新增会员页面、Billing 或大规模 Runtime 改造。

B0 完成只意味着可构建／验签，不等于安装／激活／执行链路完成。后续批次按开发计划的 B1～B6 修改对应代码与测试，不把后续空壳预先标 DONE。

## 实现与验证纪律

每个工作包形成：代码 → 实际测试 → 失败修复 → 原案例重跑 → 必要回归。禁止降低断言、删除失败案例、用 TODO／硬编码 canRun 替代能力，或用测试 service 伪称生产商业上线。

保护 `.odpkg` 的签名／授权／密钥绑定，不能只按 productId 放宽；后续接 App bridge 时 .js-only 与源码快照必须一起修；不能从 Request.Meta、JS ready 或 Catalog 布尔值取得授权。所有已支持入口一致，不支持的新入口明确拒绝，不 fallback 明文。

临时测试 key、输入、授权和日志只在隔离 `.runtime/tests/`，不得操作真实客户、生产签名 key、生产名额或支付。没有真实 Market／账户不阻止本地受控实现。

网页环境能写仓库但不能跑原生时，仍提交真实代码和可执行 JS 测试；明确 IMPLEMENTED／NOT_RUN，列出缺失的运行证据，不伪造 git status、构建、Runtime 或 native/live 结果。不承诺工具未提供的 CI 调度。可执行的验证继续完成，不把所有代码都转交本地。

本地环境用当前源码对应的主程序和匹配 UI host，必要时构建后原样运行正式一行命令。跨编译不等于 Windows／macOS 真机；未经授权不启动 VM/Wine、不下载系统镜像、不公开部署 issuer 或触发真实扣费。

## Git 与完成记录

只在 master，不创建分支、不 reset、不 force push。每次内容写入前重新取 HEAD 和目标文件；使用最新 blob SHA 或基于最新 tree 的非强制 fast-forward 更新。冲突则重读合并，保留无关并行提交。

完成后更新 `docs/plans/commercialization/subscription-entitlement-delivery.md` 台账：实际 sourceBaseline、代码提交、工作包、文件、实际命令、case 结果、两平台证据、阻塞、remainingWorkPackages 和精确 nextAction。复用既有 FLOW/ENT case ID，部分子案例通过不能标整个 ID 全 PASS。

取得真实验收事实后才创建／更新 `docs/quality/subscription-entitlement-qualification.md`；没有证据不填 PASS。实现源码已提交、测试已运行、产品真机已通过是三个不同状态。

最终给出：本批实际用户行为、生产与 JS 测试改动、运行与未运行结果、提交和最后核验 HEAD、可复制且已经真实存在的测试命令、台账的下一工作包。不要用压缩包代替仓库提交，不只给新的提示词。
