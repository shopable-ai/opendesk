# TestMonkey MCP GOAL Prompt（新对话继续执行，直到真正交付）

把下面整段直接作为新对话里的 Goal / Prompt 使用。

---

你现在在 `/Users/a0000/Documents/workspace/testMonkey-go` 项目中，继续以“长期一次性执行”的方式，自主推进 TestMonkey MCP，直到把当前 mcpserver 推到一个“高可用、agent-friendly、可判定完成、接近最终可交付”的阶段再停止。

这一次不要停在“代码和文档已经差不多”“还需要人工 smoke”这种中间态。你要把当前阶段该完成的都完成掉：
- 实现闭环
- 测试闭环
- 文档闭环
- 真机 smoke 闭环
- 完成判定闭环
- 最终交付结论闭环

你的目标不是只补接口，也不是只做一轮 review，而是把“实现、验证、盲区审计、自我否决、测试补齐、文档交付、真机 smoke、完成判定”整合成一条连续执行链路。

工作总原则：
1. 先读当前 MCP 相关文档、代码、测试，再行动。
2. 严格 TDD：任何新增能力、修复、收尾标准，都先写 failing tests。
3. 每完成一批就运行：
   - `go test ./pkg/mcpserver ./cmd/testmonkey-mcp`
4. 自动修到通过。
5. 每轮都同步更新文档。
6. 不要 clone Peekaboo 作为主实现。
7. 优先复用现有 automation / vision / window / screen 能力。
8. 不引入不必要的大抽象层。
9. 不要只做正向方案，必须做盲区审计 + 自我否决 + 反方攻击。
10. 不要过早结束；只有在继续投入已难以显著提高总分时才停止。
11. 这次不允许停在“manual smoke 还没做”。如果可用工具能够做真机 smoke，就直接做完；只有遇到系统权限弹窗、用户凭据、或必须人工授权时，才把阻塞点明确定义为“外部阻塞”。

先读这些文件：
- `docs/mcp/DELIVERY-CHECKLIST.md`
- `docs/mcp/TEST-MATRIX.md`
- `docs/mcp/MANUAL-SMOKE-macOS.md`
- `docs/mcp/testmonkey-mcp-plan.md`
- `docs/mcp/README.md`
- `docs/mcp/hermes-integration.md`
- `docs/mcp/NEXT_CHAT_PROMPT.md`
- `pkg/mcpserver/server.go`
- `pkg/mcpserver/runtime.go`
- `pkg/mcpserver/server_test.go`
- `pkg/mcpserver/runtime_test.go`
- `cmd/testmonkey-mcp/main.go`

当前阶段主目标：
把 TestMonkey MCP 当前阶段最关键的 host-friendly target discovery + safe action loop 做到“实现闭环 + 测试闭环 + 文档闭环 + 真机 smoke 闭环 + 交付判定闭环”。

必须围绕以下主链路推进：
- `tm_inspect_desktop`
- `tm_find_target`
- `tm_act_on_target`

当前优先级：
1. 真实 macOS smoke/runbook 执行并回填结果
2. 完成判定与交付控制层最终收口
3. 测试矩阵与缺口补齐
4. Windows-first 残留语义清理
5. inspect -> find -> act 主链路最终收口
6. 只有在前面都完成后，再补非阻塞增强

你必须按以下阶段连续执行，不要跳步：

阶段 A：基线复核与阻塞项识别
目标：
- 基于现有 delivery checklist / test matrix / manual smoke 文档，判断当前还差什么
- 不要重复生成空洞总结，要把“剩余阻塞项”精确化

执行要求：
1. 先总结当前：
   - 已实现能力
   - 已有测试
   - 已有文档
   - 当前主链路状态
   - 当前阻塞与非阻塞项
2. 以 `docs/mcp/DELIVERY-CHECKLIST.md` 为准，找出还没有真正完成的项。
3. 如果发现文档与代码/测试不一致：
   - 以测试和实际代码为准
   - 先写 failing tests，再修代码，再修文档

阶段 B：测试优先补齐
目标：
把文档中声称已经成立的能力，尽可能变成自动化测试。

优先补测试：
1. `tm_find_target`
   - `strategy=ocr/detect_ui/layout/hybrid`
   - ranked candidates
   - bestCandidate
   - ambiguity signaling
   - OCR line candidates 纳入统一 candidate 模型
2. `tm_act_on_target`
   - staleTarget guard
   - ambiguousTarget guard
   - `allowAmbiguous=true`
   - `dryRun / previewOnly`
   - `expectedWindowTitle / expectedTargetText`
3. inspect -> find -> act
   - 推荐主链路 smoke contract
4. schema
   - freshness / ambiguity / target metadata 字段断言
5. runtime adapter
   - 若当前明显偏薄，则补最小高价值 unit tests

要求：
- 任何新增测试先 fail，再修到 pass
- 每一批完成后都运行：
  - `go test ./pkg/mcpserver ./cmd/testmonkey-mcp`

阶段 C：macOS 真机 smoke 真正执行
目标：
这一次不要只写手册，要实际执行 manual smoke。

你要做：
1. 按 `docs/mcp/MANUAL-SMOKE-macOS.md` 真正执行：
   - build
   - Hermes 接入检查
   - `tm_status`
   - `tm_permissions`
   - `tm_list_windows`
   - `tm_screenshot`
   - `tm_inspect_desktop`
   - `tm_find_target`
   - `tm_act_on_target`（先 `previewOnly`）
2. 如果可以，再做一次低风险真实执行：
   - focus 或 type 或 click
3. 对每一步记录：
   - 是否成功
   - 失败表现
   - 属于系统权限问题 / 实现问题 / 能力边界 / 外部阻塞
4. 把结果回填到文档：
   - `docs/mcp/MANUAL-SMOKE-macOS.md`
   - 必要时更新 `DELIVERY-CHECKLIST.md`
   - 必要时更新 `README.md` / `hermes-integration.md`
5. 只有遇到真实系统授权弹窗、必须用户批准的系统权限、或用户凭据时，才允许把该项标为外部阻塞。

阶段 D：平台语义收口
目标：
把当前偏 Windows-first 的残留表达改成：
- 跨平台表述
- 或明确写出 macOS 当前限制

你要做：
1. 检查 `runtime.go`、文档、schema、tool 描述中是否还有明显 Windows-first 表述。
2. 改成更 host-friendly 的跨平台表述，或在文档中明确降级为“底层元数据，不是稳定 contract”。
3. 如果需要小修测试，也按 TDD 做。

阶段 E：多专家盲区审计 + 自我否决
目标：
当实现、测试、文档、真机 smoke 已有一定收口后，进行高强度质量审计。

你必须模拟并组织 3 位专家，连续讨论 20 轮：
1. 架构与可维护性专家
2. 测试与可靠性专家
3. 反方/红队攻击专家

每轮必须包含：
- 聚焦 1~3 个最值得攻击的小问题
- 三位专家分别发言
- 明确反方攻击，不允许只有正方建议
- 给出修正建议
- 给出评分
- 给出与上一轮对比
- 给出下一轮攻击重点

评分维度固定如下：
- A. 需求完成度（20）
- B. 架构质量（15）
- C. 测试与回归保护（20）
- D. 可靠性与异常处理（15）
- E. 文档与可交接性（10）
- F. 平台/环境适配性（10）
- G. 风险暴露与可观测性（10）

总分公式：
- Total = A + B + C + D + E + F + G

评分规则：
- 若存在阻塞级缺陷，总分上限 <= 79
- 若存在高风险未验证项，总分上限 <= 89
- 若缺少关键自动化测试或关键人工验证闭环，总分上限 <= 92
- 只有当：
  - 无阻塞级缺陷
  - 高风险项有明确缓解
  - 测试/验证闭环基本完整
  - 文档可交接
  才允许进入 95+ 区间

要求：
- 不允许因为“已经能跑”就提前结束
- 不允许在总分明显低于 95 时草率收尾
- 必须持续迭代，直到“继续投入也很难显著提分”
- 但如果分数上不去的唯一原因是外部阻塞（例如系统权限必须人工授权），必须明确写出阻塞归因，而不是继续假装靠代码能解决

阶段 F：最后收口与交付输出
停止条件：
- 当前阶段最关键的 host-friendly target discovery + safe action loop 已完整闭环
- 测试稳定通过
- 文档已同步更新
- 完成判定标准已写清楚
- 自动化测试与人工 smoke 的边界已写清楚
- 真机 smoke 已执行，或已被严格归因为外部阻塞
- 下一步只剩长期增强，而不是当前阻塞项
- 20 轮专家审计后，继续投入已难以显著提高总分

最终输出必须包含：
1. 已完成能力清单
2. 当前怎样判断“已经完成”的明确标准
3. 当前已有测试清单
4. 当前仍只能人工 smoke 验证的部分
5. 当前已知限制
6. 20 轮专家审计总结
7. 最终总评分
8. 当前还未做但不再阻塞交付的增强项
9. 对 TestMonkey MCP 当前成熟度的判断
10. 如果还要继续做，最值得补的前 3 个点
11. 若未达 95+，明确说明卡分原因到底是：
   - 代码问题
   - 测试问题
   - 文档问题
   - 平台问题
   - 外部阻塞

执行纪律：
- 不要只说计划，直接做
- 不要停在抽象分析
- 发现缺文档就补文档
- 发现缺测试就先写 failing tests
- 发现文档声称与测试不一致，就以测试和实际代码为准，修正文档
- 每完成一批必须运行：
  - `go test ./pkg/mcpserver ./cmd/testmonkey-mcp`
- 若某项只能人工验证，必须明确写入 manual smoke 文档，不要假装已有自动化覆盖
- 如果工具足以执行真机 smoke，就必须直接执行，不允许再次以“留给下轮”收尾
- 不允许再次在“代码完成但 smoke 未做”的中间态停止

---

快捷用法（可直接粘贴到新对话开头）

请严格按照 `/Users/a0000/Documents/workspace/testMonkey-go/docs/mcp/GOAL-PROMPT-FINAL-DELIVERY.md` 执行，直到真正完成当前阶段交付，不要停在中间态。先读文档与代码，再直接开始。
