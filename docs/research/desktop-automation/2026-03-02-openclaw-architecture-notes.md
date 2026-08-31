# OpenClaw 系统功能架构思考与对标落地笔记（testMonkey-go）

更新时间：2026-03-02
用途：作为后续自动化框架升级时的长期参考文档（可持续维护）
配套执行清单：`docs/discuz/v2-architecture-task-list.md`

---

## 1. 文档目标
- 抽取 OpenClaw 官方文档中可复用的系统架构能力。
- 将这些能力映射到 `testMonkey-go` 的现实演进路径。
- 形成“可逐步实施”的配套功能清单，避免一次性大改。
- 为后续 AI 自动化功能扩展提供决策基线。

## 2. OpenClaw（官方）架构要点提炼

> 说明：以下为官方文档事实与工程化推断的结合。凡“推断”字样均为架构抽象，不是逐行官方原文。

### 2.1 Gateway 中枢（统一控制平面）
- 官方要点：
  - 单一长期运行 Gateway 承载消息面与控制面。
  - 客户端与节点通过 WebSocket 连接，采用 `connect` 首帧握手。
  - side-effect 方法要求幂等键，服务端做短期去重。
  - 协议由 schema 驱动并支持代码生成（TypeBox -> JSON Schema -> Swift 模型）。
- 可借鉴原则：
  - 控制入口统一，协议统一，状态统一。
  - 将“幂等性”前置到协议层而不是业务层补丁。

### 2.2 Agent Runtime 与 Workspace
- 官方要点：
  - Agent 工作目录明确，关键上下文文件（如 `AGENTS.md`、`SOUL.md`、`TOOLS.md`）在首轮注入。
  - Session 以持久化日志形式管理（JSONL）。
  - Skills 有分层来源（内置、用户级、工作区级）并支持覆盖。
- 可借鉴原则：
  - AI 行为依赖“稳定上下文文件系统”而非临时 prompt。
  - 会话状态必须可追踪、可重放、可审计。

### 2.3 Multi-Agent 隔离模型
- 官方要点：
  - 多 Agent 共享 Gateway，但每个 Agent 拥有独立 workspace、state 目录、session 存储。
  - 强调不可复用同一 `agentDir`，避免认证与会话碰撞。
- 可借鉴原则：
  - 多任务并发必须先做“上下文隔离”。
  - 认证、配置、会话三者必须一致隔离。

### 2.4 消息队列与并发控制
- 官方要点：
  - 使用 lane-aware 队列，保证同 session 串行、跨 session 可并行。
  - 支持 `collect/steer/followup` 等策略，处理高频消息冲突。
- 可借鉴原则：
  - 并发控制不是简单“全局锁/全局并行”，而是“按会话分 lane”。
  - 任务排队策略应可配置且可观测。

### 2.5 Retry 策略（请求级而非流程级）
- 官方要点：
  - retry 以单请求为单位，不回滚整条多步流程。
  - 明确 provider 差异行为与默认参数。
- 可借鉴原则：
  - 对自动化流程，避免“整流程重试”导致副作用重复。
  - 把“可重试边界”放在动作级接口上。

### 2.6 安全模型与审计基线
- 官方要点：
  - 强调个人助理信任边界（非对抗多租户模型）。
  - 提供安全审计命令和默认加固建议。
  - 鉴权、pairing、反向代理可信链、权限最小化等规则完善。
- 可借鉴原则：
  - 先定义信任边界，再谈模型能力。
  - AI 自动化系统必须“默认安全”，调试模式才可放开。

### 2.7 Bootstrapping 与持续记忆
- 官方要点：
  - 首次运行引导生成关键文件，完成后移除一次性引导文件。
  - 引导 AI 每轮先读取核心上下文文件和近期记忆。
- 可借鉴原则：
  - 上下文初始化流程应产品化，不应依赖人工手工准备。
  - 持续记忆是提升 AI 稳定性的工程能力，不是模型参数能力。

## 3. 对 testMonkey-go 的可复用映射

### 3.1 当前问题（摘录）
- 入口层耦合：`cmd/clawdesk/main.go` 同时处理运行时初始化、HTTP、脚本执行和状态。
- 全局状态：`jsRuntime` 与 `scriptStatus` 共享，天然不利于并发。
- 重复实现：timer 与 HTTP 模块存在双轨实现。
- 缺少契约：tool schema 与 d.ts/Go 实现缺少自动同步机制。
- 缺少治理：鉴权、审计、回放、能力白名单不完整。

### 3.2 架构映射建议（OpenClaw 思路 -> testMonkey-go）
1. Gateway 思路 -> `Automation Controller`
- 在当前程序中引入统一控制层（可先仍为单进程）：
  - 统一接收请求
  - 统一调度任务
  - 统一状态事件流
- 不要求一步到位改成复杂分布式；先单机内实现控制平面。

2. Session 隔离 -> `Runtime Session`
- 每个任务会话独立：
  - 独立 goja runtime
  - 独立日志上下文
  - 独立超时与取消信号
- 严禁多个任务直接共享同一 runtime 实例。

3. Lane Queue -> `Task Lane`
- 推荐最小策略：
  - `lane=session:<id>` 同会话串行
  - 全局并发阈值限制跨会话并行数
- 先支持 `collect` 与 `followup` 两种模式即可。

4. Tool Registry -> `tool.schema.json`
- 建立能力注册表，覆盖：
  - 方法名
  - 参数 schema
  - 副作用级别
  - 幂等性说明
  - 失败语义
- 作为 AI 调用和 SDK 提示的单一事实源。

5. Context Files -> `AGENTS.md` 自动化
- 自动生成并更新：
  - `AGENTS.md`（文本总览）
  - `agent.context.json`（结构化上下文）
- 让 AI 执行前读取统一上下文，而非散落文档。

6. Security Baseline -> 默认最小权限
- 默认 `localhost` 绑定 + token 验证。
- 高危动作需显式策略允许（例如 kill/批量输入/跨窗口操作）。
- 增加审计日志：谁、何时、用什么参数执行什么动作。

7. Retry + Idempotency
- 动作级 retry（如截图失败可重试），流程级不自动重放。
- 对有副作用动作引入幂等键，避免重复执行。

8. Observability
- 增加统一事件：`task_started/task_step/task_failed/task_finished`。
- 首期关键指标：成功率、超时率、人工接管率、回放一致率。

## 4. 配套功能清单（后续可按需增加）

### 4.1 必做（P0）
- [ ] 引入 Session 模型并去除全局 runtime 并发共享。
- [ ] 引入任务队列（同 session 串行、全局并发上限）。
- [ ] 统一 HTTP/脚本入口的状态机与错误码。
- [ ] `AGENTS.md + agent.context.json` 自动生成器 MVP。
- [ ] 默认鉴权与审计日志落地。

### 4.2 次优先（P1）
- [ ] tool schema 自动生成并与 d.ts 同步校验。
- [ ] 回放系统（动作与关键截图摘要）。
- [ ] 动作级 retry 与幂等键。
- [ ] 平台能力矩阵（Windows/macOS/Linux 支持等级）。

### 4.3 进阶（P2）
- [ ] 多 Agent（执行/验证）协作。
- [ ] 插件协议与私有能力注册中心。
- [ ] 策略引擎（RBAC/审批/风控）。
- [ ] 评测平台（离线基线 + 在线灰度评估）。

## 5. 推荐目录落地（参考）

```text
cmd/
  cli/
  server/
internal/
  app/               # 控制编排层
  engine/            # 执行引擎
  session/           # 会话与状态机
  queue/             # lane queue
  registry/          # tool schema 注册
  security/          # auth/policy/audit
  observability/     # logs/metrics/traces
  ai/
    context/         # AGENTS/context 生成器
    eval/            # 评测与指标
docs/
  discuz/
    upgrade.md
    openclaw-architecture-notes.md
```

## 6. 持续思考模板（每次迭代后更新）

### 6.1 版本记录
- 版本：
- 日期：
- 迭代目标：
- 完成项：
- 未完成项：
- 风险项：

### 6.2 对标检查（OpenClaw 视角）
- 控制平面是否统一？
- 会话是否隔离？
- 并发是否 lane 化？
- 工具契约是否结构化？
- 上下文文件是否自动生成？
- 默认安全是否开启？
- 评测与回放是否可用？

### 6.3 决策日志
- 决策：
- 背景：
- 备选方案：
- 选择原因：
- 影响范围：
- 回滚方案：

## 7. 对当前项目的具体功能增补建议

1. 增加 `POST /v1/tasks` 与 `GET /v1/tasks/:id`
- 让脚本执行变成“任务对象”，天然支持异步状态管理。

2. 增加 `taskId + idempotencyKey`
- 防止重复请求造成重复点击/重复输入。

3. 增加 `GET /v1/capabilities`
- 返回平台支持矩阵，供 AI 决策前检查。

4. 增加 `GET /v1/tools/schema`
- 输出可调用能力 schema，减少 AI 调用错误。

5. 增加 `POST /v1/agent/context:refresh`
- 手动触发 `AGENTS.md` 与 `agent.context.json` 生成。

6. 增加 `GET /v1/audit/events`
- 提供最基础审计查询。

7. 增加实时数据接口（供 Agent 下一步判断）
- `GET /v1/tasks/:id/events?since=...`（增量事件）
- `GET /v1/tasks/:id/snapshot`（最新状态快照）
- `GET /v1/stream/tasks/:id`（SSE/WS 实时订阅）
- 目标：让 Agent 在步骤执行中获取即时数据并动态调整后续动作，而不是盲目按固定脚本跑完。

## 8. 风险与边界
- 不建议照搬 OpenClaw 的全部实现细节。
- 当前项目定位偏“自动化引擎”，应优先引入其架构原则而非复杂产品层。
- 所有“多 Agent/生态”相关能力都应在 P0 稳定后推进。

## 9. 建议立即执行的最小动作（本周可做）
1. 先落地 `Session` + `Queue` 两个最小核心对象。
2. 统一现有 HTTP 状态结构并补错误码。
3. 建立 `AGENTS.md` 自动生成脚本最小版（可先手工模板 + 程序填充）。
4. 定义 20 条核心任务评测清单，作为后续变更门禁。

## 10. 官方参考链接（用于持续复查）
- Gateway Architecture：https://docs.openclaw.ai/concepts/architecture
- Agent Runtime：https://docs.openclaw.ai/concepts/agent
- Multi-Agent Routing：https://docs.openclaw.ai/concepts/multi-agent
- Retry Policy：https://docs.openclaw.ai/concepts/retry
- Command Queue：https://docs.openclaw.ai/concepts/queue
- Security：https://docs.openclaw.ai/gateway/security
- Agent Bootstrapping：https://docs.openclaw.ai/start/bootstrapping
- AGENTS 模板：https://docs.openclaw.ai/reference/templates/AGENTS
- OpenClaw 仓库：https://github.com/openclaw/openclaw

---

维护建议：
- 每次完成一轮架构改动后，至少更新本文件第 6 节与第 7 节。
- 若 OpenClaw 官方文档关键章节更新时间变化（如 Architecture/Security），需要同步复盘本文件中的对应策略。
