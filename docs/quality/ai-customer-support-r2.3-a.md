# OpenDesk Desktop · AI 客服助手 R2.3-A · React 六页差量业务验收

日期：2026-10-29（Asia/Shanghai）。

## 结论

**React 阶段为 PARTIAL（自动化验收通过，Mac Chrome 实窗与外部预览 URL 尚有 NOT_TESTED）。** 不把 Desktop 原生集成、真实微信识别、真实商品服务或外部发送列为本轮 React 缺陷。继承 R2.0 基线，不重新开发六页和共享状态。

基线：`edbeab59c7f340ce747de8dbb3e67406bfed2eeb`。
- 功能提交：[`75e6f285`](https://github.com/shopable-ai/opendesk/commit/75e6f285418a4caaddfe1f6781ec7dfcb4fa277e)。
- 浏览器断言修复：[`a1e55828`](https://github.com/shopable-ai/opendesk/commit/a1e558280de627f4b9554a95c3703b3e0f037d20)。
- 验证后由 CI 生成正式 HTML：[`a4a14c4b`](https://github.com/shopable-ai/opendesk/commit/a4a14c4b64b2b2938c2ae4ca8b54ceca971ac03d)。

## 已确认的正式结构

`examples/ai-customer-support/src/main.tsx` 单 React Root；`src/state.tsx` 统一会话、草稿、授权和业务状态；`src/views/` 为推荐回复、知识库、客户档案、商品、图片和订单六个业务页，设置由齿轮进入。唯一维护源码为 `src/`，构建产物为 `preview/index.html`；不得直接手工编辑 HTML。

R2.0 保留的业务能力：2–3 个推荐回复、编辑/复制/安全填草稿；知识 JSON/Markdown 导入；客户历史 JSON、证据和人工确认；SKU/规格与图片图库；按客户隔离的虚构订单；模拟托管与未知回读降级。原始成功记录见 `ai-customer-support-r2-core.md`，不把其旧 Mac 检查算作本轮复测。

## 本轮修复的两个明确 P0 缺口

1. **商品链接识别**：`src/domain/catalog.ts` 严格解析仅属于 `https://catalog.opendesk.example/products/<ID>` 的演示链接；仅本地 fixture，不发网络请求；拒绝伪造域名、错误 SKU、未知商品、多商品歧义及非可信 URL。商品详情可复制这种示例链接；商品搜索接受链接；推荐回复页在当前客户消息存在唯一可信商品线索时可跳商品详情及图片。演示域名为保留 `.example`，不是真实商品或价格来源。
2. **知识匹配解释性**：`src/domain/knowledge.ts` 统一输出 exact/similar/conflict/none 分类；知识库和推荐回复页面可显示冲突与未命中之区别；冲突不会选择任一矛盾答案，也不会开启自动发送资格。复用原有 `matchKnowledge` 安全入口和共享状态。

改动范围：`src/domain/catalog.ts`、`src/domain/knowledge.ts`、`src/views/Products.tsx`、`src/views/Reply.tsx`、`src/views/Knowledge.tsx`、`tests/domain.test.mjs`、`tests/browser-smoke.mjs`、`README.md`。没有创建第二套 React 项目、状态 owner、Runtime 或新框架。

## 本轮最新自动化证据

CI 运行：<https://github.com/shopable-ai/opendesk/actions/runs/40853902059>，结果 **success**，测试提交 `a1e558280de627f4b9554a95c3703b3e0f037d20`。

| 检查 | 结果 | 证据/边界 |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` |
| 领域和安全 | PASS · 76/76 | 包括本轮 URL、歧义、冲突与既有客户/草稿/导入安全回归 |
| 正式 HTML 生成 | PASS | `npm run build`，366938 字符；CI 在所有检查通过后将此产物写回 master |
| 离线契约 | PASS · 1/1 | 单文件 HTML、样式与 JS 无外部依赖 |
| CI 核心 Chromium | PASS · 12/12 | 六页/设置、订单草稿隔离、商品图库、演示链接与客户切换、知识冲突、知识/历史导入、授权暂停、人工模拟发送、草稿确认、导入拒绝、证据冲突、未知回读 |
| Mac Chrome 实窗 | NOT_TESTED · 本轮 | 当前工具无法操作用户本机的文件选择、系统剪贴板或确认弹窗；保留为本地定向补验 |
| 外部 CDN 预览 URL | NOT_TESTED | 已确认 GitHub 正式 HTML 与 CI 构建产物存在，但尚未独立验证第三方网页代理可打开 |

产物：<https://github.com/shopable-ai/opendesk/actions/runs/40853902059/artifacts/12887854350>，浏览器证据：<https://github.com/shopable-ai/opendesk/actions/runs/40853902059/artifacts/12888033171>（GitHub Actions artifact 均为 CI 存档，非独立网页预览服务）。正式 HTML：`examples/ai-customer-support/preview/index.html`，GitHub 文件 blob `dc23bb28a843f3c313fe1329e95136dabb030ffb`。

首次 CI `40853686953` 失败：新增知识状态区域导致旧浏览器断言使用 `getByRole('status').last()` 选到了错误元素；新增商品链接和冲突两场景当时已通过。修复为显式定位“导入失败”，最新全套通过。该失败不代表产品数据导入失败。

## 未完成 / 非本轮范围

- 本阶段本地实窗补验：真实 JSON 与 Markdown 文件选择/拖拽，历史文件导入后人工确认，模拟草稿覆盖确认取消/接受，系统剪贴板粘贴验证、`file://` 及外部可点击 HTML URL；未实测不报 PASS。
- 图片以图搜索、外部商家商品链接和实际商品 Provider、复杂语义提取属于后续增强，不因本地演示链接匹配而冒充已实现。
- Desktop WebView 窗口跟随、原生数据桥、微信/企业微信 Accessibility/OCR、真实草稿写入和真实发送均属于下一阶段，尚未验收。

八维满分均为 100，正式评分目标各 ≥95；**当前不做最终八维算术平均与通过声明**，因为实际 Mac UI/剪贴板/文件操作未测，不能用代码审计主观打分冒充完整验收。下一步仅在本地 Mac Chrome 定向测试上述缺口，失败则最小修复，再根据八项可复现证据评分、计算算术平均并冻结 React，之后才进入 Desktop 阶段。
