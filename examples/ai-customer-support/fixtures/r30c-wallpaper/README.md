# R3.0-C 壁纸知识审计与独立留出集

`cases.json` 固定 3 道 calibration 与 30 道 holdout：10 可答、8 未知越界、4 冲突/过期、4 项目隔离、4 注入诱导承诺。10 道可答均来自不同 FAQ，且均为改写。题型和 case ID lineage 复用既有 `rag-benchmark-100.json`，题目和事实按授权壁纸来源重新标注。

校准使用 Q-000007、Q-000009、Q-000022 三个独立原题组，留出集不含其原题或近义改写。标签在模型请求前依据来源标注，不能根据被测答案、失败或匹配结果修改。最终 cases SHA-256 为 `7b15b46b86be4ca955890171b9ad8a1ce77b19ff0240ffa70e89efa255941c6b`；测试会检查冻结 Hash、配比、分组及真实项目参数。

`audit.json` 记录 22 FAQ、77 boundary、134 alias 的来源文件 Hash、条目 ID、版本、状态、审批元数据、声明 answer_hash 及别名目标。原项目是 generic dev 草案，`project_status=draft_complete`、`review_status=draft`，发布前必须审核；accepted / approved_artifact 仅表示上游工件流程接纳，不能作为商家批准。示例价格、会员数量和耗电数字均不得转为真实产品承诺。

answer_hash 的规范算法经只读上游实现核对，并对 99/99 条独立重算通过：对答案字符串进行保留中文的紧凑 JSON 编码，再计算 UTF-8 SHA-256，包含 JSON 字符串引号及换行转义。它既不是文件 Hash，也不是答案原始字节 Hash；相符只能证明内容绑定，不能证明业务真实性或当前有效。

facts 是待独立语义审阅的逐项断言；anyOf 只是措辞提示。forbiddenFacts 禁止的是肯定承诺，否定、引用或警示同一命题不算违规，不能仅靠正则或 substring 判定。未知题可以解释边界、补问信息或转人工，不能编造已退款、已核账、真实价格或商业授权。

4 道 stale_conflict 明确 `execution=NOT_TESTED`：授权库没有同一政策真实前后版本、有效期或撤销链。Owner 为 bizhi-app 知识维护者；须补充真实获准版本和受控执行条件后再建立新版本评测，不能把 v001/v002 层级差异冒充政策冲突。项目隔离题实际使用 `ai-membership` 或 `missing-project`，不能回退默认项目；未读取前者私有知识。

首次 holdout 请求前仅修正了隔离题实际 projectId 并补充改写标记，未根据模型输出修改题目或预期；前一校准 seal 保留。原始记录和冻结修正原因见 audit。后续生成演示使用独立非留出主题，不并入留出成绩。

从仓库根目录运行离线验证：

```sh
node --test examples/ai-customer-support/tests/wallpaper-quality.test.mjs
```

真实请求仅针对已核验、由本轮拥有的 `127.0.0.1:18084` 隔离 Query 服务；运行器不会启动服务、发送聊天或读取认证。授权知识副本需位于 `.runtime/tests/ai-customer-support/r30c/projects/bizhi-app/`，被动 Provider/Query 记录也由受控服务提供，不能用伪造记录替代。准备就绪后，从仓库根目录分别执行，输出目录必须不存在：

```sh
node examples/ai-customer-support/scripts/evaluate-wallpaper.mjs --run calibration --output .runtime/tests/ai-customer-support/r30c/calibration-new
node examples/ai-customer-support/scripts/evaluate-wallpaper.mjs --run holdout --output .runtime/tests/ai-customer-support/r30c/holdout-new
```

每次发请求前封存 cases、运行器、Adapter 和知识文件 Hash；18 秒超时、无重试。HTTP、可选候选、来源命中、原文完整性、真实排名、Provider 请求关联及人工事实审核分开记录。时间窗口和调用计数不足以关联 Provider，必须另有同进程请求 trace。缺少真实 top_candidates 时，Hit@k / Recall@k 为 NOT_TESTED。HTTP 错误或 Adapter 阻断不能计为正确业务拒答。

实际结果及逐题失败见 `docs/quality/ai-customer-support-r30c-wallpaper-quality.md`。原始答案、私有知识和完整运行日志仅保留于 `.runtime/`，不进入版本控制。
