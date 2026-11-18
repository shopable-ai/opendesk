# Codex Workflow Companion — 2026-11-10 Mac 验收记录

**最终结论：BLOCKED，尚未完成官方 Codex 桌面 A→B→C。** 本轮已运行本地服务、正式 React 页面、OpenDesk 真实原生窗口和官方内嵌 Codex MCP 客户端，并修复实际发现的缺陷。模拟闭环、协议调用和组件测试均不作为真实桌面执行证明。

所有下列运行文件均位于仓库根目录下的 `.runtime/tests/codex-workflow-companion/mac-acceptance/`，只保留本地，不提交运行状态、截图、配置备份或凭据。记录时间为 2026-11-10，Asia/Shanghai。

## 本次续接：当前结论及新证据

本节为本次续接的最新记录；后续章节保留上一轮观察，旧 PID、端口、86项测试及评分不能替代本节。**真实官方桌面 A→B→C 仍为 BLOCKED；未提交、未推送。** 本次证据位于上述根目录的 `continuation-20261110/`。

| 项目 | 状态 | 本次实测 |
| --- | --- | --- |
| Git 范围 | PASS | 重新 fetch 后仍为 master；HEAD `975f7f111c6ffe6b18002c08574b762eb1aa06c1`，origin/master `9192ad2a9e5d197b4373c2ad5745058e2ce126f4`。保留其他任务的未提交修改，无分支/worktree/暂存/提交/推送操作 |
| 当前官方 Codex 对话的 MCP | PASS（当前对话、只读） | 原生工具 `opendesk-cwf.workflow_status` 成功，直接读取配置中的 browser Owner；并在该 Owner 端口/凭据轮换后再次成功。`current-chat-mcp-status.json`、`current-chat-mcp-after-restart.json`；没有冒充任务领取或真实 Hook |
| 官方 Hook 信任 | BLOCKED | 当前官方内嵌 CLI `0.167.0-alpha.3.2` 的只读 `hooks/list` 仍显示 UserPromptSubmit/Stop 为 enabled=true、untrusted。`hooks-current.json`；诊断子进程已退出，无模型 turn、无信任写入 |
| 官方 Codex 桌面控制 | BLOCKED | 本次对 `/Applications/ChatGPT.app` 实测仍明确返回 `Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.`。`computer-use-access.json`；未换其他技术控制 Codex，未发送 A/B/C |
| 新代码 typecheck / 正式 React build / 回归 | PASS | `typecheck-final.log`、`build-final.log`、`test-final.log`：100/100，0 fail、0 skip。前一次96项日志是最后一处响应丢失修复前的中间证据 |
| 暂停 Owner 加载本轮 engine/adapters | PASS | 验证 PID/命令/HTTP/磁盘后，仅正常终止旧 browser PID96399，等待其自行释放锁，再以相同 stateDir 启动 PID26502。URL轮换为 `http://127.0.0.1:62251`；磁盘字节、workflow、attempt、revision10均保持。`owner-reload-before.json`、`owner-reload-after.json`、`owner-current.log` |
| 本轮 native wrapper 普通入口、实窗及刷新 | PASS（展示历史模拟状态） | 从根目录执行下方原生命令；最终 host PID28215、window221859，实际加载当前外部 `native-window.js` 与正式页面。`native-final.log`、`native-window-final-check.json`；通过 CUA 实看并点击“刷新状态”，截图保留在本 Codex 对话中，无另存PNG |
| 本轮 native 桥故障、响应丢失及交错刷新 | PASS（VM） | 实际 wrapper 源码13项故障/交错回归；`native-window-before.log`→`native-window-after.log`、`native-window-p2-before.log`→`native-window-p2-after.log`。故障注入路径不是实窗故障运行 |
| 桌面任务及执行中退出/恢复 | NOT_TESTED | A依旧为暂停的草稿准备，session/turn=null、claimed=false、stopObserved=false，B/C attempts=0。未取得真实任务 Hook、业务 MCP、审核及自动发送证据 |
| 托管完整闭环、全仓构建/CI/发行 | NOT_TESTED | 未重复无变化的旧模型探针，未扩展到无关模块 |

本次没有改模型/provider/认证、Hook定义或信任记录。官方网页检索工具不可用，文档直连超时/403，局域网代理连接被拒绝，见 `official-docs-retrieval.json`；未据此新增官方行为断言。当前 Hook 状态以实际安装版本的只读回执为准。

本次按实际缺陷最小修复：

| 复现与原因 | 修复 | 证据 |
| --- | --- | --- |
| 提交后重试原 progress/submit，阶段检查先于去重，误报失败；重启后同样失败 | 在存储健康、身份/version/nonce校验后先只读检查重复；新事件仍先通过阶段检查才入账，冲突仍拒绝 | 新增 `event-idempotency.test.mjs`；`idempotency-before.tap` 2 fail→`idempotency-after.tap` 2 pass，内存/磁盘不变、B不启动 |
| native 命令发布后同步启动异常没有不确定标记，Owner可将其归为blocked | 异常携带 dispatchPossiblySent=true，保留unknown及停止回执要求 | `native-spawn-before.tap`→`native-spawn-after.tap` 6 pass；fake child，无桌面输入 |
| HTTP已接受操作，但成功通知桥失败会误报拒绝 | 将接受结果与展示错误分开，记录已接受、禁止重放，仍刷新状态 | wrapper VM回归 |
| 多个刷新并发可将旧状态投递到新状态之后 | 串行并合并刷新；Owner端口或凭据变化后丢弃旧响应并重新读取 | wrapper VM回归，包含慢桥及只轮换凭据 |
| POST已应用但响应丢失时误报拒绝 | 模糊结果显示UNKNOWN_NO_REPLAY，警示勿重复，只GET刷新；仅明确ok=false响应报拒绝 | wrapper VM回归，包含故障诊断桥也失败的情形 |

**仍未解决的恢复限制：** native停止回执由Owner的child-close回调发布。Owner先退出、随后child才退出时，可能永久缺少该回执；当前实现安全停止但没有独立的恢复证明/监督通道，不允许仅靠“未发送”声明重发。不能把这个限制计作可恢复性通过，也不能在缺少真实桌面证据时达到最终交付标准。

**证据分层：** 代码已修改；新browser Owner已加载本轮engine/adapters；新原生窗口已加载最终wrapper/页面；视觉已确认普通展示与刷新。native-ui Owner PID96525保持原样，revision77仍是上轮模拟结果，本次未重新完成A/B/C；它不证明本轮engine的实窗业务回归。页面SHA256仍为 `fe33e3c15ee9bc0300238281fd3758a986473ab4ba07da55e2a8a9d76627a16e`。稳定开发主程序与UI host的 `OpenDesk Local Development` 签名及包完整性已核对；没有重建native core。

当前服务入口（端口/PID为本次观察，续接时重查）：

- browser：PID26502，[React准备页面](http://127.0.0.1:62251/)，paused=true、revision10；当前官方Codex对话的MCP连接到它。
- native-ui：PID96525，[历史模拟页面](http://127.0.0.1:64679/)，revision77；最终原生窗口保持打开查看。没有把模拟状态接到正式任务。
- 官方Codex仍为 `/Applications/ChatGPT.app`，26.1103.60933 (25894)；操作它的限制保持有效。本次未创建ego TaskSpace或改动其他任务服务。

以下普通原生入口已从仓库根目录原样运行，只显示历史模拟Owner：

```sh
OD_CWF_STATE_DIR="$PWD/.runtime/tests/codex-workflow-companion/mac-acceptance/native-ui" ./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
```

已运行的正式检查为 `npm --prefix examples/codex-workflow-companion run typecheck`、`npm --prefix examples/codex-workflow-companion run build`、`npm --prefix examples/codex-workflow-companion test`。UI外观未重新设计；100项测试不能替代官方桌面闭环。

经架构、集成、可靠性、安全、测试及独立反方复核，本次工程暂评分为：设计合理性90、架构复用94、代码质量90、接口契约88、状态可靠性86、可测试性91，**均值89.83**。扣分主要为真实Hook/自动派发缺证、Owner退出后的恢复限制及VM与真实故障证据的差距；未达到95，不作为最终认证。复核摘要见 `review-summary.json`。

后续仍需在允许控制官方Codex的环境，正式审阅Hook、取得真实选择器证据并完成原始人工A→审核→自动B→审核→自动C闭环，以及真实暂停、防重和退出恢复。禁止绕过当前拒绝、伪造信任或将新的模拟结果改写为PASS；未达到提交条件，继续保留当前改动。

---

以下为续接前的上一轮记录，历史入口与证据不自动延续为本轮通过。

## 仓库与环境

- 分支始终为 `master`；开始及交付前 HEAD 均为 `975f7f111c6ffe6b18002c08574b762eb1aa06c1`。
- 两次 fetch 核对的 `origin/master` 为 `9192ad2a9e5d197b4373c2ad5745058e2ce126f4`。开始时比较此提交与 HEAD，companion 和对应测试没有新增差异，未重复开发前阶段实现。
- 仓库有大量其他任务未提交修改。仅修改本项目与 `tests/codex-workflow-companion/`；没有清理 `.runtime`、切换分支、覆盖旧 Demo 或其他服务、重置 Hook、提交或推送。
- 官方 Codex：`/Applications/ChatGPT.app`，bundle `com.openai.codex`，版本 `26.1103.60933 (25894)`。官方内嵌 CLI `0.167.0-alpha.3.2`，区别于 PATH 中旧版 CLI。
- OpenDesk 固定入口 `./dist/opendesk` 指向 `dist/OpenDesk.app/Contents/MacOS/opendesk`，签名 `OpenDesk Local Development`；主程序/UI host 为 2026-11-06 构建，VCS `f42d26c246fc7c57a03a664d6b3b49e59e23aa48`，dirty。仅修改外部 JS/React，实际验证了现有宿主所用 TrustedWindow、HTTP、File、Command 合同兼容；没有更新 native core 或重打包发行物。
- 正式页面来自 `scripts/build.mjs`，真实原生窗口加载的 `preview/index.html` SHA-256 为 `fe33e3c15ee9bc0300238281fd3758a986473ab4ba07da55e2a8a9d76627a16e`；host PID `96689`、window ID `221251`。这些 PID 是本轮观察，续接时须重查。

## 实际验收结果

| 项目 | 状态 | 本轮证据及边界 |
| --- | --- | --- |
| T1 npm install | PASS | 根目录原样执行；`npm-install.log` |
| T1 typecheck / 正式 build | PASS | `typecheck-final.log`、`build-final.log`；无静态 Mock |
| T1 回归 | PASS | 最新 `test-final.log`：86/86，0 fail、0 skip |
| T1 正式浏览器页面 | PASS | ego TaskSpace 59：真实 Owner 页面，启动/暂停/恢复，最终 revision 10 已暂停；`browser-paused-final.png` |
| T2 官方 MCP tools/list 与五工具调用 | PASS（协议层） | `codex-mcp-catalog-final.json`、`codex-mcp-client-result-final.json`；官方内嵌 app-server 的真实 MCP 客户端调用，全为 isError=false；使用明确标注的 synthetic Hook、ephemeral thread，无模型 turn、无桌面执行 |
| T2 Hook 配置合并 | PASS（配置层） | `config-merge-verification.json`：原有 MCP/Hook 配置语义保持；新配置使用同一 browser stateDir；备份权限受限 |
| T2 官方真实 UserPromptSubmit / Stop | BLOCKED | 官方 hooks/list 显示两个新增 Hook 均 enabled=true、trustStatus=untrusted；未篡改信任记录。未取得真实会话/turn 回执 |
| T2 身份、nonce、重复及 Stop 门禁 | PASS（组件层） | Hook 安全矩阵、现有 HTTP/Python/stdio 测试与 `reliability/probe-fixed.json`；不是官方桌面 Hook 证据 |
| T3 官方桌面 A→B→C 自动创建并发送 | BLOCKED | 本会话 Computer Use 明确拒绝 `com.openai.codex`：`Computer Use is not allowed to use the app ... for safety reasons`，见 `environment.json`；没有用其他控制通道绕过，未向 Codex 发送 A/B/C |
| T4 持久化、并发、重复、错误恢复 | PASS（组件/真实文件系统） | 保留 21 项原回归并补齐新用例；真实 HTTP 故障探针、实际写盘重载、相同 stdio MCP 进程跨 Owner 端口/凭据轮换，无未知 mutator 重放 |
| T4 真正执行中的桌面 Codex 崩溃/恢复 | NOT_TESTED | 没有真实桌面业务执行，不能从组件注入或托管探针外推为 Mac live 通过 |
| T5 TrustedWindow 状态与操作 | PASS（真实窗口、模拟业务） | 同一 Owner 收到暂停、恢复、审核、重试；`native-ui-final.log`、`native-ui-result.json`、`native-error-retry.png`、`native-simulation-complete.png` |
| T5 窗口服务重连 | PASS | 先复现旧端口连接失败/回调使窗口退出，再修复；同一窗口服务离线后重新读 endpoint 恢复，`native-window.log`、`native-window-fixed.log` |
| T5 超长历史与视觉 | PASS | 40 条500字中文进度：原消息65,943字节→投影2,981字节，实际窗口显示39%、revision65；`native-ui/long-history-receipt.json`。截图检查700×600点窗口正常滚动、换行和对齐，无异常拉宽/空白/裁切 |
| 独立 App Server 适配器真实模型执行 | PASS（独立托管） | `hosted-live-result.json`：官方内嵌CLI经现有 `appServerTurn` 完成 initialize→thread/start→turn/start→turn/completed，准确输出 `OD_CWF_HOSTED_CHECK`，未授予额外授权，子进程已退出；没有声称线程显示在桌面 |
| App Server 托管模式完整 Hook/MCP/人工审核闭环 | NOT_TESTED | 上述单次模型探针不带Companion身份、不绑定任务；不替代正式桌面目标或完整托管工作流验收 |
| 全仓构建、CI、发行包签名验收 | NOT_TESTED | 本轮只构建 companion 正式前端，未扩展到其他任务的仓库改动 |
| T6 最小修复/回归/记录 | PASS | 见下表。没有宣称最终集成验收成功 |

当前没有未修复的已复现测试失败；历史 FAIL 日志保留为修复前证据，不计为最终 PASS。已审范围未发现未解决的 P0/P1；真实桌面尚未运行，不能据此保证不存在现场缺陷。

## 发现、定位、修复及回归

| 发现问题 / 原因 | 最小修复 | 针对性证据与回归 |
| --- | --- | --- |
| unknown 派发可被 resume/approve 绕过，B 未对账时可能放行 C | 先对账再恢复/审核；两条入口分别验证 | `reliability.test.mjs`、修复前/后 TAP；C attempts 保持0 |
| not_sent 可丢弃已绑定/报错的尝试并重试 | 拒绝与 session/claim/result/Stop/error/thread 冲突的未发送声明 | 同上；真实磁盘 B 错误重载后仍不可放行 C |
| 保存失败留下内存 reservation，后续只读 status 可触发外部派发 | owner poison、回滚最后已知展示、停止所有变更；status不派发；不把保存失败改写成另一次派发结果 | `reliability/probe-fixed.json`：真实 rename 失败，后续 mutation HTTP400，fake sends=0；前/后 rename seam 及实际重载用例 |
| native 子进程延迟可读到被新尝试覆盖的共享命令；未知子进程未退出就能重试 | 不可覆盖的 attempt 命令和显式环境身份；close 后发布私有且绑定命令哈希的回执；缺回执即阻止重发 | `native-dispatch.test.mjs` 6项，fake child/VM、无真实桌面输入 |
| Hook cwd 为空/相对路径会被误当作仓库当前目录 | 要求非空绝对路径并核对仓库范围；严格会话/turn/最终Stop字段，限量诊断且不泄露身份凭据 | `hooks-security.test.mjs` 41项；保留 advisory continue=true |
| Owner 重启后 native/MCP 缓存旧 endpoint | 每次调用重新加载，MCP严格校验私有文件及loopback，禁止redirect/自动重放 | 同一原生窗口实测；`mcp-reconnect.test.mjs` 4项真实stdio/HTTP，`mcp-reconnect.tap` |
| 合法长历史写出大于读取上限的文件，重启失败 | 读写统一1 MiB UTF-8容量，写前拒绝，保留旧安全文件和dedup；不静默裁剪 | `store-capacity.test.mjs` 4项真实写盘重载，`store-capacity-before.tap`→`store-capacity-after.tap` |
| 长历史超过 TrustedWindow 64 KiB；桥故障被误判Owner离线 | UI只投影最近12条事件标题，60,000字节预算；桥错误单独记录，notice失败不掩盖日志 | `ui-state.test.mjs` 2项；真实长历史窗口；`native-window.test.mjs` 双重桥故障VM用例 |
| 审核依据预填、跨任务沿用；错误重试无可编辑证据输入 | 每attempt清空审核/对账字段，要求填写；新增已有重试动作的依据输入；错误/未知禁止审核 | 真实原生窗口 B错误→审核重试→B审核→C独立审核，`native-ui-final.log` |

最后一处“先记录桥错误、再尽力发 notice”的补丁在上述真实窗口截图之后加入；该异常路径通过实际 wrapper 源码 VM 故障注入验证，没有将它写成再次实窗运行通过。React 正式产物与截图的加载哈希一致。

## 真实窗口结果与证据分层

- **代码已修改：** core、adapters、Hook/MCP、native wrapper 与最小 React 控件；无 native core/API改动，无新依赖。新增 lockfile 固定现有 npm依赖解析。
- **实际已加载：** 正式 browser HTML；原生可信内容哈希和 host/window 来自 `panel.getState()`。窗口重连及各操作都到达实际运行的 Owner。
- **视觉已确认：** `native-review-paused.png`、`native-error-retry.png`、`native-simulation-complete.png`；本轮只做功能必要调整，没有重新设计UI。
- **功能已验证：** synthetic UI workflow 最终 revision77、active=null，A/B/C accepted，attempts=1/2/1（B因有意注入错误后人工重试而为2）；与真实 Codex 准备状态严格分开。
- **真实桌面准备状态：** `desktop-preparation-final.json`：revision10、paused=true、A=draft、无session/claim/Stop，attempts=1/0/0。没有把准备草稿标为执行成功。
- 本轮 ego Space已释放；原生模拟结果窗口与两个自己启动的 Owner 保留用于查看。启动前先查owner.lock/PID，不要创建第二个Owner。PID、端口须现场重查。

## 下一步：完成原始目标的剩余条件

1. 在允许控制官方 Codex 的环境继续本轮目标；保持原生发送前的窗口身份、前台、空输入框、唯一新对话标识及准确提示词预检。本会话明确拒绝的控制不改走其他通道绕过。
2. 在官方UI审阅并信任新Hook、重新加载MCP，确认运行中的桌面连接同一个Owner。配置已写入不代表运行中桌面已加载。
3. 人工发送 A，从真实 UserPromptSubmit取得同attempt/session/turn；用MCP claim/progress/submit，等待真实最终Stop并检查业务结果，人工审核A。
4. 完成真实选择器/profile预检后，只发送一次B；独立核对Hook和桌面回读。未知发送结果保持暂停，不重试点击。B通过后同样执行C。
5. 补齐真实执行中退出/重启、native未知发送人工对账，以及B异常不能放行C的live证据；独立App Server适配器已完成单turn模型实测，完整托管Hook/MCP/审核闭环仍未测，不能替代桌面验收。
6. 真实闭环和上述验收通过后再按Lore规范提交并安全推送现有master；先重新核对并发修改/远端，不强推。本轮未满足该提交前提，未提交也未推送。

## 多专家复核与评分

架构/身份审查、官方Codex合同研究、测试工程与native适配器审查并行进行，最后由独立反方审计复核修复、日志与截图。以下评分基于本地可信demo范围，不是生产安全或真实桌面验收认证。

| 用户指定维度 | /100 | 主要扣分依据 |
| --- | ---: | --- |
| 设计合理性 | 92 | 桌面继续执行与发送回读未实证 |
| 架构复用 | 94 | 保留单Owner/既有Runtime/Hook传输/React构建；live复用边界仍待确认 |
| 代码质量 | 90 | 修复有针对性；独立托管子进程监督及容量运维仍为Demo范围 |
| 接口契约 | 89 | 正式API/官方MCP有证据；真实Hook信任及原生选择器尚未验证 |
| 状态可靠性 | 90 | 磁盘/并发/未知结果保护已测；真实运行退出及断电未测 |
| 可测试性 | 90 | 86项测试及实窗证据；关键桌面e2e、CI缺失 |
| **算术平均** | **90.83** | (92+94+90+89+90+90)/6；未达到95 |

## 当前使用入口

以下命令均从仓库根目录执行。当前已保留一个暂停的 `browser` Owner；先确认其PID及输出URL，仍运行时直接访问该URL，不要再执行同目录启动命令。服务停止后可用同一stateDir恢复，已有任务不会重置：

```sh
OD_CWF_STATE_DIR="$PWD/.runtime/tests/codex-workflow-companion/mac-acceptance/browser" OD_CWF_MODE=deeplink OD_CWF_REVIEW=manual node examples/codex-workflow-companion/server.mjs
```

浏览器打开实际 `CWF_READY` 的URL；端口不固定。原生窗口使用同一个目录：

```sh
OD_CWF_STATE_DIR="$PWD/.runtime/tests/codex-workflow-companion/mac-acceptance/browser" ./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
```

当前 `~/.codex/config.toml` 的 `opendesk-cwf` 和新增Hook均指向上述 `browser` stateDir；具体MCP格式、Hook合并/信任步骤见 README。默认启动是simulate；`deeplink`只准备草稿，不自动发送。`native` profile尚未现场确认，不得把切换环境变量当作验收完成。
