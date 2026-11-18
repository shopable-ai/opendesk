# OpenDesk Desktop · AI 客服助手

## 人工辅助试用：重建本地 Query 环境（2026-11-06）

沿用下文双实窗、六业务 Tab 和人工审核流程，不新增界面。真实 Query 只生成待审建议；自动发送仅限无网络的本地 fixture。运行结果与限制统一见[试用复现记录](../../docs/quality/ai-customer-support-trial-repro-20261106.md)。

一次性准备（仓库根目录）：需要 Python ≥3.11、Node ≥22、本例已有 npm 依赖、已构建并签名的 `dist/OpenDesk.app`，以及获准的私有 Query 源码和合成项目资料。已验证的上游版本是 `878c619`；它不是本仓库依赖，启动器不下载代码或知识。源码应包含 `apps/query-api/server.py`、`libs/project_knowledge/` 和所选 `projects/.shared/query_context_profiles/`；项目根目录应包含隔离的 `bizhi-app/project.yaml`、知识索引和上下文原文。缺少这些输入时先取得获准副本，不从旧 `.runtime` 的运行结果恢复服务，也不替换知识后端。

Query 使用上游已有 Python 环境；本次实际为 Python 3.14.6、PyYAML 6.0.3、jsonschema 4.26.0（其既有依赖为 attrs 26.1.0、jsonschema-specifications 2025.9.1、referencing 0.37.0、rpds-py 2026.9.1）。本机系统 `python3` 缺少 `yaml`，不能冒称只需标准库；配置 `python` 显式指向获准上游环境的 `bin/python`，启动工具会在读取凭证及创建运行目录前重启为该解释器。使用上游自己的依赖清单准备环境；本工具不安装任何依赖。健康检查只需系统 Python 标准库。

将 `scripts/query-local.example.json` 复制到 `.runtime/ai-customer-support/query-config.json`，填写本机 `python`、`source` 与 `projectsRoot`（绝对路径，或相对于配置文件），保持项目与共享 profile 一致。`port: 0` 由实际 socket 绑定选择空闲端口；显式端口被占用时失败，不停止原监听、不换端口。配置不含密钥，运行目录每次新建，输入只读；项目副本、编译快照和输入 Hash 均落入本次 `.runtime`。

本机现有 HTTP endpoint 拒绝上游 profile 的 `service_tier: standard`，部署工具只在本进程传输边界将其转换为 `default`，不修改模型、provider、知识或上游文件。示例配置的 `plannerTimeoutSeconds: 16` 仅调整本地检索规划单次请求上限（可选整数 1–20，省略沿用上游 8 秒），不增加重试或响应延迟；本机已观察到 8 秒规划超时。Host 的整体 HTTP 超时仍为 30 秒，超时继续保守失败。实际配置、Bootstrap Hash、流式/非流式调用与失败状态分别留证。

`credentialSource: "environment"` 从启动终端继承既有 `QUERY_API_HTTP_LLM_BASE_URL`、`QUERY_API_HTTP_LLM_MODEL`、`QUERY_API_HTTP_LLM_API_KEY`，可选 `QUERY_API_HTTP_LLM_API_STYLE`。不要把密钥写入配置、命令正文或仓库。显式选 `"existing-codex"` 时，只读当前账户 `~/.codex/config.toml` 中的现有模型/HTTP URL 与 `auth.json` 中的既有认证，保留在子进程内存；不启动 Codex CLI、不改模型/provider/认证。该模式要求现有配置具有兼容 HTTP endpoint，不代表所有登录方式均可直接用于 HTTP。

准备完成后，从**仓库根目录**执行普通体验的一条命令：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh --with-query
```

在独立测试聊天输入合成问题、点「添加客户消息」；助手点「获取 AI 知识建议」，展开「审核依据」核对原文，人工选用/编辑，再点「填入聊天草稿」。从左侧确认草稿；草稿不是发送。普通服务附加延迟为 **0ms**。关闭右侧助手窗口结束体验，启动器等待 Runtime 正常结束，再关闭自己创建的 fixture 和 Query；已有安装版、其他服务和浏览器不受清理。不要先关闭测试聊天后继续操作隐藏助手。启动前已有 fixture 时会拒绝附着。

可用 `--query-config <配置路径>` 或 `OPENDESK_SUPPORT_QUERY_CONFIG` 选择其他本地配置；不能同时指定外部 Query 端口/项目。仅需本地演示时仍用 `./examples/ai-customer-support/scripts/run-desktop.sh`，无需 Query 配置。

维护者也可单独在前台启动服务（输出目录必须未存在）：

```sh
python3 examples/ai-customer-support/scripts/local-query.py serve --config .runtime/ai-customer-support/query-config.json --run-dir .runtime/tests/ai-customer-support/query-manual
```

另一个终端从仓库根目录检查：

```sh
python3 examples/ai-customer-support/scripts/local-query.py check --run-dir .runtime/tests/ai-customer-support/query-manual
```

健康检查同时核对实例 ID、PID、实际端口、所选项目、预加载与已加载的编译上下文；不发送模型请求。`ready.json` 只在真正绑定且上下文加载后发布，不能仅凭 HTTP 200 判断就绪。前台 Ctrl-C 正常关闭自己拥有的服务，`cleanup.json` 记录端口是否释放。每次使用新输出目录；不提供从旧 PID 文件终止服务的入口。输入或认证错误不会回显上游异常中的敏感原值。

正式验收与普通体验分开，从仓库根目录串行执行：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh --verify
OPENDESK_SUPPORT_CONTROLLED_UNKNOWN_MODE=unknown-delivered ./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled
OPENDESK_SUPPORT_CONTROLLED_UNKNOWN_MODE=unknown-not-delivered ./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled
./examples/ai-customer-support/scripts/run-desktop.sh --with-query --verify-ai --query-test-response-hold-ms 6000
```

两种 unknown 使用全新 fixture，分别证明已送达/未送达仍持续锁定；不在未知动作后重发。受控 gate 还检查 8 条突发消息合并、一次动作及有界完成。6000ms 是 AI gate 专用的最短响应时间：从请求开始计时，只补足不足的时间，不向较慢的模型请求再叠加 6 秒；普通命令拒绝该参数。原有外部服务命令（`OPENDESK_SUPPORT_QUERY_PORT=… OPENDESK_SUPPORT_PROJECT_ID=bizhi-app OPENDESK_SUPPORT_QUERY_PROVIDER=auto … --verify-ai`）仍可使用，但必须由维护者独立准备兼容服务；端口不是默认值，启动器不会取得其关闭权。

本次启动的 `desktop/runs/<run-id>/`（基于 `.runtime/tests/ai-customer-support/`）保存源码/构建 Hash、`launch.json`、`owned-processes.json`、原生证据与 `launcher-cleanup.json`。其 `query/` 保存输入 Hash、快照 manifest、实例就绪信息、脱敏 Query/Provider 关联审计和关闭结果。Provider 请求成功、实际响应模型和业务答案语义分别核对，健康检查或服务自报计数不能代替真实调用证据。

小规模合成业务案例（不是新留出集或全面评分）先离线验证，再对上述单独服务的实际端口运行：

```sh
node --test examples/ai-customer-support/tests/local-query.test.mjs examples/ai-customer-support/tests/trial-business.test.mjs
TRIAL_QUERY_PORT=<ready.json中的端口> TRIAL_QUERY_PROJECT=bizhi-app node examples/ai-customer-support/tests/trial-business.mjs --live
```

业务运行器复用当前 Host 查询函数与唯一 reducer，AX 为合成输入，不冒称原生场景；真实 HTTP、人工修改保护、来源 Hash 与需独立审阅的语义分别记录。当前上下文只合并最后一条客服回复后的最多 8 条未回答客户消息，不把已回答的整段历史发送模型；代词消解和完整多轮记忆不在已实现能力内。资料不足须人工核实，不推断真实价格、订单、退款或商家批准。输出默认 `.runtime/tests/ai-customer-support/trial-business/`。

## 2026-11-06 · 本地原生闭环与微信延期

当前仅对无网络的独立测试聊天完善原生辅助、真实 Query 人工审核和明确启用的本地受控回复。微信接入、登录、探针、草稿、双机和发送暂缓，不要求重新登录。已观察到重新登录提示，技术因果未核实。

默认辅助模式；本地自动回复须在设置明确确认账号、PID、窗口、会话及 `builtin-demo-v1` 演示知识，只处理随后消息。它复用预审精确演示规则并带「【OpenDesk 本地测试】」标识，不是模型自动发送。暂停、撤权或人工接管停止动作；恢复不补历史；发送失败暂停、结果未知锁定且不重发。推荐页可展开完整授权范围，启用前仍完整展示确认。

从仓库根目录执行本地受控 gate：`./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled`。它串行操作本次 fixture 与 React 实窗，分别读取新 AX 消息和独立磁盘 oracle，不读取真实联系人、不发网络消息。此前原生闭环验收的结果及未覆盖场景见[先前原生质量记录](../../docs/quality/ai-customer-support-native-completion-20261106.md)；本次重建部署的最新通过项与未完成项以顶部[试用复现记录](../../docs/quality/ai-customer-support-trial-repro-20261106.md)为准，不用旧 AI gate 成功代替当前整体验收。

桌面/浏览器及微信自动化的许可、平台和维护证据见[有限开源选型报告](../../docs/research/ai-customer-support-automation-options-20261106.md)。本轮仅提炼可复用机制，没有引入依赖或恢复微信操作；近期热榜归属未核实。

## 2026-11-06 · 依据审核与人工交接

原生推荐回复页的「审核依据」仅比对该候选自己的引用，完整列出当前编辑稿的分句与待核实项，不再静默截断前 24 段。文字相同只表示字面比对，不证明来源真实、版本有效或业务适用；其他候选或后续查询的来源不会被借用。

在同页展开「人工交接 · 仅复制」，可预览并复制当前客户问题、选中编辑稿、项目/请求、引用编号与 Hash、未核实内容。编辑、选版本、切换客户后重新派生；暂停或撤权时隐藏。复制只准备交接材料，不代表已转人工、建工单或发送。内容仍仅保存在本次页面内存。

上游参考与本轮取舍见[GitHub 调研记录](../../docs/research/ai-customer-support-references-20261106.md)，验证与边界见[本轮质量记录](../../docs/quality/ai-customer-support-review-20261106.md)。普通入口仍从仓库根目录运行：`./examples/ai-customer-support/scripts/run-desktop.sh`。

开发者从仓库根目录执行：`node examples/ai-customer-support/tests/reply-review-browser.mjs`。此检查通过已安装的 ego-browser 操作正式 HTML，以合成 Native Bridge 和剪贴板写入桩检查引用、交接、编辑与会话隔离；不连接 Query 服务，不证明真实模型、系统剪贴板或原生草稿。证据写入 `.runtime/tests/ai-customer-support/research-improvements-20261106/`，结束后释放本次浏览器资源。

> 2026-10-30 用户纠偏：以已可用的独立聊天实窗 + 右侧约 380px、六业务 Tab 助手为当前基线，支持观察消息和人工填入草稿。此前的平行面板及独立「未连接」App 入口已退役；不能再用旧启动命令替代当前界面。恢复提交与验证边界见[入口清理记录](../../docs/quality/ai-customer-support-ui-retirement-20261030.md)。

## 框架方案与示例归属

本项目是 [JavaScript 桌面应用解决方案](../../docs/frameworks/javascript-desktop-app-solution.md)的第一个业务示例。通用方案说明 JS 应用、界面、Runtime、App Mode、桌面交付及独立测试对象的关系；本目录维护客服业务、数据与协议、具体命令和验收入口。

客服助手通过 JS 入口创建可信窗口并加载 React 页面，复用 OpenDesk Runtime 的公共能力。原生 Demo 中的 `OpenDeskSupportChat.app` 是用 Swift/AppKit 实现的独立测试聊天客户端，承担被观察和操作的外部目标；它与 JS 客服助手属于不同职责。此前独立「未连接」App Mode 已退役，当前使用原生 Demo；消息桥握手不授予真实聊天权限。

## 数据处理方案：从字段对应开始

设置 → **业务数据与同步 → 数据处理方案** 提供商品清单和客户名册模板。对应输入字段，查看样例试跑的完整输入/输出和失败行，保存并启用方案，再预检、确认应用。修改配置、停用或离开编辑器会使旧待确认结果失效；界面更新保留未映射的商品元信息、客户标签和会话关联，仍检查版本、游标和本地覆盖冲突。

方案仅保存在本次页面内存，业务备份不含方案；关闭前单独导出方案 JSON，恢复后默认停用。需要几行 JavaScript 定制时，沿用共享映射器的可信本地 Adapter。完整步骤、可复制命令和代码边界见 [数据处理方案使用说明](integrations/mapping-guide.md)。不执行上传代码、不保存平台密钥，也不建立真实聊天授权。

## 2026-10-30 · 可选本地业务工作区

在设置 → **业务数据与同步** 中点「保存工作区」，可保存全部店铺资料及游标。原生 App 写入固定 `.runtime/business-sync/` 的三个版本槽；浏览器使用当前浏览器、当前 origin 的 IndexedDB，两者不共享。页面明确区分未保存、保存中、已保存和失败；导出下载只表示请求文件备份，不会把当前工作区标为已保存。

「启用自动保存」需要当次确认，**每次启动默认关闭**，不会默认读取恢复或托管。重新打开后点「刷新工作区版本」，选择有效版本并确认恢复；损坏/不兼容版本保留诊断，上一有效版本仍可恢复。恢复绑定所选槽位与版本号，版本已轮换时要求刷新。取消不替换资料，恢复后自动保存关闭，核对后再显式保存。

只保存既有业务备份字段：店铺、来源原件、本地覆盖、停用版本和已应用游标；不保存聊天/历史/草稿、授权/真实Binding、托管、脚本或密钥。工作区保存3个恢复版本，原生使用稳定文件锁、版本CAS、同目录独占完整写入及原子rename发布，保留最后有效槽；固定pending/abandoned文件用于中断恢复，不是可选择的业务版本。业务payload仍限8MiB，外层JSON转义单独有界。此发布路线已在本机macOS验收；跨平台live未做。失败或回执未知时关闭自动保存，先刷新核对，不盲目重试；无法辨识generation的损坏文件会保守阻止新写，仍可从其他有效槽恢复并导出。

原生点「刷新文件清单」或图片表单的「刷新图片清单」，从白名单文件中选择，无需手填文件名；也保留basename输入。最多处理500个名称、展示100个文件并提示截断。Runtime `File.listDir` 底层仍全量枚举，本例不宣称其内存扫描硬上限；建议将业务目录保持精简。列表不是授权，读取时仍重新校验路径、类型和容量。页面不会提供任意路径或执行上传脚本。

浏览器存储可能受隐私模式/配额/清除影响，原生 `.runtime` 也可被清理；请独立导出业务备份并妥善保管。关闭拦截取决于宿主，工作区状态是核对保存结果的依据，不能依赖退出时自动落盘。真实CRM/微信、多人权限和生产写回仍不在本地示例范围。

接入开发者可直接运行 [通用JSON/HTTP只读适配器](integrations/README.md)。一调用一页，UI确认应用后才推进cursor；GET、固定allowlist、限额/deadline和外置只读凭据都有本地loopback契约测试，未连接任何真实平台。

Unix工作区新文件从临时inode创建起使用`0600`，固定pending/abandoned及版本槽保留该权限。父目录权限不变；历史文件不被隐式改权限，同账户进程和Windows ACL不在此保证中。

新增验收入口（**从仓库根目录**）：

```sh
npm --prefix examples/ai-customer-support run test:workspace-browser
node tests/custom-ui/tools/support-app/run-workspace-files.mjs
```

使用本机Chrome可在命令前加 `PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`。浏览器证据只证明浏览器能力；旧 App Mode 工作区实窗 gate 已退役，迁移至当前原生入口后的验收待做；详见[本轮工作区质量记录](../../docs/quality/ai-customer-support-workspace-20261030.md)。

## 2026-10-30 · 通用多店资料与脚本扩展

在原有六页和约 380px 助手中增加「数据店铺」选择及设置 → **业务数据与同步**。可新增店铺、搜索与维护商品/客户、上传并关联本地商品图片、导入只读订单；支持预检后确认同步、来源游标、本地覆盖与恢复来源、全量业务备份/恢复。两个内置店铺用于验证相同 ID 隔离，全部为虚构数据。导入后商品、图库、客户资料和客服订单页消费所选店的数据。

这是单机资料拥有者的管理视图：管理列表有意显示所选整店数据，备份包含所有店铺，与聊天权限分开。客服订单页只显示明确映射到当前虚构会话的客户；切换店铺隔离草稿和历史，CRM 映射变化清空原客户的会话资料。原生聊天尚无可信店铺/CRM 身份映射，因此其客服订单页为空、业务资料填入禁用；选店不建立真实聊天绑定。多人部署需另接服务端身份和权限。

从**仓库根目录**运行以下离线接入示例（Node >=22，先安装本例依赖；输出名须未使用）：

```sh
node examples/ai-customer-support/scripts/sync-business.mjs --adapter examples/ai-customer-support/integrations/demo-adapter.mjs --store store-demo --source crm --out .runtime/business-sync/multistore-v1.json
```

启动下文的原生 Demo 或打开 `preview/index.html`，选「示例旗舰店」。浏览器在业务数据区选择生成的 JSON；原生 Demo 在「本机文件名」填写 `multistore-v1.json` 后点「读取本机同步页」。核对预检后点「确认应用同步页」。CLI 成功只表示文件已准备好；UI 确认才更新游标。下一页显式传 `--cursor demo-v1` 并使用新输出名。从界面已应用的游标继续，逐页确认，不跨页承诺事务。

原生文件操作使用**业务工作目录**下固定的 `.runtime/business-sync/`：`native-demo.js` 使用其 Execution 工作目录；公开启动器从仓库根目录运行。图片也先放入这里，在编辑表单填写图片文件名后读取；导出会独占生成 `business-backup-*.json` 并显示保存回执。恢复时填入备份文件名，再点「恢复本机业务备份」并确认替换。仅接受不含路径的 ASCII 文件名，拒绝连续点、符号链接和超限文件；不会覆盖已有备份。浏览器继续使用文件选择、下载与恢复。原生入口没有系统文件选择器或下载功能，这些按钮通过本例 Host 文件通道完成。消息分块控制在原生桥每条 64KiB 限额内，完整文件仍按上述业务限额校验；备份收齐并复验后才写入。

自定义本地 `.mjs` 导出 `pull(context)`，可选 `normalize(record, context)` 和 `afterSync(summary)`；可适配 CRM、网店 API、内部系统或文件。完整字段、示例和执行边界见 [接入开发说明](integrations/README.md)。Worker deadline 覆盖模块加载和全部 hooks；父进程复验后独占原子发布。脚本是拥有完整 Node 权限的可信代码，Worker 只做故障隔离；界面不执行上传脚本、不保存平台密钥。

数据格式以 [business.ts](src/domain/business.ts) 为准：`schemaVersion:1`，每条含 store/source/kind/id、正安全整数版本、UTC 时间、deleted 和严格 data。来源独占规范 ID，跨来源关联必须由接入脚本预先归一；版本回退、同版本变更、断游标、坏外键和本地覆盖冲突均整批拒绝。停用保存 tombstone；存在历史订单引用的商品不能删除。同游标仅允许所有记录均已一致的无副作用重放/轮询（可含子集或空页），不保存原页字节身份；旧页在游标前进后拒绝。

商品参考价和订单金额限定 CNY、最多两位小数；不执行金融操作。图片只收 PNG/JPEG/WebP 内嵌数据，单图 128KiB、边长最多 4096、最多 4Mi 像素；域校验结构，UI 再真实解码。同步页最多 1MiB、每店最多 1000 条及 6MiB（含停用记录）、最多 20 店、业务备份 8MiB。不抓取远程图片，程序 SVG 仅作无图片时的示意。所有外部资料仍待人工核实。

React页面内存仍是活动业务状态的唯一owner；可显式保存到工作区或导出备份。备份包含各店来源原件、本地覆盖、停用版本和已应用游标，不含聊天、授权、脚本或凭据；恢复旧备份将恢复旧游标。真实 CRM/OAuth/webhook、生产写回和图片识别尚未实现或验证。

验证命令（同样从仓库根目录）：

```sh
npm --prefix examples/ai-customer-support run typecheck
npm --prefix examples/ai-customer-support test
npm --prefix examples/ai-customer-support run build
npm --prefix examples/ai-customer-support run test:business-browser
```

已安装本机 Chrome 时，浏览器命令前可加 `PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`。CI 同时运行新增域、会话状态、真实 CLI hooks 与浏览器流程。[目标、关键条件与分层验收记录](../../docs/quality/ai-customer-support-multistore.md)记录本轮结果；下文保留既有原生 Demo/AI 能力说明及历史验收边界。

> 2026-10-29 · 当前阶段：macOS Desktop 技术 Demo，复用 React 19 + TypeScript 六页及唯一 HTML。目标是独立测试聊天实窗 → 原生识别 → 推荐 → 人工选用 → 草稿回读；真实微信、订单后台和自动发送未接入。

## 当前目标与工程归属

优先走通「客户消息 → 当前客户与订单/知识/历史 → 多条推荐 → 编辑/复制/安全填入草稿 → 人工接管与模拟回读」。保留已确认的联系人头像、消息气泡、双窗口与约 380px 助手风格。缩放、小屏宽度矩阵和重复截图评分已暂停，不作为本轮核心交付前提。

- 唯一可维护 UI 源码是 `src/`：单 React root，六个业务页和右上角独立设置。
- `src/state.tsx` 是唯一会话、授权、草稿、导入结果和模拟发送 owner；`src/domain/` 放商品、订单、知识和历史规则。
- 唯一正式 HTML 为 `preview/index.html`，由 `scripts/build-preview.mjs` 从正式源码原子生成，无 CDN、开发服务器或平行 Mock。不要直接修改生成 HTML。
- 三位虚构客户各有独立消息、编辑建议、草稿、订单与档案。聊天状态只保留在当前页面内存，刷新重置；可选工作区仅保存上文限定的业务资料。离线预览不调用云模型。
- 不开发扩展、sidepanel、第二个页面或新的 Runtime。R2.3 原生入口仅维护窗口、观察身份与动作凭据，业务状态仍由 `src/state.tsx` 负责。

## macOS 原生 Demo

从仓库根目录运行：`./examples/ai-customer-support/scripts/run-desktop.sh`。

启动器显式授权自己创建的 `OpenDeskSupportChat.app` 子进程，打开独立测试聊天和约 380px 的原生 React 助手。输入客户消息，点「添加客户消息」，在助手选择推荐，再点「填入聊天草稿」。只有新的原生快照与请求正文一致时才显示 `verified`。测试聊天另有明确的本地模拟发送按钮，不联网；不代表微信或真实客户发送。

切换联系人使用独立聊天的三个按钮。窗口移动/缩放触发提示后重新读回坐标，1000ms 兜底核验；失焦、最小化、关闭或身份失效会停止观察并隐藏助手。暂停和撤销授权使旧请求失效；撤权后须关闭并重新启动本 Demo。已有人工草稿保留，原生模式不提供覆盖确认。

维护者需先准备当前源码对应的稳定签名宿主：`./scripts/build_macos_app.sh`；React 源码修改后执行 `npm --prefix examples/ai-customer-support run build`。启动器核验现有签名；独立聊天 fixture 缺失或源码更新时使用同一固定开发身份构建。需要已授予 OpenDesk 的 Accessibility；截图验收另需 Screen Recording。缺少权限会明确失败，不自动更改系统授权。不改动 `/Applications/OpenDesk.app` 或其他任务的进程。

正式实机 gate：`./examples/ai-customer-support/scripts/run-desktop.sh --verify`。它会操作本次创建的测试聊天和 React 实窗，保存 AX、坐标、回执、截图和逐项结果，结束时清理自己创建的进程；不用于真实聊天软件。普通体验只需上面的一条启动命令和窗口交互。

可信容器为独立的 `ui.createTrustedWindow()`：固定本地 HTML 字节与 SHA-256、每窗口独立 origin、非持久 WebKit store、仅限 JSON 的双向桥、阻断导航和网络资源。它仍加载 `preview/index.html`；普通 `ui.createWindow()` 继续禁用业务脚本。知识、商品、订单、档案仍为本地演示数据，不调用云模型。

R2.1/R2.2 的平行 `desktop/main.js/panel.html` 实现已在恢复提交 `1a6ca3a8` 留档后移除；当前命令不生成或加载这些页面。当前入口为 `native-demo.js`，应用特定解析为 `desktop/native-adapter.js`，测试聊天源码在 `tests/custom-ui/tools/support-chat/`。

实机证据、失败案例和分项计分见 [R2.3 验收记录](../../docs/quality/ai-customer-support-r23-desktop.md)。所有运行输出位于仓库根 `.runtime/tests/ai-customer-support/r23/`，不提交。

## 核心操作

| 页面 | 当前能力 | 边界 |
| --- | --- | --- |
| 推荐回复 | 2–3 条处理策略、选用、编辑、复制、填草稿、人工接管 | 草稿不等于发送；没有可靠知识时只澄清/人工核实 |
| 知识库 | 搜索、状态/来源/范围筛选、展开完整答案、JSON/Markdown 导入 | 新导入数据默认无托管资格；冲突、停用或范围不符不作为可靠匹配 |
| 客户档案 | 历史 JSON、确定性规则提取、原话证据、人工确认/忽略/恢复、Markdown | 候选不参与自动发送；保守规则不是 LLM，不推断敏感属性 |
| 商品 | 按店铺维护/导入、SKU/规格搜索、详情和关联图片；内置基线 6 件商品 | 不识别外部商家链接、不爬取网页、不查询实时库存或价格 |
| 图片 | 按商品关联的 PNG/JPEG/WebP 本地图片、大图和双向跳转；无图片时使用示意 SVG | 未实现以图识物或真实附件发送 |
| 订单 | 当前映射客户只读搜索/筛选、详情、摘要复制、草稿和关联商品 | 基线 8 笔虚构订单；可脚本导入，不执行退款、取消、付款或发货 |

商品详情可复制 `https://catalog.opendesk.example/products/<商品ID>` 形式的演示链接（`.example` 为保留示例域名，不指向真实商品）。商品搜索可粘贴该链接；当前客户消息包含唯一 SKU、型号、完整名称或唯一可信演示链接时，推荐回复页显示可点开的商品线索；不存在或有歧义时不猜测，也不会据此自动发送。

左侧模拟聊天可切换客户、接收演示/自定义消息、人工编辑并模拟发送。已有草稿需要明确确认才能替换；提交时重新核对客户、最新消息、授权与已回复状态。切换客户或收到新消息保留人工草稿，旧身份动作不能写入当前会话。

智能托管须单独确认，只处理后续精确匹配且具资格的演示知识。未知、冲突、敏感问题或已有草稿转人工；人工接管后推荐仍可用，恢复不会补发历史消息。关闭回读后的模拟提交显示「状态未确认」，已提交消息禁止重发；托管发生这种情况时当前会话转人工，停止后续自动模拟发送。

## 导入与证据规则

| 示例 | 内容 | 入口 |
| --- | --- | --- |
| `fixtures/knowledge-demo.json` | 8 条虚构问答 | 知识库 → 导入知识 → 选择本地文件 |
| `fixtures/customer-history-demo.json` | 3 客户、6 会话、22 条消息 | 客户档案 → 导入历史会话 → 选择 JSON 文件 → ✦ 提取 |
| `fixtures/products-demo.json` | 内置基线 6 商品、12 SVG 引用 | 业务同步另见上节的严格 delta 契约 |
| `fixtures/orders-demo.json` | 内置基线 8 笔客户隔离订单 | 可从受信 Adapter 导入，没有生产订单操作接口 |

知识文件限 256KB，单文件 1–100 条，页面总计最多 150 条，超限整份拒绝。JSON 接受数组或 `{ "entries": [...] }` / `{ "items": [...] }`；每条须有字符串 `question` 和 `answer`，兼容 `title` 与 `content`/`reply`。可选 `aliases`/`keywords` 为字符串数组，`enabled` 为布尔值，`category`/`group` 为字符串，`scope` 为字符串或 `null`。错误字段类型整份拒绝，避免把 `"false"` 当启用或把对象变成答案。来源显示本地文件名，导入字段不能授予托管资格。

Markdown 采用二级标题问答格式，作为纯文本数据处理：

```markdown
## 清洗方法
请手洗并自然晾干。

## 联系方式
请联系人工客服。
```

历史文件限 512KB，须采用示例中的 `schemaVersion:1`、`format:"opendesk.ai-customer-support.customer-history-demo"`、`demo:true` 和 `customers` 结构；只接受 `t1/t2/t3`。会话与消息 ID 必须为 1–80 位字母、数字、横线或下划线字符串，单文件最多 360 条消息，原话最长 600 字符。

历史按文件中的客户身份归档，与当前浏览哪位客户无关。相同客户/会话/消息 ID 且原话、角色、日期完全一致时幂等；任一内容冲突则提示定位并拒绝整份文件，原历史和人工确认保留，不把新内容悄悄覆盖到已确认事实。须先核对源文件，再决定后续更正流程；当前没有原地编辑历史证据功能。

提取仅生成有原话、客户、会话、消息 ID 和提取方式的待确认候选。已知否定、撤回、疑问及歧义语境保守不提取；这一规则会漏掉部分自然语言，不能冒称普遍理解。确认/忽略按客户隔离，清空只影响所选客户；重置或清空后旧文件读取不能恢复已清空数据。

## 运行与验证

以下命令均从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行。

首次安装依赖：`npm --prefix examples/ai-customer-support ci`。

类型与正式生成物：`npm --prefix examples/ai-customer-support run typecheck && npm --prefix examples/ai-customer-support run build && npm --prefix examples/ai-customer-support test`。

### 当前入口与独立检查

普通体验从仓库根目录执行：`./examples/ai-customer-support/scripts/run-desktop.sh`。它加载 `native-demo.js` 和同一份 `preview/index.html`，创建测试聊天与六页助手。旧独立 App Mode 的 Manifest、入口、Host、staging 命令和专属验收启动器已移除；本例当前不提供可搬移 App Mode 包。

本机已有 Chromium 时，核心浏览器检查：`PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm --prefix examples/ai-customer-support run test:browser -- --core`。它使用隔离的 headless 浏览器和 Bridge stub，不能代替原生聊天、实窗或权限证明。可用 `SUPPORT_TEST_EVIDENCE="$PWD/.runtime/tests/ai-customer-support/<新目录>"` 保存独立浏览器证据。

保留的文件桥 Runtime 检查：`./dist/opendesk -script tests/custom-ui/ai-customer-support-business-files.js -console-mode script`；工作区文件检查：`node tests/custom-ui/tools/support-app/run-workspace-files.mjs`。这些检查不证明真实平台接通。原工作区/映射实窗 controller 保留供后续迁移，但当前没有对应启动器，尚未在现有原生入口重新验收；历史 App Mode 报告只作为历史证据。

可选静态 HTTP：`python3 -m http.server 4173 --bind 127.0.0.1 --directory examples/ai-customer-support/preview`，访问 <http://127.0.0.1:4173/>。已有客服验收服务时直接复用其地址。HTTP 仍读取同一个正式 HTML；不再生成预览。直接 `file://` 是离线产品目标之一，当前 Mac 工具未完成该路径验收。

CI 核心浏览器入口：`cd examples/ai-customer-support && npx playwright install chromium && npm run test:browser -- --core`。CI 使用 Linux headless Chromium；核心模式跳过既有宽度/缩放矩阵，增加导入错误、历史冲突、草稿覆盖取消/接受与未知回读回归。它不能替代 Mac 实窗文件选择和系统剪贴板证明。

`.github/workflows/ai-customer-support-preview.yml` 检查类型、领域/安全测试、构建、离线 HTML 契约及核心浏览器流程，再上传 HTML 和运行证据。构建产物与当前源码必须一致；历史提交的 CI/截图不作为新修改的通过证明。

## 当前验收状态

最新核心修复和证据分层见 [`docs/quality/ai-customer-support-r2-core.md`](../../docs/quality/ai-customer-support-r2-core.md)。运行日志、截图、临时文件均在仓库根 `.runtime/tests/ai-customer-support/`，不提交。

- 六页、设置、三客户会话/订单/草稿隔离、商品图片双向关联、档案确认/忽略、回复编辑与填入空草稿、撤权/暂停、人工接管及模拟去重已有真实 Mac Chrome HTTP 证据。
- 最新核心差量已补领域/安全回归、正式生成 HTML 和真实 Mac Chrome 未知回读检查；具体计数与提交以质量报告为准。
- **NOT_TESTED（当前 Mac 实窗）：** 知识 JSON/Markdown 和客户历史的正常文件选择导入、错误/过大文件 UI、拖拽、草稿覆盖确认的取消与接受、回复/订单摘要系统剪贴板粘贴、`file://`。工具无法完成的操作不推断为产品失败；成功 toast 也不等于系统剪贴板已验证。
- **浏览器历史证据的边界：** 上述浏览器结果不证明 R2.3 Desktop；原生加载、视觉与功能证据见 R2.3 验收记录。
- **当前范围外：** 微信/企业微信接线、真实订单系统、LLM/RAG/图片识别、真实发送与外部回执。
## R3.0-A · 可选本机 Query API 知识回复（实验能力）

本轮仅连接 **R2.3 独立测试聊天**，不连接真实微信/企业微信，不启用自动发送。React 六页面不变、设置仍在齿轮，网页预览是离线演示；`native-demo.js` 通过可信 Host 读取目标窗口最新客户消息，显式执行 `support.aiQuery` → `desktop/query-api-adapter.js` → `http.post` → 旧 Query API `POST /api/query`（仅 `127.0.0.1`）→ 独立最新窗口读取 → `support.aiResult` → 推荐卡片和已有人工填草稿/新快照回执。无外部查询配置时给出明确 `NOT_CONFIGURED` 错误，不冒充真实回答。仅真实 Query API 返回的一个回复才能生成一个候选；旧 `reply_segments` 不代表多条策略。

如已在本机自行启动获准的旧 Query API，并为该服务准备了隔离的非生产项目知识，可显式绑定：
```bash
OPENDESK_SUPPORT_QUERY_PORT=18082 \
OPENDESK_SUPPORT_PROJECT_ID=your-approved-demo \
OPENDESK_SUPPORT_QUERY_PROVIDER=auto \
./examples/ai-customer-support/scripts/run-desktop.sh
```
`QUERY_PROVIDER` 可为 `auto`、`http`、`codex_cli`。端口需为 1–65535，项目 slug 必须由运行者可信指定，不取自 React 页面，也不做跨项目自动回退；不得把服务绑定到公网/企业网入口。该 URL 固定为 `http://127.0.0.1:<port>/api/query`。只提交 `delivery_mode=draft`；不提供真实订单操作、不发出消息。旧 Query API 的当前开发接口并非经过单独验证的认证型公网服务，外部/远程部署不得照搬本配置。

返回的 `review_answer` 仍是待人工审核的候选草稿；`EvidencePack` 中的知识 ID 和 Hash 只是旧系统上报的依据引用，**不等于 OpenDesk 独立验证该知识正确、未过期或适用于当前订单**。模型失败、冲突、项目不符或身份变化均不授权自动操作。旧知识系统包含 Hash Vector 和 BM25，但 Hash Vector 不是已验证的语义 Embedding。

`fixtures/rag-benchmark-100.json` 保留为最初的问题草案。R3.0-C 的有标签合成基线位于 `fixtures/r30c-quality/`，开发集、封存集、来源和真实有界调用结果见[质量记录](../../docs/quality/ai-customer-support-r30c-quality.md)。先比较 FAQ/BM25，只按开发集错误做最小增强；不要求为本轮重建七策略。合成知识不代表商家批准。测试：`npm --prefix examples/ai-customer-support test` 或单独 `node --test examples/ai-customer-support/tests/ai-query.test.mjs`。`--verify` 禁用 Query API 配置，继续检验离线原生闭环；真实 AI+Mac 结果按独立实机证据报告，不能由源码或 CI 推定。

## R3.0-C · 版本与来源审核

原生模式再次查询会保留当前人工稿和旧版本，新回答追加为待选版本，点击对应版本才改变选择。暂停恢复保留同一窗口、客户及消息的人工稿，同时使旧请求失效；已有聊天人工草稿仍拒绝覆盖。

每个版本可以展开自己的“审核依据”，查看 Query 项目、请求、来源条目、文档、原文及 Hash。当前服务没有提供的版本、生效期、适用条件和逐句引用明确显示待核实。来源存在、文字匹配和业务适用性是分别审核的事项；本地知识导入不会更新 Query 项目。

本轮修改、真实加载、实窗和功能证据及未完成项见[R3.0-C Mac 验收记录](../../docs/quality/ai-customer-support-r30c-mac-verify.md)。正式启动命令继续使用现有 `scripts/run-desktop.sh`，无真实发送。

