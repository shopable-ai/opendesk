# AI 客服助手 R3.0-B：Mac 验收记录（2026-10-30）

结论：**PARTIAL，R3.0-B 尚未达到真实 AI 闭环完成标准；暂不进入 R3.0-C。**

当前已在真实 Mac 独立测试聊天读取客户消息，并完成安全人工核实文案的草稿写入、新 Accessibility 快照回读和零发送检查。尚未证明真实 Query API 模型回答进入 React 后，再经人工编辑写入原生草稿。HTTP、协议桩、模型生成和原生草稿四层证据不能合并成一次成功链路。

## 1. 基线与归属

- 起始 master HEAD：`c65848c246c516d111b8cd12b947f33a6cbc70a7`。
- 启动时本地与 origin/master 分叉；远端已包含 R3.0-A 的 `679752a9`、`f7c2ae44`、`535cd48b`。核实指定 Actions run `40902286696` 的 job `123547530449` 为 success。
- 在 master 合并现有基线，保留本地安全工作：`f084960ee7e527fd1fd01aeb0b25feefec579e6f`。未创建分支、Git worktree 或 PR。
- 本轮修复提交及最终 HEAD 记录于交付消息与本地 `.runtime/tests/ai-customer-support/r30b/delivery.json`，避免在版本化文档中自引用提交 Hash。
- 原有 Adapter、AI 类型、六个页面、状态和独立聊天仍在；没有重新实现 RAG、React、100 题或原生 Runtime。
- 初始脏状态和补丁分别保存在 `initial-status.txt`、`initial-tracked.patch`。原有 App Mode、Runtime、签名等改动保留。处理基线冲突所用定向 stash 仍保留为恢复副本。
- 本轮提交的 HTML 来自 HEAD 正式 React 源码加本轮状态修复的隔离普通构建目录；该目录仅为忽略的构建 staging，不是 Git worktree。未手改 HTML，也未把其他任务 App Mode 源码或其生成变化混入提交。

下文的简写证据文件均位于 `.runtime/tests/ai-customer-support/r30b/`；运行日志、截图、配置及探针不入版本控制。

## 2. 真实 Query API：版本区分是关键

旧仓库保持只读，未修改源码、切分支或提交。

| 对象 | 本轮实际证据 | 结论 |
| --- | --- | --- |
| 本机旧库 HEAD | `53c2e2fc17e098aff980e5c938d16ad8c46c6c7d`，仅原有 .shopme 文件为脏 | 过期实现，不能代表远端当前协议 |
| 旧库远端 main | `878c61904d94ada0bfe37c283973c527735396ad`，SSH ls-remote 与 GitHub 固定 ref 源码核对 | 新版有 auto、响应信封、coverage 和调用计数；仅源码证据，未启动 |
| 真实本机进程 | 使用旧库 Python server.py、127.0.0.1:18082、隔离公开最小 fixture | 受控真实 HTTP 协议测试，不是真实 AI 回答 |

仅复制旧库既有公开合成 fixture 的六个文件到忽略目录，没有复制私有项目、密钥或旧 Python RAG 源码。项目名为 `support-r30b-test`，检索条目仅有 FAQ/边界最小结构；status 仍报告 `needs_attention / alias_rows_empty`。它不是已经就绪的业务知识项目。

### 本机 53c 实测

- `/api/health`、`/api/projects` 为 404；`/health`、`/projects`、`/status?product_slug=...` 为 200。
- 正式 Adapter 的 `channel=generic` 请求返回 400：unsupported channel。旧版接受 `api/dm/comment`。
- 使用该旧版本接受的 `channel=api` 后得到 HTTP 200，接受 request_id 与 delivery_mode=draft，返回 draft_only、direct_reply_allowed=false。
- 返回原始 DTO，缺少正式信封、selected_answer_strategy 与 model_call_counts。Adapter 正确拒绝：`QUERY_ENVELOPE_INVALID`。
- 旧版对无效 answer_strategy 仍返回 200，说明字段被忽略，不能据此宣称 auto 已运行。
- model_provider=null、inference_source=rule_based_kb，没有 Provider 调用证据，也没有可认定为有效业务回答的来源。
- single-project 模式对错误 product_slug 返回 200 且错误标记 actual_product_slug；multi-project 模式对错误项目返回 400。此问题属于实测旧版本，不外推至新版。

证据：`query-get-*.json`、`query-post-adapter.json`、`query-post-documented-raw.json`、`query-final-probe.log`、`query-negative-*.json`、`query-multi-*.json`。临时测试 api channel 获得 200 的响应另存 `query-transient-api-channel-200.json`，该兼容改动已撤回。

### 远端 878c 源码核对

- server.py 4783/4797 提供 /api/health、/api/projects 别名；4489–4518 的 JSON 输出使用标准信封。
- 2540 起的 normalize_request 处理 answer_strategy；2649 接受 dm/comment/generic。保留现有正式 generic，不为迁就过期服务降级合同。
- 620–672 附加策略、coverage、locked_hits 和累计调用数；403–436 计算真实 Provider 请求计数。
- adapters.py 的 HTTP 初始化需要明确 Key；失败可回退 Mock。因此非空回复、策略名或 HTTP 200 都不能独立证明真实生成。
- common.py 的 HTTP 实现 provider 名为 openai-compatible，与 Adapter 白名单一致。
- 显式 Context 路径可能只有 compiled_context_hash/文档数量，没有可锁定知识 ID 和 coverage。当前产品刻意阻断这类结果；这是安全策略限制，**不应归因为新版 API 不支持 Context**。
- 已核对 server.py、answering.py、answer_strategy.py、adapters.py、common.py 的固定 ref 和 blob Hash，保存在 `legacy-version-contract.json`。未运行最新源码。

没有找到可供当前 Query 服务使用的就绪隔离项目及模型配置。未读取或复制认证秘密；没有为了完成验收擅自改模型路由、凭证或私有知识。此结论不等于本机不存在任何模型账号。

| 层级 | 结果 |
| --- | --- |
| HTTP 通信 | PASS（真实旧 Python 服务；文档对应请求 200，正式请求 400） |
| 正式 Adapter 与本机服务合同 | FAIL（版本落后；400/原始 DTO） |
| 取得有效业务回答 | NOT_TESTED（最小 fixture 不就绪，未取得合格回答） |
| 真实模型生成 | NOT_TESTED（无独立 Provider 请求、模型和生成文本证据） |
| 新版远端运行合同 | NOT_TESTED（只有固定 ref 源码核对） |

本轮创建的测试服务均已停止，仅终止自己的进程；没有结束用户既有服务。SSH fetch 因网络无进展被有界停止，LAN proxy 不可达；未把网络失败误记为协议失败。

## 3. 最小修复与红绿证据

| 修改文件 | 已复现问题与修复 |
| --- | --- |
| examples/ai-customer-support/desktop/query-api-adapter.js | coverage 两字段矛盾、Mock/空 Provider 加计数被误标 HTTP、缺少/非法调用计数、无来源的业务承诺仍可成为候选。现在失败关闭；rag_raw 零调用仍合法，回复仍一条映射一个候选 |
| examples/ai-customer-support/src/state.tsx | 请求期间人工输入会被迟到结果覆盖；人工输入接管当前回复并使待处理结果失效 |
| examples/ai-customer-support/native-demo.js | AX 等待期间撤权/暂停/换身份后仍可发 HTTP；增加发送前、读取后与发布前检查，以及授权代次，阻断快速暂停恢复穿透 |
| examples/ai-customer-support/scripts/run-desktop.sh | 正式命令文件不可执行；仅修正执行位 |
| examples/ai-customer-support/tests/ai-query.test.mjs | 增补上述负向协议、人工编辑及 Context 策略限制测试 |
| examples/ai-customer-support/tests/ai-browser-smoke.mjs | 新增四项浏览器 Bridge 桩测试，明确不提供真实网络、模型或原生回执证据 |
| tests/custom-ui/ai-customer-support-r30b-query.test.cjs | VM 提取现有 Host 函数，验证 AX/HTTP 等待窗口中的失效、去重和断连，不复制业务实现 |
| tests/custom-ui/ai-customer-support-r23-native.js | 单安全候选选中应幂等，不能等待旧演示答案切换；先激活精确自有 fixture 再等前台绑定；增加独立 sendActions=0 检查 |
| examples/ai-customer-support/preview/index.html | 由正式源码构建更新，内容包含本轮状态修复 |
| docs/quality/ai-customer-support-r30b-mac-verify.md | 本验收记录 |

红测保留：`edit-before.log`、`adapter-before.log`、`adversarial-before.log`、`host-before.log`（30 项中 17 失败）。对应绿测为最终 unit/Host/browser 日志。

其他真实失败均保留：最初命令 exit126；旧选项断言超时；实验性的 AX setValue 没有触发 React onChange（该实验已撤回）；前台未就绪导致握手超时（已修测试前置条件）；Host 新策略启用后旧桩缺少来源而被阻断（补齐明确合成合同样本后 58/58）。这些都不被抹成首次即通过。

## 4. 最终验证

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| npm ci | PASS | npm-ci.log |
| 工作区 typecheck / unit / 正式 build | PASS，113/113 | typecheck-final.log、unit-final.log、build-final.log |
| 独立提交候选 typecheck / unit / 正式 build | PASS，108/108 | commit-typecheck-final.log、commit-unit-final.log、commit-build-final.log |
| 工作区已有浏览器核心回归 | PASS，14/14 | browser-final.log、browser-final/ |
| 提交候选原有核心回归 | PASS，12/12 | commit-browser-verified.log |
| AI 浏览器 Bridge 桩 | PASS，4/4（两构建均通过） | ai-browser-final.log、commit-ai-browser-final.log |
| R23 + 安全 + 新 Host VM | PASS，58/58 | host-verified-final.log |
| JS 语法与本轮 diff whitespace | PASS | 交付前本地检查 |
| 正式原生命令，不设置 Query 环境变量 | PASS，23/23 | native-after-startup-fix.log；下述 r23 run |
| 实际模型→React→人工编辑→原生草稿 | NOT_TESTED | 无整链证据 |
| 全仓测试架构审计 | FAIL，外部归责 | test-architecture.log |

独立提交候选使用原有构建脚本，排除其他任务未提交代码。浏览器均实际运行本机已安装 Google Chrome 的 headless Chromium；候选测试仅在忽略目录给 Playwright 指定 executablePath，没有改写业务结果。旧 harness 末尾的 CI 环境固定文案不能作为真实环境证明。工作区比提交候选多出的测试来自其他任务，不混入本轮提交验收。

没有独立 lint npm script；未添加新依赖或为本轮扩展全仓构建。全仓审计失败为既有 Go 测试分类计数 361/301、缺少 tests/runtime-api/single/window-app-watch.js 及文档 manifest 漂移。未证明它阻断 Mac 客服功能，因此未治理这批外部问题。Runtime catalog / Windows CI 也未被宣称已修复。

## 5. 真实 Mac 证据与边界

从仓库根目录原样运行：

```bash
./examples/ai-customer-support/scripts/run-desktop.sh --verify
```

实际执行时显式 unset 三个 OPENDESK_SUPPORT_QUERY_* 环境变量，保留默认离线合同。

最终原生证据：
`.runtime/tests/ai-customer-support/r23/runs/20261030-003828-5108/`。

- native-results.json：23 项 PASS。
- fixture-oracle.json：sendActions=0。
- draft-readback-*.json：写入后新 Accessibility 快照，独立 customer/message/draft 匹配。
- 01-message-react.png、02-draft-verified.png、03-follow-resized.png、04-isolated-return.png：真实测试聊天及 380px 助手。已目视检查草稿截图；六个 Tab、设置齿轮、内容换行及底部按钮均保留，无本轮布局改造。
- source-sha256.txt、artifact-sha256.txt、launch.json、head.txt：实际外部脚本/HTML、主程序与 UI host 的 Hash 和路径。
- 主程序使用现有固定签名 dist/OpenDesk.app，沿用可兼容宿主；没有覆盖签名包或重置权限。原生编译来源仍为已有 c658/dirty 构建，不能宣传为本轮新 clean build。
- 运行摘要：`.runtime/runs/direct-20261030-003834-907000/summary.json`，succeeded。
- 本次原生运行加载的是工作区正式构建（含保留的并行改动），不是独立提交候选 HTML；后者另有 typecheck/unit/browser 验证，二者的 Hash 不能混称相同。

代码已修改：是。实际已加载：是（上述脚本/HTML Hash）。视觉已确认：仅安全人工核实草稿状态。功能已验证：独立聊天读取、绑定、草稿回读与隔离。**真实 AI 推荐卡片、人工编辑 AI 文本、整链填稿仍 NOT_TESTED。**

当前安全人工核实文案不是 AI 生成。日志中的单次 AX 动作可能返回 TIMEOUT/unknown；测试未重放该动作，使用独立后置快照判定相应测试动作结果。产品填草稿自身对动作 unknown 保持停止且不自动重试。未连接微信、企业微信或真实客户发送。

### 负向验收的证据强度

| 场景 | 已有证据 | 未完成部分 |
| --- | --- | --- |
| 请求中切客户、新消息、暂停/撤权、迟到响应 | Host VM + reducer PASS；原生基础隔离/撤权 PASS | 与真实模型请求并发的 Mac 整链 NOT_TESTED |
| 超时/断开 | VM 断连及 Adapter HTTP 失败 PASS | 真实模型服务断连的实窗验收 NOT_TESTED |
| 错项目/请求 ID | Adapter 协议 PASS；旧服务多项目错误项目 400 | 新服务运行时验证 NOT_TESTED |
| 已有人工作稿 | 原生保留、拒绝覆盖 PASS | AI 文本整链场景 NOT_TESTED |
| 重复点击/迟到回复 | VM 去重、browser 人工编辑保护 PASS | 真实模型整链 NOT_TESTED |
| 无证据承诺/冲突/Mock | Adapter 拒绝候选 PASS | 真实模型输出该类事实的验收 NOT_TESTED |

## 6. 六方独立审阅

审阅均以具体源码/测试为依据，未将专家意见作为真实模型执行证据；下列为各自发现和修复后剩余项。

| 视角 | 具体发现与处置 |
| --- | --- |
| 产品 | Feynman：state.tsx 215 的迟到覆盖已修；145–153 的显式再次查询仍会清除此前编辑；来源卡只有编号，缺少原文/版本供审核。AI 业务效果仍无证据 |
| 架构 | Herschel：保留 native-adapter、Query Adapter、reducer 三个现有 Owner；不转移到并行 App Mode Host，不新增后端 |
| 集成 | Lorentz：本机 53c 的 channel/DTO 和新合同不匹配；父任务进一步固定 ref 核实 878c，撤回迁就旧版的 channel 改动，避免错误归因 |
| 安全 | Averroes：AX await 期间失效仍可泄露请求，coverage 矛盾及假 Provider 标识已修；在途已发送 HTTP 不会因撤权撤回，后续结果仍丢弃 |
| QA | Halley：分层 PASS 无法推出整链 PASS，日志包含 unknown 不得隐去；候选构建和工作区验收范围已分开记录 |
| 反方 | James：缺失/非法计数、无来源承诺漏洞已修；指出 Context 正常返回也可能被产品策略阻断，现明确列为受限能力并补测试。最终同意本轮修复收口，但拒绝宣称 AI 闭环 |

Provider、计数、来源 Hash 仍由服务上报，不能单独证明模型真实调用或知识正确/新鲜/适用于当前订单。需要独立调用和业务依据证据；没有因此放宽来源门禁。

## 7. 八维评分

评分反映本轮目标的已证实完成度，不是测得的模型质量；未测试项以 0 计入证据完成度下限，同时保留 NOT_TESTED 标记。没有把未执行维度强填 95。

| 维度 | 分数 / 100 | 状态与理由 |
| --- | ---: | --- |
| 原始目标达成度 | 55 | PARTIAL；原生人工草稿成立，真实 AI 整链缺失 |
| 架构复用和最小改动 | 97 | PASS；复用现有 Owner 与 Runtime，无新后端或页面 |
| Query API 合同正确性 | 55 | FAIL/部分源码吻合；本机版本实测不兼容，新版运行未验 |
| 真实 AI 回复及证据质量 | 0 | NOT_TESTED；没有真实生成证据 |
| 项目、会话和草稿安全 | 88 | 分层 PASS；整链并发及来源真实性尚未实测 |
| Mac 真实闭环可靠性 | 65 | PARTIAL；原生 23/23，尚无 AI 文本闭环 |
| 测试覆盖与证据可复核性 | 88 | 分层证据齐全，关键整链缺失 |
| 维护性及跨阶段收敛 | 94 | 小改动、红绿证据；环境阻断与受限能力明确 |

算术平均：`(55+97+55+0+88+65+88+94)/8 = 67.75/100`。未达到各维度 ≥95、平均 ≥97 的目标；不得作为 R3.0-B 完成证明。

## 8. 剩余阻断与同轮差量任务

1. **Query 服务部署/环境 Owner**：在保持旧仓库源码只读的前提下，提供或部署与已核实新版合同一致的本机测试服务；禁止用本机 53c 的原始 DTO 冒充新版 API。当前没有运行合格新版服务。
2. **项目知识/模型配置 Owner**：明确批准的隔离测试项目、完整知识与模型配置。当前 fixture 不就绪，Query 服务缺少可验证 Provider 调用。禁止复制私有资料或为凑通过自动换路由/账户。
3. **本轮集成验收**：沿用现有脚本，绑定该项目；至少选择一个确实走模型且具有 locked evidence 的 auto 问题，保留 request/project/strategy、实际 Provider 调用与响应字段。rag_raw 可单独 PASS，但不能替代模型生成。
4. **Mac 实窗验收**：同一请求在 React 显示实际回复和来源，人工选用/编辑，写入原测试聊天，以新 AX 快照独立读回且 sendActions=0；补全真实并发负向场景。
5. **Context 限制**：若必须使用无 locked_hits 的显式 Context，需要先设计并验证独立来源合同；本轮不通过伪造锁定来源或去掉门禁来兼容。
6. **非本轮阻断**：全仓 catalog/测试分类及 Windows CI 独立跟踪；不重开网页架构设计、不重做六页、100题或 RAG。

完成上述同一轮差量验收后才进入 R3.0-C 的真实业务知识与检索质量评测。本轮没有启动七算法/100题基准，也没有新建聊天或 PR。
