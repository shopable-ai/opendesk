# AI 客服原生闭环与自动化选型（2026-11-06）

本轮已完成当前约定的安全分支：修复自身回复竞态和 Query 原生验收定位，三项正式实窗 gate 全部通过；普通命令已原样启动。代码已修改、当前生成物实际已加载、关键实窗视觉已确认、下表功能已验证。微信保持延期，真实 Query 仅人工审核/填入草稿；本地自动回复仅限无网络 fixture。没有提交或推送。

| 检查 | 最终结果 | 当前源码实窗 run / 证据 |
| --- | --- | --- |
| `--verify` | PASS，23/23，零发送 | `20261106-032256-41606/native-results.json` |
| `--verify-controlled` | PASS，26 项；1 项 NOT_RUN | `20261106-031956-35712/controlled-native-results.json` |
| `--verify-ai` | PASS，21/21，6 次真实 Query HTTP 200，零发送 | `20261106-033918-52194/ai-native-results.json` |
| 普通一行命令 | 启动检查通过；主动清理取消退出，不作为正式 gate PASS | `20261106-034130-54218`、`ordinary-launch.log` |
| 当前离线回归 | 236/236 native/Query，284/284 React | `native-unit-final.log`、`react-unit-final.log` |

上述 run 路径基于 `.runtime/tests/ai-customer-support/desktop/runs/`，单独日志基于 `.runtime/tests/ai-customer-support/20261106-native-completion/`。开源比较见[8 个候选的官方证据与取舍](../research/ai-customer-support-automation-options-20261106.md)。

## 本轮目标与验收合同

需求来源：用户决定暂缓微信，继续完善现有客服助手并核实开源自动化方案。本轮原生 Goal 独立建立，不恢复来源对话的 paused Goal。工作目录为仓库根 `/Users/shopme/Documents/workspace/opendesk`，开始时 master / `f42d26c246fc7c57a03a664d6b3b49e59e23aa48`；未创建分支、提交或推送。其他任务的未提交修改保留。

沿用现有 React、唯一业务状态 owner、正式生成 HTML 和 OpenDesk Runtime。保持左侧独立测试聊天、右侧约 380px 六业务 Tab 与独立设置入口。微信登录、探针、草稿、双机和发送均延期；重新登录提示已观察，技术因果未核实。本轮不操作微信，不要求重新登录。仅明确无网络的本地 fixture 可受控发送，真实 Query 结果仅供人工审核。

| 关键条件 | 必需证据 |
| --- | --- |
| 新消息与身份 | 同文不同原生 ID，重复观察去重，自身消息不触发；新会话和晚到请求不能误写 |
| 人工优先 | 编辑、版本选择、已有原生草稿保护；正确目标的新 AX 草稿读回 |
| 自动化范围 | 默认关闭；本地账号/PID/窗口/会话/演示知识授权；暂停、撤权、接管、恢复不补历史 |
| 有界执行 | 消息合并、队列、单飞、限流、截止和异常停止；不得释放仍未结束的单飞 |
| 发送核验 | 动作前重新核对；新 AX 消息身份与独立磁盘 oracle 一致；失败暂停、未知锁定且不重发 |
| 真实 Query | 实际服务/模型审计、正确知识项目、人工审核/编辑/版本、真实草稿；模板不得冒充模型 |
| 实窗与交付 | 普通命令、三项正式命令分别记录；当前截图检查 380px 可用性；代码/加载/视觉/功能分开报告 |
| 开源比较 | 官方仓库、许可、平台、维护和可复用机制；无法核实近期热榜时明确未核实 |

## 执行与证据索引

本轮日志与研究原始资料：`.runtime/tests/ai-customer-support/20261106-native-completion/`。启动器独立实窗产物：`.runtime/tests/ai-customer-support/desktop/runs/<run-id>/`。运行产物不提交。

固定开发 Runtime 和 UI host 构建于本机 2026-11-06 02:16:02，Go VCS revision 为上述 HEAD，dirty=true；开始核对时没有晚于主程序构建的已修改 native 依赖，仅 Swift fixture 较新，由启动器按固定签名核验/构建。每次启动分别保存主程序、UI host、fixture、HTML 和业务 JS Hash，不以历史 Hash 代替当前加载证明。现有 `/Applications/OpenDesk.app` 与其他任务进程未修改。

首轮 `--verify`：FAIL，run `20261106-030719-21636`。真实加载、新消息、重复观察前段通过；随后检测到前台为 Chrome，停止。未放宽前台条件或重放该 Execution。`native-verify-1.log` 保留原始错误。99 项定向 native/Swift 模型回归通过，详见 `native-unit.log`；离线结果不证明实窗已完成。

第二轮 `--verify`：PASS，run `20261106-030804-22350`，包含设置页 gutter 滚动、撤权、失焦/最小化/恢复、同文不同 ID、旧引用拒绝、草稿保护与独立读回、零发送。随后视觉检查发现范围说明占用过长；已仅折叠说明详情并纠正启用状态文案，最终生成物需后续重验。

本地发送 gate 的初始失败分别保留：`20261106-031028-25433` 的 React 全树 AXValue 不可序列化（未发请求），`20261106-031136-26201` 的前台身份变化（已独立确认一次本地发送），以及 `20261106-031307-27418` 的自身回复竞态。第三轮已成功发送一次，但确认阶段仍 busy，外层观察误将本次 agent 回复判为人工接管；第二条同文新 ID 因暂停而超时，不能算通过。

针对此实际竞态，`fixture-automation.js` 只记录本次成功原生回执的消息 ID、正文、scope 及完整前缀；观察时仅完整上下文与空草稿严格相等，才允许其通过自身消息分支。独立确认仍由 controller 重新读取，额外人工消息/草稿仍接管。先加失败回归再修复，证据 `own-reply-race-red.log` / `own-reply-race-green.log`；该组 24/24 包含确认期间自身观察与人工追加回复两个相反场景。

Query gate 的 React 操作改用新鲜双快照与单次 PID press，离屏先有界滚动；来源和编辑框才定向读取值。没有降低原有人工编辑、版本、依据与草稿断言。`query-unit.log` 的 131/131 是 Query Host 和定位 helper 的离线测试，不是模型或实窗结果。

最终 `--verify-controlled`：PASS，run `20261106-031956-35712`，26 项通过、0 失败，另 1 项明确 NOT_RUN（突发合并及 unknown-not-delivered）。独立 oracle 记录恰好 5 次本地动作：3 次 sent/delivered、1 次 failed/未落入、1 次 unknown/已落入。后者即使独立证据确认已落入，也保持 unknown 锁定；新消息、重复观察、暂停/恢复/接管、重新启用与撤权均不能释放或重试。第 4 轮此前停在 unknown 前，原因是前台转到 ChatGPT，保留 `controlled-verify-4.log`，未在同一 Execution 重放。

本轮最终离线回归 `native-unit-final.log` 为 236/236，`react-unit-final.log` 为 284/284；前者包含本地控制器、原生适配、队列、草稿、Swift fixture 模型、Query Host 与定位 helper。`build-final.log`、`typecheck-final.log` 通过；改动 JS 的 `node --check` 与定向 `git diff --check` 通过。项目没有单独 lint script，不冒称运行 lint。代码审查独立复核自身回执豁免的边界：额外人工消息仍接管，未知结果没有豁免。离线通过不替代以下实窗结果。

视觉检查：当前生成 HTML 的 `controlled-enabled.png` 与 `controlled-unknown-locked.png`（上述最终受控 run）已检查。右侧约 380px 保留六 Tab、独立设置、建议和底部草稿动作，授权范围改为可展开详情；启用前的确认仍完整展示范围。启用文案与锁定状态一致，无异常拉宽、空白、裁切或错位。未展开缩放/小屏矩阵，也未把功能成功代替视觉结论。

最终 `--verify`：PASS，run `20261106-032256-41606`，23/23，独立 oracle 为 0 次发送，包含本轮生成 HTML 与竞态修复。当前 `02-draft-verified.png` 已目视确认原生草稿与助手一致、布局正常。

Query 实窗定位又暴露并修复一个验收工具缺陷：WebKit 返回的后代 AX bounds 不含 CSS 裁切，审核按钮虽处于窗口内，实际被固定底栏遮挡。初两轮因此误点本地填入草稿（无发送），没有通过审核断言。定位现从真实 AX「推荐回复」容器与固定 footer 派生可视区，内容须完整进入可视区才提交单次 PID click；第二快照还须复核该可视区。Runtime native wrapper 不保证 JS 对象 identity，包含关系改用已证明唯一的 role/name；离线先复现遮挡与 wrapper 失败，再修复。`query-occlusion-red.log`、`query-wrapper-red.log`、`query-occlusion-green.log` 保存红绿回归，最后 135/135；原有业务断言保留。第三轮已正确滚动与展开，随后应用级唯一搜索返回 SEARCH_INCOMPLETE。第六轮只读诊断明确为 `reason=unmaterialized`（118 nodes，maxDepth=11），不是搜索上限；未展开菜单或把部分树视为通过。来源与编辑框最终使用精确助手窗口内的新 ref，实窗证明可用；标题栏继续走双快照 PID click。第四轮前台变化、第五/六轮搜索失败的原始日志均保留。

第七轮 Query 已通过审核、原文、编辑、两版本、真实草稿、人工草稿保护及前三项晚到检查；最后撤权检查 FAIL：服务尚未加载上下文快照，409 错误先于撤权返回，不能算“撤权后的晚到结果”。这不是撤权后错误写入的证据，也不作为正式通过。

最终 Query 部署仍使用缓存上游 `878c619` 代码与同一 `bizhi-app` 合成项目。只在本轮 `.runtime` 复制相同项目并补齐其既有共享 profile，用上游 publish/registry loader 编译加载快照；输入相等 Hash 见 `query-deployment-inputs.json`，快照 manifest 为 `47e88d2b47bb1309092d7ea6c9305d3ce045bbf6095eb0e7405b69431106d518`。只启用 HTTP；未配置或运行 Codex CLI、未改全局模型/认证/代理，未替换知识后端。沿用进程内服务兼容项 `service_tier=default` / `reasoning_effort=low`。测试服务明确将真实 Query 响应延迟 6000ms，不修改模型正文或结果字段，以稳定覆盖实际在途撤权；这不是正常服务延迟/性能结论。

最终 `--verify-ai` run `20261106-033918-52194`：21/21 PASS。`final-query-provider-proof.json` 将本次 6 个请求 ID 与 Query wire audit 对齐，均 HTTP 200 且 `total_provider_requests>0`，模型为 `openai/gpt-6.1-sol`，包括 `rag_rewrite` 和 `context_http`；另有本次时段内 6 条直接 provider 请求/响应审计。服务内部 planner 计数不冒充完整独立 wire trace。原生 UI 真实展开来源、编辑并保留人工版本，显式切换新旧版本，填入后从新 AX 树读回相同草稿。独立 oracle 为 0 次发送。新消息、客户切换、暂停及撤权后均丢弃晚到响应；最后撤权点击为 UTC `19:40:57.321`，实际响应为 `19:41:08.216`。不是模板替代模型，也不是只验证快速错误。当前 `02-ai-edited-draft-verified.png` 与来源审核截图已检查。

普通命令 run `20261106-034130-54218` 原样启动，三个 verify flag 均 false、无 Query 配置；固定签名进程与正式 HTML Hash 与上述最终 gate 相同，初始自动化为 disabled / requests=0、无历史重放。CUA 看到了本地测试窗口和新增客户消息；因前台变化，额外手动消息没有进入助手观察，不宣称普通消息闭环通过。其闭环结论来自正式 23 项 gate。关闭本次 fixture 后，CUA 的后续状态读取曾自动重新打开一个空 fixture，已单独关闭并用应用清单核对退出；本次 Runtime 最后通过 SIGINT 主动取消，日志 `status=canceled` / 退出码 1，不伪记为正常成功退出。

资源清理：本次 Query 服务 PID 52179 已 TERM；普通 Runtime PID 54249 已 INT；fixture、当前源码 UI host 及 18082 监听均不存在。原有安装版 PID 50465 / UI host 50486 保持运行。只对核对过命令行的本任务 PID 发信号，无宽泛 kill。具体记录见 `cleanup-request.json` 与 `cleanup-final.json`。

本轮直接维护：`src/views/Settings.tsx`（范围折叠和状态文案）、`desktop/fixture-automation.js`（自身回执竞态）、其回归、`tests/custom-ui/ai-customer-support-controlled-native.js`（React AX 投影/失焦诊断）、Query native gate 及 helper 回归，README/DESIGN 与本报告/调研报告；正式 HTML 经 build 生成。其他既有未提交修改保留，未创建分支、提交、推送。最终源码/生成物 Hash 见 `candidate-index.json`；每个 run 另存 `artifact-sha256.txt` / `source-sha256.txt`。

## 命令

均从仓库根目录执行。普通体验：`./examples/ai-customer-support/scripts/run-desktop.sh`。

正式检查分别执行：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh --verify
./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled
OPENDESK_SUPPORT_QUERY_PORT=18082 OPENDESK_SUPPORT_PROJECT_ID=bizhi-app OPENDESK_SUPPORT_QUERY_PROVIDER=auto ./examples/ai-customer-support/scripts/run-desktop.sh --verify-ai
```

三个正式命令的本轮结果见顶部表。Query 服务仅为本次隔离部署，现已清理；重跑 AI gate 仍须先准备兼容的本地服务。`bizhi-app` 为隔离合成资料，非真实店铺。

## 明确限制

本地受控回复复用预审精确演示知识并带本地测试标识，不是模型自动发送。当前实窗 gate 的突发合并与 unknown-not-delivered 场景尚未补实窗证据；不得用单测填补。真实客户托管、生产写回、金融操作、图片识别、管理扩张、数据库/工作区重构及全策略/压力/缩放矩阵继续延期。商品资料仍以外部 JSON/CSV/API/数据库同步为主要方向，本轮不擅定未决数据方案。
