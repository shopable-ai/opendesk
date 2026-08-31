# OpenDesk JavaScript Runtime API Conformance Lab acceptance audit

`quality_gate.js` 不搜索源码关键词，也不从注释推导分数。它只读取本次 `runId` 的 contract、
unit、coverage、smoke、failure-exit、live、composition 与 cleanup 结果，并核验：

- 每项结果属于当前 runId、当前二进制绝对路径和 SHA-256，且时间不早于本次启动；
- catalog 没有重复、未知测试 ID、遗漏 Runtime 方法、缺失 API family 文件、缺 tier 或无理由的 contract-only 项；
- composition evidence 同时具有 pre/post 截图、state、events JSON、单调 NDJSON、文件大小和 SHA-256；
- Safari 前台窗口身份、权限快照和窗口移动后的完整重放均存在；
- failure-exit 不是 0 或 124，cleanup 明确确认记录的 Runtime/watchdog/fixture PID 消失；
- summary 满足 `schemas/runtime-api/runtime-api-run-summary.schema.json` 的必需字段。

只有所有检查由本次真实结果满足时，quality 才输出 `RUNTIME-API-QUALITY 100/100`。

`acceptance_negative.test.js` 会实际证明下列伪造或漏项必定失败：删除 catalog 方法、插入
重复或未知 ID、live 缺截图、composition 缺 state/events、failure-exit 为 0/124、cleanup 未确认，
以及二进制 SHA 不一致。
