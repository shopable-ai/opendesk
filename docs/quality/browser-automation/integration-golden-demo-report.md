# Demo 2 — OpenDesk Browser Integration Golden Demo

Demo 2 = **PASS**；Precondition Demo 1 = **PASS**。真实 Codex → existing OpenDesk MCP → same Core → real Extension/DOM → unique Agent Trace → existing automation-script workflow → ordinary JS → frozen Fresh Run/Qualification 已有对应实际证据。

| Stage | Status |
|---|---|
| A. Real Codex → MCP → Browser | PASS |
| B. Authoritative Browser Agent Trace | PASS |
| C. Agent-to-Recipe transformation | PASS |
| D. Ordinary JS Recipe | PASS |
| E. Candidate Freeze | PASS |
| F. Fresh Run without Agent | PASS |
| G. Qualification | PASS |

真实 Agent：19 次 MCP 调用、19 条唯一 canonical action；金额 DOM=Confirmation=server=596.96，submissionCount=1，Completed。

| Fresh Run | Actual Amount | Confirmation / server | count | Status |
|---|---|---|---|---|
| INTEG_fresh_B_54a40b0584 | 997.40 | 997.40 / 997.40 | 1 | Completed |
| INTEG_fresh_C_fd5f5d2d2a | 215.03 | 215.03 / 215.03 | 1 | Completed |
| INTEG_fresh_D_3f010ef26b | 64.57 | 64.57 / 64.57 | 1 | Completed |

Candidate Path: `/Users/mac/Documents/workspace/clawdesk/.runtime/automation-authoring/browser-integration-golden-demo/attempts/S11-build-r001/order.recipe.js`
Candidate Hash: `0492f858504d8a6116bc91554865979e7031192c2b2d21841b6442584b578543`
Generation Execution ID: `codex-task-01a0f903-7dcc-7470-99cd-dc45512ebe50/S11-build-r001`
Fresh Run Count: 3
Same Hash Used: yes
Agent Used During Fresh Run: no

| Negative | Test | Incorrect Candidate | Actual refusal |
|---|---|---|---|
| F1 | PASS | FAIL | DOM runtime amount 313.27 was replaced by hardcoded first-run 596.96 |
| F2 | PASS | FAIL | Host-bound permission rejects another same-name Tab before Core dispatch/input |
| F3 | PASS | FAIL | Core rejects old opaque target after actual document refresh as STALE_TARGET before input |
| F4 | PASS | FAIL | Independent server submissionCount = 2 instead of 1 |
| F5 | PASS | FAIL | Missing actual candidate final DOM verify despite accepted server submission |

Amount lineage: `/Users/mac/Documents/workspace/clawdesk/.runtime/automation-authoring/browser-integration-golden-demo/attempts/S12-qualify-r001/amount-lineage.json`。可以逐环追到首次 read/action、Distilled D05/D06、Business B05/B06、runtime amount、Core locator/read rule、Procedure、JS read/fill 区域及各 Fresh Run verifier。

既有工作流 S1—S12 全部 PASS；最终 `allowed=true`、status=qualified；S2 预算超限被保留并扣为 95 分，其余阶段按各自 evidence 独立审阅。S10 首次等待超时和首版最终汇总缺引用的失败均保留，未修改已发生事实或重放成功订单。

Last Confirmed Boundary: Same frozen ordinary JS completed three new orders through real Core/Extension/DOM, independent verifier count=1, and all F1-F5 incorrect candidates rejected; existing S1-S12 final qualification allowed=true
First Invalid / Unknown Boundary: none for this qualified scope
Failure Owner: CONFIRMED（controlled negative injection owners）

Evidence: `/Users/mac/Documents/workspace/clawdesk/docs/quality/browser-automation/integration-golden-demo-report.json`；全部 content-bound refs 在 JSON 正文。
Preserve: Core original evidence/source, Unique Agent canonical trace, All authoring versions/failed attempts, Frozen candidate/dependency bytes, All fresh and negative run evidence, Other tasks uncommitted changes
Invalidate: Old incomplete/blocked Demo 2 state, Qualification cannot transfer to changed source/dependency/permission, Incorrect candidates remain qualification FAIL
Next Minimum Action: Stop Demo 2. Only suggest Demo 3 Browser Human Demonstration Golden Demo; do not implement it.

Validation: MCP package regression、339 workflow regressions、public JS calls、API navigation/docs contract、git diff --check passed。全仓 test architecture audit 为 FAIL：15 项既有未登记 Go 测试；本轮新增 Go test 已登记，不把该全仓审计误报为 PASS。

普通启动与当前候选入口必须从仓库根目录 `/Users/mac/Documents/workspace/clawdesk` 执行。Core Broker/fixture 实际入口见 `lab/browser-automation-core/README.md`。本候选实际执行的一行命令：

```sh
.runtime/tests/browser-integration-golden-demo/bin/opendesk -allow-browser -browser-core-root /Users/mac/Documents/workspace/clawdesk -browser-origin http://127.0.0.1:51722 -browser-tab 759147624 -script .runtime/automation-authoring/browser-integration-golden-demo/attempts/S11-build-r001/order.recipe.js -console-mode script
```

输入文件 `.runtime/tests/browser-integration-golden-demo/recipe-input.json` 只包含新的 `orderId`；本轮实际冻结的 origin/Tab/Core/依赖不随业务输入改变。此命令属于本轮独立构建 CLI；`dist/opendesk` 的已签名 App 未被覆盖或作为新 API 验收证据。

Code modified: yes；Actually loaded: yes；Visual confirmed: 当前受控窗口截图已真实观察；Functions verified: yes。最终 refresh 后截图展示 Ready/empty，不冒充三订单完成截图；此前真实 DOM/独立服务端证据分别留存。

支持范围：macOS+Chrome、指定 loopback origin/Tab、现有有限 Core 语义。正式发行包、任意网站、Human Recorder、Browser+Desktop 不在本资格范围。

Git: master @ 877c852acca28b4658d01fd727b37b883b4792d1；本任务未提交、未推送；保留其他任务修改。


Final audit: frozen 59 dependency bytes/current source PASS; 675 ordinary output files scanned, private verifier credential findings=0.

Owned Demo2 tabs、Broker、fixture 已停止；原 Core installation 和全部 evidence 保留。未进入 Demo 3。

Source JSON SHA-256: 2ca8f98cf2c1a1e8e3848b94adf4959f4a982b1c59a6394f69bd7047f48c848e
