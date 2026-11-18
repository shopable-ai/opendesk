# MCP Runtime 深度修复与验收

日期：2026-11-18。工作目录为仓库根目录；基线 `master` / `975f7f111c6ffe6b18002c08574b762eb1aa06c1` 加原有及本任务未提交修改。保持现有分支，未提交或推送。本文区分导航、源码审查、受控 fixture 和真实现场证据。

## 合并复核结果

合并复核以既有 `master` 和共享工作区为输入，证据根为 `.runtime/tests/mcp-merged-20261118/`。本节记录本次变化。后文的 c8028eba 回执、历史测试计数和原始评分依据保留。

| 当前发现 | 修复及证据层 |
| --- | --- |
| IO-07 / IO-08 / IO-11 | 键名、修饰键、空 chord 部件及 Screen 批量坐标在输入或读取前验证。正式 JS 经生产绑定进入惰性回调，核对合法参数、无效参数零分发及结果顺序。 |
| DATA-01 / DATA-02 | FileHandle.truncate 在数字转换前验证非负安全整数。HTTP owner 对亚毫秒正 timeout 使用 1 ms。真 stdio 和正式脚本经独立磁盘字节/位置及 loopback 连接关闭核验。 |
| DATA-05 / DATA-06 | ImageColor.findImages 读取包复用单模板选项。巨大 maxResults 不再按输入预分配内存，现有结果限制仍生效。巨幅图像每尺度 score grid 的资源上限另有缺口。 |
| BD-01 / BD-02 | BrowserDOM 后验不可信归为 OUTCOME_UNKNOWN。adapter 回包无论成功或错误都须验证请求关联和 envelope。惰性 Core CLI 和 Go owner 替身复核。 |
| EV-01 | Events.once 使用同一单调 deadline，极小的正 timeout 可过期，排队晚到事件拒绝。生产 Runner 的合成 backend 核对超时、恢复与 teardown 计数。 |
| DESK-01 / DESK-04 / DESK-05 | UI.readText 检查 tagged screen region 并显式路由本地 OCR。page.openURLInApp 拒绝空白应用名。旧 RegExp 文本等待丢弃跨 deadline 的结果。provider 与等待用确定性替身复核，启动和实窗未运行。 |
| DESK-02 / DESK-03 | 截图选择无法解析活动窗口或指定显示器时失败，macOS 捕获使用同一次解析的 ID。全局 mouse 与 page.mouse 在转换前拒绝缺失、非数值、非有限和溢出的显式坐标，Goja 整数 delay 进入 owner。合成截图选择与惰性鼠标回执覆盖受影响边界。 |
| DESK-06 | 纯文本序列最后一步确认后观察到取消时返回 CANCELED，保留已确认输入，不提交下一步。确定性测试覆盖 tapTexts 与纯文本 tapTargets。 |
| 阅读和类型 | 11 个 FloatingWindow 缺失类型的完整包修复，Custom UI 返回句柄和 notify 补齐契约来源。固定公开分母仍为 499。 |

`member-evidence.json` 为 499 个导航键保留历史和当前定位，`findings-reconciled.json` 保留 56 条旧 finding 及相应复核证据。审查批次分别为数据与网络 110 条、桌面与目标 150 条、条件资源与跨域 217 条，存在交集。各行以实际来源、合成、真实 stdio 和独立 fixture 后置条件标注。仍需验证平台截图的真实窗口归属和显示器映射。已确认的其他缺口包括 ReadableStream 的迭代器锁释放、部分签名及默认值、Flow 条件入口声明、受保护包的 Execution.scriptHash 文档范围，以及 Command 与文档 reader 的 Windows 后代清理。平台、音频、插件、TCC、Browser Core 和远端服务按台账保留现场条件。

候选、`dist/opendesk-mcp`、`$HOME/.local/bin/opendesk-mcp` 分别通过 **85/85 MCP、29/29 兼容回归**，零跳过。候选另从真实只读 MCP 验证 **499/499** 带类型 packet。文档生成、检查和 **54/54** 测试通过。MCP/CLI/执行相关 Go 测试、vet 和定向 race 通过。架构检查仍有 68 条，原始差集为空。声明诊断从 12 降至 8，余项为 tapTargets 重复声明。

两条 CLI 的 SHA-256 为 `e383188a4ca9bd91a3432bfeedee6e682922b75a20ff718eacec174ca3eebe04`。按目标逐一校验、备份、同目录 fsync 与原子替换。安装后各自启动的新 stdio 进程正常结束，并核对实际 checkout、reader/map/adapter 标识，以及实际加载的 28 项 polyfill 和 8 项 JS library。每处旧版备份与本轮经历见 `install-receipt.json`，来源对账见 `external-assets.json`。用户 PATH 初次并行兼容测试未取得 Git leader 的瞬时 ps 样本，独立串行复验 29/29 通过。失败和清理原始记录保留。命令见同目录 README 与 `*.command.txt`。

沿用四项固定分数 **90 / 90 / 100 / 100**。C10 与 P1 保持 0。真实 Runtime 逐成员历史证据下界仍为 **98/499**。合成 backend 和重复运行不计入下界，`runtimeMatchVerified` 继续为 **false**。

## 固定评价口径

本任务开始时固定 `.runtime/tests/mcp-depth/20261118/plan.json`：四维分别有十项合取标准，每项十分；没有完整证据的项计零，不跨维平均，不随结果调整分母或标准。E0 未核验，E1 canonical 与 owner 源码核对，E2 离线回归，E3 真实 Runtime/MCP，E4 另有独立后置条件。代表场景的成功不能证明全部公开方法正确。

固定公开分母为 **499** 个唯一 `(doc, method, mode)`：targets 120、IO 115、data 65、network 21、resources 178，来源为现有 canonical 导航。保留条件入口、属性、别名和 global，不包含第三方库内部 API 或 CLI 协议内部方法。快照为 `public-denominator.json`；该临时审计清单不构成第二份长期方法数据库。

本次收口通过现有 reader 重查仍为 499，含 13 个 Audio 方法，公开 `(doc, method)` 无增删。旧快照中十项 File/FileHandle/AppStorage 的提取 mode 已改为独立 section；不是三元组集合逐字未变，也没有为评分调整分母。差异见 `customui-final/denominator-check.json`，保留旧快照。

### 完整性

| 标准 | 所需证据 |
| --- | --- |
| C1 当前公开 surface/导航闭合 | generator、导航与 canonical contract gate |
| C2 选中方法及依赖/类型 | 真实 `tm_api_read` 完整 packet 和来源账本 |
| C3 完整阅读不可绕过 | 删除、篡改、过期、加载后修改均 fail closed |
| C4 文件/路径/JSON | canonical、真实 Runtime 和独立文件 oracle |
| C5 HTTP/axios/download | 请求/响应、失败、取消及独立网络/字节 oracle |
| C6 Execution | 状态、错误、取消和资源/槽位恢复 |
| C7 SQLite | 契约、事务、关闭及外部重开 |
| C8 Webhook | 身份、认证、去重与生命周期 |
| C9 条件入口 | 授权、可用性及专用入口准确区分 |
| C10 所有 499 项语义核对 | 每项均完成 canonical 与 owner 链路审查；未核验不视为通过 |

### 专业性

| 标准 | 所需证据 |
| --- | --- |
| P1 精确签名/默认/返回 | 全局 canonical 与实际 owner 一致 |
| P2 错误与未知结果 | 可辨认错误、未知结果停止、不盲目重放 |
| P3 单一正式契约 | 别名/共享依赖复用 canonical，不新建方法数据库 |
| P4 来源身份 | reader/map/adapter、checkout 与 binary 来源，明确 mismatch/unchecked |
| P5 响应/协议边界 | 完整响应预算与 stdout JSON-RPC |
| P6 兼容与权限 | 默认受限、只读、nonce、Native 专用 surface 回归 |
| P7 可复现来源 | source/binary/script hashes、命令和证据路径 |
| P8 安装闭环 | 候选先通过，原子安装，安装路径再测 |
| P9 工程检查 | 定向 Go/vet/docs/security，架构/类型无新增诊断 |
| P10 独立审查 | 独立发现与复核，明确未验证边界 |

### 垂直适配与深度

| 标准 | 所需证据 |
| --- | --- |
| V1–V3 | native 生命周期保留；七项 capability 由 host 授权；固定 workdir/空环境，不接受请求注入 |
| V4–V7 | 普通 execution 与 App Mode/Flow/Browser Core 区分；UI 授权与可用性区分；插件发现不等于调用；权限/音频/provider 未验证如实停止 |
| V8–V10 | 下载 commit/cancel owner、Webhook auth/dedupe/close owner、SQLite queue/transaction/close owner |
| D1–D4 | 纯数据、持久化、网络回调、条件停止四条 discover/read/execute/独立结果链 |
| D5–D7 | 下载失败不发布；HTTP deadline/abort 关闭连接；Webhook 拒绝/冲突/未知结果不重放 |
| D8–D10 | SQLite rollback/read-only/cancel/recovery；cancel/EOF 清理后槽位可用；packet 攻击与独立审查 |

## 本轮实际修复

| 范围 | 问题及修复 | 证据边界 |
| --- | --- | --- |
| HTTP/axios | 参数追加到 fragment 前；native headers 转普通值；非 2xx、响应类型、interceptor 顺序和错误语义对齐 | MCP + 独立 loopback caller/连接 |
| 下载 | 空 Range/If-Range 也拒绝；gzip 首部等待保留取消/超时；commit fence 取消不能伪造成功；选项 getter 异常转脱敏 Promise rejection | MCP + 独立字节、SHA、旧目标保留、临时文件/槽位 oracle；commit fence 私有 Go seam |
| Webhook | JSON 数字/普通对象保真；取消/EOF 释放已接受的连接；关闭、重开及同名多代不串代；迟到调用不重建 host | MCP + 独立认证 caller、504 未知结果不重放、socket 关闭；204/304 只纠正文档并验证既有无正文行为 |
| 文档来源 | 完整 packet/report/依赖/账本校验；加载后 toolchain 或 source 改变拒绝；构建 revision 与 checkout 分开报告 | 真实 MCP hostile-copy 回归；`runtimeMatchVerified` 仍为 false |
| File | open/copy 拒绝特殊文件；macOS/Linux 非阻塞 open 后检查实际 fd；copy 自身、hard-link、symlink 同 inode 在截断前拒绝；严格读取限额在反射转换前校验 | MCP + FIFO、inode、独立文件内容/位置；其他平台非阻塞能力未验证 |
| path/crypto | 两个路径常量不可改写；随机数使用捕获的 TypedArray intrinsic brand 和真实 view 边界，拒绝伪造对象且忽略 shadow 属性 | MCP；随机字节不做概率性“必须变化”断言 |
| Command/System | Command 缺省 cwd 绑定 execution；getEnv 非法 fallback 不再取决于键是否存在 | 合成宿主、生产 MCP/Runner、正式 Runtime JS；独立 cwd 和合成环境 |
| Agent | 实际 cwd/allowedCwd 经 native realPath 校验，包括默认 invocation；拒绝越界或不可解析目录，保留隔离临时资源 | 38 个受控 CLI fixture 场景；Node realpath + pwd -P；没有真实模型/provider/凭据 |
| Streams/Abort | 已排队 write 可在 close 前完成；transform/flush 错误终止两侧；异步 abort listener 失败受控报告 | 真实 MCP + 正式 Runtime JS；不等待 listener 完成 |
| console | 最终 console 保留 null/undefined 身份，泛型 variadic interface 不产生无效 reflect.Value | 真实 MCP 五种日志方法，落盘 event oracle |
| 图像 | 非零 ROI 不再重复加偏移；模板数组同分优先首项，保留单模板内部排序 | 真实 MCP + 独立手工 PNG/几何 oracle；非桌面截图 |
| UI perception | 同值不同节点仍歧义；native 失败/不完整不被 OCR 成功掩盖；共享预算、取消检查；只消费 native 发布的 screen bounds | 84 项离线模拟；没有真实窗口、OCR 现场或输入证据 |
| App Shell | updateMenuItem 的 void 成功显式为 undefined，保留其他 nullable 方法 | 正式 Runtime JS + memory driver；没有真实 App Mode 视觉验收 |
| App/Notifications | 等待成功前复核同一操作 context，丢弃跨 deadline 才返回的匹配，不再启动额外读取 | 18 项私有 Go seam，E2；没有公开 deadline 的 E3。忽略 context 的 native 调用仍须返回后才能丢弃结果 |
| Events | single-flight callback 的 deferred 槽替换累计两个合并层代表的事件数 | 正式 Runtime JS + 生产 Runner + 合成 backend；10 次写入计数守恒、单回调并发及退订后重用；不是真实系统事件 |
| Custom UI | 首次 show/close 同一 owner；Session.Create 首次 State 失败及 session 创建中关闭均使用独立三秒失败清理，失败保留 live handle/ID 供 retry/teardown；聚合错误链与主错误字段保留；ui.closeAll 返回 undefined | 正式 Runtime JS + 生产 Runner、gated MemoryDriver 独立调用/状态/sink oracle，普通和 race 各 14 场景；私有 Session 关闭交接 seam；不是真实窗口或视觉验收 |
| window.activate | macOS 首次 refresh、一次 activation 和 readback 共享单总 deadline；拒绝迟到成功，不重放 activation | 八项窄 native seam，E2；本次定向重验通过，无真实激活/JXA/AppleEvents 权限证据 |
| canonical | File/handles/AppStorage、HTTP/axios、App/window/page/Geometry、输入/剪贴板/Screen/Vision、Audio/Dialog/System/Native 条件入口等按当前 owner 校准 | E1/E2；API 可发现/可读不等于实际调用通过 |

最后一轮还补齐 System 的同步/部分结果、宿主 cwd 与环境来源、目录 native 时间值，Audio 的稳定错误/operation、默认设备 null 与设备消失错误的区别，以及 FloatingWindow 创建前后的返回分支、Sound 记录/属性、Flow 路径字节与深度限制。以上由独立只读 reviewer 核对 owner；未运行音频、指纹、账户查询或电源控制来制造 live 证据。

## 运行与复验

正式 JavaScript 在 `tests/runtime-api/`；MCP fixture/gate 在 `tests/mcp/`。所有日志、截图外的运行产物、配置副本和 source 快照在 `.runtime/tests/mcp-depth/`，不进入版本控制。私有 commit-fence Go seam 是 JS 无法观察的内部边界，不代替 Runtime 公共断言。

从仓库根目录构建候选：

```bash
GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go build -o .runtime/tests/mcp-depth/20261118/bin/opendesk-mcp ./cmd/opendesk-mcp
```

从当前候选或安装路径运行完整所选 MCP 回归：

```bash
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js tests/mcp/runtime-contracts.test.js tests/mcp/runtime-download.test.js tests/mcp/runtime-network-depth.test.js tests/mcp/runtime-persistence.test.js tests/mcp/runtime-provenance.test.js tests/mcp/runtime-stream-depth.test.js tests/mcp/runtime-image-depth.test.js tests/mcp/runtime-file-open-depth.test.js tests/mcp/runtime-data-boundaries.test.js
```

跨宿主 cwd/环境和 Agent 使用独立测试宿主；宿主只提供合成输入及已有 owner，公开断言仍由正式 JS 执行。它们不增加生产 MCP 参数、不提供请求级环境注入，不冒充真实外部 provider。

## 最终交付与来源

本次授权范围已完成。工作区仍为原 master，HEAD 未变，未提交或推送。下面的源码快照覆盖共享 dirty tree，不把 HEAD 当作全部修改的来源证明。

最终候选、`dist/opendesk-mcp` 与 `/Users/shopme/.local/bin/opendesk-mcp` 的 SHA-256 均为：

```text
c8028eba7750249b5bb7ad93df3d1d2e170259a2f75ebab370ebab0c4620c0cb
```

以下路径均以仓库根目录为起点。最终证据根为 `.runtime/tests/mcp-depth/customui-final/`：

| 交付项 | 实际结果与记录 |
| --- | --- |
| 来源闭包 | `build-before.json`、`build-after.json`、`preinstall-source.json`、`delivery-source.json` 内容相同；保守 aggregate `7aacedc24b6809b52adc4ef645d322461ba5d6ad87508a628b4f87a95a957765`。覆盖指定源码/资源目录及 Go module，不是精确 Go 构建输入证明 |
| 构建 | `candidate-build.command.json` / `candidate-build.log`；arm64、CGO、Go 1.25.13；`candidate-build-info.txt` 保留 VCS/工具链元数据 |
| 候选 | 十套真实 MCP 回归 **80/80**；三套兼容回归 **29/29**，均零跳过；`candidate-mcp*` / `candidate-compat*` |
| 原子安装 | `install-receipt.json`；每处同目录 staging、chmod、file fsync、rename、directory fsync，替换前后 hash 核对；独立旧版备份在 `installed-before/`。旧 `20261118/install-receipt.json` 与更早备份未覆盖 |
| 安装路径复验 | dist 和用户 PATH **各 80/80 MCP、29/29 兼容**，均零跳过；`dist-mcp*` / `dist-compat*` / `local-mcp*` / `local-compat*`。旧预计 19 项不是当前兼容套件实际计数 |
| Custom UI finding | `lifecycle-red.log` 动态复现无期限 Close 和 JS 丢失 cleanup 原因；`session-closed-red.log` 复现另一个创建期间关闭分支。`lifecycle-green.log` / `lifecycle-race.log` 各 **15 tests（14 场景），零跳过**；`session-race.log` 与 `errors/` 通过；`independent-review.txt` 未发现新增重要缺陷 |
| Go/vet | `automation-targeted.log`、`session-race.log`、`mcp-cli-go.log`、`mcp-cli-vet.log` 通过；automation 使用 `-vet=off` 绕开既有 vet 基线，未运行全仓 `test ./...` |
| 文档 | 最终 generator/check、`API_DOC_CONTRACT_OK` 与 **53/53** 文档 tests；修正 C10-I03 三处返回类型正文名称后，安装路径再跑 discovery/packet/provenance **19/19**；`docs-*-final*` |
| 基线 | `types-comparison.json` 仍 12 条、`architecture-comparison.json` 仍 68 条；原始及 normalized 差集无新增/删除。全仓类型和架构审计仍失败 |

Custom UI 普通证据为 `.runtime/tests/mcp-depth/floating-lifecycle/run-ujqYEv`，race 为 `run-beotjA`。独立 oracle 分别保留显式关闭前后的 native 状态与 sink，并在生产 Runner teardown 后确认归零；teardown 场景在 JS 返回前明确保留一个活资源，不靠本地“已关闭”标记伪造清理成功。三秒期限依赖 driver 对 context 的响应，不能强制中断任意忽略 context 的系统调用。旧 `cleanup-race.log` 的 ENOENT 仍是历史启动失败，未当作 race 结果。

三批 MCP 的 execution `events.ndjson` 均确认实际选用仓库的 `polyfills/` 与 `jslibs/`。`external-assets.json` 保存选中路径、event 行与稳定期间的逐文件身份：polyfills 28 个文件、tree SHA `5bd221f658d5a414448a09af61cce2a1b9a4f5998590712488c3456ed25c87b7`；jslibs 10 个文件、tree SHA `d2b4640c79cec7030a3f1df63aade00ba960caf2bcbac4e4daf77c4ffc3f68c7`。这些是保守目录身份；CLI 单文件不是自包含发行包，`runtimeMatchVerified` 仍为 **false**。未更新或重启 GUI/helper/插件/Tunnel/其他任务进程。

兼容回归从仓库根目录执行；分别将 binary 设置为候选绝对路径、`$PWD/dist/opendesk-mcp` 和用户 PATH：

```bash
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/api-docs-faults.test.js tests/mcp/desktop-control-safety.test.js tests/mcp/script-initialization.test.js
```

Custom UI 受控宿主先成功构建，再调用：

```bash
GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go build -o .runtime/tests/mcp-depth/floating-lifecycle/bin/floating-host-final ./tests/runtime-api/tools/floating-lifecycle
OPENDESK_FLOATING_LIFECYCLE_HOST_BINARY="$PWD/.runtime/tests/mcp-depth/floating-lifecycle/bin/floating-host-final" node --test tests/runtime-api/floating-window-close.test.js
```

race 使用同一构建命令增加 `-race`，输出 `floating-host-race-final`，再将宿主变量指向该文件运行相同测试。完整构建/测试命令、时间、退出码和日志 hash 在各 `*.command.json` 与安装回执中。

## 固定四维结果与未验证

最终独立评分为 **完整性 90、专业性 90、垂直适配 100、深度 100**，不平均。后两项仅对固定十项适配/代表链路标准成立，不是全部公开 API、真实设备或所有平台认证。逐项原定义、证据路径与得分在 `customui-final/scorecard.json`，定义来源 hash 固定指向原 plan。

| 项 | 分 | 最终证据与界限 |
| --- | --- | --- |
| C1 | 10 | 最终导航、canonical contract 和 53 项文档回归 |
| C2 | 10 | 三路径真实 tm_api_read 的完整正文、依赖与类型 packet |
| C3 | 10 | packet/report/toolchain 篡改、删除、过期与加载后变化整包拒绝 |
| C4 | 10 | 真实 Runtime File/path/JSON，独立文件、inode 与数据 oracle |
| C5 | 10 | HTTP/axios/download，独立 loopback、连接、字节与 SHA |
| C6 | 10 | 状态、错误、cancel/EOF 与槽位恢复 |
| C7 | 10 | SQLite 事务、关闭、跨 execution 与外部重开 |
| C8 | 10 | Webhook 认证、去重、代际身份与连接生命周期 |
| C9 | 10 | host 授权、可用性、专用入口准确区分 |
| C10 | 0 | 全 499 项 owner 语义复核未闭合 |
| P1 | 0 | 全局签名、默认值、返回精确一致性未闭合 |
| P2 | 10 | 失败与 unknown 可辨认，Custom UI 保留主因及 cleanup 链 |
| P3 | 10 | canonical/别名/公共依赖单一来源，无第二长期数据库 |
| P4 | 10 | checkout/binary/toolchain 分开；未证明的 Runtime match 保持 false |
| P5 | 10 | 完整响应预算、stdout JSON-RPC 与协议错误恢复 |
| P6 | 10 | 默认/只读真实 MCP；Go files-bridge 与 nonce 私有/loopback 兼容，未冒称远程 Native 现场 |
| P7 | 10 | source/binary/正式脚本/外部资源、命令与身份记录 |
| P8 | 10 | 候选先通过、两处原子安装、两路径分别复验 |
| P9 | 10 | 定向 Go/race/vet/docs/安全回归通过，类型/架构诊断无新增；基线未修 |
| P10 | 10 | 独立 reviewer 确认两个 finding 闭合，保留残余界限 |
| V1 | 10 | native owner、创建失败、retry 与 teardown 资源 oracle |
| V2 | 10 | 七项额外 capability 仅由 host 开启 |
| V3 | 10 | 固定 workdir、空环境及禁止请求上下文注入 |
| V4 | 10 | 普通 execution 与 App Mode/Flow/Browser Core 分层 |
| V5 | 10 | UI host 授权不当作可用性或窗口成功 |
| V6 | 10 | 插件 registry 发现不当作方法已执行 |
| V7 | 10 | 权限、音频、provider 未验证明确停止 |
| V8 | 10 | 下载 native commit/cancel owner 与独立 loopback 字节 oracle |
| V9 | 10 | execution-owned Webhook auth/dedupe/close |
| V10 | 10 | execution-owned SQLite 路径/队列/事务/close |
| D1 | 10 | 纯数据业务链 discover/read/execute/独立几何结果 |
| D2 | 10 | JSON/SQL 持久化业务链与外部重开 |
| D3 | 10 | 网络回调业务链与独立 caller |
| D4 | 10 | 不可用条件链准确停止，未探测真实 provider |
| D5 | 10 | 下载限额/hash/status/abort 失败不发布 |
| D6 | 10 | HTTP deadline/pre-abort/in-flight abort，真实连接清理 |
| D7 | 10 | Webhook auth/protocol/dedupe/conflict/unknown 不重放 |
| D8 | 10 | SQLite rollback/read-only/cancel/closed 恢复 |
| D9 | 10 | cancel/EOF 资源清理与下一槽位可用 |
| D10 | 10 | hostile packet/change 与独立审查 |

`findings-disposition.json` 对 56 条带来源的 finding/处置记录逐项对账，包括本次两个 Custom UI finding、C10-T02、DN-01–05、R1–R7 及 IO-10。只关闭实际 finding，不升级整个方法的所有分支；保留原 semantic 快照及未核验项。IO-07/08 的键盘严格校验和 IO-11 的 Screen.pixels coercion 仍是已披露实现限制，本轮不执行桌面输入或扩大重构。

**不能声称全局 95+。** C10/P1 的全部方法语义核对仍未闭合。审计快照：targets/IO 235 项为 59 consistent、17 gap、159 unverified；resources 178 项为 65 consistent、43 gap、70 unverified；data/network 86 项为 78 consistent、7 gap、1 unverified。这些是各次审查时点的状态，不是修复后的剩余缺陷计数。DN01–05、R1–R7 和多项旧 gap 已有单独修复证据；不追改历史快照，也不把已修复 finding 自动升级为同一方法所有分支均已核验。`LLM.generate` 的 schema/generation/provider 组合、条件现场与大量低使用率方法链路仍未验证。

目前保守逐项列证的 Runtime member 下界是 **98/499（19.64%）**，含 3 项仅负向、9 项仅诊断/无显示声明；这不是全部调用覆盖或成功率。计入 Agent.run 的是生产 Runner 与受控 CLI 协议 fixture，不是真实模型调用。其余代表链路经实际 MCP，环境特定边界另经生产 Runner；模拟 perception、page unit、App Shell、FloatingWindow 和合成 Events 不计入该 live 下界。详细成员和例外在 `live-coverage-lower-bound.json`。

`window.activate` 的总预算 finding 已由上述窄 seam 修复并重验；其真实系统激活仍未验证。App/Notifications 的 E2 deadline、合成 Events 的生产 Runner、受控 Agent CLI 与无窗口 MemoryDriver 各自保持原证据层级，不能转换为真实设备现场。

未运行真实 GUI/TCC、音频录放、外部模型调用、插件方法、跨平台 live 或远程 Tunnel/Host 重新配置。未更新 GUI、UI host 或 Native 插件发行包；CLI 安装不能证明这些配套资源可用。`polyfills/`、`jslibs/` 为外部加载资源，必须核对实际 event 路径及内容身份。

类型检查已有 12 条诊断；测试架构审计已有 68 条错误。先前比较为类型新增 0；架构原始 total/expected 计数均增加，未分类差值仍 64，其他诊断逐条无新增。全仓检查未通过，不能用定向回归替代或宣称基线问题已修复。
