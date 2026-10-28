# AI 客服助手 R2.0 · 核心闭环差量验收

日期：2026-10-29（Asia/Shanghai）。源码基线为 `cfcbfa47d96aa458c5c32450d68b201e8f39c437`；业务修复提交为 `6f894340bee099d4db6ca37204896377d0551c7c`，浏览器断言修正及当前 CI 验证提交为 `9ffdc6f273ab07b4d5e60d764514001c432946b3`。报告后续补记不改变该业务源码与 HTML。

## 结论与范围

已修复本轮发现的四类核心缺陷，正式源码与唯一生成 HTML 一致；本地类型、74 项领域/安全测试和 1 项 HTML 契约通过，当前 CI 的 10 个核心浏览器场景通过。真实 Mac Chrome HTTP 补验 6 项核心操作通过。**仍未完成全部核心实窗验收**：正常文件选择导入、草稿覆盖确认取消/接受及系统剪贴板粘贴受现有工具能力影响，逐项保留 `NOT_TESTED`。

当前产物是桌面客服产品的 React 离线浏览器原型。未接原生 Desktop Runtime、真实微信/企业微信、订单后台、LLM/RAG、真实发送或外部回执。本轮未开发扩展、sidepanel、第二套页面；未重跑宽度、200% 缩放或截图评分矩阵。

## 复现、根因与修复

| 缺陷 | 修复前复现与根因 | 最小修复与重验 |
| --- | --- | --- |
| 知识错误字段被接受 | 对象问题、数组答案、`enabled:"false"`、数字范围被强转成字符串或被当作启用/通用 | 校验记录与可选字段类型，整份拒绝错误输入；JSON/Markdown 正常解析、默认无托管资格、范围和停用回归通过 |
| 历史冲突被静默忽略 | 同客户/会话/消息 ID 换原话、角色或日期，合并只看 ID，旧人工确认继续被当成新导入成功 | 完全相同才幂等；冲突整份拒绝并定位 ID，保留原历史/人工确认；文件内重复与跨文件冲突、原子拒绝、错误状态回归通过。ID 先校验字符串，拒绝数字 |
| 规则候选反驳证据 | “不喜欢蓝色、不要短信通知”仍生成正向偏好；条件句及已改变的旧偏好也误提取 | 对已知否定、撤回、歧义、旧偏好及条件子句保守不提取，保留明确购前尺码表/短信请求；原正向 fixture、反例、人工状态与客户隔离通过 |
| 托管虚假回读成功 | 关闭回读后自动模拟发送仍显示“回读一致” | 显示“状态未确认”，保留已提交消息去重，当前会话转人工，后续不再自动模拟发送；领域及真实 Mac Chrome 重验通过 |

没有改变 `Common.tsx` 复制实现：它按浏览器 clipboard Promise 或 `execCommand` 的返回值显示反馈。本轮没有证据证明复制产品代码有缺陷，因此没有为工具限制盲改。

规则提取仍是有限的本地模式匹配，会漏掉复杂表达；通过所列反例不代表自然语言普遍理解。同 ID 历史更正当前采用拒绝策略，未增加原地编辑/覆盖历史证据功能。

## 验证分层

| 层级 | 当前结果 | 证据与限制 |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck`；未配置独立 lint 命令 |
| 领域与安全 | PASS · 74/74 | 包括正常/错误导入、默认资格、历史冲突、否定/条件/旧偏好、人工确认、客户隔离、导入 epoch、草稿覆盖接受/拒绝及失效身份、未知回读与去重 |
| 正式 build / HTML | PASS · 1/1 | `npm run build` 后执行离线结构契约；`node --check tests/browser-smoke.mjs` 通过 |
| HTTP 与本机文件 | PASS | `http://127.0.0.1:52132/` 返回 200，与正式 HTML 逐字节一致；SHA256 `18e090aeb69ff7cdf153cbce8391f31ff377a0c696fcf553e79abdb60f4f7499` |
| 真实 Mac Chrome | PASS · 6 个定向检查 | 未知回读转人工、后续停止发送、接管后编辑并填草稿、切客户不带入编辑、当前订单摘要草稿、返回原客户保留草稿；浏览器版本未知 |
| 视觉 | 已确认本轮实际窗口 | 双窗口、头像、气泡、380px 助手、六 Tab 与操作区保持既有风格；没有重新评分。浏览器右侧“阅读目录”悬浮层来自外部浏览器环境，不是客服原型 UI |
| CI 核心浏览器 | PASS · 10/10 | [当前运行 40754087547](https://github.com/shopable-ai/opendesk/actions/runs/40754087547)，提交 `9ffdc6f2`；包含导入、错误文件、历史冲突、回复/订单草稿确认取消/接受与未知回读；不运行旧尺寸矩阵。Linux headless Chromium 143.0.7499.4 不能替代 Mac 文件选择或系统剪贴板证明 |

当前 CI 也通过类型、74 项领域测试、1 项 HTML 契约和构建；重建后的 HTML/lockfile 无差异。产物：[唯一离线 HTML](https://github.com/shopable-ai/opendesk/actions/runs/40754087547/artifacts/12845093285)、[浏览器证据](https://github.com/shopable-ai/opendesk/actions/runs/40754087547/artifacts/12845252830)。此处以 CI 的构建及无差异检查证明一致性，未再次下载 ZIP 做独立字节比对；上表 SHA256 是本机正式 HTML 的散列，不是 artifact ZIP 的散列。

首次 [CI 40753662806](https://github.com/shopable-ai/opendesk/actions/runs/40753662806) 在 8 个浏览器场景通过后，新增客户隔离断言立即读取了 effect 切换前的旧档案。修正为等待目标客户档案身份与旧事实移除，并增加切回原客户后已确认事实仍保留的检查；同一场景及全部 10 个核心场景重验通过。仅修正测试等待，未为此改变产品逻辑。其他仓库级工作流不计入本报告的客服验收结论。

本地验证从 `examples/ai-customer-support/` 执行：

```sh
npm run typecheck
node --test tests/domain.test.mjs tests/import-safety.test.mjs tests/knowledge-conflict.test.mjs tests/knowledge-import.test.mjs tests/history-evidence.test.mjs
npm run build
node --test tests/preview.test.mjs
node --check tests/browser-smoke.mjs
```

上轮六页、设置、三客户隔离、商品与图片、档案确认/忽略、暂停/撤权、托管授权和模拟发送等 Mac HTTP 证据保留于 `r2-local-20261029/mac-chrome-http-results.json`，原有 67 PASS、2 INVALID_ASSERTION、1 NOT_TESTED 不合并成新提交计数。两条失效断言仍按原记录保留原因。此前 CI 的成功与产物比对不冒充本轮证据。

## 核心操作状态与剩余项

| 项目 | 已证明 | 当前 Mac 实窗缺口 |
| --- | --- | --- |
| 六业务页与设置 | 既有六页交互证据，最终 HTML 已重新加载 | 本轮未再跑全部旧回归或宽度矩阵 |
| 会话/订单/草稿 | 领域保护与本轮编辑、订单草稿、客户隔离通过 | 覆盖确认的真实取消/接受 `NOT_TESTED`；确认框可识别，工具 `dismiss` 操作超时，不计通过 |
| 知识 JSON/Markdown | 解析、字段/大小/数量错误、来源、无托管资格的本地回归 | 正常本地文件选择及错误文件 UI `NOT_TESTED`；filechooser 事件超时，未上传文件、未注入假事件 |
| 客户历史导入→提取→证据→确认/忽略 | 领域及 reducer 证据链通过，既有种子档案确认/忽略实窗通过 | 本轮真实文件导入到提取全链 `NOT_TESTED` |
| 回复与订单复制 | 代码核查；已有成功提示 | macOS 系统剪贴板粘贴 `NOT_TESTED`，不拿 toast 或虚拟剪贴板替代 |
| 人工接管与回读 | 模拟回读缺陷已修复并真实 Chrome 重验 | 真实聊天平台及原生 Runtime 尚未实现 |
| 拖拽 / `file://` | 无新增通过声明 | `NOT_TESTED`，不列为本轮扩张任务 |

## 修改归属与证据文件

实际业务修复仅位于 `examples/ai-customer-support/src/domain/history.ts`、`src/domain/knowledge.ts` 和 `src/state.tsx`；没有新增状态 owner、Mock API 或数据副本。

必要配套修改：既有 `tests/domain.test.mjs`、`tests/import-safety.test.mjs`、`tests/browser-smoke.mjs`；新增 `tests/history-evidence.test.mjs`、`tests/knowledge-import.test.mjs`；CI 纳入新测试及核心模式；重建 `preview/index.html`；更新 README、DESIGN 与本报告，移除过时的原生开发前提和截图评分要求。

运行证据根目录：`.runtime/tests/ai-customer-support/r2-core-20261029/`：

- `knowledge-before.log`、`core-before.log`、`before.log`、`history-review-before.log`：修复前失败证据；不作为当前失败状态。
- `typecheck.log`、`domain-after.log`、`build.log`、`preview-after.log`：最终本地检查。
- `http-verification.json`、`mac-core-results.json`：HTTP一致性与分项结论。
- `ci-first-failure.txt`、`ci-success-excerpt.log`：首次断言竞态与当前 CI 通过摘要，完整日志以各运行链接为准。
- `mac-unknown-readback.jpg`、`mac-edited-draft-isolation.jpg`、`mac-final-loaded.jpg`：本轮真实 Chrome 页面证据；前两张针对同一回读/草稿实现，最后一张为最终历史规则构建后的重载。

原 `r2-local-20261029/report.md`、`results.json`、`completion-audit.json` 属于旧 file-only 阻塞阶段，不是最新结论。所有运行文件仅保留本地，不提交 `.runtime/`。

仅在已有 `master` 提交客服范围差量；不创建分支/Worktree/PR。其他任务的六个未提交文件不改动、不暂存、不提交。旧对话 paused goal 未恢复，旧缩放目标未重新启用。
