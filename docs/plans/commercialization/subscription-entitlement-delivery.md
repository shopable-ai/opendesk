# OpenDesk：订阅权益与首个商业 Flow 交付计划

> 建立日期：2026-09-17。状态：PLAN_ACCEPTED / CODE_IMPLEMENTATION_PENDING。
> 建立基线：`master@9b90670d187a4ea6eeea232f6a52e1ad1be4ebcc`。本次只写入设计、开发计划和实施入口，没有构建／运行证据；下方开发批次不得据此标记完成。
> 本文是本工作流唯一开发分解与进度台账。后续对话直接更新本文，不重复生成 `plan-v2`、另一份 phase report 或平行进度文件。

## 1. 目标与阅读路径

**不再让一个“按方案全部实现”的提示词承担项目管理。采用稳定架构 → 可验收工作包 → 分批修改真实代码 → 原测试回归 → 真机资格 → 接续台账。**

架构：[订阅权益合同](../../architecture/execution/subscription-entitlement.md)。分发依赖：[Flow 安装合同](../../architecture/execution/flow-distribution-installation.md)。统一实施入口：[按批次执行提示词](../../../prompts/runtime/subscription-entitlement-implementation.md)。

首个客户可验证结果：

```text
开发者交付一个签名 .odflow（main.odpkg + 必要资源）
→ 客户双击／拖入，安装但不自动运行
→ 必要时明确批准发布者
→ 一次兑换码激活
→ 正确读取资源并运行
→ 临时断网仍在签名窗口内可执行
→ 购买后 30 天或本地证明硬截止时禁止新运行并取消在途付费任务
→ 续费后刷新恢复，不改业务脚本或重新打包
```

默认产品政策见架构：购买确认起 30×24 小时，一设备，24 小时刷新，签发后最多 7 天离线且不越过商业截止。上述需由真实代码实现；单纯安装／加密／UI 日期均不算商业闭环。

## 2. 三条责任线，一条关键路径

```text
A 分发线：签名格式 → 安全安装与 Catalog → 文件打开／拖放与 Runner
B 授权线：grant/lease → 本地校验／时间／防回滚 → 持久化 issuer 与激活刷新
C 执行线：原生 Gate → 受保护加载与 artifact → 运行期截止／取消 → 所有支持入口

B0 包格式与可执行校验
  ├── B1 安全安装／Catalog ──────────────────┐
  └── B2 本地权益／proof v2 ── B3 激活刷新 ─┤
                                           ↓
                              B4 Gate／受保护执行／截止
                                           ↓
                              B5 原生入口与最小产品体验
                                           ↓
                              B6 兼容／故障／双平台交付资格
```

默认执行顺序 B0→B1→B2→B3→B4→B5→B6。B1 与 B2 在 B0 合同一致且 owner 不重叠时可以并行；这是代码依赖许可，不是自动授权启动多个会话。B3 可在 B1 收口前做服务侧工作。所有写入仍检查当前 HEAD 和目标文件。

UI 可以提前完善不依赖商业判断的部分，但 B5 整体完成依赖 B4，不能用 mock ready、测试根或假授权演示替代真实链路。

**第一轮默认 B0，必须有生产代码和 JS 测试，不是再写一篇架构。**如并行会话已实现某部分，复用实际代码并做针对性核验，不从头再造一个模块。

## 3. 工作量：24 个工作包，不是一个小开关

这里采用相对规模估计，衡量改动面、未知量、跨层耦合和验收成本。点数不是天数、聊天轮数、质量评分或完成比例；前一批取得证据后再修订后续估计。

| 批次 | 工作包数 | 相对规模 | 核心难点 | 结束时能看到什么 |
|---|---:|---:|---|---|
| B0 格式／校验 | 3 | 5 | 单一 wire 合同、签名域、打包输入与安全输出 | 真正构建并验证 .odflow；改一个字节即拒绝；不运行 JS |
| B1 安装／Catalog | 3 | 8 | ZIP／文件系统安全、事务、恢复与旧资源 | 命令行安全安装、重启可发现、稍后激活状态 |
| B2 本地授权内核 | 4 | 8 | proof v2、精确包绑定、时钟、防回滚 | 有效／过期／错设备／篡改产生可验证的不同判断 |
| B3 issuer／激活刷新 | 4 | 8 | 数据持久化、幂等、设备名额、重试恢复 | 一次激活；重启仍有效；断网缓存；恢复网络刷新 |
| B4 执行与截止 | 4 | 13 | 多入口、无源码泄露、可延期监督和取消 | 带资源受保护任务运行，到期能停止在途任务 |
| B5 原生产品接线 | 3 | 8 | 双击冷／热启动、实窗拖放、现有 UI 生命周期 | 客户不操作目录或 key，Runner 内完成安装激活运行 |
| B6 交付资格 | 3 | 8 | 故障注入、迁移、泄露面、双平台 | 可追溯的首客户放行或具体拒绝项 |
| 合计 | 24 | 58 | 跨分发、安全、状态、执行和原生 UI | 完成 Phase 0 与首客户 Phase 1 |

这些是**剩余增量的规划上限形状**，不是重复开发已有 `.odpkg`、P1/P2、Keychain／DPAPI、Execution。并行 Flow 分发会话完成 B0/B1/B5 的能力后，重新核对并扣除对应增量，不累计两次工作量。不能仅因一个同名文件存在就扣除工作。

## 4. 批次详细合同

下文新文件名均为建议目标，不是已经存在的声明。开始每批先检查实际 owner；发现等价实现时改它，不机械新增平行文件。

### B0：可构建、可验签的包格式基础

前置：读取两份架构、AGENTS、现有 protected package CLI 和实际命令路由。无需真实客户、支付平台、公开 Market 或桌面输入权限。

- **B0.1 格式与唯一 parser**：冻结 flow.json schema v1 的具体字段、ID 长度、路径规范、文件清单、Runtime／平台要求与 protected identity；明确原始字节签名域、大小限制、重复／未知字段行为、safe inspect 输出和错误码。同步签名固定向量；新的通用 proof v2 此批只固定与 Flow 的身份关联／兼容决策，真正 proof 校验代码由 B2 实现，不假装全部授权已经冻结可运行。
- **B0.2 native writer/reader/verify + CLI**：复用 canonical `pkg/flowpackage` 的格式、签名、受限容器检查；在现有 CLI 组织旁接入实际 `flow pack / inspect / verify` 命令。复用 `.odpkg` 内层校验，不解密／执行业务。签名公钥参数用于开发侧候选校验，不能自动写客户 Trust Store。pack 从显式 `--file` 输入生成清单，签名私钥不进入输入树，既有输出不能静默覆盖。
- **B0.3 可执行测试与文档**：`tests/runtime-api/flow-package.js` 使用真实 OpenDesk／Command 接口调用真实 CLI，正向验证普通与受保护包结构、带资源清单，负向覆盖 Manifest／entry／asset／signature 篡改、重复条目、基本路径与上限、同名输出拒绝。必要内部密码／解析 seam 可有 Go 测试，但不能只交 Go 或 Node mock。CLI 先实现再同步 `docs/api/` 与正式测试注册；安装/运行资格由独立 `tests/runtime-api/flow-distribution.js` gate 负责。

建议改动面：`pkg/flowpackage/`（唯一格式 owner）、`schemas/flow/`、`internal/flowcli/`、`cmd/opendesk/main.go` 仅路由、`tests/runtime-api/flow-package.js` 与 `tests/runtime-api/support/`、`examples/flow-distribution/`、对应 API/测试注册。

验收 Oracle：合法包 verify 成功且业务计数为零；篡改任一受保护字节失败且计数仍零；inspect 不写源码／秘密、不把候选验签成功标作发布者已认证或客户已授权。对已加密入口只检验现有内层结构和签名所需材料，不要求商业激活。

映射：FLOW-02/04/06/07/20/25 的格式子集；ENT-10 的包篡改子集。只标通过的子案例，不把整个 FLOW-02 安装验收一起标 PASS。

**B0 完成不是 .odflow 已能安装／运行。**本批不做账户页面、安装事务、proof v2 的完整实现、Billing 或 Runtime 重构。

### B1：安全安装、Catalog 与可恢复更新

前置：B0 parser/writer/签名与字段合同可复用。

- **B1.1 受限安装与独立信任**：唯一 native install owner，ZIP 路径穿越、大小写／Unicode 别名、ADS／保留名、链接／reparse、父路径竞态和实际解压量约束；候选验签和单 Flow／Publisher 信任分开；无 postinstall，无自动执行。缺权益可安装为 needs-activation，不能 ready。
- **B1.2 Catalog 和内容／数据分离**：`flows/<installId>/`、flow-data、flow-state 单 owner；本地生成 Manifest 不冒充发布者签名；裸 `.odpkg` 只在有合法可信材料时接入；重启可发现，显示名不承担身份。旧 recipes 作为兼容输入，保存原脚本／旁置资源／顺序／调用映射，不静默改根导致丢失。
- **B1.3 事务／恢复／更新卸载**：同版同摘要幂等、同版异摘要拒绝、待授权更新不替换可用旧版；journal／staging／短期 rollback，目录与索引故障恢复；建立安装运行租约 seam，B4 接真实 Execution 后补运行期更新验收。卸载不删共享授权或其他 Flow 数据。

建议面：`pkg/flowinstall/`，复用 `pkg/licensing` 信任存储／精确定位；`cmd/opendesk/app_paths.go` 只做必要接线；`internal/flowcli` 安装／列表命令；`tests/runtime-api/flow-installation.js`；内部文件系统与事务 seam。

演示：隔离目录内安装→重启/重新枚举→正确条目与锁定状态；重复／失败安装不破坏现有条目。安装失败业务零执行、无越界写入。

映射：FLOW-01～11、17～22、25 中安装／信任／恢复子项；ENT-10/11/24/25。此批不得宣称受保护源码已可运行。

### B2：本地权益校验、设备、时钟和 proof v2

前置：B0 身份／版本关联明确；可与 B1 的无冲突文件并行。

- **B2.1 grant/lease 严格格式和 evaluator**：在 `pkg/licensing` 定义显式 v2、完整 signed payload、固定算法／域、nonce、issuer/audience/作用域、resource/action、有效期和 SemVer；缺字段不变永久；多来源按完整 grant 判断，不能拼权限。签名有效与 issuer 获准是两步。
- **B2.2 精确 KeyGrant 和设备**：绑定 grant、publisher/key、product、Flow/version、packageId/digest/contentKeyId/device；复用 envelope 算法；feature-only proof 也验证真实设备 key 身份／可用性；验证结果仅宿主可构造，不从 JS boolean 取得。v1 parser 保持兼容，新订阅不发旧式旁路 License，抽包运行也能验证签署的 release 关联。
- **B2.3 安全缓存与防回滚**：复用 FileInstallationStore／securestore 的 owner，新增 v2 存储与代际提交／恢复；处理缓存文件和 OS 高水位跨存储崩溃，不能因为新 sequence 部分提交就永久停机，也不能回到旧 active。保留 terminal revoked tombstone，恢复使用新合法 lineage。
- **B2.4 可信时间与离线决策**：商业截止、证明截止、刷新点分开；服务端锚、单调经过时间、受保护高水位、重启／唤醒处理与安全重新校时；网络失败不延长时限。测试时间源只注入隔离 owner，不开放生产 JS 改时钟开关。

建议面：`pkg/licensing/license.go`、新增 grant/lease/evaluator 文件、`offline_license.go`／`online_cache.go`／`online_replay.go`／`device_bound.go` 的窄适配；`pkg/deviceidentity`／`pkg/securestore`；`schemas/licensing/`；`internal/licensecli` 的最小安全诊断／导入能力；`tests/runtime-api/entitlement-local.js`，复用既有测试 runner。

演示：同一个 signed proof 在有效期、起点前、终点、离线硬截止、错误设备、错误 issuer、篡改、旧修订等场景输出正确结构化决策。不要为了演示暴露通用 decrypt/verified token 给业务 JS。

映射：ENT-02/03/05～16/19/20/22/28/29 的本地子项，FLOW-10～13 的授权子项。

### B3：最小持久化 issuer、一次激活与自动刷新

前置：B2 proof 合同和校验基础。

- **B3.1 持久化商业账本**：扩展 `pkg/entitlementservice.Registry`，复用仓库已有数据库技术实现事务型存储；购买确认事件、subject、grant、device allocation、activation、sequence、审计持久化；禁止 MemoryRegistry 直接作为生产主存储。每次 refresh 从权威权益读取当前截止，不沿用过期的内存 ActivationDecision。
- **B3.2 受认证兑换与发行配置**：最小单服务部署入口、受保护 issuer key、登记的商品／发布映射；一次兑换码只存必要摘要／状态、限频，不通过公共未认证接口签发权益。人工确认收款即可，但真实扣费、生产 key、真实客户授权、公开上线不是测试的隐含授权。
- **B3.3 幂等激活／刷新／停用**：兼容已有 REST，明确 v2 协商；最后设备名额事务性竞争；响应丢失后可重试／恢复，不重复占名额或无限提升 sequence 导致客户端失步；请求 nonce 与幂等操作身份分工清楚。记录签发响应／修订和恢复协议，不能要求客户端降高水位。
- **B3.4 宿主刷新协调与状态恢复**：复用 `pkg/entitlement` HTTPS 客户端，限定 endpoint／audience，凭据不随包 URL 外送；24 小时刷新、网络恢复／唤醒、single-flight、退避／抖动；刷新失败保留有效缓存。已知撤销不能因断网被覆盖。本地安装失败与远端激活名额需要幂等恢复或补偿记录。

建议面：`pkg/entitlementservice/{service,http,...}.go` 与持久化 Registry，`pkg/entitlement/client.go`，`internal/licensecli`；必要单独 server cmd（先核对已有部署入口）；原生产品协调文件，不能把网络逻辑塞入 ProtectedPackageLoader。`tests/runtime-api/entitlement-activation.js`＋受控 issuer fixture，持久化／网络故障内部 seam。

演示：人工登记测试购买→兑换→运行所需证明→issuer 重启→名额与序号保持→断网缓存→恢复刷新→撤销／重新购买。测试证书／key 仅在隔离环境，不进入生产信任默认值。

映射：ENT-04/08/12～14/17/18/24～27（ENT-26 此批只验内部幂等与事件账本，不宣称真实 Billing webhook 已实现）。

### B4：统一 Gate、受保护执行与运行期截止

前置：B1 安装身份和运行租约、B2 evaluator、B3 激活／刷新可对接。

- **B4.1 统一执行准备**：Catalog 身份、实际 bytes、Trust、grant、版本、设备、权限和 KeyGrant 绑定；原生生成 PreparedFlow，任何调用方 ready/canRun/Meta 都不能越权；支持的 Runner/CLI/AI 路径共用。内层 .odpkg 直接执行仍保留既有底层授权关口。
- **B4.2 保护加载与资源上下文**：修改 `cmd/opendesk/app_recipe_runner.go` 时一起修 .js-only 和 persistExecutionSnapshots；ProtectionInfo 贯穿日志／预览／语法错误／失败／取消；无明文临时文件。实现目标 Flow.root/resolve/dataDir，保持 Execution 原路径和 workdir 语义，资源不随更新混用。
- **B4.3 Lease Supervisor**：宿主监督可续期的最早授权截止，复用取消上下文；refresh 后正确重设 timer，不用不可延长的固定 WithDeadline 再假装已经续期；断网不立即取消，硬截止／已知撤销取消目标任务。while(true)、异步与子进程归属验收，不能取消整个 App 或声称已完成外部交易回滚。
- **B4.4 入口与能力收窄**：实际审查 direct CLI、ai run、App bridge、Scheduler、HTTP/MCP、嵌套模块和调试导出；已支持 .odpkg 的入口不回归，新 Flow 入口未安全接入则显式拒绝。远程传输不获得任意路径／本地权限；高级 capability 使用相同权益判断，不因 Manifest 声明自动授权。

建议面：`pkg/flowinstall/` 执行编排，`pkg/scriptloader/{loader,protected,...}.go`，`cmd/opendesk/app_recipe_runner.go`、`main.go`，`internal/aicli`／`internal/protectedcli`，必要 `pkg/execution` 可信输入与取消接线，不复制 Runtime；`tests/runtime-api/flow-execution-entitlement.js`／`entitlement-runtime-deadline.js`／`flow-protected-artifacts.js`（建议名）。

演示：同一业务 JS 与授权 .odpkg 读资源输出一致；无权零执行；短 TTL 长任务到点停止，续期可以延长合法运行；直接抽出 .odpkg 不能绕过；所有受控输出无测试秘密标记。

映射：ENT-01～03/07/08/14～16/19～25/29，FLOW-13/15/16/19/23/25。

### B5：原生安装入口与最小授权 UX

前置：B4 可运行商业链路。界面不是独立授权 owner。

- **B5.1 双击／拖放／文件选择**：macOS 文档打开事件与 Windows 文件关联／参数，冷启动／热转交同一实例；实窗拖放统一安装 owner；不抢 .js 系统默认关联，不拼 shell 命令，不自动执行业务。
- **B5.2 既有 Runner 与授权管理**：Catalog 接入播放器，保留运行／停止／上一个／下一个／当前名称／列表；一行状态＋对应激活／续订／联网修复主动作；信任与授权不同意不能混成一个默认勾选。单次激活后多 Flow 可以复用产品购买、独立取得包信封，用户不选 key。无人值守返回错误，不弹购买窗。
- **B5.3 产品发行接线**：只读官方资源与可写 Flow 分开；manifest／构建脚本携带所需关联和原生入口；主程序与 UI host provenance 一致。保存原 recipes 顺序／当前选择／资源／引用的迁移资格；运行／更新／停止／隐藏关闭回归。

建议面：`apps/opendesk/script-runner/controller.js`、`player-controller.js`、`script-runner-simple.js`、必要 `main.js`／locale，`pkg/appshell`／native file-open/drop owner、产品构建脚本（先读实际 owner），`tests/runtime-api/flow-product-installation.js` 与原生资格脚本。

演示：客户对一个带空格／中文路径的 .odflow 双击或拖入→明确信任／激活→正确条目→明确 Run→结果；到期可续订，免费项目与停止按钮仍可用。

映射：FLOW-01/03/08/11/12/14/22～25，ENT-11/20/24/25/30。

### B6：首客户放行与双平台资格

前置：B0～B5 已有实现；不要求把所有真机测试推迟到此时，每批能验的就当批验。

- **B6.1 对抗和泄露总回归**：架构 ENT 与 FLOW ID 对齐，缺失分支／旧入口／权限扩大／明文泄漏逐项修复；正向独立业务 Oracle，拒绝独立零执行 Oracle。不能降低断言或删失败测试。
- **B6.2 故障、迁移和运营恢复**：ZIP／目录／Catalog／cache／secure high-water／server response 等提交点注入失败；并发激活刷新、备份回退、服务恢复、更新中运行、卸载、设备换机与 v1 兼容。最小发行方 runbook 包含备份／恢复、撤销、续期、密钥失效和无网络处置。
- **B6.3 真实交付资格**：macOS 与 Windows 分别验证构建、文件关联、Keychain／DPAPI、冷／热启动、实窗拖放、首次激活、离线、截止与续期；保存截图／实际结果。生成维护 `docs/quality/subscription-entitlement-qualification.md`，链接已有 Flow 资格而不复制其事实表。

演示：一个干净客户环境完成完整链路；通过短 TTL／受控时间覆盖 30 天边界，并有生产时间源校准／睡眠恢复证据。没有 Windows 设备就明确标 Windows native 未验证，不能把 cross-build 改名 PASS。

放行是按目标平台分开的：可标 macOS 候选已资格、Windows 待验；不得对外宣传双方均稳定。真实支付／公网站点／生产 key 缺少时，注明生产运营配置未完成，不能把本地测试 issuer 称商业上线。

## 5. 工程边界：避免边做边变成另一个系统

既有 Go 依赖方向保持可理解：scriptloader 消费 licensing；entitlement 客户端消费 licensing；entitlementservice 消费协议／licensing；高层 Flow／宿主编排组合它们。不要让 licensing 反向 import Flow／网络客户端／execution 制造环或隐式联网。

共享热点：`main.go`、`app_recipe_runner.go`、`pkg/licensing/*`、Runner controller。每批先声明实际 owner 与本次触达文件，其他会话已改时合并最新内容；不能让 B1/B2 在未协调情况下同时重写共享 store。

Trust Store、公钥 pin、Scope record、商业 proof 各自有明确用途。路径统一不是另起一个 key owner 的理由。现有 `.odpkg`／`.odlicense`／online-cache v1 只做受控适配，不改变历史语义。

授予真实授权的 operator 接口必须认证，签名私钥不从生产客户端或脚本加载。隔离测试输入／临时 key 放 `.runtime/`，不提交真实或可通用绕过的秘密；非秘密固定向量可以作为测试资产。

付费明文 JS 不能被包装宣传成强防复制；首客户模板用 `.odpkg`。安装不执行 hook，不覆盖官方 Shell。缺许可可以安装待激活，坏签名不能正式 ready。

## 6. 每批固定执行循环

```text
读取最新 master／AGENTS／对应合同／台账
→ 核对代码与已有证据，只复用真实成果
→ 锁定本批 goal、依赖、owner 和最小测试集合
→ 修改真实生产代码＋真实 JS 测试＋必要内部 seam
→ 执行可用的构建／测试
→ 修复失败并重跑原案例及必要回归
→ 写入 master，重新核验提交范围／HEAD
→ 更新本台账：代码状态、测试状态、剩余阻塞、下一工作包
```

新对话先展示简表：已完成可复用／需补充／被什么证据阻塞；然后直接改代码，不能在读取之后只再输出一段计划。一个对话按一个有边界的批次执行；批次太大就按已定义工作包交付，保留准确接续点，不为凑“批次完成”写空壳。

GitHub-only 环境：没有本地 checkout 就只报告远端 SHA／文件，不编造 git status；直接写仓库代码和测试，使用可用 CI 的真实结果，无法执行标 NOT_RUN。不得为了模拟成功新建生产绕过接口。可用工具若无对应 CI 调度能力，不承诺自动触发。没有原生桌面不会阻止实现 parser／installer／client 等可做部分。

本地执行：先核对当前 checkout／HEAD／git status 与运行构建物；不覆盖无关修改。真实 Runtime／UI 验收用同来源主程序和 UI host，普通体验提供从仓库根目录复制的一行命令。不要用旧 dist 造成代码已改但 UI 未加载的假结论。

## 7. 测试组织与准入规则

测试名是预期目标，复用既有等价文件优先。公开 Runtime 行为放 `tests/runtime-api/*.js`，CLI 集成也应调用真实二进制，按 AGENTS／docs/api/.rules.md 和正式 runner 注册。内部 crypto／路径竞态／数据库故障 seam 可写同包测试，不以其替代产品 JS。开发 fixture/工具进所属 tests 域；执行输出一律 `.runtime/tests/flow-distribution/` 或 `.runtime/tests/subscription-entitlement/`，不可提交运行日志／客户 proof／秘密。

每个案例必须有：test ID＋子场景、expected/actual、状态、源码／构建身份、OS、命令、证据位置。正向读真实资源产出独立结果，负向宿主运行计数／副作用 Oracle 为零。泄露检查扫描实际安装输出、artifact、日志、预览和受控 temp；不把本来含测试源码的输入 fixture 混进去误报。

测试分层：格式／纯规则 → 原生 owner → 真实 CLI／Runtime JS → 产品 native/live。不得把上层缺失交给下层成功掩盖。C0/B0 的 verify 测试只能证明签名与容器合同，不等于安装／激活成功。

首客户必须覆盖：有效、未开始、商业过期、离线硬截止、服务恢复、篡改、多发布者隔离、错设备、防回滚、无限运行到期取消、受保护源码零落盘、安装恢复和目标 OS 真实安装体验。Trial/买断/组织／计数等未销售的模式可以延后，但 parser 必须明确拒绝尚不支持的语义，不能静默放行。

## 8. 台账与接续协议

### 8.1 当前批次状态

**架构与计划文档已建立不等于 B0 已完成。以下是入库时状态。**

| 批次 | 实现状态 | 验证状态 | 当前依赖／下一步 |
|---|---|---|---|
| B0 | NOT_STARTED | NOT_RUN | NEXT：核对并行改动后实现包格式／CLI／JS 测试 |
| B1 | NOT_STARTED | NOT_RUN | B0；消费同一包 parser |
| B2 | NOT_STARTED | NOT_RUN | B0 身份合同；实现 proof v2，复用旧授权基础 |
| B3 | NOT_STARTED | NOT_RUN | B2；持久化 issuer／激活刷新 |
| B4 | NOT_STARTED | NOT_RUN | B1+B2+B3；统一执行及截止 |
| B5 | NOT_STARTED | NOT_RUN | B4；原生入口与 Runner |
| B6 | NOT_STARTED | NOT_RUN | B0～B5；目标平台交付资格 |

### 8.2 状态不能混成一个 DONE

实现状态：NOT_STARTED / IN_PROGRESS / IMPLEMENTED / BLOCKED。

验证状态：NOT_RUN / PARTIAL / PASS / FAIL / BLOCKED；具体案例可按既有标准标 SKIP 并注明理由。IMPLEMENTED＋NOT_RUN 是合法进度，不是完成验收。一个批次只有代码、命令与规定证据齐全且必需用例 PASS 才能标该阶段已验证。大 ID 的子场景未验时不报整个 ID 全 PASS。

更新模板（写到本台账下面，不另造一份 handoff 文件）：

```yaml
batch: B0
workPackages: [B0.1, B0.2, B0.3]
sourceBaseline: <开始时实际 SHA>
implementationCommits: []
codeStatus: IN_PROGRESS
verificationStatus: NOT_RUN
changedOwners: []
reuseEvidence: []
commandsActuallyRun: []
caseResults: []
platformEvidence:
  macOS: NOT_RUN
  Windows: NOT_RUN
blockingFacts: []
remainingWorkPackages: []
nextAction: <一个明确的工作包或验收动作>
```

模板是字段说明，不是本轮证据。代码 commit 与证据报告 commit 可分开，避免把正在创建的 commit SHA 自引用为已存在。任何证据只对其实际 source SHA／build 有效。

### 8.3 一个批次结束必须回答

本批实现了哪个用户行为；实际改了哪些生产／测试文件；哪些测试确实运行；哪些未运行及原因；代码 commit 和最后核验 HEAD；下一批依赖是否满足；本台账精确 nextAction。

不能只说“准备继续”“建议下一轮测试”，也不能把开发完成与生产上线混在一起。上次未跑的测试优先补或明确作为外部资格阻塞；与之无关、依赖合同已明确的工作可以继续，但不能宣称整体可交付。

### 8.4 并行写入纪律

始终 master，不建新分支、不 reset、不 force push。开始与每次内容写入前检查 HEAD 和目标文件；GitHub Contents 写入使用最新 blob SHA，或基于最新完整 tree 创建小范围提交并用非强制 fast-forward 更新 ref。失败／冲突时重新读取差异并合并，不能覆盖并行工作。不要把本地未保存／未授权文件顺带提交。

## 9. 与旧 Flow 实施会话的协调

`docs/command/flow-distribution-implementation.md` 仍作为原分发目标入口，不删除它；现有会话可以继续分发功能。但需要读取本商业合同与台账，避免完成安装后才发现要重做授权和执行桥。

复用映射：原“格式与安全安装”对应 B0/B1；原“信任／授权／受保护加载”覆盖 B2/B4 的部分，通用权益／时钟／运行期截止不能省；原“Runner／原生入口”对应 B5；原“兼容迁移／故障验收”对应 B6。现有 FLOW-01～25 原门槛保留，不因为新的批次计划删测试。

同一目标代码只有一个 owner。已有实现不重建，缺商业能力只追加必要 seam。即使旧文档写了完成，仍以源码＋测试＋实际证据决定该工作包能否复用。

## 10. 首客户之后，才进入完整会员与平台阶段

| 阶段 | 对应开发增量 | 开始前条件 |
|---|---|---|
| Phase 2 正式会员 | Account、Pro 商品、设备管理、一个实际 Billing adapter；取消／退款／恢复／对账 | B0～B6 的本地交付与授权边界稳定 |
| Phase 3 开发者生态 | 多 Publisher 登记与作用域委托、开发者发布、Market／更新／结算 | 包和授权协议稳定，不把 Market 当执行引擎 |
| Phase 4 企业 | Organization／Seat／服务主体、离线借出／归还、通用 .odlicense、审计策略 | 有明确企业场景与隔离网资格计划 |

首客户前无需全套 SaaS，但 B3 的持久化签发／刷新不能省。未来更换 Billing 不应改 Runtime 或 .odflow；新增商业模式先落可信 grant 政策和测试，再开放销售。未知／未实现模式宁可明确拒绝，不以默认永久或无授权运行代替。

## 11. 当前下一步

**在新网页对话执行 B0：实现可构建、可检查、可验签的 `.odflow` 包内核与真实 CLI／JS 测试。**不要首先去做会员 UI，也不要一次性要求完成 B0～B6 后把多数工作留成空壳。

新对话使用统一提示词；若实际 master 已有 B0 实现，先核验可复用证据，补本批缺口或接续已满足前置的下一工作包。台账跟随真实源码更新，不能把本次初始 NOT_STARTED 当成永远必须从零开始。
