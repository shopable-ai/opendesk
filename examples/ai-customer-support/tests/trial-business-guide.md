# P3 小规模业务试用

工作目录：仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。
仅提供 Node HTTP 验收与现有宿主/reducer 检查；不部署 Query、不启动 GUI、不操作模型认证。

## 执行

离线（全部为 synthetic 输入/响应，不调用模型）：

```sh
node --test examples/ai-customer-support/tests/trial-business.test.mjs
```

主任务完成 HTTP-only Query 部署后，使用其提供的端口；例如端口为 18082 时：

```sh
TRIAL_QUERY_PORT=18082 TRIAL_QUERY_PROJECT=bizhi-app node examples/ai-customer-support/tests/trial-business.mjs --live
```

默认 provider 为 `auto`，由现有 Query 选择检索或上下文策略；本地受管部署仅开放 HTTP 生成并禁用 CLI/fallback。显式设置 `TRIAL_QUERY_PROVIDER=http` 会强制 `context_http`，可能因无法关联来源而被生产 adapter 阻断，不能用它冒充检索通过。只连接指定的 `127.0.0.1` 端口；禁止重定向；每例一次请求、30 秒超时，无重试，无附加延迟。不写业务数据，不填入聊天草稿、不发送消息。端口缺失、项目不为 `bizhi-app` 时，在 HTTP 请求前失败。

本地部署的传输兼容与可选 `plannerTimeoutSeconds` 见上级 README；业务运行器不修改这些参数或在失败后改问法。原问题被阻断的失败记录应保留，部署修复后另建 run 重验，不能拿后端 raw 回答代替可用候选。

输出位于 `.runtime/tests/ai-customer-support/trial-business/<timestamp>-<id>/`，已被现有 `.runtime/` ignore 规则覆盖。包含请求、原始响应、时间、被测源码/既有 fixture 的 SHA256、adapter 结果、自动断言和逐例人工复核清单。原始回答/来源可能含私有资料，只保留在本地运行目录，不提交。

退出码 0 **只代表自动契约检查通过**；`semanticStatus: NOT_TESTED`、`manualReview.status: PENDING` 始终保留，不能据此宣称业务答案合格或真实模型已核验。非零退出码应先查看 `summary.json`，区分协议错误、超时、来源完整性失败与断言失败。

## 四类案例

| ID | 输入与观察目标 | 自动证据 | 人工复核 |
| --- | --- | --- | --- |
| common | 壁纸新内容更新频率 | draft-only、当前 request/project、候选边界、来源原文 hash（可用时） | 回答是否符合实际来源，有无新增更新承诺 |
| insufficient | 询问今天实际成交价，资料缺少真实定价 | 无证据时不得产生候选；blocked 结果在现有 reducer 中提供“人工核实”；不把 HTTP 错误算业务转人工 | 是否编造价格，是否明确限制并追问或转人工 |
| context | 旧问题已由客服回答，随后两条客户消息询问更新 | 执行生产 askAI，合并最后客服消息之后的客户消息；不传旧轮次、历史字段或 session ID | 合并问题的回答是否完整；跨已回答轮次的指代需人工补充 |
| correction | 人工把更新承诺改为“以页面为准”后再次查询 | 使用实际返回 DTO 执行生产 reducer：等待及新结果均保留人工稿；编辑时迟到结果无效；没有填入/发送 | 主任务真实窗口中检查实际输入、后续响应及版本选择 |

`context` 验证的是“当前未回答的客户消息段”，并非有状态服务多轮。另有离线反例：客服回答后客户再问“那它呢？”，实际 Query 只有这四个字，不会恢复历史指代；旧结果不能恢复已失效的 UI 权限。宿主限制超过 8 条或 3800 字的未回答消息段，工具验证超限不发 HTTP。

## 断言边界与来源

自动检查仅证明 HTTP/envelope、request/project 归属、保守草稿、人工审阅要求、可用来源的 ID/hash 关联与原文 hash 完整性，以及当前 reducer 的人工稿保护。完整性只证明服务声明和内容一致，**不证明来源可信、业务批准或回答被来源蕴含**。缺失来源正文显示 `UNAVAILABLE`，不从 fixture 补造正文。

可回答案例还必须有可选用候选，且来源 ID/hash 符合锁定资料；全部被阻断不能算可回答案例通过。事实关键词和禁止字面量仅放在 `observations` 供审阅，不参与自动通过。特意保留反例：含“保证每天更新”的来源关联合格草稿可以自动检查通过，但语义仍为未验证；不能用正则或关键词宣称事实全判定。生产 adapter 的 `blocked` 与 `error` 分开；前者可作为保守阻断证据，后者判自动失败。

案例沿用仓库既有 `fixtures/r30c-wallpaper/cases.json` 的 C-W-02/C-W-14 标签和 audit 中的来源指纹，未新增知识正文。C-W-14 在本试用中已公开，不再作为新盲测 holdout。context/correction 是新增合成流程输入，不代表真实客户或商家批准。已只读核对用户授权的本机 `bizhi-app/project.yaml` 与 context manifest 标签：通用壁纸、dev、draft、投产前需审核、缺少真实 SKU/定价，允许 shared profile；没有复制私有知识正文。

真实模型声明与验证分开：报告保留 Query 的 provider/strategy/call-count 声明，但 `independentProviderVerification` 固定为 `NOT_TESTED`。主任务须用部署日志或对应 provider 证据独立核对；HTTP 响应、非零调用计数或 badge 均不能替代。此工具不读取全局认证。

## 人工复核步骤

1. 查看每例 `*-request.json` 和 `*-response.json`，核对实际 query、策略、回答及来源原文。
2. 对照 `summary.json` 的 `manualReview.rubric` 和实际部署资料，逐句核对否定、限制、版本、遗漏和新增承诺；期望标签不是实际来源正文。
3. 无原文/可关联来源时记录“无法核对”，不推断通过；资料不足例记录是否追问或交给人工。
4. 主任务在真实窗口验证人工纠正保留、显式版本选择及上下文显示。本工具的 synthetic AX + production reducer 不能替代实窗证据。
5. 另存人工结论于本轮 `.runtime/` 证据目录，记录 reviewer、时间、case ID、结果和原因；不要把自动 `passed` 改写为事实全通过。
