# AI 客服 R3.0-C：编辑、来源审核和安全验收

本轮从 `master` 的 `d0a2e0ae3e1d3f2bf7529509a1f266cf30499d70` 继续开发。本任务未创建分支、worktree，未提交或推送。期间并行壁纸质量任务提交六个独立文件，HEAD 前进至 `09470cfc245403a9ef5e3d48cbda49761ddf8fc9`；本轮产品改动仍未提交，没有重置或改写该提交。并行 App Mode、Runtime、签名及其他修改保留。证据默认相对于 `.runtime/tests/ai-customer-support/r30c-20261030/`；日志、截图和响应不进入版本控制。

本记录区分代码、实际加载、视觉和功能证据。合成质量评测另见 [R3.0-C 质量基线](ai-customer-support-r30c-quality.md)，不把合成测试知识或模型文本解释为商家业务批准。

## G1：重新查询与人工稿

`state.tsx` 保留当前选中版本、人工修改和各版本原始 Query 结果。再次查询不会清稿；新答案追加为待选版本，只有点击对应版本才改变选择。返回失败、被阻断、取消或人工接管均保留旧稿。首次查询沿用原先的初始选择行为。

打开编辑器或修改文字同步发送 `support.aiCancel`；在途 HTTP 可以结束，但旧请求不得继续受保护读取、发布或填入。原有 textarea 的 ref/key 原生缓冲和显式提交路径保留，没有用合成 input/blur 修复。

暂停和恢复会改变请求授权 generation；人工稿按 PID、窗口、客户和消息身份保留。请求和回执仍验证完整 generation。换客户、窗口、进程、消息或同 ID 不同正文会清除当前版本及人工修改，不能把旧稿迁移到新客户。

红绿证据：`g1-red.log` / `g1-green.log`、`race-pause-red.log` / `race-pause-green.log`。后者包含原生 generation 变化、旧结果拒绝和正文变化的回归。

## G2：来源与适用性

选中版本的“审核依据”来自该版本自己的结果；不会用最新查询的来源装饰旧人工稿。展示项目、请求、条目、文档、原文及内容 Hash。原文只在服务返回一个锁定来源，且 `matched_id` / `source_answer_hash` 与该来源完全一致时附加；多来源汇总、错 ID、错 Hash 或超长原文不冒充逐条出处。

实测旧 Query 合同提供 `knowledge_answer`、`canonical_question`、`retrieval_index_manifest.primary_sources.faq` 和 `coverage.locked_hits`，没有版本、生效日期、适用条件或逐句引用接口。本轮不发明新端点和字段。UI 明示“服务未提供，待核实”，区分 Hash 指纹和业务版本；服务声明的原文关联也未冒称独立内容校验。

主张比对仅标注原文中逐字出现的文本；改写、增补和人工编辑中的其他主张保持待核实。文字相同仍不等于适用当前业务。知识页本地导入不会更新远程 Query 项目。原有 locked_hits、coverage、请求和项目门禁保持，一条实际回答只生成一个候选，不拆成三条或扩展七策略。

静态证据：`tests/source-review.test.mjs` 检查单来源关联、桥接有界解析和文字匹配边界。真实窗口来源证据见下面运行表。

## G4：异步授权与原生验证

复审发现初版在排队入口及 `freshTarget()` 等待期间取消后仍可能开始 AX 读取，另有暂停 generation 丢稿问题。先添加失败回归，再修复。进一步检查填入路径，在排队、窗口查询、find、read、最终动作前及读回前检查捕获的授权代次；只释放旧 ref 进行清理，不自动重放未知动作。

`fill-race-red.log` / `fill-race-green.log` 保留填入取消竞态的红绿结果。最终复审还补齐前台检查失败立即停止读取、读回写盘后及发布后重新检查授权。`final-authority-red.log` 中六项新增回归失败，修复后 `final-authority-green.log` 的 reducer / Host VM 合计 **87/87**。独立只读复审确认原先 P1 均解决，无剩余 P0/P1。VM 使用模拟窗口与响应，不计作真实模型或桌面结果。

原生 AX 的最后 read 与 setValue 不构成原子事务；API 没有 CAS 或硬取消契约。本实现尽量缩小间隙、在每个异步边界重新验证，但不宣称能排除最后一读与系统写入之间的外部并发输入。未知结果暂停且不重试。

| 验证 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| 工作区单测 | PASS，132/132 | `unit-final.log`，包含保留的并行测试 |
| TypeScript | PASS | `typecheck-final.log` |
| 正式 React 构建 | PASS | `build-final.log`；唯一 `preview/index.html`，未手改 HTML |
| 核心浏览器 | PASS，14/14 | `browser-final.log`；实际安装的 Mac Chrome headless |
| AI Bridge 浏览器 | PASS，8/8 | `ai-browser-final.log`；桩响应，不是真实 Query 或原生回执 |
| 原生离线命令 | PASS，23/23 | `native-offline-exclusive-final.log`；最终安全修复后的完整重验 |
| 真实 Query + 原生 | PASS，21/21 | `native-ai-exclusive-final.log`；同请求模型、来源、编辑、待选版本、独立草稿回读，sendActions=0 |
| 真实模型无证据承诺探针 | 实调返回澄清、无承诺 | `quality/v2/no-evidence-promise-probe.json`；约束输出结构的隔离模型探针。危险承诺门禁回放采用合成输入，不能称为实际模型危险输出 |

最终真实运行是 `r23/runs/20261030-030508-61868`；离线运行是 `r23/runs/20261030-030700-65311`。两者加载的 `native-demo.js` SHA256 均为 `9b313dee56f55d556df668dfc7c6948473a65dfbcf85fe67f1063623631bd5b3`。

`native-chain-index.json` 关联真实请求 `ai-1793300719792-1`、项目 `bizhi-app`、generation2 / PID61903 / window180249 / t1 / t1-m1、Query 原始响应、来源、原生编辑器读回和新 AX 草稿快照。模型审计中该 HTTP 时间区间内唯一 provider 请求返回 `chatcmpl-a88adce8030946ab8633e184`；这是一条有时间范围的关联证据，不冒称 Query 提供共同 provider trace ID。实际模型为 `openai/gpt-6.1-sol`，既有10100路由。完整 Query 响应另存 `native-primary-query-response.json`。

| 交付状态 | 证据 |
| --- | --- |
| 代码已修改 | G1/G2/G4 的源码、针对性测试及最终源码 Hash |
| 实际已加载 | launcher 的 launch、artifact/source Hash，真实 AX 和 React render 日志 |
| 视觉已确认 | `visual-verdict.json`；真实运行的 `01a-source-review-expanded.png`、`01c-human-edit-and-pending-version.png`、`02-ai-edited-draft-verified.png` |
| 功能已验证 | 原生21/21与离线23/23；新旧版本明确选用、人工编辑、重新查询、暂停恢复、拒绝覆盖、在途失效、独立读回和零发送 |

窗口保持约380px和六 Tab，版本“当前选中／待选”清晰，文字换行及页脚对齐正常。长列表在内容区滚动，固定页脚不拉伸窗口。来源元数据有真实截图；完整原文位于初始视口下方，以作用域限定的 AX value 保存证明可读，不把未出现在截图里的全文称为视觉确认。

## 运行与失败记录

所有启动命令的工作目录均为仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。

离线正式命令：`./examples/ai-customer-support/scripts/run-desktop.sh --verify`。

真实 Query 正式命令：`OPENDESK_SUPPORT_QUERY_PORT=18082 OPENDESK_SUPPORT_PROJECT_ID=bizhi-app OPENDESK_SUPPORT_QUERY_PROVIDER=auto ./examples/ai-customer-support/scripts/run-desktop.sh --verify-ai`。

该命令是维护者自动验收，会操作自有测试聊天的实际控件；普通体验沿用不带 verify 参数的启动命令。没有连接微信、真实客户、订单或发送接口。

早期失败保留：`native-ai.log` 的前台身份丢失使旧响应被丢弃；`native-ai-retry.log` 因 ENOSPC 中断；`native-ai-final.log` / `native-ai-restored.log` 记录既有 18082 服务退出后的安全降级。首次恢复误用未安装 yaml 的系统 Python，失败日志保留；随后复用原缓存 venv 和原启动脚本，健康检查200，再运行原生验收。没有修改全局模型、账号、代理、10100 服务或上游源码。18082 仍是原隔离 bizhi-app 项目，非生产服务。

`native-ai-live.log` 已证明真实模型生成和推荐实窗加载，来源断言初次只读 AX name 而漏取正文 value，验收未因此强判通过。后续保存展开截图和 AX value 后重新核对。

`native-ai-scoped-source.log` 遇到真实生成耗时12.34秒超过旧12秒限制；HTTP 改为有界30秒，正式等待35秒，无自动重试。版本 badge 改变列表几何后，旧测试点落到页脚下；随后错误使用未声明的 checkbox invoke 也如实失败。最终门禁按实际 AX actions 使用 button invoke / checkbox setChecked，仍操作真实窗口，不注入 React 状态。多次失去前台及一次 `BACKEND_FAILED` 均保留失败记录；用户随后确认刚才在手动使用桌面。独占时重跑完整命令通过，未放宽身份或前台门禁，未结束无关进程。

## 交付边界

继续复用现有 `state.tsx`、Native Adapter、Query Adapter 和真实测试聊天；没有重建业务后端。保留六 Tab、约380px窗口与唯一 React 预览。原生依赖没有由本轮修改，沿用固定签名兼容宿主，实际路径和 Hash 由每次 launcher 的 `artifact-sha256.txt` / `source-sha256.txt` 记录；不宣称新 clean build。

业务知识批准、持久化、Context 扩展、产品图片、原生 AX/CPU、App Mode 迁移、真实微信/发送、全策略和压力/缩放矩阵继续延期。缺失的业务适用元数据保持待核实；合成质量通过也不授权生产发送。

停止钩子复核时，`state.tsx` 已由并行业务数据任务继续扩展；随后并行任务又重建了预览。本记录中的21/21及视觉结论对应上述明确Hash的已测版本，不外推到这些后续源码和新构建。停止复核时的合并源码重新通过87项定向测试和TypeScript，质量测试重新通过24项；证据为 `post-stop-targeted.log`、`post-stop-typecheck.log`、`quality/post-stop-tests.log`。本任务保留并行改动，未为消除Hash差异覆盖其源码或构建物；当前与已测版本的Hash差异另存 `post-stop-audit.json`。Ralph残留状态按本会话scope终结，Native Goal仍为complete。
