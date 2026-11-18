# AI 客服助手人工辅助试用复现记录 · 2026-11-06

需求来源：本轮用户要求将现有双实窗原型推进为可复现的人工辅助试用，按 P0 本地 Query 部署、P1 普通单命令体验、P2 两种 unknown 与突发消息、P3 小规模业务案例推进。沿用既有六业务 Tab、独立设置与约 380px 助手，不改版、不接微信、不新增依赖、不扩大真实发送权限。

当前阶段：P0 部署与 P2 原生辅助/两种 unknown/突发消息通过。P1 普通命令已证明真实 Query 和标题栏关闭清理，但完整审核、编辑、填稿体验尚未通过；正式 AI gate 的核心交互通过，整体因后续失焦停止。P3 四例真实调用为 1 PASS / 3 FAIL，不能宣称业务全通过或整体试用验收完成。下列状态仅代表本轮新证据，不覆盖历史结果。

## 1. 源码、输入与启动合同

- 工作目录：仓库根目录 `/Users/shopme/Documents/workspace/opendesk`；现有 `master`，本轮起始 HEAD `f42d26c246fc7c57a03a664d6b3b49e59e23aa48`。保留已有大量未提交修改，无切分支、提交或推送。
- 使用当前外部 `native-demo.js` 和正式 `preview/index.html`，复用固定签名 `dist/OpenDesk.app` 及配套 UI host。主程序构建时间 2026-11-06 02:16；已核对本轮相关 native 输入无晚于该构建的修改，产物 Hash 与此前已验证的配套宿主一致。本轮 fixture 的新增测试按钮由 launcher 刷新并验签。
- P0 的维护源码为 `examples/ai-customer-support/scripts/local-query.py`、`scripts/query-local.example.json` 与 `scripts/run-desktop.sh`。不把历史 `.runtime` 启动脚本当部署依赖。
- 私有 Query 输入为获准上游版本 `878c619`、隔离 `bizhi-app` 与选中的共享 `ai_sales_assistant_zh` profile；不复制到版本控制、不下载、不改上游源码。运行时编译选中项目上下文，发布独占 snapshot，显式加载 registry，并核对 health 中 available/preloaded/context 三个项目列表。
- 配置仅保存 `source`、`projectsRoot`、`projectId`、`profile`、`port`、`credentialSource` 与可选 `python`、`plannerTimeoutSeconds`。路径相对配置文件或为绝对路径。配置和运行结果只允许在仓库 `.runtime/`；每次 run-dir 必须未存在。
- 显式 `python` 保留虚拟环境路径语义，在读取凭证和创建 run-dir 前 re-exec；本机系统 Python 缺 PyYAML 的首次启动失败已保留，修正为复用获准上游现有 Python 环境，未安装依赖。依赖版本见示例 README。
- `credentialSource=environment` 继承既有 HTTP 环境；显式选择 `existing-codex` 只读当前配置/认证并在子进程内使用，不写全局配置，不启动 Codex CLI。服务仅允许当前项目的同步 draft 查询、HTTP 生成且禁用 CLI/mock/fallback；managed adapter 使用既有 `auto` 策略，不强制缺少可关联来源的 `context_http`。
- 默认绑定 `127.0.0.1:0`，从实际 socket 发布端口；显式端口占用直接失败，不接管或停止监听。ready 必须通过实际绑定和上下文 health；check 同时验证随机实例 ID、PID、项目和 snapshot。默认附加响应延迟 0ms；显式 AI gate 的 6000ms 为从请求开始计时的最短响应时间，只补不足部分，不给慢模型请求再叠加延迟，审计另记实际补足毫秒数。
- 本机 HTTP endpoint 对规划 profile 的 `service_tier: standard` 返回 400，已用脱敏布尔诊断确认；本进程 wire 边界将此上游标签转为 `default`，不更换模型/provider、不修改上游文件、不重试。随后观察到上游 8 秒规划超时；显式本地 `plannerTimeoutSeconds: 16` 后规划完成。该项允许整数 1–20，省略仍为上游 8 秒，Host 总 HTTP 超时仍为 30 秒。保留修改前全部失败 run，没有改变原问题、来源期望或覆盖规则。
- launcher 仅回收自己仍为直接父进程的 Runtime、fixture 和 Query 子进程；不按名称批量终止，不读取旧 PID 文件取得关闭权。启动前已有 fixture 则拒绝附着。普通关闭先等待助手 Runtime 正常结束，再回收所属服务。

## 2. 普通体验与正式 gate

一次性准备好 README 中明确的依赖与本地配置后，从仓库根目录执行：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh --with-query
```

用户只在两个真实窗口中添加合成客户问题、获取建议、查看审核依据、选用/编辑并填入聊天草稿，最后正常关闭助手。草稿不是发送。普通命令不需要 AX observer/controller/watchdog 等维护者控制命令。

| 验收项 | 本轮状态 | 证据与边界 |
| --- | --- | --- |
| P0 独占 Query 启动、health/context 和默认 0ms | PASS | `query-cleanup-proof.json` 为独立生命周期证据；最新普通 run `20261106-172010-65397` 的 ready/check、16 秒显式规划预算、snapshot 和实际模型审计均通过，正常关窗后端口释放 |
| 普通一行命令、真实 Query 审核/编辑/草稿、正常关窗 | 启动/真实 Query/正常关窗 PASS；完整体验未通过 | 原样普通命令 `20261106-172010-65397`，三个 verify 标志均 false、Query 0ms、端口 63977。独立维护者控制器证明真实 rag_rewrite 与 Provider matched；展开来源后只读 ref 仍失效，未完成编辑/填稿。最后对真实 AXCloseButton 执行一次 PID AXPress，launcher 退出 0、所属三子进程退出、Query 端口释放。不能将维护者控制器写成普通用户步骤或把分段证据写成完整体验通过 |
| `--verify` 原生辅助 gate | PASS · 23 项 | `20261106-163808-35976/native-results.json`：草稿独立回读、跟随/缩放、客户隔离，0 次发送，launcher 退出 0，所属子进程退出 |
| 8 条突发合并 | PASS · 两次独立实窗 | 8 个独立消息 ID 各只合并为一次动作，7467ms / 6621ms，均小于 15000ms；与下两行同 run |
| unknown-delivered | PASS · 28 项 | `20261106-164212-44431/controlled-native-results.json`：独立 oracle 确认本地已落入，结果仍 unknown；新消息、恢复、重新启用、清空草稿均不解锁、不重发 |
| unknown-not-delivered | PASS · 29 项 | `20261106-163915-37228/controlled-native-results.json`：独立 oracle 确认本地未落入；同样持续锁定。两个 run 各 5 次动作，均仅无网络 fixture |
| `--with-query --verify-ai --query-test-response-hold-ms 6000` | 整体 FAIL；16 项 PASS | `20261106-171612-61609` 已完成真实模型、来源原文审核、编辑、重查保护、版本恢复、草稿 AX 回读、已有人工稿拒绝覆盖和新消息丢弃在途结果；随后失焦，助手隐藏，等待可见超时。0 次发送；客户切换、暂停/撤权的后续在途场景未完成，不能引用部分通过作整体通过 |

正式命令见示例 README，须串行运行并分别留证。来源 section 的纯只读 ref 因 `STALE_TARGET` 失效时仅允许一次释放后重新 find，actionState 缺省或为 not_started 时适用，显式 unknown 仍停止。同一 PID/窗口/几何和 section 唯一性须前后成立；不重放任何动作。此修正没有消除普通跨 Execution 控制器中的来源读取失败，根因尚未核实。原生快照只对 `complete=false, truncated=false, reason=unmaterialized` 作最多 8 次、1200ms 内的只读物化等待，前后复验同一窗口/PID/handle/几何；不重试输入或切换 backend，其他不完整快照仍立即失败。

原生操作前使用既有 UI 协调锁。首次申请被另一 owner 持锁拒绝，期间只推进磁盘/HTTP 工作；随后原 owner 自行释放，本对话正常取得锁，没有强抢、修改注册表或发送跨对话消息，先前移交许可问题已失效。四类原生验收串行执行。本对话 UI 锁已正常释放，最终 native_ui_owner=null。

## 3. P3 四例业务结果

运行器 `examples/ai-customer-support/tests/trial-business.mjs` 调用生产 Host 的 `askAI` 和唯一 reducer，AX 观察为明确的 synthetic 输入。HTTP 请求真实发到本轮独立 Query，不能冒称这些 Node 检查是原生窗口体验。案例沿用既有 C-W-02/C-W-14 来源指纹与人工构造流程；不是新的盲测留出集、商家批准或全面评分。

最终配置的实际 `auto` run：`.runtime/tests/ai-customer-support/trial-business/2026-11-06T08-17-03.113Z-74736949/`，四例自动契约结果 1 PASS / 3 FAIL。

| 案例 | 自动契约结果 | 内容/业务结论 |
| --- | --- | --- |
| 常见咨询：更新频率改写问法 | FAIL | 规划完成，但 coverage=conflict、无锁定来源，UI 阻断；回答遗漏页面条件，不可选用 |
| 资料不足：今天实际会员成交价 | PASS 保守转人工 | 当前资料缺实际价格；后端 raw 含参考价与“未确认”说明，但无证据的 raw 不作为候选展示；没有确认真实成交价 |
| 两条未回答消息，前面有已回答旧轮次 | 载荷合并 PASS，完整覆盖/原文检查 FAIL | 仅合并两条新客户消息；规划完成并返回部分覆盖候选，来源 ID/hash 符合 000009，但 DTO 的 knowledge_answer 是生成文本，不能作为该来源原文核验；不算完整多轮记忆 |
| 人工纠正后重查/迟到响应 | reducer 保护 PASS，完整覆盖/原文检查 FAIL | 部分覆盖候选的人工稿保留，新结果需显式选用；编辑后迟到结果被丢弃；来源原文仍不可核对，此处不是实窗编辑证据 |

部署早期另作既有标准问题“APP里都有哪些类型的壁纸可以选？”控制检查，真实 `auto` 返回 `rag_rewrite`、一条有来源候选及实际 HTTP Provider 响应。已比对完整回答与 `000006` 原文的类型/风格和免费/会员区别，没有新增交易或账户承诺，证据为 `canonical-route-probe.json`。最终配置重新检查时 Provider 返回 502；Query 的 raw 原文回退没有被 adapter 冒称为真实模型成功，结果为 `PROVIDER_MISMATCH`，证据 `canonical-route-probe-final.json`。随后最终部署的原生 AI gate `20261106-164502-50598` 已完成真实 rag_rewrite、来源原文审核、编辑、重查保护和草稿回读，0 次发送；整体仍因后续在途场景超时失败。502 为保留的失败样本，不能把单次成功写成服务稳定性证明。

默认曾误用强制 `context_http`，导致四例均无可用来源。该诊断 run `2026-11-06T07-01-58.196Z-34759930` 保留，不能引用其早期宽松断言作业务通过证据。当前断言要求可回答案例必须有可选用候选和期望来源 ID/hash；另有回归禁止“全部被阻断仍通过”。

自动完整性和语义分开：Hash 只证明关联内容一致；关键词不参与事实判定。实际内容审阅另存 `business-semantic-review.json`，不修改运行器原始 `semanticStatus: NOT_TESTED`/人工复核待办。最终两例部分覆盖候选的正文与获准本地 000009 原文所述每周更新、免费/会员持续上新及页面条件相符，但服务 DTO 未关联提供该原文，因此仍不满足试用完整核对要求。来源不足继续人工核实，不降低 adapter 门禁。

当前 Host 只发送最后一条客服回复之后的最多 8 条、3800 字未回答客户消息；不发送已回答历史、session ID 或整段聊天。客服答复后再问“那它呢？”不会自动恢复历史指代；超限不发请求。无完整多轮记忆、价格/订单/退款实查或真实平台资格声明。

## 4. 验证与证据索引

本轮汇总目录：`.runtime/tests/ai-customer-support/20261106-trial-repro/`，运行产物均不进入版本控制。

- `native-provenance.json`、`native-provenance-final.json`：native 构建来源与兼容性核对，收尾时相关 native 输入仍无晚于构建的修改；各 desktop run 另有源码/产物 Hash、HEAD、实际 launch 配置与所属 PID。
- `react-unit-final.log`：最终 npm 测试 313/313（含 P0 19 项与业务 10 项）；`typecheck-final.log`：类型检查通过。`native-unit-final.log`：原生 gate 配置、输入保护、有界快照和 fixture 的离线检查 181/181。这些不是实窗成功证据。无 UI 产品源代码改版，因此没有为文档/脚本变更重建相同 React 产物。
- `business-live*.log`、`business-compatible-final.log`、`business-trial-final.log`：保留各次真实请求与失败；`planner-diagnostic-response.json` 及其部署审计定位 400；标准问题两次控制和逐例内容结论分别留存。
- `business-provider-proof.json`：最终四例按 internal/public request ID 关联到 7 条 Provider 观察记录，声明/观察数量逐例相符，响应元数据均为 `openai/gpt-6.1-sol`。流式规划由上游消费者正常提前关闭迭代器，审计保守记录 `cancelled/consumptionComplete=false`，所以 aggregate coverage 仍为 incomplete，不能声称完整流消费成功；普通回答均有成功的非流式响应 ID/模型/hash。早期只审计非流式所漏的调用已明确保留为旧 run 的证据缺口，没有回填伪造。
- `native-verify.log`、`native-verify-2.log`、`controlled-not-delivered.log`、`native-ai-additive-hold-failed.log`、`native-ai-source-calibration-failed.log`、`native-ai-startup-focus-failed.log`：保留此前失败停止证据。对应 launcher-cleanup 均表明所属子进程已退出，未把失败动作盲目重放。先前附加 6 秒测试延迟与约 26 秒模型耗时共同超过 30 秒，现已修为最短响应时间；来源只读失效与启动失焦另行分类。
- 新通过的 `20261106-163808-35976/02-draft-verified.png` 及两种 unknown 的 `controlled-unknown-locked.png` 均已视觉查看：约 380px 助手、六页导航、锁定提示与按钮对齐正常，无异常拉宽、裁切或错位；fixture 中聊天历史区域的既有留白未改版。AI 原文/编辑另看其对应实窗证据。
- `20261106-171612-61609/02-ai-edited-draft-verified.png` 已视觉查看：人工编辑保留在版本 1、版本 2 待选，左侧原生草稿与编辑稿相同，状态明确未发送；布局、换行和固定页脚正常。`20261106-172010-65397/ordinary-source-visible-before-close.png` 只证明普通实窗中候选和空草稿可见，不证明来源原文审核或编辑；文件名不能替代实际画面结论。
- `ordinary-final.log` 对应首次普通运行 `20261106-171032-58551`：后台 UI 工具未能使聊天成为实际前台，最后由维护者 SIGINT 清理，不算正常关窗。`ordinary-native-final.log` 对应后一次普通运行；其 `ordinary-native-results.json` 与 resume 结果保留 FAIL，`ordinary-close-native-results.json` 单独 PASS。临时控制器及各版本执行快照只在 `.runtime`，其中早期两处输入前的脚本错误已修正并保留日志，没有重发或重放未知动作。
- `query-process-state.json`、`final-resource-state.json`：各服务 PID 与端口复查；前四次独立服务有正常关闭记录。最终业务服务后来已退出且端口释放，退出原因未核实、没有 cleanup 文件，不能写成正常关闭。之后用最终代码另起独占 `query-cleanup-final`，完成 health/check/SIGINT/退出 0/端口释放，证据 `query-cleanup-proof.json`；普通 GUI 标题栏关窗已在后续 `20261106-172010-65397` 单独证明。

## 5. 未完成与后续边界

本轮交付层次：代码已修改；最终部署和当前 preview 已实际加载；新辅助 gate、两种 unknown 和 AI 编辑草稿的实窗截图已视觉确认；功能通过范围以上表为准。普通命令的真实查询与正常关窗清理已证明，完整编辑体验和 AI gate 整体尚未通过。

后续按优先级补齐：先定位普通流程来源 ref 的跨 Execution 校准失效，在不弱化身份/前台/草稿保护的前提下完成原命令完整交互；再在稳定且独占的前台环境跑完 AI gate 的客户切换、暂停和撤权在途场景。此前失焦不代表 Query 失败，也不能把“安全停止”算成场景通过。不需要重跑已通过的 P2，除非后续代码修改影响其行为。

三例业务完整验收仍失败：需在现有 Query 上游修复来源冲突/覆盖及原文关联后用原问题重验，不改期望来源或缩小问题掩盖失败。本轮已解决本地传输参数与规划时间兼容，未改上游核心、不建立第二知识后端。微信登录、探针、草稿、双机和发送，以及真实商家/客户投产审核继续延期。

收尾只读核对本轮 9 个原生 run 的 launcher、Runtime、fixture、UI host、Query PID 均不存在且端口关闭；安装版 PID 50465/50486 仍为原路径进程。最初观察的 Native browser host PID 56102 已不存在，退出原因未知，本任务未对其发停止信号。独立 Query 服务另在 `final-resource-state.json` 核对。本轮未新增依赖、未改模型/provider/认证、未改系统浏览器或既有扩展配对，未操作微信、真实联系人或生产发送。
