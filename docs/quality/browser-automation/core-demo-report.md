# Browser Automation Core Demo — Core PASS

最终候选：`74d9700a9a7dbc30837e2b34ebba714473d8e3e3dbc5aeed736a00f31968169b`。Git：`877c852acca28b4658d01fd727b37b883b4792d1`，master，未创建分支、提交或推送。既有未提交修改全部保留。

本任务修复审计器误拒绝 Chrome 原始 JPEG 截图的问题；保留 PNG/JPEG 文件格式、hash、页面身份、期限和实际审阅检查。此前四项运行安全修复保留。审计器修改后重新冻结候选并完成全套验收，旧候选结果只用于恢复。

| Gate | 结果 | 必需用例数 |
|---|---|---:|
| A | PASS | 16 |
| B | PASS | 39 |
| C | PASS | 9 |
| D | PASS | 29 |

Unit/deterministic 20/20、Integration 34/34、Live Browser 93/93；Integration 的 Chrome adapter 和 Worker 容量 seam 明确为模拟，未计入 Live。实际 Chrome 150.0.7871.125、Node v24.15.0、Native Messaging，Extension ID jpjgepfbapojijlabljgdpbhfmiapkin，版本 0.3.1。Worker 可执行指纹/文件 hash 和 26 份参与 document 的 Content/Locator 运行指纹已核对。

| 新订单 | DOM read | Input actual | Server amount | 提交数 | 最终 DOM |
|---|---:|---:|---:|---:|---|
| ORDER_39919176 | 605.43 | 605.43 | 605.43 | 1 | Completed |
| ORDER_48097630 | 721.14 | 721.14 | 721.14 | 1 | Completed |
| ORDER_0d599838 | 671.43 | 671.43 | 671.43 | 1 | Completed |

每单真实 readRequestId → fill.sourceReadRequestId 相等，原始响应、完整目标身份和独立服务端 verifier 保存在 JSON 报告的 orders/requirementMatrix。六类定位的唯一/零/歧义，Frame/Document/八字段身份、所有 stale 生命周期及执行竞争、五类 outcome、认证、普通模式 test 禁用、敏感输出扫描和负控均通过。

30 项冻结配置的资源容量/期限证据在 resourceMatrix，逐项区分 Unit、Integration、Live。最终 pending=0，缓存有界；未完成扫描拒绝“唯一”。八类审计反向变体全部拒绝。全部 required cases 驱动审计通过，4759 条 Trace 检查了关联、完整身份与唯一终态。

视觉在 C 后真实截图并实际查看，23.359 秒内完成。640px 卡片、输入和按钮对齐，无非预期裁切；正常纵向滚动可见三笔 Completed/count1。原始 JPEG 截图：/Users/mac/Documents/workspace/clawdesk/.runtime/tests/browser-automation-core/dom-1790964120948/visual-full.jpg。

23 次当前候选公开命令从 README 指定仓库根目录原样执行，普通与 test mode 均通过 setup/start/doctor/tabs/fixture/golden/verify-golden/cleanup，另有完整 verify、重复 setup、重装 doctor 和最终 stop。仅重定向输出用于证据，不替换可执行文件。cleanup 前后 PID/命令/cwd/listener/安装归属清单和证据保留检查均通过。最终普通模式 Native registration 和 unpacked Extension 保留安装；核对时无 Broker、fixture 或 Native Host 进程。无 Broker 时 Chrome 可能发起短暂、有界 Native 重连尝试。

预期故障包含实际断连、Host 退出、Extension reload、Broker restart、协议/消息/队列拒绝、精确丢 ACK 和受控取消。Last Confirmed Boundary：Confirm 已点击、服务端 count1、DOM Completed。First Unknown Boundary：Extension → Broker 的指定 ACK 被遗漏。Broker 保持长期 owner，OUTCOME_UNKNOWN 停止；同一 fixture 在重连和 Broker restart 后仍为 count1。Owner confidence：CONFIRMED。

非预期故障单独保留：首轮观察助手导致 60 秒视觉超时；修正助手后重新运行且未放宽期限。审计器 PNG-only 检查误拒绝 JPEG；最小修复后完成新候选全量回归。最终候选没有未完成必需项。

完整 requirement → artifact/command → actual evidence → status 矩阵及资源/加载 hash、来源、session/epoch、三订单 raw lineage、错误边界、视觉、清理和限制见 core-demo-report.json。完整审计索引：/Users/mac/Documents/workspace/clawdesk/.runtime/tests/browser-automation-core/final-index.json；审计结果：/Users/mac/Documents/workspace/clawdesk/.runtime/tests/browser-automation-core/final-audit.json。

支持边界：仅 macOS + Chrome + 127.0.0.1 HTTP fixture；无 arbitrary eval/CSS、完整 ARIA、shadow DOM、跨 origin、上传下载、复杂 profile/cookies。此任务未实现 MCP/Recipe/Recorder/Flow/Scheduler/Marketplace/Desktop 集成。Core PASS 后仅向既有 Demo 2 实证交接。

已向既有 Demo 2（01a0f903-7dcc-7470-99cd-dc45512ebe50，local）发送唯一实证完成交接，并在目标任务最新用户消息中确认收到专属 marker；该任务已开始核验前置条件。
