# OpenDesk Desktop · AI 客服助手 R2.3

> 2026-10-29 · 当前阶段：macOS Desktop 技术 Demo，复用 React 19 + TypeScript 六页及唯一 HTML。目标是独立测试聊天实窗 → 原生识别 → 推荐 → 人工选用 → 草稿回读；真实微信、订单后台和自动发送未接入。

## 当前目标与工程归属

优先走通「客户消息 → 当前客户与订单/知识/历史 → 多条推荐 → 编辑/复制/安全填入草稿 → 人工接管与模拟回读」。保留已确认的联系人头像、消息气泡、双窗口与约 380px 助手风格。缩放、小屏宽度矩阵和重复截图评分已暂停，不作为本轮核心交付前提。

- 唯一可维护 UI 源码是 `src/`：单 React root，六个业务页和右上角独立设置。
- `src/state.tsx` 是唯一会话、授权、草稿、导入结果和模拟发送 owner；`src/domain/` 放商品、订单、知识和历史规则。
- 唯一正式 HTML 为 `preview/index.html`，由 `scripts/build-preview.mjs` 从正式源码原子生成，无 CDN、开发服务器或平行 Mock。不要直接修改生成 HTML。
- 三位虚构客户各有独立消息、编辑建议、草稿、订单与档案。状态只保留在当前页面内存，刷新重置；不持久化，不调用云模型。
- 不开发扩展、sidepanel、第二个页面或新的 Runtime。R2.3 原生入口仅维护窗口、观察身份与动作凭据，业务状态仍由 `src/state.tsx` 负责。

## macOS 原生 Demo

从仓库根目录运行：`./examples/ai-customer-support/scripts/run-desktop.sh`。

启动器显式授权自己创建的 `OpenDeskSupportChat.app` 子进程，打开独立测试聊天和约 380px 的原生 React 助手。输入客户消息，点「添加客户消息」，在助手选择推荐，再点「填入聊天草稿」。只有新的原生快照与请求正文一致时才显示 `verified`。测试聊天没有发送动作。

切换联系人使用独立聊天的三个按钮。窗口移动/缩放触发提示后重新读回坐标，1000ms 兜底核验；失焦、最小化、关闭或身份失效会停止观察并隐藏助手。暂停和撤销授权使旧请求失效；撤权后须关闭并重新启动本 Demo。已有人工草稿保留，原生模式不提供覆盖确认。

维护者需先准备当前源码对应的稳定签名宿主：`./scripts/build_macos_app.sh`；React 源码修改后执行 `npm --prefix examples/ai-customer-support run build`。启动器核验现有签名；独立聊天 fixture 缺失或源码更新时使用同一固定开发身份构建。需要已授予 OpenDesk 的 Accessibility；截图验收另需 Screen Recording。缺少权限会明确失败，不自动更改系统授权。不改动 `/Applications/OpenDesk.app` 或其他任务的进程。

正式实机 gate：`./examples/ai-customer-support/scripts/run-desktop.sh --verify`。它会操作本次创建的测试聊天和 React 实窗，保存 AX、坐标、回执、截图和逐项结果，结束时清理自己创建的进程；不用于真实聊天软件。普通体验只需上面的一条启动命令和窗口交互。

可信容器为独立的 `ui.createTrustedWindow()`：固定本地 HTML 字节与 SHA-256、每窗口独立 origin、非持久 WebKit store、仅限 JSON 的双向桥、阻断导航和网络资源。它仍加载 `preview/index.html`；普通 `ui.createWindow()` 继续禁用业务脚本。知识、商品、订单、档案仍为本地演示数据，不调用云模型。

R2.1/R2.2 的历史 `desktop/main.js/panel.html` 补丁未在 master 合入，不是此命令的输入；R2.3 不生成或加载那些平行页面。当前入口为 `native-demo.js`，应用特定解析为 `desktop/native-adapter.js`，测试聊天源码在 `tests/custom-ui/tools/support-chat/`。

实机证据、失败案例和分项计分见 [R2.3 验收记录](../../docs/quality/ai-customer-support-r23-desktop.md)。所有运行输出位于仓库根 `.runtime/tests/ai-customer-support/r23/`，不提交。

## 核心操作

| 页面 | 当前能力 | 边界 |
| --- | --- | --- |
| 推荐回复 | 2–3 条处理策略、选用、编辑、复制、填草稿、人工接管 | 草稿不等于发送；没有可靠知识时只澄清/人工核实 |
| 知识库 | 搜索、状态/来源/范围筛选、展开完整答案、JSON/Markdown 导入 | 新导入数据默认无托管资格；冲突、停用或范围不符不作为可靠匹配 |
| 客户档案 | 历史 JSON、确定性规则提取、原话证据、人工确认/忽略/恢复、Markdown | 候选不参与自动发送；保守规则不是 LLM，不推断敏感属性 |
| 商品 | 6 件商品、SKU/规格搜索、详情与关联图片；严格匹配本地演示商品链接 | 不识别外部商家链接、不爬取网页、不查询实时库存或价格 |
| 图片 | 12 张 SVG 图库、大图和商品双向跳转 | 未实现以图识物或真实附件发送 |
| 订单 | 当前客户只读搜索/筛选、详情、摘要复制、草稿和关联商品 | 8 笔虚构订单；不执行退款、取消、付款或发货 |

商品详情可复制 `https://catalog.opendesk.example/products/<商品ID>` 形式的演示链接（`.example` 为保留示例域名，不指向真实商品）。商品搜索可粘贴该链接；当前客户消息包含唯一 SKU、型号、完整名称或唯一可信演示链接时，推荐回复页显示可点开的商品线索；不存在或有歧义时不猜测，也不会据此自动发送。

左侧模拟聊天可切换客户、接收演示/自定义消息、人工编辑并模拟发送。已有草稿需要明确确认才能替换；提交时重新核对客户、最新消息、授权与已回复状态。切换客户或收到新消息保留人工草稿，旧身份动作不能写入当前会话。

智能托管须单独确认，只处理后续精确匹配且具资格的演示知识。未知、冲突、敏感问题或已有草稿转人工；人工接管后推荐仍可用，恢复不会补发历史消息。关闭回读后的模拟提交显示「状态未确认」，已提交消息禁止重发；托管发生这种情况时当前会话转人工，停止后续自动模拟发送。

## 导入与证据规则

| 示例 | 内容 | 入口 |
| --- | --- | --- |
| `fixtures/knowledge-demo.json` | 8 条虚构问答 | 知识库 → 导入知识 → 选择本地文件 |
| `fixtures/customer-history-demo.json` | 3 客户、6 会话、22 条消息 | 客户档案 → 导入历史会话 → 选择 JSON 文件 → ✦ 提取 |
| `fixtures/products-demo.json` | 6 商品、12 SVG 引用 | 商品与图片共享，无单独导入 |
| `fixtures/orders-demo.json` | 8 笔客户隔离的订单 | 订单页，无后台接口 |

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

`fixtures/rag-benchmark-100.json` 仅是 100 个合成、未标注/未执行的问题草案；不得生成虚假 Recall@K、正确率、成本或延迟。正式评测需准备经过审核的项目数据、黄金证据 ID 和可比对的 7 策略实际输出。测试：`npm --prefix examples/ai-customer-support test` 或单独 `node --test examples/ai-customer-support/tests/ai-query.test.mjs`。`--verify` 禁用 Query API 配置，继续检验原有离线原生闭环；R3.0-A 真实 AI+Mac 需独立实机验收，尚不能从源码或 CI 推定通过。

