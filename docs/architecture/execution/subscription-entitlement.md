# OpenDesk：订阅会员、统一权益与 Flow 商业分发架构

> 决策日期：2026-09-17。状态：DESIGN_ACCEPTED / IMPLEMENTATION_PENDING。
> 本文由本次会话提供的 `opendesk-subscription-entitlement-architecture.md` 整理入库，是商业权益的目标合同，不是功能已经实现或通过验收的声明。
> 原始源码核验基线：`0dfdedc9dd15b37274f3751ebaf599374f909f6b`；Flow 合同基线：`9cbd2b1ef7201746a30ce3508895476083993efb`；入库前复核：`9b90670d187a4ea6eeea232f6a52e1ad1be4ebcc`。后两者的差异仅涉及推广 controller/core，不证明本机运行状态。
> 本次落文不修改业务代码，不运行构建、Runtime 或 macOS/Windows 真机测试。实现进度和证据由下列开发计划持续记录。

## 0. 文档权威与执行入口

- [Flow 分发与安装合同](flow-distribution-installation.md)：格式层级、单目录安装、信任、资源上下文、FLOW-01～FLOW-25。本文补充商业权益，不重新定义安装体系。
- [开发计划、工作包与进度台账](../../plans/commercialization/subscription-entitlement-delivery.md)：批次 B0～B6、依赖、源码 owner、测试与接续点。
- [网页／本地实施提示词](../../../prompts/runtime/subscription-entitlement-implementation.md)：进入一个明确批次，直接修改代码与测试，不重复整轮研究。
- [受保护包架构](protected-recipe-package.md)、[安全模型](protected-package-security-model.md)：既有 `.odpkg` 与 P1/P2 的兼容基础。

优先关系：当前源码与真实证据描述实现事实；本文和分发合同规定目标行为；开发计划决定实施顺序；提示词只引用这些合同，不再维护一份平行架构。未实现字段不能直接写进现有严格 parser 并假设受支持。

入库时明确补齐了原示意 JSON 中未展开的请求 nonce、包签名身份、Flow/版本/包摘要关联。它们必须由 B0/B2 固化为共同 schema 与测试向量，不是声称旧 v1 parser 已经识别这些字段。未知安全语义、旧格式降级、字段丢失均须 fail closed。

## 1. 一页式最终方案

**统一 Entitlement Framework；签名本地执行租约加定期刷新为主；已有设备绑定 `.odlicense` 为企业离线／历史兼容通道。**

| 核心对象 | 职责 |
|---|---|
| Product / Offer | 卖什么、包含什么、计费方式与周期 |
| Subscription / License | 持续付费关系或一次购买／企业合同的来源 |
| Entitlement | 谁对什么资源有什么权利、期限与版本范围 |
| Activation / Allocation | 设备激活、人员／无人值守分配、名额占用 |
| Signed Execution Lease | 当前设备可离线验证的有限期证明，有刷新点与硬截止 |
| Flow / Package | 稳定自动化身份与具体发布内容 |
| Publisher Trust | 发布身份、密钥用途、作用域和认可来源 |
| Content Key Grant | 特定受保护包的设备密钥信封，不是购买关系 |

```text
支付平台 / 人工收款 / 企业合同
             ↓
内部 Product、订单、Subscription / License
             ↓
Entitlement Service（持久化权益、激活、撤销）
             ↓
签名执行租约 + 按需包级 KeyGrant
             ↓
原生商业状态 owner

.js / .odpkg / .odflow
             ↓
安全安装：内容完整性 + 发布者信任；业务零执行
             ↓
flows/<installId>/ + Flow Catalog
             ↓
Runner / CLI / AI / 其他受支持入口
             ↓
原生 Gate：身份、内容、信任、权益、版本、设备、时间、权限
             ↓
已有 ScriptLoader → 已有 execution.Run / Goja
             ↓
宿主监督授权截止，必要时取消目标付费 Execution
```

安装：允许可信包安装后稍后激活，缺权益不能标 ready。运行：有效本地证明即可本地决策，不每次联网。订阅：可信账单事件转权益，再刷新桌面证明。离线：允许用到签名硬截止，但不能超过商业有效期。到期：保留安装、数据、日志和续订入口，阻止新执行并取消在途付费长任务，不关闭整个 App。

首客户建议政策：**购买确认后 30×24 小时、一设备、每 24 小时尝试刷新、签发后最长 7 天离线且不超过购买截止**。这是产品政策，不是当前实现默认值或防破解保证。

## 2. 当前仓库事实与真实增量

| 能力 | 已核验 owner | 事实和限制 |
|---|---|---|
| 受保护单脚本 | `pkg/scriptpackage`、`pkg/scriptloader/protected.go` | `.odpkg`、Ed25519、AES-GCM，验签→授权→取 key→内存解密→ScriptSource |
| 本地授权 | `pkg/licensing/license.go`、`device_bound.go` | 精确 publisher/product/package/content-key/device 绑定；不能简化为只看 productId |
| 离线 License | `pkg/licensing/offline_license.go` | 已定义 `.odlicense` v1，设备绑定、issuedAt/expiresAt、KeyEnvelope |
| 在线缓存 | `pkg/licensing/online_cache.go` | v1 有签名、refreshAfter、offlineUntil、sequence、active/revoked；客户端最大离线区间 7 天 |
| 缓存防回滚 | `pkg/licensing/online_replay.go` | OS 保护的激活／修订记录；不等于强系统时钟防回拨 |
| 在线客户端 | `pkg/entitlement/client.go` | HTTPS 激活、刷新、停用；加载器不自行联网 |
| 参考授权服务 | `pkg/entitlementservice/service.go` | Authenticator、Registry、设备名额与撤销；MemoryRegistry 不是生产持久化；默认离线配置 24 小时 |
| 设备与秘密 | `pkg/deviceidentity`、`pkg/securestore` | P-256、macOS Keychain、Windows current-user DPAPI owner；不是硬件不可导出承诺 |
| 执行生命周期 | `pkg/execution/runner.go` | 同一 Goja；Request.Context、取消与超时可以复用 |
| 官方 App 执行桥 | `cmd/opendesk/app_recipe_runner.go` | 当前只接受 `.js` 并保存源码快照；接入受保护文件时必须同时修快照路径 |
| Runner 发现 | `apps/opendesk/script-runner/controller.js` 等 | 直接 `.js` 文件扫描；播放器已有，应该换数据源而非重做界面 |
| 产品路径 | `apps/opendesk/script-runner-simple.js`、`cmd/opendesk/app_paths.go` | 现有 App 数据根、recipes、显式路径覆盖 |
| CLI 组织 | `internal/packagecli`、`internal/licensecli`、`internal/protectedcli`、`internal/aicli` | 后续接线应先复用现有组织与公共文档，不把新命令逻辑全堆进 main.go |

`licensing.Entitlement` 当前混合包级身份、ExpiresAt 和 KeyEnvelope，是包级验证结果，不是完整产品／功能／组织权益领域模型。在线验证还会将 ExpiresAt 收敛成 offlineUntil；新合同必须保留商业截止与证明截止两个含义。

Flow 分发文档在 `9cbd2b1...` 已入库，状态是 DESIGN_ACCEPTED / IMPLEMENTATION_PENDING：`flows/<installId>/` 无正式版本层，flow-data/flow-state 分开，运行中更新等待执行结束，保留原授权存储，`.odflow` 必须签名，`.js` 可生成本地 Manifest，允许稍后激活。本设计全部继承。

本轮未验证 `.odflow` 双击安装、会员系统、生产持久化后台、账户／Billing／市场已经完成。参考服务、测试文件存在或设计评分都不能转写为生产 PASS。

## 3. 架构候选与主方案

| 维度 | A 完全在线验证 | B 签名租约＋刷新 | C 设备 License 文件 |
|---|---|---|---|
| 用户体验 | 网络故障直接阻断 | 运行快，首次激活联网 | 激活后简单，导入续期较人工 |
| 实现复杂度 | 本地简单、服务可用性要求高 | 中等，复用 P1/P2 | 初期较低、后期生命周期成本高 |
| 安全性 | 撤销状态传播快，不能防本机补丁 | 防篡改与普通复制，有界撤销延迟 | 防篡改，撤销延迟最长 |
| 离线能力 | 不满足核心需求 | 适合多数桌面场景 | 适合隔离网／固定期预付 |
| 企业适配 | 持续联网场景 | 桌面／工作站主路径 | 离线企业补充 |
| 第三方／Market | 可支持但放大平台故障 | 多产品多来源使用同一协议 | 需补销售和设备管理 |
| 长期维护 | 可用性成本容易被低估 | 最均衡 | 易形成文件碎片化 |
| 设计适配自评 | 72/100 | 95.5/100 | 83/100 |

选择 B，C 是同一框架的发行通道，不另造授权 Runtime。A 只用于明确要求实时在线计量的云能力。上述是本需求的设计判断，不是第三方实测跑分。

## 4. 格式与四条安全边界

| 格式 | 职责 | 不承担 |
|---|---|---|
| `.js` | 开发、自用、免费分享、快速导入，保留原直接执行 | 发布者认证、源码保密、强商业防复制 |
| `.odpkg` | 已有受保护单 JS，包签名、授权、设备信封、内存加载 | Flow 资源安装／更新／市场 |
| `.odflow` | 已签名 ZIP 类交付容器，资源清单、安装单位 | 第二层源码加密、新 Runtime、覆盖官方 Shell 的插件 |
| `.odlicense` | 已有设备离线 License；兼容与企业导入 | 普通客户日常手动管钥 |

**Trust ≠ Content Protection ≠ Commercial Entitlement；Permissions 是第四条独立边界。**

签名不证明客户付款、代码无恶意或拥有系统权限；加密不等于授权；商业 grant 不自动授予 File、Command 或 Accessibility 能力。权限 metadata 没有实际 enforcement 时必须如实说明，不称为沙箱。

JS 中的 expireAt 可以删改，未签名 flow.json 同样如此。即使已签名 Manifest，也只应声明资源与要求，不绑定某个客户的期限；每客户重打包破坏缓存、更新、退款和多设备管理。

首个受控 30 天交付采用 `.odflow + main.odpkg`。付费明文 JS 可以受官方入口 Gate 约束，但复制出来后不能声称仍受强防复制保护。保密 helper 在构建时合入 `.odpkg`；assets 不提供保密。

## 5. 统一权益对象、授权维度和产品政策

Account 是登录身份，Principal 是权利主体；Product 是商品，Offer 是销售方案；Subscription/License 是商业来源；Entitlement 是具体权利；Activation/Allocation 是分配；Lease 是客户端证明。

```text
Product / Offer → 订单 / Subscription / 企业合同
→ Entitlement(subject, resource, action, validity, versions)
→ 分配与设备激活 → Signed Execution Lease
→ 独立包绑定与 KeyGrant → ProtectedPackageLoader
```

组织通常是主体，Seat 是名额，设备是激活目标，不把它们混成万能 resource 字符串。

| 方式 | 模型位置 | 用途与限制 |
|---|---|---|
| 用户／账号 | subject=user；Account 认证用户 | 个人会员，一人多设备不等于多个 Seat |
| 设备 | activation→真实设备密钥身份 | 固定自动化电脑，迁机需回收流程 |
| 组织 | subject=organization＋allocation | 统一购买，分配给人或服务主体 |
| Seat | 配额与分配记录 | 人员名额，不等于机器数 |
| Flow | resource=flow:stableFlowId | 独立购买、订阅、试用 |
| Publisher 套装 | 可信商品展开若干 Flow grants | 信任发布者不等于买了全部内容 |
| 离线机器 | signed proof＋device binding＋policy | 预付隔离网，不承诺即时撤销 |
| 无人值守 | service-account／machine allocation | 不依赖员工持续交互登录 |
| 并发容量 | 独立 capacity allocation | 不等于设备激活数；离线借出仍占名额 |

首版一客户、一 Flow、一设备；不实现复杂组织 Seat 和全球实时并发。Pro 与第三方 Flow 共用签发、验证、设备、缓存、撤销、错误框架，不必共用价格、试用、离线和版本政策。

Pro 可以产生 product/use、feature/use、具体官方 flow/run。跟随 Pro 的 Flow 必须来自可信商品目录或获准合作，由服务端展开 grant，不能只填 includedInPro=true。高级功能在现有原生 capability owner 使用相同权益判断，不能只隐藏 UI。

默认免费宿主允许运行已购买且仅依赖免费能力的第三方 Flow；确实依赖 Pro 能力时，在购买与运行前明确展示，避免无意双重收费。Free 基线由宿主定义。会员到期不关闭 App、不锁用户数据、不禁用停止／日志／数据导出／续订；这里的数据导出不包含受保护源码。登录会话过期不自动抹除仍有效的本地运行权；显式退出和停用另有清楚政策。

| 商业模式 | 权益 | 推进策略 |
|---|---|---|
| 免费 | 无商业 grant；仍验 Trust／权限 | 首版；加密免费包仍需合法密钥交付 |
| 30/90/365 天 | 固定 validFrom/validUntil | 首版核心；订单固定起算事件 |
| 月付／年付 | 当前已付账期 grant，续订延长 | Phase 2，账期不是 Runtime 规则 |
| 7/14 天试用 | source=trial 的期限 grant | 首次服务端确认试用，重装不重置 |
| 30 次试用 | 独立计量账本、幂等执行计费 | 暂缓，不能靠可删 count.json |
| 永久 1.x | perpetual＋版本范围 | 必须显式永久类型，不把缺字段当永久 |
| 永久含未来版本 | perpetual＋明确 all 政策 | 不等于无限云资源／维护 |
| Pro included | 可信套餐展开具体 grant | 与独立买断共存 |
| 企业／市场 | source=contract/market-order | 仍使用统一框架 |

同资源有多个来源时，满足一个完整、兼容的 grant 即可；不能拼接不同主体、版本、期限来凑权限。撤销一个订阅不自动撤销另一个独立买断；包安全撤销则可以独立阻止运行。

## 6. 稳定 ID 与版本权益

publisherId 是登记／企业认可的稳定 namespace，反向域名只是语法，不自动证明所有权。无域名发布者可使用登记 namespace。认证身份与自称同名的未知 key 不合并。

- flowId：如 `com.vendor.order-export`，跨版本不变。
- productId：内部商品／套餐，如 `com.vendor.order-export`、`com.opendesk.pro`，不复用支付平台的 Product/Price ID。
- offerId：月付、年付、term30d 等销售方案。
- packageId：具体受保护发布构建；contentKeyId 是该构建的独立 DEK 标识。
- installId：宿主分配、跨升级不变的本地安装标识。

安装匹配使用已验证发布者身份＋flowId；磁盘用 installId，不直接拼包提供的字符串。新商业 ID 长度先与既有 License 的 identifier 限制对齐，不能照搬 App ID 255 字节后在包授权层失败。具体语法和长度在 B0/B2 共同冻结。

版本用 SemVer，不按字符串排序。买 1.x 不自动有 v2。同版同摘要幂等，同版异摘要拒绝普通更新。

| 承诺 | 表达 |
|---|---|
| 只买 1.x | 永久／定期＋`>=1.0.0 <2.0.0` |
| 永久含未来版本 | 独立明确的 perpetual＋all 商品政策 |
| 订阅期间更新 | 验当前 grant 与可信发布归属，再按需发新包 KeyGrant |
| 到期保留旧版本 | 独立 fallback 永久 grant，固定版本／摘要或可信版本集合 |

不得将 Publisher 自填 releasedAt 当作购买前后版本的唯一证据；用可信发布记录／摘要。未获得 v2 权利时不替换仍可用的 v1。更新等待运行结束，再事务替换单目录。fallback 从受管签名归档缓存或可信源重新安装到同一 installId；缓存不是第二棵可执行版本树。离线回退承诺需要保留归档包；业务数据不兼容时须备份和明确恢复流程，不能自动破坏性降级。

## 7. 时间、刷新、离线和运行期截止

### 7.1 时间模型

| 字段 | 谁决定 | 定义 |
|---|---|---|
| validFrom | 权益服务依可信购买／试用事件 | 商业开始，包含端点 |
| validUntil | 权益服务 | 商业截止，不包含端点 |
| issuedAt | 证明签发服务 | 本次签发／时间锚，不等于购买开始 |
| refreshAfter | 证明签发服务 | 刷新软时间，不是立即停机时间 |
| offlineUntil | 证明签发服务 | 本地证明硬截止，客户端不能延长 |

所有 wire 时间为 canonical UTC；界面转换用户时区。

```text
购买确认：2026-09-17T08:00:00Z
validFrom  = 2026-09-17T08:00:00Z
validUntil = 2026-10-17T08:00:00Z

issuedAt = 每次真实签发时间
offlineUntil = min(issuedAt + 7 天, validUntil)
refreshAfter = min(issuedAt + 24 小时, offlineUntil)

max(validFrom, issuedAt) <= effectiveNow < min(validUntil, offlineUntil)
```

多 grant 不同期限时首版分组签发或取最早截止，不能延长已过期 grant。将来可独立刷新不同资源，不能把一个无关 Flow 到期扩大为整个产品停机。

“购买后 30 天”按确认购买开始；“首次激活后 30 天”应是独立 startPolicy 和最迟激活期限，不由本地文件创建时间决定。月／年订阅按账期，不粗暴替换成固定 30／365 天。

### 7.2 刷新与宽限

正常执行只验证本地 proof。到刷新点、启动、恢复网络、唤醒时，由宿主统一限频、幂等、退避／抖动刷新，不让每个 Flow 自己联网。网络失败保留尚有效证明。

7 天从签发算总窗口，不是断网后或刷新点后再送 7 天。现有客户端上限 7 天、参考服务默认 24 小时是两件事，新默认须配置和测试。

Billing Grace 是服务端明确延长商业权利；Offline Grace 是已获得权利内断网容忍，不能越过 validUntil。收到可信签名撤销后提交高版本状态并停止目标执行，后续网络错误不能回用旧 active。网络故障、DNS、HTTP 401 或会话到期本身不是签名商业撤销。到硬截止且不能刷新，就停止对应付费能力，不能伪造续期。

退款／撤销后的离线设备可继续到原 offlineUntil，是明确接受的传播窗口。长期完全离线、即时服务端撤销、绝对防绕过不能兼得。隔离网更长预付期限使用企业合同，接受更长传播窗口，人工导入续期。

### 7.3 时钟与恢复

在既有 sequence 防回滚上补：可信服务端时间锚、进程内单调经过时间、OS 保护最近可信时间／修订、重启和唤醒核对。明显回拨要求安全校时／修复，不把系统时钟当续期接口。

跨平台处理单调时钟是否包含睡眠、休眠／重启、时区和 DST，不能只调用 Date.now。误调未来不能永久毒化用户：用认证、nonce 和最新修订绑定的服务端响应重新锚定，不依赖用户删文件。

完整机器／VM 快照、管理员改客户端、复制可导出 OS 状态仍是上限；不宣称硬件安全时钟，MVP 不建设大型 DRM。

### 7.4 运行期截止

**只运行前检查会允许到期前启动无限循环长期继续。**

宿主 Lease Supervisor 将授权最早截止绑定目标付费 Execution 的取消上下文；新签名证明成功提交后可以重设计时。商业到期、离线硬截止或已知撤销时拒绝新运行，并取消在途目标执行；不在脚本中插会员定时器。

复用 Request.Context 和已有取消机制，不修改 JS 语言语义、不终止 App Shell。保留日志和结果。已发送鼠标事件、外部 HTTP／业务交易不能自动回滚。长任务按业务需要幂等／检查点。脱离 Execution 管理的长期子任务不能作为首版付费模板；不可取消原生调用、子进程、睡眠恢复必须是资格阻断项，不能用“瞬间停止一切”掩盖。

## 8. 建议 JSON 与可信字段

以下是目标合同示例，不是当前 parser 可直接使用的输入。`2.1.0` 只是假设首个支持版本，不得据此改当前 VERSION；writer 填实际支持版本。哈希、密钥、签名和尺寸是示意，不组成真实有效包。

### 8.1 flow.json

```json
{
  "schemaVersion": 1,
  "flowId": "com.vendor.order-export",
  "name": "订单导出",
  "version": "1.2.0",
  "publisherId": "com.vendor",
  "publisherKeyId": "package-signing-2026-01",
  "entry": "main.odpkg",
  "minimumRuntimeVersion": "2.1.0",
  "platforms": ["darwin", "windows"],
  "permissions": {"requested": ["desktop-automation", "filesystem"]},
  "files": [
    {"path": "main.odpkg", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "size": 16384},
    {"path": "assets/template.csv", "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "size": 1024},
    {"path": "trust/publisher.pub", "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "size": 32}
  ],
  "commercial": {
    "productId": "com.vendor.order-export",
    "requiresEntitlement": true,
    "resource": "flow:com.vendor.order-export",
    "action": "run"
  }
}
```

flow.sig 对原始 Manifest 字节＋专用格式域签名；清单覆盖全部入口、资源、公钥，不包括 flow.json 和 flow.sig 自身。缺文件、多文件、重复字段、未知安全语义、摘要不符均拒绝。公开材料须实际使用公钥 parser，私钥改名不能发布。

commercial 只说需要哪个权利；商品归属来自可信记录，不固定唯一月付／年付／买断方式。不含客户 ID、购买截止、兑换码、明文 DEK、任意授权服务器 URL。permissions 只是请求，只有真实宿主 enforcement 才能称权限限制。

### 8.2 Publisher metadata

```json
{
  "schemaVersion": 1,
  "publisherId": "com.vendor",
  "displayName": "Vendor A",
  "flowNamespace": "com.vendor.",
  "packageKeys": [{"keyId": "package-signing-2026-01", "algorithm": "Ed25519", "publicKey": "<base64-public-key>", "purpose": "package-signing"}],
  "entitlementIssuers": [{"issuerId": "com.opendesk.licensing", "resources": ["flow:com.vendor.order-export"], "actions": ["run"]}],
  "recordRevision": 1,
  "attestation": {"issuerId": "com.opendesk.registry", "keyId": "registry-2026-01", "signature": "<signature-over-record-excluding-attestation>"}
}
```

只有回到已有可信根的注册证明，或用户明确批准的本地作用域才有效。自称 issuer、包带公钥、attestation 字符串都不能建立可信根。显示名／图标／网址属于不可信显示输入，安全渲染。

单 Flow 批准不能扩大到全 Publisher；package-signing 不等于 entitlement-signing。Vendor A 不能发 Pro、Vendor B Flow 或超出委托范围的通配权限。授权 issuer 的 keyId 先只作候选路由，最终必须核对外部信任与发行作用域。

### 8.3 服务端 Entitlement

```json
{
  "entitlementId": "ent_order_001",
  "subject": {"type": "license_customer", "id": "customer_001"},
  "resource": "flow:com.vendor.order-export",
  "action": "run",
  "validityKind": "term",
  "validFrom": "2026-09-17T08:00:00Z",
  "validUntil": "2026-10-17T08:00:00Z",
  "versions": {"kind": "semver_range", "value": ">=1.0.0 <2.0.0"},
  "source": {"type": "term_license", "id": "lic_001", "productId": "com.vendor.order-export"},
  "revision": 1
}
```

永久用 validityKind=perpetual 与显式 validUntil=null，仅在获准发行政策下支持；缺字段、零时间、解析失败绝不等于永久。永久销售需有离线恢复／持续使用路径，不能暗中依赖发行服务器永远在线。

数据库记录不是客户端证明；决定运行的全部字段必须签名。客户端不能凭 entitlementId 信任另外一份可修改 JSON。设备名额／用量由服务端事务分配，不是给客户端写个 deviceLimit 就算实现。

### 8.4 Signed local proof：既有在线缓存显式 v2

```json
{
  "format": "opendesk-online-entitlement-cache",
  "formatVersion": 2,
  "issuerId": "com.opendesk.licensing",
  "issuerKeyId": "entitlement-signing-2026-01",
  "audience": "opendesk-desktop",
  "requestNonce": "<canonical-base64-32-byte-request-nonce>",
  "activationId": "activation_001",
  "deviceId": "device_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "deviceKeyAlgorithm": "P-256",
  "sequence": 8,
  "state": "active",
  "issuedAt": "2026-09-17T08:00:00Z",
  "refreshAfter": "2026-09-18T08:00:00Z",
  "offlineUntil": "2026-09-24T08:00:00Z",
  "entitlements": [{
    "entitlementId": "ent_order_001",
    "subject": {"type": "license_customer", "id": "customer_001"},
    "resource": "flow:com.vendor.order-export", "action": "run", "validityKind": "term",
    "validFrom": "2026-09-17T08:00:00Z", "validUntil": "2026-10-17T08:00:00Z",
    "versions": {"kind": "semver_range", "value": ">=1.0.0 <2.0.0"},
    "source": {"type": "term_license", "id": "lic_001", "productId": "com.vendor.order-export"},
    "revision": 1
  }],
  "keyGrants": [{
    "entitlementId": "ent_order_001",
    "publisherId": "com.vendor",
    "packagePublisherKeyId": "package-signing-2026-01",
    "productId": "com.vendor.order-export",
    "flowId": "com.vendor.order-export", "flowVersion": "1.2.0",
    "packageId": "order-export-release-1.2.0",
    "packageDigest": "<existing-odpkg-package-digest>",
    "contentKeyId": "content-key-release-1.2.0",
    "deviceId": "device_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "envelope": {
      "algorithm": "P-256-HKDF-SHA256-AES-256-GCM",
      "ephemeralPublicKey": "<base64-ephemeral-public-key>",
      "nonce": "<base64-nonce>",
      "wrappedContentKey": "<base64-wrapped-content-key>"
    }
  }]
}
```

示例展示签名前 payload；实际 envelope 保留原始 payload 字节，专用 v2 域和固定算法签名覆盖全部安全字段。不通过 JSON 重排猜签名，不允许 alg=none。请求 nonce 在接收在线响应时校验，离线读已提交缓存不要求制造新请求；最高 sequence／摘要继续约束缓存。

KeyGrant 关联完整 grant、精确内层包身份和已验证 release。packageDigest 是已有 `.odpkg` 摘要语义，不混成外层 `.odflow` 摘要。商品→Flow→版本→包的关系必须由可信发布记录证明，不能由调用者自报。即使抽出 `.odpkg`，服务端签署的 Flow/版本关联仍可校验，不能仅依赖外层文本。

entitlements 只表达权利，keyGrants 只表达密钥交付。可以同装在一个签名响应中减少首版复杂度；feature proof 无需 keyGrants。后续拆分需保持签名／签名摘要关联、精确绑定与最短有效期。已验证 revoked 证明不交付可用 KeyGrant，其接收和 tombstone 处理不依赖成功解密业务包。

兼容：`.odpkg` v1 不改加密／签名容器；`.odlicense` v1、online-cache v1 保持明确解析；新字段走 proof v2，旧 parser 必须拒绝。原生适配器把新权益和信封转交既有加载边界，普通 JS 不能构造 verified 对象。

新订阅交付不附赠能绕过新 Gate 的长期旧式 License；旧客户端不得通过降级领取兼容解密凭据。已发历史 License 按原承诺兼容，不能说发布新客户端便能即时撤销全部离线旧客户端。

### 8.5 Product / Subscription

```json
{
  "productId": "com.opendesk.pro", "name": "OpenDesk Pro",
  "entitlementTemplates": [
    {"resource": "product:com.opendesk.pro", "action": "use"},
    {"resource": "feature:com.opendesk.protocol-automation", "action": "use"},
    {"resource": "flow:com.opendesk.premium-report", "action": "run"}
  ],
  "offers": [
    {"offerId": "pro-monthly", "model": "subscription", "interval": "month"},
    {"offerId": "pro-annual", "model": "subscription", "interval": "year"}
  ],
  "allocationPolicy": {"kind": "named_user", "maxActivationsPerSubject": 2},
  "offlinePolicy": {"refreshIntervalSeconds": 86400, "maxOfflineSeconds": 604800}
}
```

```json
{
  "subscriptionId": "sub_internal_001",
  "subject": {"type": "user", "id": "user_001"},
  "productId": "com.opendesk.pro", "offerId": "pro-monthly", "state": "active",
  "currentPeriodStart": "2026-09-17T08:00:00Z", "currentPeriodEnd": "2026-10-17T08:00:00Z",
  "cancelAtPeriodEnd": true, "revision": 4,
  "billingReference": {"provider": "stripe", "subscriptionId": "<provider-subscription-id>"}
}
```

两设备及 feature 名只是设计示例，不是当前能力／定价。provider 标识留在服务端。cancelAtPeriodEnd 只取消以后续订，已付款区间仍有效。

### 8.6 Local cache index

```json
{
  "schemaVersion": 1, "activationId": "activation_001",
  "proofFile": "leases/activation_001.json", "secureStateRef": "os-store:activation_001",
  "lastRefreshAttemptAt": "2026-09-18T08:00:00Z",
  "displayCache": {"status": "OFFLINE_GRACE", "commercialValidUntil": "2026-10-17T08:00:00Z", "offlineUntil": "2026-09-24T08:00:00Z"}
}
```

displayCache、proofFile、lastRefreshAttemptAt 都不是授权事实；每次运行校验真实签名、发行范围、主体、设备、版本、时间、修订。改 ACTIVE 文本不改变 Gate。私钥／刷新凭据／最高修订在 OS secure store，不在 Flow 目录。

## 9. 密钥、设备和信任生命周期

| 材料 | owner | 禁止混用 |
|---|---|---|
| Publisher 私钥 | 发布者／签名服务 | 不交客户，不当 License Code |
| Entitlement 私钥 | 获准发行方 | 不作为包私钥或写入客户端 |
| 每包 DEK | 发布者／受托密钥库 | 不全平台静态共用 |
| Device 私钥 | Keychain／DPAPI 原生 owner | 不进 JS、环境、子进程参数、日志 |
| License Code | 服务端兑换凭据 | 不当 AES／签名密钥 |
| Refresh credential | OS 安全存储，限 audience／范围 | 不发送到包任意网址 |

设备绑定验证真实私钥持有／可用性及其派生身份，不只比较字符串；包括不带 KeyGrant 的 feature proof。设备解封复用现有算法，不把 ECDH key 随意改作另一协议的签名 key。服务端设备持有证明按现有能力补充经验证协议，不自创密码算法。

current-user DPAPI 不等于所有 Windows 账户共同机器授权。跨用户／重装／迁机／服务账号有独立流程。正常轮换需可信旧 key 或上级根授权、新 key 持有证明、用途／namespace／序号约束；旧 key 泄露或撤销后不能仅靠旧 key 自签恢复。

退役不等于泄露撤销。包自填日期不能证明在泄露前发布，应使用已接受摘要或可信发布记录。离线知晓撤销受信任刷新和租约窗口限制。首版少数预置信任根＋单 Flow 批准即可，不搭完整公有 PKI。

## 10. 本地目录和安装状态

沿用已有单目录合同，禁止重新引入 `flows/<flowId>/<version>`。

```text
<appDataRoot>/
├── recipes/                    # 兼容／迁移输入
├── flows/<installId>/          # flow.json、flow.sig、entry、assets、公开 trust
├── flow-data/<installId>/      # 配置、输出、检查点
└── flow-state/
    ├── catalog                # 身份、版本、摘要、状态和引用
    ├── transactions/          # 私有 staging、journal、短期回滚
    └── package-cache/         # 可选签名归档，不是可运行版本树

<existing licensing root>/
├── package-keys/
├── license-keys/
├── licenses/                  # 既有 .odlicense
├── online-entitlements/       # 既有包级缓存
└── leases/                    # 建议通用 proof v2，同一 owner

OS secure store
└── device key / refresh credential / revision / time anchor
```

默认 App 根为当前用户 `~/.opendesk/apps/com.opendesk.desktop/`，保留现有覆盖规则；License 根沿用 DefaultInstallationRoot，即显式配置或 `os.UserConfigDir()/OpenDesk/protected-recipe`。全局是当前 OS 用户范围，不是所有用户共用。

不为整齐搬迁旧激活状态；后续迁移需单 owner、恢复事务和禁止双权威回退。卸载 Flow 不默认删除共享权益、其他 Flow 信任或设备身份。

受限 ZIP、路径／大小／条目限制、候选验签、独立批准、资源验证；无 postinstall.js。目录与 Catalog 以 journal／恢复保证一致，不假设跨平台非空目录替换天然原子。双击、实窗拖放、文件选择统一 native install owner；热启动转交现有实例，不用 shell 字符串拼接执行文件。

## 11. 宿主 Gate 与模块／API 边界

只新增小的 Flow 编排 owner，不新建八套竞争系统。

| owner | 改动 | 责任 |
|---|---|---|
| `pkg/scriptpackage` | 复用 | `.odpkg` v1 格式／签名／加密 |
| `pkg/scriptloader` | 适配 | 加载、包级授权、保护状态、内存解密 |
| `pkg/licensing` | 扩展 | grant／lease、作用域、时间、版本、旧 LicenseVerifier 适配 |
| `pkg/entitlement` | 扩展 | 激活／刷新／停用、传输与重试，不判断支付 |
| `pkg/entitlementservice` | 扩展 | 持久化、签发、设备分配、审计 |
| `pkg/deviceidentity`／`pkg/securestore` | 复用／补恢复 | 私钥、时间锚、防回滚状态 |
| `pkg/flow`（建议新增） | 新增 | Package／Installer／Catalog／执行准备 |
| CLI 与 `cmd/opendesk/app_recipe_runner.go` | 接线 | 统一加载、保护 artifact、截止监督，维持 App 进程身份 |
| `pkg/execution` | 保持引擎 | 可信源码和 Context，不认识 Stripe／Market |
| Runner／App Shell／其他入口 | 状态与调用 | 支持即复用 Gate，不支持则显式拒绝 |

建议接口仅作为宿主合同，不是当前公开 API：

```text
flow.InspectPackage(path) → verified metadata / diagnostic
flow.Install(path, approvedTrustScope) → InstallationResult
flow.Catalog.List() → display entries
flow.PrepareExecution(installId, callerContext) → host-private PreparedFlow
licensing.Evaluate(resource, action, subjectContext, release) → Decision
entitlement.Refresh(activation) → verified update
flow.Run(preparedFlow, executionOptions) → existing execution result
```

已有 `/v1/activations`、刷新／停用路径保留兼容，新 proof 通过显式协商或新 API 版本接入。不存在的 CLI／API 必须先实现、测试，再作为实际命令发布。

运行顺序：可信调用上下文→Catalog 解析→原始清单／内外层身份复核→Trust／已知撤销→资源与权限要求→权益／设备／时间／修订→feature 与宿主／OS 权限→既有 Loader 的精确 KeyGrant→无泄漏 artifact→资源上下文／Supervisor→execution.Run。

JS canRun=true、可写 Catalog ready、Request.Meta 布尔值都不是授权。PreparedFlow 为宿主私有对象。抽出内层 `.odpkg` 经 -script／ai run 仍守相同权益与截止；不能删除底层 LicenseVerifier。远程入口不能因支持 flowId 获得任意路径或本地高级权限。

Flow.root／resolve／dataDir 延续安装合同目标；未实现时不可调用。不改 Execution.scriptPath/scriptDir/workdir，不用 os.Chdir；资源解析不冒充整个 File/Command 沙箱。执行绑定实际校验的字节，避免检查 A 执行 B。

**App bridge 的后缀限制与 persistExecutionSnapshots 必须一起修。**可信 ProtectionInfo 贯穿 artifact、日志、错误、预览和取消；不能只按后缀判断或把源码放进 Request.Meta。

## 12. 用户体验与错误

保留运行／停止／上一个／当前 Flow／下一个／列表。低频账户授权进入管理页。点击 Run 被拒时只提供匹配原因的主动作；无人值守返回结构化错误，不弹购买模态窗阻塞其他任务。

安装采用 C：可信包允许安装、查看、稍后激活。签名损坏不是没付款，不能成为正式 ready；安全撤销不降级成未知发布者确认。

| 错误 | 用户文案／动作 |
|---|---|
| flow_signature_invalid／清单不符 | 文件损坏或被修改，重新获取 |
| flow_not_trusted | 尚未确认发布者，查看信息 |
| license_required | 需要激活，激活／购买 |
| entitlement_authentication_required | 登录或重新连接；仍有效本地权利不立即抹除 |
| license_not_yet_valid | 授权尚未开始，显示开始时间 |
| license_expired | 使用期结束，续订 |
| license_revoked | 授权停用，查看状态／联系管理员 |
| wrong_device | 属于另一设备，管理设备 |
| device_limit_exceeded | 达到名额上限，管理设备 |
| offline_grace_expired | 联网更新授权 |
| entitlement_refresh_required | 联网校验授权／时间 |
| entitlement_replay_detected | 本地状态需修复，安全刷新 |
| flow_version_not_entitled | 不包含该版本，查看可用版本 |
| permission_required | 需要系统／宿主权限 |

沿用 licensing 现有小写错误 ABI；新 Flow 码具体形式由共同合同冻结，文档大小写展示不可生成重复语义。安装状态、权益状态、连接状态分轴，UI 只显示最重要一行。恢复订阅不复活 terminal revoked 激活，使用新 activation／lineage 并保留 tombstone。

## 13. Billing 与 Marketplace

```text
Billing provider / 人工收款 / 企业合同
→ Adapter：验签、原始 body、去重与正确来源
→ 持久化 inbox／交易记录
→ 订单和 Subscription 状态机
→ Entitlement 授予／延长／撤销事务＋审计／outbox
→ 签名执行证明 → Desktop Refresh
```

不信 checkout success 页面、客户端 paid=true；created 不一概等于已付。provider 状态由服务端适配，区分试用、已付期、past_due、取消未来续订、立即退款／争议撤销。Webhook 去重、乱序治理、定期对账，重启／失败恢复。一个来源撤销不删独立买断。

首版可以人工确认收款后用受认证后台创建权益，但需要真正持久化的客户／权益／激活账本、受保护签名 key、审计与备份。一个服务进程＋事务型数据库即可，不需要微服务或商城。

Market 后续做发现、认证、购买、下载、更新和结算，仍交付同一 `.odflow`。第三方授权 issuer 必须有资源／namespace 委托，不能签平台 Pro。首版第三方可由受控后台登记商品和授权，不要求每个 Flow 接登录 SDK。

## 14. 企业离线与 .odlicense

保留已存在后缀，不为整齐发明第二套格式。普通客户是 `.odflow + 宿主管理证明`；隔离网通过可信设备请求→发行方签发→导入 `.odlicense`→同一原生框架校验。

v1 是精确设备／包／期限合同，不能直接塞 Pro／永久／组织字段。确有需求时显式 v2 或统一导入封装，复用 evaluator 与 envelope，不新造 License Runtime。

离线名额预分配／借出期间仍占用，不能再次无限分配；释放需证明到期、可信归还或管理员明确接受重叠风险。无人值守授权不保证锁屏／无桌面会话时所有 UI 自动化都能执行，商业授权和系统能力分别验收。

## 15. 威胁模型

| 威胁 | 必要防线 | 上限 |
|---|---|---|
| 改 flow.json／entry／assets | 原始签名清单、受限读写、执行复核 | 不证明逻辑无恶意 |
| 替换 .odpkg | 外层摘要＋内层签名＋精确 DEK 绑定 | 不保证管理员补丁不可行 |
| 抽出内层直接运行 | Loader 同权益／KeyGrant，所有支持入口有截止监督 | 明文无强防复制 |
| 修改 Runner／ready 状态 | native Gate，UI 只投影 | 修改整个程序是另一等级威胁 |
| 复制 proof／Flow | 实际设备私钥、定向 envelope、激活额度 | 可导出私钥／整机快照另论 |
| 时间回拨 | 服务端锚、单调时间、安全高水位、校时恢复 | 无硬件时无法证明所有离线绝对时间 |
| 旧缓存／删缓存 | sequence、marker、tombstone、禁止同 lineage 降级 | OS 整体快照有上限 |
| 退款后断网 | offlineUntil，客户端不能自续 | 窗口内有传播延迟 |
| 冒充 Publisher／Pro | 外部信任、发行域、商品归属 | 人工批准需清晰 |
| Publisher／issuer 泄露 | 分用途轮换、撤销、根恢复、可信发布记录 | 离线暂未知，发行域影响需运营响应 |
| 服务宕机 | 有效本地 lease、退避、保留旧有效缓存 | 不承诺无限离线 |
| Webhook 重放／乱序 | 验签、inbox、版本、对账、事务 | 需监控恢复演练 |
| 无限任务 | 宿主 Supervisor 与子任务归属 | 已发生外部动作不能撤回 |
| 源码／秘密泄漏 | ProtectionInfo、禁 snapshot／preview／temp、输出扫描 | Goja／OS 内存提取不能绝对防止 |

目标是商业上足够可靠、正常用户可解释可恢复，不是绝对桌面 DRM。简单编辑配置不能延长期限，与管理员重新构建客户端不是同一安全承诺。

## 16. 测试矩阵和证据

商业测试链接既有 FLOW-01～FLOW-25，不再造第二套安装 Oracle。产品集成用真实 OpenDesk 执行 JS；原生不可从 JS 观察的 crypto／parser／竞态／存储 seam 可保留内部测试，不能以 Go 或 Node mock 代替产品验收。以下初始均 NOT_RUN。

| ID | 场景 | 必须证明 |
|---|---|---|
| ENT-01 | 免费脚本／Flow | 无账户不会误锁，Trust／权限仍生效 |
| ENT-02 | 付费有效 | 正确业务输出、身份版本设备匹配 |
| ENT-03 | validFrom／validUntil 边界 | 起点前拒绝、起点允许、终点拒绝，拒绝零执行 |
| ENT-04 | Trial | 有效／到期正确，重装不重置 |
| ENT-05 | 未到刷新点断网 | 本地成功，不每次联网 |
| ENT-06 | 刷新点后断网 | 硬截止前可用，不延购买期 |
| ENT-07 | 离线硬截止 | 阻止新运行、取消长任务、保留数据日志 |
| ENT-08 | 服务恢复 | 新证明修订安全提交，失败不清旧有效状态 |
| ENT-09 | proof／issuer／audience／action 篡改 | 拒绝，无业务副作用 |
| ENT-10 | Manifest／包／资源篡改 | 内外层校验，无 ready 半安装 |
| ENT-11 | 多 Publisher 同名 | 不串权益、不覆盖 |
| ENT-12 | 复制至第二设备 | 无真实私钥不可用，合法激活按额度 |
| ENT-13 | 争抢最后名额 | 事务只批准一个 |
| ENT-14 | 旧／删缓存与 revoked 复活 | marker／最高修订拒绝回退，不退旧 P1 |
| ENT-15 | 回拨／跳前／校时 | 不延长，不永久误伤，可安全重锚 |
| ENT-16 | 睡眠／休眠／重启／时区 | 不冻结时间，双平台行为正确 |
| ENT-17 | 取消续订／立即退款 | 保留已付期，退款窗口符合合同 |
| ENT-18 | 恢复订阅 | 新合法激活，不复活旧 tombstone |
| ENT-19 | 1.x→2.x／fallback | 不替换可用旧版，版本证据和数据兼容 |
| ENT-20 | Pro＋独立买断 | 一来源到期不误删另一来源，伪 Pro 不授权 |
| ENT-21 | CLI／AI／Runner／支持的 Scheduler | 一致 Gate，其他入口显式拒绝 |
| ENT-22 | 抽包／旧客户端降级 | 不绕过新 proof 和截止，无兼容旁路凭据 |
| ENT-23 | while(true)／异步／子任务 | 到期可取消，不伪称外部交易回滚 |
| ENT-24 | 安装后服务宕机 | 未激活不运行；已激活按 lease；免费能力不受连带影响 |
| ENT-25 | 本地安装与远端激活失败 | 幂等恢复／补偿，不伪造跨系统原子事务 |
| ENT-26 | Webhook 重复／乱序／漏送 | 账本不多发、不回退，对账可恢复 |
| ENT-27 | 服务重启／备份恢复 | 名额／授权／sequence 持久化，旧备份不能静默倒退 |
| ENT-28 | key 轮换／泄露 | 用途与 namespace 隔离，可信恢复，退役／撤销分开 |
| ENT-29 | 源码／秘密扫描 | 成功失败语法异常取消都不由宿主写出秘密／源码 |
| ENT-30 | macOS／Windows 真机 | 双击冷热启动、实窗拖放、Keychain／DPAPI、迁机与截止分别有证据 |

结果记录 case ID、expected/actual、状态、源码 SHA、构建身份、OS、安全 proof 标识、独立副作用计数和证据路径。拒绝不能只断言错误字符串，正向不能只断言 mock 调用。测试输入含源码／测试 key，本来就有明文，必须与泄漏扫描的输出区隔离。

不用等待真实 30 天，通过隔离测试 owner 的时间源及短 TTL 验证，生产不暴露时钟改写 JS API／万能 key。跨编译不等于 native/live。HTTP 响应丢失后重试、缓存写入与 secure high-water 之间崩溃、刷新/执行并发均作为 ENT-08/13/14/25/27 的子案例，不另造重复顶层 ID。

## 17. Phase 0～4 与首客户 MVP

| 阶段 | 范围 | 完成标准 |
|---|---|---|
| Phase 0 | ID、格式、Trust、grant/lease、兼容、错误与向量 | 合同不冲突，真实 parser／writer／签名验证与测试逐步落地 |
| Phase 1 | .odflow 安装、目录、信任，一客户一 Flow 一设备，30 天权益、刷新、离线、Gate／Supervisor、最小持久化 issuer | 真实交付→激活→运行→断网→到期停止，无完整账户／支付网页／Market 前置 |
| Phase 2 | Account、Pro 月年订阅、设备管理、一个 Billing adapter | 取消续订／退款／恢复和独立购买共存正确 |
| Phase 3 | 多 Publisher 注册委托、发布、Market、更新结算、门户 | 同包同协议，第三方不获得平台签发权 |
| Phase 4 | Organization、Seat、服务主体、离线预分配、通用 .odlicense、策略审计 | 隔离网／归还／迁机有明确真实证据 |

在线刷新不能整体推迟至 Phase 2，首版有界离线已经需要最小签发／刷新服务，但不需要完整 SaaS。既有离线 v1 继续兼容，不因 Phase 4 标签删除。

首版不做：商城、所有支付平台、复杂组织权限、跨设备精确离线次数试用、远程依赖安装、任意插件钩子、第二 Runtime、硬件 DRM、微服务群或全面资产沙箱。

七组最小组件：安全 Flow 安装与 Catalog；信任和设备密钥交付；持久化购买／权益／激活账本；一次激活与自动刷新；本地签名／设备／时间／版本／修订校验；统一 Gate 和截止监督／源码保护；最小 UI 与真实 JS／双平台验收。

```text
普通 JS 验证业务
→ 现有 protect 产出 main.odpkg，helper 合入
→ Flow builder 产出签名 .odflow
→ 客户双击／拖入，安装显示需激活
→ 收款确认，服务端创建购买后 30 天权益
→ 一次兑换码，宿主复用真实设备 key
→ 服务端分配名额，签发 lease 和精确 KeyGrant
→ 原生校验并安全提交
→ 明确点击运行 → Gate → 内存加载 → existing execution.Run
→ 宿主定期刷新，临时断网沿用有效证明
→ 商业或证明硬截止，阻止新运行并取消目标付费任务
→ 续费刷新，无需重打包／改脚本
```

详细代码工作拆成 B0～B6，见开发计划；这不是七次聊天即自动完成的承诺，也不能把本页的 95.5 设计分当作产品完成度。

## 18. 交叉审查与设计自评

这是原方案的设计自评，不是外部专家投票、实际安全审计或生产验收分。

| 维度 | 分数 | 保留项 |
|---|---:|---|
| 架构清晰度 | 98 | grant／lease／key delivery 分开 |
| 用户体验 | 96 | 简单激活与有界离线，更长断网仍受限 |
| 开发者体验 | 95 | builder／schema 待完成 |
| 商业扩展性 | 97 | 多来源／版本兼容 |
| 安全性 | 94 | 不承诺管理员 DRM |
| 离线能力 | 96 | 时钟／整机快照上限 |
| 实现复杂度 | 92 | 安装事务、proof v2、生命周期真实成本 |
| 长期维护 | 95 | 单 owner，持续回归 |
| Marketplace | 97 | 无 Market 前置 |
| macOS／Windows | 95 | 相同领域合同，native/live 待验 |
| 等权平均 | 95.5/100 | 可进入实施，不代表产品已通过 |

商业视角检查购买承诺与多来源；桌面视角检查 App 生命周期、更新和离线；支付视角检查取消／退款和一致性；安全视角检查 issuer 范围、回滚、设备与源码；开发者平台视角检查 ID／签名／兼容。

## 19. 研究来源与仓库依据

以下外部链接保留自上一轮 2026-09-17 的研究材料；本次是整理入库，不声称重新检索了各产品当前政策。它们是设计输入，不是 OpenDesk 已具备能力的证据。

| 资料 | 借鉴原则 |
|---|---|
| VS Code Marketplace | 发布签名／安装信任／本地 VSIX 可分层，签名不等于商业授权 |
| JetBrains fallback／Marketplace | 永久特定版本与订阅更新权分离，fallback 是明确权利，不默认保留取消时最新版 |
| Microsoft 365 企业扩展离线 | 原研究记录特定许可／配置的 Windows 长离线，不能泛化成全部订阅政策 |
| Power Automate／UiPath | 用户、机器、无人值守容量分开，离线有独立分配合同 |
| Stripe Entitlements／Webhook | Billing 驱动权益，内部持久化，不依赖每次支付 API |
| Paddle | 缓存、取消生效时间、重复／乱序／对账 |

外部原始资料：

- https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
- https://sales.jetbrains.com/hc/en-gb/articles/207240845-What-is-a-perpetual-fallback-license-and-how-do-I-use-one
- https://blog.jetbrains.com/platform/2025/01/introducing-perpetual-licenses-on-jetbrains-marketplace/
- https://learn.microsoft.com/en-us/microsoft-365-apps/licensing-activation/overview-extended-offline-access
- https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/types
- https://docs.uipath.com/robot/standalone/latest/admin-guide/licensing-robots-unattended
- https://docs.stripe.com/billing/entitlements?dashboard-or-api=api
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://developer.paddle.com/build/subscriptions/provision-access-webhooks/
- https://developer.paddle.com/webhooks/about/signature-verification/

仓库阅读入口（实现事实始终重新取实际 HEAD）：

- [Flow 合同](flow-distribution-installation.md)、[Protected Package CLI](../../api/protected-packages.md)、[Execution](../../api/execution.md)、[App Package](../app-package-format.md)。
- [Protected Loader](../../../pkg/scriptloader/protected.go)、[License](../../../pkg/licensing/license.go)、[设备与存储](../../../pkg/licensing/device_bound.go)、[离线 License](../../../pkg/licensing/offline_license.go)、[在线缓存](../../../pkg/licensing/online_cache.go)、[防回滚](../../../pkg/licensing/online_replay.go)。
- [客户端](../../../pkg/entitlement/client.go)、[参考服务](../../../pkg/entitlementservice/service.go)、[App 执行桥](../../../cmd/opendesk/app_recipe_runner.go)、[Execution](../../../pkg/execution/runner.go)、[Runner](../../../apps/opendesk/script-runner/controller.js)、[产品路径](../../../apps/opendesk/script-runner-simple.js)。
