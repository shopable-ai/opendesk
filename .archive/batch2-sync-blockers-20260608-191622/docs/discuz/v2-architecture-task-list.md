# testMonkey-go v2 架构改造任务清单（可执行版）

更新时间：2026-03-02
适用周期：2026 Q2-Q3
关联文档：
- `docs/discuz/upgrade.md`
- `docs/discuz/openclaw-architecture-notes.md`
- `docs/discuz/experience-script-asset-strategy.md`
- `docs/discuz/multimodal-perception-roadmap.md`
- `docs/discuz/ocr-ui-tooling-options.md`

---

## 1. 使用说明
- 本清单用于直接拆分 Issue、排期开发、进行迭代验收。
- 每个任务都包含：`编号`、`优先级`、`依赖`、`预计工时`、`触点`、`验收标准（DoD）`、`回滚策略`。
- 执行建议：先完成 P0，再启动 P1；P2 仅在 P0/P1 指标达标后进入。

## 2. 里程碑与目标

### M0（第 1-2 周）：止血与基线
目标：先消除高风险点，建立可控执行面。

### M1（第 3-6 周）：核心重构
目标：完成 Session + Queue + API v1 主体能力。

### M2（第 7-10 周）：AI 工程化
目标：完成 `AGENTS.md` 自动生成、工具契约、评测与回放。

### M3（第 11-14 周）：平台增强
目标：多 Agent、插件协议、策略引擎预研与小范围落地。

## 3. 全局 Definition of Done（所有任务通用）
1. 代码已通过本任务新增的测试与现有核心测试。
2. 文档已更新（至少包含使用说明与迁移说明）。
3. 变更可回滚（配置开关或兼容层可恢复）。
4. 核心日志可观测（错误码、taskId、sessionId）。
5. 无新增高危安全洞（至少完成本地安全自检）。

## 4. P0 任务（必须先完成）

### P0-001 入口解耦（CLI/Server 分离）
- 优先级：P0
- 依赖：无
- 预计工时：2-3 天
- 触点：
  - `cmd/cli/main.go`（新）
  - `cmd/server/main.go`（新）
  - `internal/app/bootstrap.go`（新）
  - `main.go`（保留兼容入口或跳转）
- 执行内容：
  - 将当前 `main.go` 中 CLI 与 HTTP 逻辑分离。
  - 保留旧启动参数兼容层。
- 验收标准：
  - `go run ./cmd/cli -script examples/test.js` 可运行。
  - `go run ./cmd/server` 可启动服务。
  - 旧命令不立刻失效（兼容至少 2 个小版本）。
- 回滚策略：恢复到单入口，保留新增目录但不启用。

### P0-002 全局状态收敛（去共享 runtime）
- 优先级：P0
- 依赖：P0-001
- 预计工时：2-4 天
- 触点：
  - `internal/session/manager.go`（新）
  - `internal/session/session.go`（新）
  - `automation/*`（调用侧改造）
- 执行内容：
  - 引入 `Session`，每个任务独立 goja runtime。
  - 移除/隔离全局 `jsRuntime`。
- 验收标准：
  - 并发提交 5 个脚本任务，不出现 runtime 竞态崩溃。
  - 日志可按 `sessionId` 区分。
- 回滚策略：配置开关切回单实例 runtime。

### P0-003 任务队列（lane 串并行）
- 优先级：P0
- 依赖：P0-002
- 预计工时：3-4 天
- 触点：
  - `internal/queue/lane_queue.go`（新）
  - `internal/app/task_service.go`（新）
- 执行内容：
  - 同 `sessionId` 串行；跨 session 并行。
  - 全局并发上限可配置。
- 验收标准：
  - 同一 session 的任务严格按提交顺序执行。
  - 队列满时返回明确错误码。
- 回滚策略：降级为同步执行模式（仅单任务）。

### P0-004 API v1 最小闭环
- 优先级：P0
- 依赖：P0-001, P0-003
- 预计工时：3 天
- 触点：
  - `internal/api/http/router.go`（新）
  - `internal/api/http/task_handler.go`（新）
- 执行内容：
  - 新增接口：
    - `POST /v1/tasks`
    - `GET /v1/tasks/:id`
    - `GET /v1/capabilities`
- 验收标准：
  - 能创建任务并查询状态（`queued/running/succeeded/failed`）。
  - 返回统一错误结构与错误码。
- 回滚策略：保留旧 `/SCRIPT_RUN` 与 `/status` 路由兼容。

### P0-005 安全基线（默认最小权限）
- 优先级：P0
- 依赖：P0-004
- 预计工时：2 天
- 触点：
  - `internal/security/auth.go`（新）
  - `internal/security/policy.go`（新）
  - `config.ini` 或 `configs/*.yaml`（建议新增）
- 执行内容：
  - 默认仅绑定 `127.0.0.1`。
  - API Token 校验（Header: `Authorization: Bearer ...`）。
  - 高危动作策略白名单。
- 验收标准：
  - 未授权请求返回 401。
  - 非白名单高危动作被拒绝并记录审计。
- 回滚策略：`DEV_INSECURE=true` 临时放开（仅开发模式）。

### P0-006 审计日志（结构化事件）
- 优先级：P0
- 依赖：P0-004
- 预计工时：2 天
- 触点：
  - `internal/observability/audit.go`（新）
  - `internal/observability/event_types.go`（新）
- 执行内容：
  - 定义事件：`task_started/task_step/task_failed/task_finished`。
  - 统一字段：`taskId/sessionId/action/result/errorCode/duration`。
- 验收标准：
  - 每个任务至少产生开始与结束事件。
  - 错误事件包含可检索错误码。
- 回滚策略：降级为文件日志但保留事件字段。

### P0-007 能力重复收敛（HTTP/timer 双轨）
- 优先级：P0
- 依赖：P0-001
- 预计工时：3 天
- 触点：
  - `automation/http.go`
  - `automation/axios.go`
  - `automation/timer.go`
  - `automation/js.go`
- 执行内容：
  - 合并重复实现到单主路径。
  - 兼容层标记 deprecated 并给迁移提示。
- 验收标准：
  - 示例脚本兼容率 >= 95%。
  - 无重复模块并行维护。
- 回滚策略：保留历史实现分支，开关切换。

### P0-008 AGENTS 上下文自动生成（MVP）
- 优先级：P0
- 依赖：P0-001
- 预计工时：3 天
- 触点：
  - `cmd/agentdoc/main.go`（新）
  - `internal/ai/context/generator.go`（新）
  - `AGENTS.md`（新，自动生成）
  - `agent.context.json`（新，自动生成）
- 执行内容：
  - 从 Go 方法、d.ts、examples 聚合生成上下文。
  - 提供命令：`-write` 与 `-check`。
- 验收标准：
  - 本地可生成两个文件。
  - CI 下 `-check` 能阻断未同步变更。
- 回滚策略：切回手工维护文档，但保留生成器代码。

### P0-009 能力契约输出（tools schema）
- 优先级：P0
- 依赖：P0-008
- 预计工时：2-3 天
- 触点：
  - `internal/registry/schema.go`（新）
  - `docs/ai/tool-catalog.md`（新）
  - `GET /v1/tools/schema`（新增）
- 执行内容：
  - 输出结构化工具契约（参数、副作用、失败语义）。
- 验收标准：
  - 接口返回可解析 JSON schema。
  - 至少覆盖 `mouse/keyboard/window/screen/http` 核心工具。
- 回滚策略：接口隐藏但保留内部 schema 生成。

### P0-010 构建门槛下降（gocv 可选化）
- 优先级：P0
- 依赖：无
- 预计工时：2 天
- 触点：
  - `automation/imageColor.go`（按 build tags 拆分）
  - `go.mod`（必要时按 build tag 组织）
  - `README.md`（编译说明更新）
- 执行内容：
  - 将 OpenCV 能力拆为可选构建。
  - 提供 `basic` 模式保证默认可 build/test。
- 验收标准：
  - 无 OpenCV 环境可通过核心构建。
  - OpenCV 环境可启用增强能力。
- 回滚策略：恢复当前单构建路径。

### P0-011 评测基线（20 个核心场景）
- 优先级：P0
- 依赖：P0-004
- 预计工时：3-5 天
- 触点：
  - `test/e2e/*.yaml` 或 `test/e2e/*.json`（新）
  - `internal/ai/eval/runner.go`（新）
  - CI 配置文件（新增 job）
- 执行内容：
  - 建立最小回归评测集与自动执行脚本。
- 验收标准：
  - 发布前自动运行快速集。
  - 输出成功率、超时率、失败分布。
- 回滚策略：CI 标记为非阻断，但保留报告。

### P0-012 迁移文档与兼容策略发布
- 优先级：P0
- 依赖：P0-001 至 P0-011
- 预计工时：1-2 天
- 触点：
  - `docs/migration/v1-to-v2.md`（新）
  - `docs/api/v2.md`（新）
- 执行内容：
  - 给出旧接口迁移对照表与废弃时间线。
- 验收标准：
  - 用户能据文档完成脚本迁移。
  - 废弃项有明确版本计划。
- 回滚策略：延后废弃窗口，延长兼容期。

### P0-013 长期运行 Session 生命周期（长任务/分步执行/续跑）
- 优先级：P0
- 依赖：P0-002, P0-003, P0-004
- 预计工时：3-4 天
- 触点：
  - `internal/session/store.go`（新）
  - `internal/session/checkpoint.go`（新）
  - `internal/api/http/session_handler.go`（新）
- 执行内容：
  - Session 增加生命周期状态：`active/idle/paused/resumed/expired`。
  - 增加 checkpoint（步骤级保存）与 resume（从断点继续）。
  - 支持长任务心跳与超时回收。
- 验收标准：
  - 单任务可在中断后按 checkpoint 续跑。
  - 长时任务超过 30 分钟仍可保持状态一致。
  - Session 过期策略可配置且可审计。
- 回滚策略：关闭 checkpoint/resume，退回一次性任务模型。

## 5. P1 任务（P0 达标后启动）

### P1-001 回放系统（动作+截图摘要）
- 依赖：P0-006
- 工时：3-4 天
- 验收：可回放失败任务关键步骤并定位失败点。

### P1-002 幂等键与动作级重试
- 依赖：P0-003, P0-004
- 工时：2-3 天
- 验收：重复请求不会产生重复副作用。

### P1-003 平台能力矩阵 API
- 依赖：P0-004
- 工时：2 天
- 验收：不同 OS 返回明确支持等级与 `unsupported_reason`。

### P1-004 统一错误码体系
- 依赖：P0-004
- 工时：2 天
- 验收：核心错误具备稳定 code 与建议修复文案。

### P1-005 可观测性增强（metrics + trace）
- 依赖：P0-006
- 工时：3 天
- 验收：支持任务延迟、队列长度、失败率可视化。

### P1-006 d.ts 与 tool schema 同步校验
- 依赖：P0-009
- 工时：2 天
- 验收：CI 自动检测声明与契约漂移并阻断。

### P1-007 实时数据通道（SSE/WS）供 Agent 即时决策
- 依赖：P0-004, P0-006, P0-013
- 工时：3-5 天
- 触点：
  - `internal/api/http/stream_handler.go`（新）
  - `internal/observability/event_bus.go`（新）
- 执行内容：
  - 增加实时事件订阅接口（优先 SSE，可选 WebSocket）。
  - 支持 `task_step` 增量事件、错误事件、checkpoint 事件、心跳事件。
  - 提供 `since_offset` / `since_timestamp` 增量拉取能力，避免丢事件。
- 验收标准：
  - Agent 可实时消费任务事件并在 1 秒内获取新步骤数据。
  - 连接断开后可按 offset 续拉，不丢关键事件。
  - 高并发下事件顺序在同 `taskId` 内保持一致。
- 回滚策略：关闭流式订阅，仅保留轮询查询模式。

### P1-008 经验资产库（Recipe/Workflow）与“检索优先执行”
- 依赖：P0-008, P0-009, P1-006
- 工时：4-6 天
- 触点：
  - `automation/assets/recipes/*`（新）
  - `automation/assets/workflows/*`（新）
  - `internal/app/recipe_service.go`（新）
  - `internal/api/http/recipe_handler.go`（新）
- 执行内容：
  - 建立 Recipe manifest 规范与索引。
  - Agent 调度改为“先检索已有资产，再参数化执行，最后才生成代码”。
  - 记录 `recipe_reuse_rate` 与 `token_per_task` 指标。
- 验收标准：
  - Top20 高频任务中，复用执行占比 >= 70%。
  - 单任务平均 token 消耗下降 >= 40%。
  - 首轮成功率较基线可量化提升。
- 回滚策略：保留传统“直接生成脚本”路径作为兜底。

### P1-009 视觉 MVP（OCR + UI 元素定位）
- 依赖：P0-004, P1-007
- 工时：4-6 天
- 触点：
  - `internal/perception/vision/ocr.go`（新）
  - `internal/perception/vision/detect_ui.go`（新）
  - `internal/api/http/vision_handler.go`（新）
- 执行内容：
  - 提供 `POST /v1/vision/ocr` 与 `POST /v1/vision/detect-ui`。
  - 输出统一元素结构（text/bbox/confidence/role）。
- 验收标准：
  - 聊天窗口消息抽取准确率达到预设阈值。
  - 按“文本+位置”定位按钮成功率显著高于纯坐标方案。
- 回滚策略：关闭视觉接口，退回截图+找色策略。

### P1-010 坐标映射引擎（多分辨率/DPI）
- 依赖：P1-009
- 工时：3-4 天
- 触点：
  - `internal/perception/coord/mapper.go`（新）
  - `internal/perception/coord/types.go`（新）
- 执行内容：
  - 统一窗口坐标、屏幕坐标、客户区坐标转换。
  - 兼容多显示器与 DPI 缩放偏移。
- 验收标准：
  - 同一流程在不同分辨率下点击命中率稳定。
  - 坐标漂移导致的失败率显著下降。
- 回滚策略：保留旧坐标路径，按配置切换。

### P1-011 聊天软件自动回复 MVP（单软件）
- 依赖：P1-008, P1-009, P1-010
- 工时：4-6 天
- 触点：
  - `automation/assets/recipes/chat_auto_reply_v1.yaml`（新）
  - `internal/app/chat_reply_service.go`（新）
  - `internal/api/http/chat_handler.go`（新）
- 执行内容：
  - 实现“识别未读 -> 切换会话 -> 读取消息 -> 模板回复 -> 发送验证”闭环。
  - 支持人工确认模式与自动模式切换。
- 验收标准：
  - 单软件连续运行可稳定处理多对话切换。
  - 回复前后有审计记录与失败可回放。
- 回滚策略：仅保留“读取消息，不自动发送”的安全模式。

## 6. P2 任务（增强项）

### P2-001 双 Agent 协作（执行 + 验证）
- 依赖：P1 全部
- 工时：5-7 天
- 验收：复杂任务成功率较单 Agent 有可量化提升。

### P2-002 插件协议与私有 registry
- 依赖：P0-009
- 工时：5-8 天
- 验收：插件可注册、签名校验、按策略加载。

### P2-003 策略引擎（RBAC/审批）
- 依赖：P0-005, P0-006
- 工时：5-7 天
- 验收：高危动作可走审批流并完整审计。

### P2-004 行业评测集扩展（100+）
- 依赖：P0-011
- 工时：持续迭代
- 验收：版本对比报告可用于发布决策。

### P2-005 语音模块（ASR/TTS/流式音频）
- 依赖：P1-007, P1-011
- 工时：5-8 天
- 验收：支持语音转文本、文本播报与实时语音事件。

### P2-006 视频能力（录制/帧分析/复盘）
- 依赖：P1-001, P1-009
- 工时：5-8 天
- 验收：可录制任务过程并基于关键帧做失败复盘。

## 7. 建议排期（可直接执行）

### Sprint A（第 1-2 周）
- P0-001
- P0-002
- P0-003
- P0-004

### Sprint B（第 3-4 周）
- P0-005
- P0-006
- P0-007

### Sprint C（第 5-6 周）
- P0-008
- P0-009
- P0-010

### Sprint D（第 7-8 周）
- P0-011
- P0-012
- P0-013
- P1-004

### Sprint E（第 9-10 周）
- P1-001
- P1-002
- P1-003
- P1-005
- P1-006
- P1-007
- P1-008
- P1-009
- P1-010
- P1-011

## 8. 每周例会检查清单
1. 本周完成的任务编号与验收证据。
2. 下周任务是否存在依赖阻塞。
3. 回归指标是否下降（成功率/超时率）。
4. 安全事件是否新增。
5. `AGENTS.md` 与 `agent.context.json` 是否已刷新。

## 9. Issue 模板（建议直接复制）

```markdown
标题：`[v2][P0-XXX] 任务名称`

目标：
- 

范围：
- 变更文件：
- 不变更项：

验收标准（DoD）：
1. 
2. 
3. 

回滚方案：
- 

风险：
- 

关联任务：
- 依赖：
- 后续：
```

## 10. 启动顺序（今天就可以开始）
1. 创建分支：`feat/v2-arch-phase1`
2. 首批立项：`P0-001` 到 `P0-004`
3. 先落地最小 API v1 与 Session/Queue，避免继续在全局 runtime 上叠需求。
4. 同步建立 `cmd/agentdoc` 骨架，确保文档与能力契约从第一周就纳入流程。
