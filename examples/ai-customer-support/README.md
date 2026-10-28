# AI 客服助手 · 六业务页面 React Workbench（R2.0）

> 2026-10-28 · `master`。**唯一正式交互预览为 `preview/index.html`**；R2.0 起从 `src/` React + TypeScript 构建，而非手工维护 HTML。原 R1.9.1 HTML 是视觉和交互迁移基线。真实 OpenDesk AI 客服业务 Execution、微信/企业微信识别与自动发送尚未实施。

## 一、原始目标

在现有 OpenDesk Desktop 主窗口、Recorder 和其他工具并行运行时，增加独立的 AI 客服助手：绑定用户授权聊天窗口与正确会话、识别客户消息、查询知识与历史上下文、给出多条可靠的推荐回复、允许人工编辑和填入聊天草稿；经过单独授权且满足安全条件后，逐步支持自动回复。窗口应智能跟随或隐藏，不重新实现 OpenDesk Runtime。

## 二、主文件与可导入示例

| 用途 | 唯一归属 | 状态 |
| --- | --- | --- |
| 双窗口主预览 | `preview/index.html` | R2.0 React 自动构建的唯一离线 HTML；构建成功前保留 R1.9.1 |
| 通用 FAQ/知识 | `fixtures/knowledge-demo.json` | 8 条虚构问答，可从「知识库」导入 |
| 客户历史语料 | `fixtures/customer-history-demo.json` | 3 个虚构客户、6 段会话、22 条消息，可从「客户档案」导入 |
| 演示商品 | `fixtures/products-demo.json` | 6 件商品、12 张 SVG 示意图，供商品和图片共享 |
| 演示订单 | `fixtures/orders-demo.json` | 8 笔虚构订单，按当前客户和授权隔离 |

仓库没有其他同目录被跟踪的旧 HTML；不要引入第二套主原型或平行 Mock。下载的 HTML 可以按 `ai-customer-support.html` 命名，但仓库主文件始终保持 `preview/index.html`。

### 浏览器评审流程

1. 打开 `preview/index.html`。左侧模拟聊天软件包括三个独立会话与客户消息，右侧为固定约 380px 的 Compact Copilot，两边共用同一套演示会话状态。
2. 在「知识库」搜索、筛选和展开条目，核对 **完整答案 / 同义问题 / 数据来源 / 托管资格**；点击导入图标选择 `fixtures/knowledge-demo.json`。新导入知识默认不具有自动托管资格。
3. 在「客户档案」查看当前客户偏好与来源证据。点击导入图标选择 `fixtures/customer-history-demo.json`，再点击 ✦ 执行**确定性规则提取**；人工确认、忽略、切换客户与清空档案。提取结果只进入当前浏览器内存，初始为待确认。
4. 「推荐回复」中选择一个答案、按需编辑并填入左侧模拟聊天草稿。默认不自动发送。开启智能托管需要明确确认，并且只允许后续精确匹配且具托管资格的**演示**消息自动模拟发送。人工接管只停止当前会话的自动发送，推荐仍可用。
5. 「设置」继续保留目标授权、当前会话、跟随、回读验证、观察暂停、多段消息、昵称与演示地区、清理操作和隐私说明。

### 客户历史档案安全边界

- **严格区别**：通用知识属于店铺规则；客户档案只属于当前被绑定的特定客户。不得跨会话或跨客户引用。
- 只基于客户明确表达的非敏感偏好等可验证语料，记录 `customerId/sessionId/messageId/原话/提取方式/确认状态`；不把模型推测或服务人员的话冒充客户事实。
- 提取方式在这版仅为**本地正则关键词匹配的演示**，不是已经接入真实 LLM/RAG/长期记忆；仍需人工确认。不得自动推断健康、宗教、政治、性取向等敏感属性。
- 原始历史和提取候选只驻留浏览器内存。清空或重置不影响其他客户；未来持久化须先设计授权、最小存储、脱敏、保留期限、删除、更正与撤权。
- 客户档案**不直接具备自动发送资格**。任何未来利用历史信息生成回复的动作都必须经过当前会话重新核对、数据权限确认和安全发送 Owner。

## R1.6 客户档案：列表 / 详情与简洁文档阅读

- **双页面而非新的一级 Tab**：「客户档案」为第三个业务 Tab，设置独立在右上角齿轮。打开 Tab 时，若模拟聊天绑定了客户，默认进入该客户详情；详情顶部「← 客户列表」可回到三位演示客户的检索列表，选择其他客户时明确提示「浏览其他客户」，不修改当前聊天绑定。
- **聊天切换立即重新匹配**：左侧切换会话时，详情自动定位新客户。客户详情不跨客户显示事实、历史原话或人工确认状态。
- **详情采用 Markdown 风格阅读排版**：客户摘要、已确认信息、待核实线索、历史对话以标题、段落、项目符号展示，不堆叠重复卡片。此阶段生成的是安全的语义 HTML，尚未引入通用 Markdown 解析器或永久 .md 文件；第三方 Markdown 数据接入待业务阶段评估。
- **保留关键操作**：搜索、状态筛选、历史 JSON 导入、确定性规则提取、来源展开、确认 / 忽略 / 撤回以及清空选中客户。所有演示数据仅浏览器内存，候选线索不自动参与回复或发送。
- **真实浏览器检查**：R1.6 专项 56 项 PASS；继承工作台核心回归 114 项 PASS，合计 170 项，0 FAILED。覆盖 320/360/380/400/440/520/1280px 无横向滚动、深浅主题与左侧会话切换。该结果不代表原生 Mac Runtime 已完成。
- **正式预览仅一份**：examples/ai-customer-support/preview/index.html，禁止创建第二套平行主 HTML。样例 JSON 继续用 fixtures/knowledge-demo.json 和 fixtures/customer-history-demo.json。

**下一阶段应先完成真实业务代码**：独立 Execution、受限 Custom UI 控件事件、模拟聊天消息与会话 readback、知识 JSON 解析、客户历史持久化/撤权删除，以及人工确认后的可信 Markdown 详情生成。未完成原生核心闭环前，不转入 Codex 的最终 Mac 验收。

## 三、现有框架复用与边界

先核查 `AGENTS.md`，再按官方文档使用 `docs/api/ui.md`、`docs/api/window.md`、`docs/api/accessibility.md`、`docs/api/desktop-ui.md`、`docs/api/llm.md`、`docs/api/events.md`、`docs/api/app-shell.md`。窗口跟随参考 `examples/custom-ui/codex-prompt-shortcuts/main.js`，但其已知 Codex 真机行为不能当成客服验收。

建议架构：现有 OpenDesk App Shell 下**独立 Execution + execution-owned Custom UI + 单一客服业务 owner + 现有授权/window/AX/File/LLM/Events API**；既有 `ui.createWindow()` 只接受受限 HTML/CSS，**不得将本浏览器原型的 `<script>` 直接作为原生 UI 内容**。Browser preview 与正式 Runtime 不能是两套长久分叉的业务引擎。

## 四、下一阶段开发（当前尚未实现）

1. P0：核实独立长期 Execution 入口，以及主窗口/Recorder/其他程序同时运行的真正生命周期边界。
2. P0：实现原生模拟聊天窗口与右侧 Custom UI，建立正规的 ControlHandle 事件、视图更新与清理；保留正式 `preview/index.html` 作为视觉/交互契约。
3. P0：通过现有 File API 加载上面两份 fixture；实现可解释知识匹配，精确命中与不匹配降级。
4. P0：实现会话/消息身份绑定、草稿填入和独立读回；提交前检查已发状态、授权、身份与人工接管。
5. P1：增加客户历史索引、幂等提取、证据追溯、人工确认、更正/撤权；先用确定性规则走通本地模拟 MVP，再引入可选 LLM 或 RAG。
6. P1：对真实聊天客户端仅进行获准的只读兼容性检查。真实微信等平台自动发送需要独立安全资格，不能用模拟演示宣称通过。

本次浏览器原型在当前环境中两套 Chromium 回归脚本分别通过 **114/114**（既有双窗口/知识/设置）与 **54/54**（客户档案/导入/隔离/适配）。这些并非真实 macOS Runtime、模型调用或外部业务行为的证明。当前未进行真实 Mac 视觉与 Accessibility 验收：**NOT_TESTED**。

**下一阶段执行原则**：网页对话先落实原生 MVP 业务源码、fixture 加载和确定性功能闭环；完成源码及可复核测试后，再单独生成本地 Codex 的 Mac 实机测试/修复/验收任务。只在 `master` 增量提交，不建立新分支/Worktree/PR。

## R1.9 · 六个业务 Tab（2026-10-29）

正式唯一预览 `preview/index.html`：推荐回复、知识库、客户档案、商品、图片、订单六个一级页面；设置继续由右上角齿轮打开。图片视图直接读取 `fixtures/products-demo.json` 商品下的图片 ID，不建立独立图库数据库。新增 `fixtures/orders-demo.json`（8 笔完全虚构订单），所有只读查询按当前会话 `customerId` 隔离；支持搜索、状态筛选、订单详情、关联商品、复制摘要以及模拟聊天草稿（保护未发送草稿，不直接发送）。HTML 内嵌演示数据以支持离线打开。真实 Desktop Runtime、微信业务接线、订单 API、实时物流、图片附件发送和 AI 视觉识别均未实现。

## R2.0 · 正式 React 迁移与验证入口

- **唯一可维护 UI 源码：** `src/main.tsx` 单 React Root，`src/views/` 六页 + 独立设置。`src/state.tsx` 是单一会话/草稿/授权状态 owner；`src/domain/` 放商品、订单、知识和历史规则；四份 JSON fixture 继续保留在 `fixtures/`。
- **唯一生成 HTML：** `node scripts/build-preview.mjs` 在 bundle 完整性检查通过后原子替换 `preview/index.html`；错误时原有正常预览不被覆盖；无 CDN、无开发服务器、无第二份 Mock。
- **本地命令：** `cd examples/ai-customer-support && npm install && npm run typecheck && node --test tests/domain.test.mjs && npm run build && node --test tests/preview.test.mjs`。需浏览器自动检查时执行 `npx playwright install chromium && npm run test:browser`。
- **CI 回归：** `.github/workflows/ai-customer-support-preview.yml` 按以上顺序执行并在全部通过后将正式 HTML 和依赖锁定文件安全提交 `master`；截图等运行证据保留在 Actions artifact，不作为项目源码提交。
- **安全边界：** 填入草稿不等于发送，客户和订单不跨会话，任何托管仅发生于左侧虚构聊天窗口。**浏览器 React 预览不等于 Desktop 原生 Custom UI 已接入。** 真正 Mac Chrome 及微信/企业微信联调：`NOT_TESTED`。

> 本节描述源码与验证协议。是否实际通过以对应提交和 CI / 本地测试日志为准；历史 R1.5/R1.6 测试数字不是 R2.0 React 的合格证明。
