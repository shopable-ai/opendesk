# AI 客服：通用多店资料与可信脚本接入验收

> **2026-10-30 入口退役说明：** 下文保留当时的源码状态、命令及证据；涉及独立「未连接」App Mode、staging 和原生业务/工作区/映射 gate 的命令已退役，不能作为当前运行入口或当前原生通过证明。共享业务代码、浏览器/领域测试及独立文件 gate 保留。当前以 `native-demo.js` 的聊天实窗 + 六页助手为基线，详见[入口清理记录](ai-customer-support-ui-retirement-20261030.md)。

2026-10-30。范围：`examples/ai-customer-support`，用户选择“通用多店客服”。本轮在现有 React 六页和唯一 reducer 上实现数据管理和同步适配，不新增依赖或 Runtime API，不创建分支、提交或推送。开始时已有大量未提交修改，保留其内容；本报告只对本轮多店能力作结论。源码基线 HEAD `09470cfc245403a9ef5e3d48cbda49761ddf8fc9`，master，dirty。

## 最新续作

本报告以下保留前轮基线与证据。可选工作区持久化、文件清单、通用只读适配器、商品SVG裁切修复及新构建原生验收，以[2026-10-30工作区续作记录](ai-customer-support-workspace-20261030.md)为准；未完成验项不会沿用旧版本通过结论。

## 目标及关键条件

| 目标 | 关键验收条件 | 实现入口 |
| --- | --- | --- |
| 多店业务资料 | 相同 ID 跨店隔离；商品/客户/图片本地维护，订单只读 | `src/domain/business.ts`、`src/views/BusinessData.tsx` |
| 客户会话隔离 | 切店保留各店草稿；恢复移除当前店、CRM 重映射不继承旧客户消息/历史/事实；native真实绑定保持 | `src/state.tsx`、`tests/business-state.test.mjs` |
| 一致同步 | 预检不改状态；显式应用原子提交；版本/游标/外键/本地覆盖冲突失败不推进 | `tests/business.test.mjs` |
| 脚本扩展 | pull/normalize/afterSync 可执行；加载/同步死循环可超时；父进程复验；异常无文件，独占发布 | `scripts/sync-business.mjs`、`tests/business-sync.test.mjs` |
| 图片与备份 | 位图有界、拒绝URL/SVG、实际解码；备份保留覆盖/游标，不带聊天或授权 | 新业务浏览器 smoke 及域/state 回归 |
| 兼容与可维护性 | 六 Tab 和现有草稿/AI bridge 回归；正式HTML/类型检查；CI注册新增测试 | CI、package scripts |

## 产品与权限决定

本例假定当前电脑操作者拥有自己导入的本地资料。设置中明确标注“本地资料管理者视图”，管理显示所选整店记录，导出含全部店铺。这是独立于客服当前会话的维护范围，不是服务端租户权限或多人RBAC实现。客服订单页仅引用当前虚构会话明确映射的客户；native缺少可信业务身份时订单页为空，业务资料填草稿禁用。选店不合成真实聊天授权。

store/source/customer 决定测试槽身份。业务apply/save/revert/restore/switch统一复核，身份变化只清相应客户的聊天、草稿、历史、事实、编辑和接管。恢复时旧session仍归原店缓存，目的店加载自己的session；native真实聊天不被业务备份替换。新导入记录不能授予托管或事实资格。

同步是每store/source一条顺序delta流。新cursor要求previousCursor等于已应用checkpoint；同cursor只允许全部记录完全一致的no-op校验/轮询，允许空页/子集，不承诺原页字节身份；游标前进后旧页拒绝。来源拥有规范ID，跨来源重名拒绝，Adapter需显式归一。上游修改碰到本地覆盖时整批拒绝；用户先备份、恢复来源，再重新预检。tombstone保留版本，有订单引用的商品不允许删除。

界面仍只在内存保留资料，关闭前导出备份。业务备份包含店铺、来源原件、本地覆盖、停用版本和cursor，不含聊天、授权、hooks或凭据。恢复旧备份也恢复旧checkpoint。当前只支持固定CNY两位小数；图片128KiB、最大4096边长且4Mi像素、同步页1MiB、单店1000记录及6MiB（含停用）、20店、备份8MiB。所有外部资料待人工核实。

可信本地Node脚本拥有完整文件/网络/环境权限，Worker是故障隔离而非安全沙箱。CLI不保存checkpoint，afterSync是发布前观察者，不能证明UI应用或撤回外部副作用。真实接入需自行确定只读endpoint/凭据、字段映射和分页策略。无真实CRM/OAuth/webhook、生产写回、图片识别或消息发送资格。

## 专家方案评审

相同rubric经历首评84、复评93，修复管理scope歧义、restore和slot身份转换、同cursor语义、图片限额以及CI遗漏后，由独立critic复评：**OKAY，98/100，未发现未解决的方案级P0/P1**。评分衡量方案成熟度，不替代功能、原生加载、视觉或平台认证。新增文件桥和分块修正后，独立code-reviewer再次给出 **APPROVE，98/100，无剩余已证实P0/P1，未复现新增P2**，确认原型名称店铺ID、旧表单和迟到回执问题已修复。最终扣分保留固定目录需手工准备文件、错误提示较概括；当时公开启动尚待复核，随后已完成下述原样公开入口验证，不自行上调分数。

| 维度 | 得分 |
| --- | --- |
| 需求覆盖 | 20/20 |
| 数据模型与隔离 | 20/20 |
| 脚本扩展安全与可用性 | 20/20 |
| 同步一致性 | 15/15 |
| 交互可用性 | 9/10 |
| 可验证性 | 9/10 |
| 兼容与演进 | 5/5 |

早期评审两项P2为表单反馈距离和当时尚无质量记录；本记录已补齐，表单增加业务版本变化的本地拒绝提示。最终复评仍保留98分，不因补证据自行加分。

## 本轮验证证据

运行目录统一为仓库根 `.runtime/tests/ai-customer-support/multistore-20261030/`，不提交截图/日志。公开操作与完整字段见 [README](../../examples/ai-customer-support/README.md)、[接入说明](../../examples/ai-customer-support/integrations/README.md)。

| 验证 | 当前结果与证据 |
| --- | --- |
| TypeScript | PASS：`npm --prefix examples/ai-customer-support run typecheck` |
| 正式生成HTML | PASS：`npm --prefix examples/ai-customer-support run build`，同步更新app-integrity |
| 本例所有单元/CLI测试 | PASS：212/212；`unit-release.log`，含22域、16状态、12真实CLI、6文件客户端及22文件桥测试 |
| 共享Desktop bundle/package离线契约 | PASS：24/24；`native-contract-release.log`，刷新core.generated及输入hash后运行 |
| 核心浏览器 | PASS：14/14；`browser-core-release.log`，本机Chrome隔离headless |
| 新业务浏览器 | PASS：7场景；`browser-release/result.json`，file://、商品与真实位图、取消/应用、坏JSON、不可解码图片、备份下载/恢复并清除旧编辑器、店铺隔离、六Tab及380px；无HTTP请求或页面错误 |
| 原生 File Runtime | PASS：28项；`file-runtime-1793303468595-137809927/result.json`；真实File读写、独占创建、近8MiB分块备份/恢复、96KiB图片、64KiB帧限额与过期；不冒称真实UI图片编辑 |
| 公开同步一行命令 | PASS：从仓库根原样执行README命令；`.runtime/business-sync/multistore-v1.json`，receipt PUBLISHED仅表示已准备 |
| 普通公开App命令与源码实窗 | PASS：从仓库根原样执行README命令；`public-source-proof.json`、`public-app-final/`。App源码未加测试后缀，由外部正式JS gate验证读取/预检/应用/导出及关闭；独立检查根业务文件区backup的CRM游标 |
| 整仓测试架构审计 | FAIL（范围外）：`test-architecture.log`；既有Go分类缺项、7个坏行、single-entry文件缺失。本轮无Go测试/目录迁移，未修改这些无关账本 |

CLI测试真实执行本地模块，另用临时loopback HTTP server和虚构凭据验证接入路径，覆盖模块加载/各hook挂起、顺序normalize、parent复验、日志泄漏、symlink/no-clobber和原子发布；不声称已接通真实平台。

## 原生与视觉分层

复用固定签名开发宿主，本轮仅修改外部JS/CSS。运行前重新核对：主程序 `dist/OpenDesk.app/Contents/MacOS/opendesk` SHA256 `87276091384883f8eb132bae733e881db2ae571bc4180ea8b49903a55222f5b0`，UI host `3fe00561a1fdfffaa0e2d0c295517d752961dabdeee39e0b8da2096a8d974b35`；两者2026-10-29 21:31:23固定OpenDesk Local Development签名，ID `com.opendesk.cli` 与 `com.opendesk.cli.Helpers.opendesk-ui-host`。未触碰既有 `/Applications/OpenDesk.app` 进程或权限。

- 代码已修改：PASS，上述域/UI/CLI和文档已落地。
- 实际已加载：最终 staged `native-files-2/run.json` PASS，PID1260、handle180596，HTML `94d8c4215aa215aecf3ed0c98ee58a58b847067d328332e0a90930003f200a86`。随后为UTF-16边界补强客户端后重新生成，最终源码 App 已原样启动并通过同样的文件流程；`public-source-proof.json` 记录PID2647、handle180616、HTML `4efac897636c894ab774197ec0e4df46ddcf5aa8c70829fbb52a019bc8a831e3`，与当前preview及app-integrity完全一致。
- 视觉观察：已检查最终 `native-source-final/native-file-preview.png`、staged `native-files-2/ui/native-file-backup.png` 及 `browser-release/workspace-380.png`，资料区、文件输入、预检及保存回执换行与按钮对齐正常，无横向溢出。列表及长设置受控滚动。历史商品SVG图标题上缘裁切仍存在，未把整例视觉声明为全部通过。
- 原生功能：真实窗口完成资料区折叠/展开、读取准备的同步页、预检、确认应用、导出业务备份；独立Node读取生成文件，确认CRM checkpoint为 `demo-v1`。stage runner仅复制输入fixture到包工作目录，不注入业务state或DOM。原生图片编辑及恢复确认对话框未在真实窗口逐项验收；对应文件读写已通过Runtime gate，域/解码/恢复流程已通过浏览器。
- 失败保留：早期core gate因不支持AXPress的details及前台遮挡拒绝通过，改为真正button；`native-files-1`未出现预检，诊断发现App Mode的File.cwd为App根而非shell启动目录。已修正固定业务工作目录及fixture准备；没有将这些失败改写为通过。

文件通道不是系统文件选择器：仓库源码App将固定业务工作目录设为仓库根，可搬移包默认自己的App根，native-demo默认其Execution工作目录；页面仅传basename。Host验证realPath、扩展名、读前/读后大小以及备份外层字段，UI再做完整域校验及实际图片解码。原生桥双向每消息64KiB，传输按8192 UTF-16单元分块且不拆开surrogate pair；顺序offset、固定总量、单个有界读/上传槽、120秒期限，备份完整提交前无文件写入。错误回执不含路径或内容。
原生短流程复现命令（从仓库根，证据目录须新建）：`node tests/custom-ui/tools/support-app/run-app-native.mjs business .runtime/tests/ai-customer-support/<新的目录>`。它是正式自动化验收，追加测试后缀的staging副本；不是普通用户体验入口。

## 演进顺序

1. 选定一个真实平台，确认只读凭据和字段/分页规则，用该Adapter输出同一契约，先脱敏fixture再独立live只读验收。
2. 增加可信Host的store/source/customer映射协议，再开放原生客服订单引用及业务草稿，继续保持发送授权独立。
3. 多人/长期部署时由后端承担身份、RBAC、租户隔离、密钥、持久化、审计和调度，UI不承担安全边界。
4. webhook/自动checkpoint/冲突调解/货币扩展/对象存储分别增加schema版本和回归，不在当前demo暗示已支持。
