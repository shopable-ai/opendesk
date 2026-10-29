# OpenDesk Desktop · AI 客服助手 R2.0

> 2026-10-29 · 当前阶段：React 19 + TypeScript 离线浏览器原型与核心缺陷修复。产品定位是桌面客服助手；真实 Desktop Runtime、微信/企业微信、订单后台及真实自动发送尚未接入。

## 当前目标与工程归属

优先走通「客户消息 → 当前客户与订单/知识/历史 → 多条推荐 → 编辑/复制/安全填入草稿 → 人工接管与模拟回读」。保留已确认的联系人头像、消息气泡、双窗口与约 380px 助手风格。缩放、小屏宽度矩阵和重复截图评分已暂停，不作为本轮核心交付前提。

- 唯一可维护 UI 源码是 `src/`：单 React root，六个业务页和右上角独立设置。
- `src/state.tsx` 是唯一会话、授权、草稿、导入结果和模拟发送 owner；`src/domain/` 放商品、订单、知识和历史规则。
- 唯一正式 HTML 为 `preview/index.html`，由 `scripts/build-preview.mjs` 从正式源码原子生成，无 CDN、开发服务器或平行 Mock。不要直接修改生成 HTML。
- 三位虚构客户各有独立消息、编辑建议、草稿、订单与档案。状态只保留在当前页面内存，刷新重置；不持久化，不调用云模型。
- 本轮不开发扩展、sidepanel、第二个页面或新的原生 Runtime。历史 R1.x 的原生开发计划和评分目标不构成本轮任务。

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
- **当前范围外：** Desktop 原生 UI/Execution、真实窗口跟随、微信/企业微信接线、真实订单系统、LLM/RAG/图片识别、真实发送与外部回执。后续须独立立项和授权。
