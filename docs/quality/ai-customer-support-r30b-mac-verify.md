# AI 客服助手 R3.0-B：Mac 真实联调验收（2026-10-30）

**核心技术闭环 PASS；业务知识质量尚未验收，综合评分未达到原定门槛。可进入 R3.0-C 质量评测，不代表允许生产发送。**

已从独立测试聊天读取窗口、客户及消息；可信 Host 向显式绑定的本机 Query API 请求 draft/auto，取得真实模型生成和锁定来源，React 显示一条推荐；经真实原生控件选用、修改后写入原测试聊天。新的 Accessibility 快照独立读回一致，sendActions=0。人工步骤由验收脚本操作实际控件完成，不冒称用户本人审核了业务事实。

未接入微信或真实客户。壁纸知识是通用草案，不绑定真实产品；来源可追溯不等于事实获业务批准。真实模型主动产生无证据承诺、Context/Codex CLI 路径及正式检索质量仍有未测项。

## 1. 基线与归属

- 起始 master HEAD：`c65848c246c516d111b8cd12b947f33a6cbc70a7`。
- 先核对 status、分支、HEAD、既有模块及 R3.0-A 三提交。Actions run `40902286696` 的 job `123547530449` 为 success（`ci-verified.json`）。
- 在 master 合并已验证基线：`f084960ee7e527fd1fd01aeb0b25feefec579e6f`，保留本地安全工作。首批修复：`0a2f0b0cd7760d8cc9415a26fb40059c63b19fa4`。后续提交、最终 HEAD 和推送状态见交付消息、本地 `delivery.json`，避免本文自引用 Hash。
- 没有新建分支、Git worktree 或 PR。旧仓库只读；没有重新实现 Adapter、六页面、测试聊天、100 题或 Runtime。
- 初始脏状态保存在 `initial-status.txt`、`initial-tracked.patch`；定向 stash 仍保留。并行 App Mode、Runtime、签名文件不混入提交、不覆盖。
- 提交 HTML 由正式 React 源码构建。忽略目录 `commit-build/` 仅为普通构建 staging，不是 Git worktree；暂存区放干净候选构建，工作区 HTML 保留他人并行构建变化。未手改 HTML。

短证据名相对于 `.runtime/tests/ai-customer-support/r30b/`。日志、截图、临时服务和完整响应留在忽略目录，不提交密钥、客户内容或私有知识。

## 2. 真实 Query API 部署与合同

用户补充：“未部署，你可以找一个进行测试。不如 ai会员，或者 壁纸”。因此选择通用壁纸项目，在旧仓库外部署其新版服务。

| 对象 | 证据与结论 |
| --- | --- |
| 本机旧库 `53c2e2fc17e098aff980e5c938d16ad8c46c6c7d` | 只读，原 .shopme 修改保留；正式 generic 请求 400、原始 DTO 不兼容、auto 被忽略。早期 FAIL 保留，不再作为当前版本结论 |
| 固定新版 `878c61904d94ada0bfe37c283973c527735396ad` | 必要运行源码与通用文本测试知识部署到仓库外 Library/Caches/OpenDesk/r30b-query/878c619；没有将 Python RAG 提交公开仓库 |
| 来源核对 | 初次记录 218 文件一致；另按 GitHub 固定 ref blob 元数据逐字节核对关键 Query/知识加载/FAQ/index 文件 54/54 一致。218 文件初始完整逐文件 manifest 未保留，不冒称独立完整重建证明 |
| 当前本机服务 | 127.0.0.1:18082，multi_project，显式绑定 bizhi-app；/api/health、/api/projects、/status?product_slug=bizhi-app 实测均 200 |
| 项目准备 | 22 FAQ、77 unknown boundary、134 alias；draft_complete/review draft，通用技术项目，不代表真实业务知识合格 |

证据：`legacy-version-contract.json`、`deployment-provenance.json`、`upstream-critical-blob-manifest.json`、`upstream-critical-blob-verified.json`、`deployed-health.json`、`deployed-projects.json`、`deployed-status.json`。

### 隔离策略及模型

原精确 FAQ 合法走 rag_raw、零模型调用。为验证真实生成，在独立 `isolated-projects/bizhi-app` 副本中，仅将 `kb-bizhi-app-accepted-q-000006.raw_reuse_eligible` 从 true 改为 false，更新 canonical FAQ 和实际消费的 active_entries_snapshot；知识文本及答案 Hash 不变，原下载源码与旧仓库不改。auto 实际选择 rag_rewrite。不能称为未经改变的上游生产配置。

`isolated-project-provenance.json` 记录前后文件 Hash；原答案 Hash：`e4dc349ccc4d93244d9e2f2f3f6214631f4be73cae45d3fc5a81c364589e2ac7`。

使用既有授权通道 `http://127.0.0.1:10100/v1`、模型 `openai/gpt-6.1-sol`。认证仅进程内读取，不输出/存入证据，不改全局模型、账号、代理或认证。旧 HTTP 客户端默认 standard tier、Responses string-input 分别出现 400，保留诊断；本次进程使用 chat_completions、service_tier=default、reasoning_effort=low。上游源码不改，没有自动换账户或路由。

健康接口的既有 LAN fallback 元数据不是实际调用路由证明；本次实际 Provider HTTP 走 10100 的 /chat/completions。

### 同一次请求证明

`chain-evidence.json` 关联 Host dispatch、实际 Query DTO、Provider HTTP、React 文本及原生草稿：

| 合同字段 | 实际结果 |
| --- | --- |
| request_id | 与可信 Host 同一请求，详见索引 |
| product_slug / actual_product_slug / requested_product_slug | bizhi-app，全部一致 |
| delivery_mode_applied / delivery_status / direct_reply_allowed | draft / draft_only / false |
| 请求 answer_strategy / 响应 selected_answer_strategy | auto / rag_rewrite |
| coverage_status、coverage.status | full / full |
| locked_hits | 上述知识 ID、答案 Hash、exact/hit |
| model_provider / model_name | openai-compatible / openai/gpt-6.1-sol |
| total_provider_requests / rewrite_status | 1 / completed |
| review_answer | 与 React 选用前的实际回复逐字一致 |

被动记录器委托原 Provider HTTP 和原 Query JSON 输出，不替换请求/响应。`provider-wire-audit.jsonl` 保留响应 ID、模型、usage、请求/响应 Hash、耗时；`query-wire-audit.jsonl` 保留实际 DTO。Provider 层没有 Query request_id，关联依据无并发 Query 时间窗口；这是同进程观测，不冒称外部厂商签名证明。

**HTTP PASS、有来源的有效技术测试回答 PASS、真实模型生成 PASS** 分别成立。rag_raw 零调用另行 PASS，不能替代真实模型生成。

### 不适用能力与上游差异

- 错误项目 400/code1004，无效策略 400/code1001，无静默换项目（`latest-negative-contract.json`）。
- 未知促销/永久免费/退款承诺走规则转人工：unknown/confidence0/requires_human_review=true、无模型。早退 DTO 缺 delivery_mode_applied 等合同字段，Adapter 以 QUERY_CONTRACT_MISMATCH 拒绝、零候选（`actual-unknown-adapter-rejection.json`）。安全降级成立；旧 API 早退合同差异未修。
- 本次部署缺可运行 Context 注册，相关路由曾返回 409/code1901。上游存在 Context MD/HTTP/Codex CLI 能力，但本次运行不适用/NOT_TESTED；不能以源码或 status readiness 代替调用成功。
- Context 无 locked_hits/coverage 时当前产品会阻断，属于来源合同限制，不放松门禁凑通过。
- /api/query/stream 未验，本轮沿用非流式 /api/query。
- Hash Vector 不是已验证真实 Embedding；本轮未证明检索算法质量、业务正确性或知识新鲜度。

## 3. 实际修复与红绿证据

| 文件 | 修改原因 |
| --- | --- |
| desktop/query-api-adapter.js | 首批：矛盾 coverage、Mock/非法计数、无来源承诺失败关闭；保留 rag_raw0 调用、一条回复一个候选，不拆 reply_segments |
| src/state.tsx | 人工输入及打开编辑器即使在途 AI 失效，覆盖 AX/IME 尚未产生 input 的窗口 |
| src/views/Reply.tsx | Mac AX setValue 无法可靠驱动 controlled textarea；使用原生缓冲、自动焦点与 change/blur；完成/填入/复制显式读取当前 key/ref，修复 AX invoke 无 blur 丢稿 |
| native-demo.js | 首批异步身份/授权代次检查；后续激活已存在的精确自有窗口，避免 UI host 抢焦；日志仅白名单元数据，不记录任意 DTO |
| scripts/run-desktop.sh | 修执行位；增加明确 --verify-ai 与本机项目要求；--verify 继续禁止 Query 配置 |
| tests/ai-query.test.mjs | 协议、计数、来源、人工接管和旧结果拒绝回归 |
| tests/ai-browser-smoke.mjs | 7 个 Bridge 桩，含无 input/blur 的两种完成及直接填入；不是模型/原生回执证据 |
| tests/custom-ui/ai-customer-support-r30b-query.test.cjs | 复用 Host 函数的 VM 负向回归，无业务平行实现 |
| tests/custom-ui/ai-customer-support-r23-native.js | 修旧演示断言、精确 fixture 前置及零发送检查 |
| tests/custom-ui/ai-customer-support-r30b-native.js | 复用测试聊天/Host 的真实 AI 门禁；PID/窗口限定 AX 编辑，同 ref 读回、AX invoke 完成，独立草稿快照；显式故障分支 |
| preview/index.html、本文 | 正式源码构建及验收记录；六 Tab 和右上齿轮保留，无 UI 重设计 |

首批红测：edit-before.log、adapter-before.log、adversarial-before.log、host-before.log（30 项中 17 失败）。后续：editor-focus-before-browser.log、native-ax-edit-before.log、editorownership-before.log、editor-invoke-before.log；最后一项复现无 blur 完成后填旧稿，修复后三个 invoke 场景全部通过。

其他失败保留：初次 exit126、fixture 未激活、助手 AX checkbox.value 类型错误、故障 UI 断言误读 staticText.name、非公开 typeForPID 实验。后者全部撤回、未改 Runtime/API 文档。早期全局键盘输入的 11 项通过记录因作用域风险不作为最终证据，已改为精确窗口 AX。unknown 动作不盲目重放。

## 4. 测试结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| npm ci | PASS | npm-ci.log |
| 工作区 typecheck / unit / build | PASS，114/114 | typecheck-delivery.log、unit-delivery.log、build-delivery.log |
| 干净候选 typecheck / unit / build | PASS，109/109 | commit-typecheck-delivery.log、commit-unit-delivery.log、commit-build-delivery.log |
| 工作区已有浏览器 | PASS，16/16 | browser-completion.log |
| 干净候选核心浏览器 | PASS，12/12 | commit-browser-delivery.log |
| AI Bridge 浏览器桩 | PASS，7/7，两构建均通过 | ai-browser-delivery.log、commit-ai-browser-delivery.log |
| R23 + 安全 + 新 Host VM | PASS，58/58 | host-completion.log |
| 原生离线 --verify，无 Query 环境变量 | PASS，23/23 | native-offline-delivery.log；r23/runs/20261030-020528-87096 |
| 真实 AI 原生 --verify-ai | PASS，13/13 | native-ai-delivery.log；r23/runs/20261030-020017-84596 |
| 五类受控故障原生 | PASS，每类4/4 | native-fault-*-final.log；不计真实 AI |
| JS/Shell 语法、限定 diff whitespace | PASS | 交付前检查 |
| 全仓测试架构审计 | FAIL，外部归责 | test-architecture.log |
| 真实模型主动产生无证据承诺 | NOT_TESTED | 规则转人工、合成不安全回复拒绝不能替代 |
| 正式知识/检索准确率、100题、Context/Codex CLI、真实微信 | NOT_TESTED | 后续对应阶段 |

浏览器实际运行已安装的 Mac Google Chrome headless。干净候选旧 harness 仅在忽略目录指定 executablePath，末尾固定“CI headless Chromium”文字不是环境证明。工作区额外5个单测、4个浏览器场景属于并行任务，不混入本轮提交。核心浏览器16项记录早于最后显式 ref 提交修复，受影响的7项 AI场景与12项候选核心已重新通过。

没有独立 lint npm script，未加依赖。全仓审计既有 Go 分类361/301、缺 window-app-watch.js、文档 manifest 漂移未修；Runtime catalog/Windows CI 未宣称修复。它们未阻断实际 Mac 链路，不扩为架构治理。

## 5. Mac 实窗与负向场景

仓库根目录，显式 unset 三个 Query 环境变量后原样执行离线命令：

```bash
./examples/ai-customer-support/scripts/run-desktop.sh --verify
```

先启动并验证隔离服务，再执行现有正式入口的 AI 门禁选项：

```bash
OPENDESK_SUPPORT_QUERY_PORT=18082 OPENDESK_SUPPORT_PROJECT_ID=bizhi-app OPENDESK_SUPPORT_QUERY_PROVIDER=auto ./examples/ai-customer-support/scripts/run-desktop.sh --verify-ai
```

普通无 --verify-ai 入口也已实测观察；修复前 UI host 抢焦导致首次观察为空，精确激活已有 fixture 后解除。不要求用户为普通体验执行探针或 watchdog。

最终证据：`.runtime/tests/ai-customer-support/r23/runs/20261030-020017-84596/`：

- ai-native-results.json：13项；chain-evidence.json 为同请求关联索引。
- ai-editor-readback.json：编辑前 value/focused、一次 setter、同 ref 读回；实际 AX invoke 完成后 React 保存值一致。
- draft-readback-fill-*.json：新的 AX 快照与客户/消息/草稿匹配；fixture-oracle.json 独立 sendActions=0，不只依赖 React 回执。
- 01-ai-recommendation.png、02-ai-edited-draft-verified.png：真实聊天、380px React 推荐与草稿；目视检查六 Tab、齿轮、换行、底部按钮。
- source-sha256.txt、artifact-sha256.txt、launch.json、head.txt：实际加载脚本/HTML/宿主来源。
- 沿用固定签名 dist/OpenDesk.app 的兼容 c658/dirty 原生构建，不宣传为本轮新 clean build；未覆盖签名包或重置权限。
- 原生加载工作区正式 HTML，含保留的并行 App Mode 变化；提交候选有独立 typecheck/unit/browser。两种 Hash 不混称相同。

代码已修改、实际已加载、视觉已确认、功能已验证分别有证据。模型回复没有经 DOM 注入，AI 结果和原生回执没有由门禁伪造。

| 场景 | 证据层级和结果 |
| --- | --- |
| 在途换客户、新消息、暂停、撤权 | 实际模型 HTTP 发出后操作 Mac 控件，等待响应，旧结果不发布；明确验证 t2，撤权后再次 observe 仍不恢复 |
| 已有人工作稿 | 实际 AX 写入人工稿后填入被 refused，独立回读原稿保留 |
| 错项目/请求ID | 受控响应+Mac安全降级、零候选/空草稿/零发送；另有真实 API 错项目400 |
| 无证据业务承诺 | 合成不安全回复被拒；真实模型该类输出 NOT_TESTED |
| 超时/断开 | 受控15秒延迟/断socket，Mac恢复安全状态，无重试/发送 |
| 重复点击/迟到结果 | VM/reducer/browser回归；真实在途身份变化已测，高速重复点击的真实模型压力测试未执行 |

五故障 run：wrong-project `20261030-015150-78270`、wrong-request `20261030-015203-78716`、no-evidence `20261030-015217-79150`、disconnect `20261030-015230-79500`、timeout `20261030-015245-79918`；均位于 r23/runs。故障服务仅为测试工具，交付前停止。Query 隔离服务暂保留在127.0.0.1:18082供复核，最终状态见delivery.json；未结束用户10100等既有服务。

## 6. 六方独立审阅

| 视角/审阅者 | 具体发现与处置 |
| --- | --- |
| 产品/Feynman | state.tsx 迟到覆盖已修；Reply.tsx 来源卡只有ID，缺原文/版本；显式再次查询仍清旧编辑，留后续体验设计，通用草案不证明真实业务效果 |
| 架构/Herschel | 复用 native-adapter、Query Adapter、reducer 三个Owner，无新增后端或迁移并行App Mode Host |
| 集成/Lorentz | 53c channel/DTO失败归因版本；固定878c核对后保留generic，部署新版解除，不为过期实现降级合同 |
| 安全/Averroes | AX await撤权窗口、coverage矛盾、假Provider已修；已发出的HTTP无法撤回，Host拒收后续结果，不冒称取消远端生成 |
| QA/Halley | 分层PASS不能推出整链；最终补同请求Provider/React/AX关联，候选与实际加载仍分列，保留unknown及早期失败 |
| 反方/James | 无/非法计数、无证据承诺漏洞修复；Context来源门禁独立归责，单个通用问题不能外推业务准确率 |

增量审阅：Copernicus 指出全局输入、替代 fixture、原始响应日志与撤权断言问题，已改精确窗口 AX、激活已有窗口、白名单日志及明确撤权检查。Kant 核对真实调用/草稿证据并限定同进程审计、派生知识、生产质量边界；补54关键文件blob核对。Erdos确认无现成公开定向键盘API，未扩Runtime，改AX与React接口。

Socrates发现 AX invoke 无 blur 丢稿；先红测再显式 ref/key 提交，真实 gate 同步改 AX invoke 并重跑。Lovelace 对该修复和三个无input/blur场景只读复审 APPROVE，无跨身份/旧key缺陷；TypeScript诊断0。审阅者未冒称自己执行GUI，专家意见不代替运行证据。

## 7. 八维评分

分数为本轮证据支持的交付完成度，不是测得的业务准确率；未执行子场景仍标 NOT_TESTED，不以综合分掩盖。

| 维度 | 分数/100 | 依据及扣分 |
| --- | ---: | --- |
| 原始目标达成度 | 96 | 同请求闭环；仅隔离项目 |
| 架构复用和最小改动 | 98 | 复用旧Query/Runtime/React，无新增业务层 |
| Query API合同正确性 | 96 | 正常合同实测；早退DTO、Context来源仍受限 |
| 真实AI回复及证据质量 | 88 | 真实调用/usage/来源；通用草案单问题，无正式准确率 |
| 项目、会话和草稿安全 | 96 | 在途隔离、撤权、人工稿、故障关闭；真实模型恶意事实未测 |
| Mac真实闭环可靠性 | 96 | 13项AI、23项离线；非长期/压力证据 |
| 测试覆盖与证据可复核性 | 95 | 红绿/来源/构建/调用/AX关联；同进程与来源manifest边界 |
| 维护性及跨阶段收敛 | 97 | master差量、并行隔离、不扩Runtime；知识/Context后续收敛 |

算术平均：`(96+98+96+88+96+96+95+97)/8 = 95.25/100`。

**没有达到各维度≥95、平均≥97。核心技术通过，不强填质量分。**

## 8. 剩余归责与下一阶段

1. **业务知识Owner（首要）**：替换为业务批准、带版本和适用范围的壁纸/AI会员知识，验证动态价格、会员承诺、订单和退款边界。来源ID/Hash只证明引用一致，不证明业务正确。
2. **R3.0-C质量评测Owner**：基于已有待标注100题草案建立真实标签，测召回、无答案/冲突、事实忠实与拒答；不把Hash Vector冒充真实Embedding，不把精确单题外推为RAG合格。
3. **旧Query API Owner**：统一早退draft/strategy/coverage合同，准备Context注册及可审计来源；Codex CLI/stream如需使用另验。旧库本轮只读，不重建RAG。
4. **产品审核体验**：补来源原文/版本，明确再次查询清旧编辑的体验；不重开六页迁移。
5. **QA后续**：真实模型不应承诺事实的受控诱导、长时间/快速重复操作；生产发送仍不在授权范围。
6. **外部Runtime/CI Owner**：catalog/分类/Windows CI独立跟踪，未证明阻断本次Mac，不纳入本轮治理。

可进入 R3.0-C 的真实知识与检索质量评测；停止重复 R3.0-A/B Adapter、页面、模拟器开发。不能宣称产品已达97分或可自动发送。
