# Browser automation dual-stack continuation prompt (post-audit bootstrap)

你现在接手 /Users/a0000/Documents/workspace/testMonkey-go 的浏览器自动化接口体系升级后续深化工作。

目标定位
- 你不是在做标准 Node.js Playwright 项目升级。
- 这是一个 Go + goja + polyfills + robotgo 的混合运行时。
- 当前目标仍然是双栈并存与逐步迁移：
  - legacy
  - upgraded
  - playwright facade
- playwright 当前仍只是 compatibility shim，不是完整 runtime。

硬性约束
1. 必须 grounded 在仓库真实代码、测试、文档、脚本与证据上，不能空谈。
2. 不允许把 shim 夸大成 full Playwright runtime。
3. 不允许把 facade proof 写成 runtime proof。
4. 没证据就降级表述。
5. 不能重复收尾已完成工作，必须在当前最新基线之上继续推进。

你必须先读取并理解这些关键文件
- /Users/a0000/Documents/workspace/testMonkey-go/automation/utils.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/browser.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/runtime_stack.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/page.go
- /Users/a0000/Documents/workspace/testMonkey-go/polyfills/000-page.js
- /Users/a0000/Documents/workspace/testMonkey-go/polyfills/010-browser-automation-upgraded.js
- /Users/a0000/Documents/workspace/testMonkey-go/automation/browser_compat_test.go
- /Users/a0000/Documents/workspace/testMonkey-go/pkg/execution/runner.go
- /Users/a0000/Documents/workspace/testMonkey-go/pkg/http/handler.go
- /Users/a0000/Documents/workspace/testMonkey-go/main.go
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-stacks.md
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-capability-boundaries.md
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-next-phase-roadmap.md
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-test-matrix.md
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-capability-evidence-manifest.json
- /Users/a0000/Documents/workspace/testMonkey-go/scripts/validate_browser_automation_evidence.py
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_legacy_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_upgraded_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_playwright_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_macos_app_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_http_e2e_smoke.py
- /Users/a0000/Documents/workspace/testMonkey-go/scripts/test_browser_stack_http_smoke.sh

当前最新基线（已完成事项）
1. close contract conservative decision 已完成
2. capability boundaries doc 已完成
3. roadmap doc 已完成
4. selector wait hardening 已完成
5. evaluate hardening 已完成
6. facade-level closed-state introspection 已完成
7. 多类 smoke / HTTP / macOS / execution tests 已通过
8. capability-to-evidence audit bootstrap 已完成：
   - docs/browser-automation-capability-evidence-manifest.json
   - scripts/validate_browser_automation_evidence.py
   - 文档已补充 bootstrap 边界说明

当前已明确的判断
- 主 P0（上一轮）已经不是继续扩 facade，而是先防 claim/evidence drift。
- audit bootstrap 已落地，因此下一阶段首选执行主线应重新转向：smoke output standardization。
- 但你必须重新审计仓库当前状态后才能确认，不允许直接照抄。

本轮候选路线（必须重新排序并论证）
- smoke output standardization
- page ownership / lifecycle 预研
- runtime-backed selector dialect 预研
- runtime-backed evaluate boundary 预研
- capability-to-evidence audit bootstrap 后续强化（如果你发现 bootstrap 仍明显不够）

你本轮的主任务
1. 先重新评估：在 audit bootstrap 已完成的前提下，“下一阶段最值得做的单一主 P0”是什么。
2. 必须在上述候选中给出优先级排序与论证。
3. 必须提出：
   - 主推荐路线
   - 备选路线
   - 明确不推荐本轮做的路线
4. 如果主推荐路线适合直接做，继续向前推进一轮最小落地：
   - 代码 / 脚本 / 测试 / 文档 / 证据
5. 优先考虑最小但真实、可验证、不会夸大 runtime 语义的推进。

强烈建议的当前主线方向（仅作为待验证假设，不是可直接复述的答案）
- smoke output standardization 很可能是最新最值得做的单一主 P0。
- 你要验证的重点：
  - 当前 CLI / HTTP / macOS smoke 的输出字段是否一致
  - 是否能统一输出：ok / stack / selectedApp / skipped / runtimeNote / finalStatus / executionId / artifactDir / evidenceLevel / boundaryNote 等字段
  - 是否能让证据更容易被审计，而不误导为 full runtime proof

如果你最终选择 smoke output standardization 作为主 P0，则最小实现要求
A. 统一 smoke 输出结构
- 至少覆盖：
  - examples/browser_stack_macos_app_smoke.js
  - examples/browser_stack_http_e2e_smoke.py
  - scripts/test_browser_stack_http_smoke.sh
- 优先统一字段：
  - ok
  - stack
  - selectedApp
  - skipped
  - runtimeNote
  - finalStatus
  - executionId
  - artifactDir
  - proofLevel
  - boundaryNote

B. 文档同步
- 更新：
  - docs/browser-automation-test-matrix.md
  - docs/browser-automation-next-phase-roadmap.md
  - 如有必要更新 docs/browser-automation-capability-boundaries.md 或 docs/browser-automation-stacks.md
- 必须明确：
  - 这些 smoke 证明的是 execution path / facade routing / desktop runtime path / real-environment evidence 的哪一层
  - 不是什么

C. 测试与证据
- 必须提供真实命令、关键输出、产物路径
- 至少验证：
  - validator 仍通过
  - automation / execution / http 相关关键测试未回归
  - 如主线涉及 smoke 脚本修改，必须跑对应 smoke 验证并保留产物

执行纪律
1. 必须先做任务拆分。
2. 必须继续使用 3 个专家 × 20 轮讨论的形式。
3. 每轮都要评分，评分公式固定为：
   Score = 0.30C + 0.25R + 0.20T + 0.15M + 0.10E
4. 每轮必须驱动：
   - 测试设计
   - 文档修正
   - 代码/脚本修改
   - 或优先级调整
5. 必须提供真实测试证据：命令、关键输出、产物路径。
6. 如果总体分数低于 95，不允许结束。
7. 只有当：
   - 下一阶段主路线已经足够清晰；且
   - 当前轮已经完成一个最小但真实的前进一步
   才允许停止。

盲区审计要求
- 每 3~5 轮至少一次盲区审计，明确：
  - 当前分数为什么还不够高
  - 哪些证据只是 facade proof，不代表 runtime proof
  - 哪些 smoke 输出即使更漂亮，也不能被误写成 stronger semantics
- 每 5 轮至少一次自我否决，假设当前主路线是错的，说明最可能错在哪。

推荐最小验证命令
- python3 scripts/validate_browser_automation_evidence.py
- go test ./automation -run 'TestBrowser|TestApplyRuntimeStackMode|TestPlaywright|TestUpgradedPage|TestLocator|TestUpgradedBrowser|TestFacadeCloseMethodsRemainCallableAfterFirstClose' -count=1
- go test ./pkg/execution ./pkg/http -run 'TestRunJavaScriptAppliesRequestedStackMode|TestHandleExecutions' -count=1
- 若修改 HTTP smoke：
  - bash scripts/test_browser_stack_http_smoke.sh
- 若修改 macOS smoke：
  - go run . -script examples/browser_stack_macos_app_smoke.js -stack upgraded -timeout 1 -console-mode summary

最终输出格式必须严格按以下结构
1. 现状差距摘要
2. 任务拆分与优先级
3. 20轮专家讨论摘要（含每轮评分）
4. 本轮修改内容
5. 新增/调整测试用例列表
6. 测试执行结果
7. 测试证据（命令、关键输出、产物路径）
8. 每轮评分变化与最终总评分
9. 实际修改文件列表
10. 仍待迁移项
11. 为什么现在可以停止，或者为什么还不能停止
