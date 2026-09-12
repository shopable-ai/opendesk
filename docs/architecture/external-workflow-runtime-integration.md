---
title: External Workflow Runtime Integration
description: OpenDesk 与 Python/LangGraph、Node、Go、Langflow/LFX 等外部流程运行时的混合自动化架构、调用合同、生命周期和落地路径。
---

# OpenDesk External Workflow Runtime Integration

日期：2026-09-12。

状态：**架构与实施基线。**

本文解决的不是“把 LangGraph 重写进 OpenDesk Runtime”，而是定义 OpenDesk 如何与 Python/LangGraph、Node.js、Go、Langflow/LFX 等外部运行时协作，让桌面自动化保持以确定性 Recipe 为主体，并只在少数真正需要理解、选择、推理或状态编排的位置使用模型与工作流框架。

相关但职责不同的设计见：

- `docs/architecture/llm-agent-runtime.md`：OpenDesk JavaScript 内部 `LLM.generate()` / `Agent.run()` 的目标合同。
- `docs/api/command.md`：当前 execution-owned 外部命令调用能力。
- `docs/api/http-server.md`：OpenDesk HTTP execution、状态、事件和取消合同。
- `docs/api/execution.md`：当前 Execution 输入、环境、artifact 与来源上下文。

本文不把以上拟新增接口写成已实现事实。具体可用能力仍以当前源码、测试与 `docs/api/` 为准。

---

## 1. 目标

OpenDesk 应支持如下混合自动化方式：

```text
大多数步骤：普通确定性脚本 / Recipe
少量步骤：模型理解、动态判断、规划或外部数据处理
复杂流程：可选使用 LangGraph 等成熟工作流框架
```

核心目标不是让所有自动化都变成 Agent，而是：

> **确定性动作继续由普通 OpenDesk JavaScript 完成；需要状态编排时可以交给成熟外部工作流运行时；模型只参与必要节点；不同运行时通过稳定输入输出、取消和 artifact 合同协作。**

目标用户链路：

```text
OpenDesk Recipe
→ 确定性桌面动作
→ 读取真实业务状态
→ 可选调用模型 / Python / LangGraph
→ 校验结构化结果
→ 再次确认桌面前置状态
→ 继续确定性 Recipe
→ 输出真实结果与证据
```

或者：

```text
Python / LangGraph
→ 调用 OpenDesk Recipe A
→ 获取真实 UI 结果
→ 模型 / 条件 / 状态节点
→ 调用 OpenDesk Recipe B
→ 验证最终业务状态
→ 保存工作流与 OpenDesk execution 证据
```

---

## 2. 核心架构决定

### 2.1 不在 OpenDesk 内重新实现 LangGraph

LangGraph、Langflow、Python/Node AI SDK 已经解决：

- 状态图；
- 条件分支；
- 循环；
- checkpoint；
- 模型调用；
- 工具节点；
- 人工确认；
- 可恢复流程。

OpenDesk 不需要复制一套完整 Workflow Engine。

OpenDesk 应重点提供：

```text
桌面自动化能力
+ Recipe 执行
+ 稳定 Execution 生命周期
+ 输入 / 输出合同
+ HTTP / Command 桥接
+ 取消
+ 日志与 artifact
```

### 2.2 统一“调用合同”，不统一“运行时”

推荐结构：

```text
                    ┌────────────────────┐
                    │ OpenDesk JavaScript │
                    └─────────┬──────────┘
                              │
                 Command / HTTP / Result Contract
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
     Python              Node.js                  Go
   LangGraph            LangGraph JS          native tool
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                      Model / Agent / Data
```

统一的是：

- 如何传输入；
- 如何返回业务结果；
- 如何表达失败；
- 如何停止；
- 如何关联日志、artifact 与 execution；
- 如何声明运行器。

不统一的是：

- Python、Node、Go 的包系统；
- LangGraph 内部节点模型；
- Langflow 流程格式；
- 各语言 SDK；
- 各运行时自己的 checkpoint 实现。

### 2.3 两种一级工作模式都要正式支持

#### 模式 A：OpenDesk JavaScript 主控

适合：

- 现有 Recipe 已经完成主要业务；
- 只有一两个动态判断点；
- 不需要复杂工作流恢复；
- 希望最小改动。

```text
OpenDesk JS
├─ 桌面动作
├─ UI 读取
├─ Command.run(Python / Node / Go)
│   └─ 模型 / LangGraph 子流程
├─ 严格校验结果
└─ 继续桌面动作
```

#### 模式 B：外部工作流主控

适合：

- 多步骤状态机；
- 多模型节点；
- 分支与循环明显；
- checkpoint / resume 有业务价值；
- 需要复用 Python / Node AI 生态。

```text
Python / LangGraph
├─ OpenDesk Recipe A
├─ 模型节点
├─ 条件判断
├─ OpenDesk Recipe B
├─ 恢复 / retry / human approval
└─ 最终验收
```

两种模式不是竞争关系。

---

## 3. 推荐的第一优先路线

P0 优先完成：

```text
OpenDesk JavaScript
→ Command.run()
→ Python worker
→ JSON response
→ OpenDesk JavaScript 继续执行
```

原因：

- 当前 `Command.run()` 已经提供 execution-owned 生命周期；
- 支持 cwd、env、一次性 stdin、timeout、输出上限与 AbortSignal；
- 可以最小成本验证跨语言调用；
- 不依赖 OpenDesk ESM Loader；
- 不要求先完成完整 `LLM.generate()` / `Agent.run()`；
- Python worker 内部既可以只做一次模型调用，也可以运行完整 LangGraph 子图。

P1 再完成：

```text
Python / LangGraph
→ OpenDesk CLI 或 HTTP Bridge
→ OpenDesk Recipe
→ result / artifact / cancel
```

这会形成双向协作，但每次工作流必须只有一个明确主控方，不能形成环形等待。

---

## 4. 模式 A：OpenDesk JS 调 Python / LangGraph

### 4.1 基本调用

OpenDesk 负责桌面业务，Python 只负责动态节点。

示例流程：

```text
OpenDesk JS
→ 点击 25 × 4 =
→ 从 UI 读取 baseResult
→ Python / LangGraph 决定 increment
→ 校验 increment
→ 检查计算器仍处于可继续状态
→ 点击 + increment =
→ 从 UI 读取 finalResult
```

业务结果必须来自真实 UI。

Python 可以计算 expected 值用于验收，但不能把 expected 冒充显示区读取值。

### 4.2 推荐调用合同

外部 worker 使用：

```text
stdin  = 一份 JSON request
stdout = 一份最终 JSON response
stderr = 诊断日志
exit    = 进程级成功 / 失败
artifact = 截图、大日志、调试证据
```

建议请求：

```json
{
  "schemaVersion": 1,
  "requestId": "execution-id:decision",
  "operation": "choose_increment",
  "data": {
    "baseResult": 100,
    "minimum": 5,
    "maximum": 15
  }
}
```

建议成功响应：

```json
{
  "schemaVersion": 1,
  "requestId": "execution-id:decision",
  "ok": true,
  "data": {
    "value": 12
  },
  "meta": {
    "backend": "langgraph-python"
  }
}
```

建议失败响应：

```json
{
  "schemaVersion": 1,
  "requestId": "execution-id:decision",
  "ok": false,
  "error": {
    "code": "INVALID_MODEL_OUTPUT",
    "message": "model output did not match required schema"
  }
}
```

### 4.3 校验规则

OpenDesk 端必须本地校验：

- `schemaVersion`；
- `requestId`；
- `ok`；
- 必填字段；
- 数据类型；
- 数值范围；
- 枚举；
- 业务前置条件。

不得：

- 将字符串 `"12"` 自动转换为数字；
- 从解释文字中正则抠取一个数字当作成功；
- 将 16 截断为 15；
- 将 8.5 自动取整；
- `eval` 外部输出；
- 把模型生成的代码自动执行。

### 4.4 运行器配置

不要假设 GUI 环境中的 `python`、`node` 或 `uv` 一定存在于 PATH。

推荐使用明确的 runtime profile，例如：

```text
project-python
project-node
system-go-tool
```

Profile 负责：

- executable；
- cwd；
- 必要 env；
- timeout 默认值；
- 最大输出；
- 允许能力。

具体配置格式可以后续单独设计，不在 P0 为了配置系统扩大 Runtime 改动。

---

## 5. 模式 B：Python / LangGraph 主控 OpenDesk Recipe

### 5.1 适用场景

当流程本身才是复杂度中心时，应该让 LangGraph 主控，而不是强行把整个图改写成 OpenDesk JS。

示例：

```text
LangGraph main.py
│
├─ node: run_base_recipe
│      → OpenDesk
│      → 读取 baseResult
│
├─ node: decide_increment
│      → model
│      → strict validation
│
├─ node: validate_desktop_precondition
│      → OpenDesk
│
├─ node: run_add_recipe
│      → OpenDesk
│      → 读取 finalResult
│
└─ node: verify_and_finish
```

### 5.2 CLI bridge

适合：

- 开发期；
- 独立示例；
- 每个 Recipe 时间较短；
- 不要求实时事件流。

目标形态：

```text
Python
→ opendesk ai run recipe.js
→ --input / --input-file / --input-stdin
→ 获取结构化业务结果
```

当前 `Execution.input` 已经能够承接结构化输入。

P0 需要补齐的是：

> **Python 怎样可靠取得 Recipe 的最终业务结果。**

不能仅用 exit code 0 代表业务成功，也不能让 Python 从任意 console 输出中猜结果。

推荐优先：

```text
结构化 stdout
或
Execution.artifactDir/result.json
```

最终选择应与当前 CLI 输出模式和现有 runtime contract 对齐。

### 5.3 HTTP bridge

适合：

- 已有常驻 OpenDesk Runtime；
- 长流程；
- 希望不重复启动进程；
- 需要状态查询；
- 需要 SSE；
- 需要精确取消。

当前 HTTP 已有：

```text
POST   /executions
GET    /executions/{id}
GET    /executions/{id}/summary
GET    /executions/{id}/events
DELETE /executions/{id}
```

因此 Python bridge 可以负责：

```text
create execution
→ 保存 executionId
→ wait / subscribe
→ 读取终态
→ 读取业务结果
→ 必要时 DELETE cancel
```

需要特别注意：

> Python 进程退出或客户端 HTTP 断开，不等于服务端 OpenDesk execution 已经取消。

外部主控必须保存下游 `executionId` 并在自身取消时显式清理。

---

## 6. LangGraph 使用策略

### 6.1 不为使用 LangGraph 而图化一切

推荐按复杂度选择：

| 任务 | 推荐方式 |
| --- | --- |
| 固定线性步骤 + 一次模型调用 | 普通 OpenDesk JS / 普通 Python |
| 希望保留函数式代码，但需要 checkpoint 等能力 | LangGraph Functional API |
| 状态转换、分支、循环较多 | LangGraph StateGraph |

桌面自动化的大多数点击不应该变成一个 LangGraph 节点。

更合适的节点粒度是：

```text
登录并确认主页
读取订单状态
选择处理策略
提交处理
验证最终结果
```

而不是：

```text
move mouse
click x=123
sleep 500ms
click x=456
```

### 6.2 checkpoint 不等于桌面状态恢复

LangGraph 可以恢复流程状态，但桌面应用可能已经发生变化。

恢复前必须重新检查：

- 应用是否仍打开；
- 当前窗口；
- 页面 / 对话框；
- 关键业务值；
- 上一步副作用是否已经发生。

对于：

```text
付款
提交
发送
删除
确认
```

等非幂等操作，不能因为节点超时就无条件自动重放。

建议策略：

```text
未知状态
→ 先查询/读取实际业务结果
→ 能确认未执行：才允许重试
→ 能确认已执行：进入后续节点
→ 无法确认：停止并人工处理
```

### 6.3 模型结果需要持久化后复用

例如模型已经生成：

```text
increment = 12
```

恢复流程时应优先复用 12，而不是再次调用模型得到 7。

这可以避免：

```text
workflow state 与实际桌面状态失配
```

---

## 7. Node.js、Go 与 Langflow/LFX

### 7.1 Node.js / LangGraph JS

Node 适合：

- 需要 npm AI 生态；
- 已有 LangGraph JS 项目；
- 需要与 Web/TypeScript 代码共享模型。

推荐：

```text
OpenDesk Command
→ node entry.mjs
```

或者：

```text
Node workflow
→ OpenDesk CLI / HTTP bridge
```

这条路线**不依赖 OpenDesk ESM Loader**。

OpenDesk ESM Loader 的价值是让 OpenDesk VM 自己加载经过验证的模块，而不是为了允许调用 Node 项目。

### 7.2 Go

Go 适合：

- 已有编译工具；
- 长驻服务；
- 本地高性能数据处理；
- 与 OpenDesk Go 生态共享某些协议。

Go 不需要被当成 LangGraph 的替代品。

可以：

```text
OpenDesk → Go binary
```

也可以：

```text
Go service → OpenDesk HTTP execution
```

### 7.3 Langflow / LFX

如果需要可视化流程设计，可以选择：

```text
Langflow 编辑
→ 导出 flow
→ LFX CLI 运行
```

或：

```text
LFX service
→ HTTP 调用
```

OpenDesk 只把它视为一种外部 workflow runtime，不维护 Langflow 内部流程 IR。

---

## 8. 与 LLM.generate / Agent.run / ESM Loader 的边界

当前并行方向仍然合理，但职责要分清。

| 能力 | 正确职责 | 不负责 |
| --- | --- | --- |
| `LLM.generate()` | OpenDesk JS 中的一次模型生成 | 通用 Workflow Engine |
| `Agent.run()` | 委托 Codex 等 Agent 完成受控任务 | 所有外部程序调用 |
| `Command.run()` | 调用本地 executable | 长驻双向 IPC / PTY |
| HTTP execution | 跨进程创建、观察、取消 OpenDesk execution | 自动提供复杂工作流语义 |
| ESM Loader | OpenDesk JS 模块加载 | Node/npm 全兼容保证 |
| External Workflow Integration | 连接 Python/Node/Go/LangGraph/LFX 与 Recipe | 自研一套 LangGraph |

一个普通 Python 脚本不应该被包装成 `Agent.run()`，因为它可能完全没有 Agent 语义。

Python 自己调用模型时，也不应该强制绕回 OpenDesk `LLM.generate()`。

原则：

> **模型调用接口按语义复用；外部运行时按运行器调用；Recipe 按 OpenDesk execution 合同执行。**

---

## 9. 统一外部运行目标

中期建议让 Script Runner 能够发现和运行“任务入口”，而不是扫描所有源码文件。

目标体验：

```text
Script Runner
├─ calculator.recipe.js
├─ calculator-workflow.py
├─ invoice-agent.mjs
└─ support.flow.json
```

统一体验：

- Run；
- Stop；
- Running / Success / Failed；
- stdout / stderr；
- structured result；
- artifact；
- execution correlation。

实际 runtime 分开：

```text
OpenDesk JS  → OpenDesk Runtime
Python       → configured Python
Node         → configured Node
Go           → executable
LFX          → configured lfx
```

### 9.1 不建议“按扩展名自动执行所有文件”

因为目录中还会包含：

```text
helper.py
utils.py
schema.py
test_*.py
library.mjs
```

应该使用显式任务描述或受控 convention。

概念形态：

```json
{
  "id": "calculator.langgraph",
  "runtime": "python",
  "entry": "./main.py",
  "runtimeProfile": "project-python"
}
```

这是目标合同示意，不表示当前已有此配置格式。

---

## 10. 生命周期与取消

这是跨语言集成必须优先设计的 P0，而不是后补功能。

### 10.1 OpenDesk JS 主控

```text
Execution
→ Command.run(Python)
```

应继续复用当前 Command 的 execution-owned 生命周期：

- outer execution cancel；
- AbortSignal；
- timeout；
- teardown；

都必须清理外部进程组。

### 10.2 外部 workflow 主控

```text
Python
→ OpenDesk HTTP execution
```

需要保存：

```text
workflowRunId
workflowNodeId
opendeskExecutionId
```

取消顺序：

```text
workflow cancel
→ cancel active OpenDesk execution
→ wait bounded time for terminal state
→ mark workflow node canceled
→ release local resources
```

不能只 kill Python process 而留下正在点击桌面的 OpenDesk execution。

### 10.3 禁止环形 owner

禁止形成：

```text
OpenDesk JS A
→ Python B
→ 再同步等待 OpenDesk JS A
```

一个运行链必须有一个顶层 owner。

允许：

```text
OpenDesk JS owner → Python decision worker
```

或：

```text
Python workflow owner → OpenDesk Recipe executions
```

---

## 11. 并发规则

模型与纯数据计算可以并行。

同一桌面 session 中会改变交互状态的操作默认串行：

```text
鼠标
键盘
焦点
窗口切换
菜单
模态对话框
```

即：

```text
parallel thinking
serial desktop mutation
```

后续若需要并行桌面任务，应以明确的隔离 session / VM / desktop ownership 为前提，而不是依靠 LangGraph parallel node 直接竞争同一个桌面。

---

## 12. 安全与权限

外部运行器不能成为 capability 绕过方式。

需要遵守：

- 当前 Execution 是否允许 `Command.run()`；
- HTTP execution 当前授权；
- UI capability；
- OS Accessibility / TCC；
- 文件系统权限；
- 网络权限；
- secret 不写入日志。

尤其要避免：

```text
受限 HTTP/Scheduler execution
→ 通过某个包装 API
→ 偷偷获得本地任意命令权限
```

外部 runtime capability 必须由 host 授权决定，不能由脚本参数或 workflow 自行提升。

---

## 13. 推荐示例

第一套正式示例建议：

```text
examples/integrations/langgraph-python/
├── README.md
├── pyproject.toml
├── uv.lock
├── .env.example
├── main.py
├── opendesk_bridge.py
├── decision.py
├── main.js
├── recipes/
│   ├── calculator-base.js
│   └── calculator-add.js
└── tests/
    ├── test_protocol.py
    └── test_validation.py
```

目录职责：

### `main.js`

验证：

```text
OpenDesk JS
→ Python decision worker
→ OpenDesk JS
```

### `decision.py`

只处理动态决策：

```text
input JSON
→ model / LangGraph
→ validated JSON
```

不反向启动新的 OpenDesk execution。

### `main.py`

验证：

```text
LangGraph
→ OpenDesk Recipe A
→ decision
→ OpenDesk Recipe B
```

### `opendesk_bridge.py`

隐藏：

- CLI 参数；
- HTTP endpoint；
- execution polling；
- cancel；
- result parsing；
- correlation metadata。

业务图不应重复实现这些细节。

### `recipes/`

优先复用当前已有 Calculator Recipe / helper，不重新录制和重新发明定位方案。

---

## 14. 分阶段实施

### P0｜跨语言 worker 闭环

目标：

```text
OpenDesk JS
→ Command.run Python
→ strict JSON
→ continue Recipe
```

完成：

- runtime executable 配置；
- stdin/stdout 协议；
- stderr 分离；
- schema validation；
- timeout；
- cancel；
- process cleanup；
- 示例；
- 测试。

不做：

- Workflow 平台；
- 可视化图编辑器；
- Python 嵌入 Goja；
- 自动安装所有 AI 依赖。

### P1｜LangGraph 主控 Recipe

目标：

```text
Python/LangGraph
→ OpenDesk Recipe execution
→ structured result
→ cancel / evidence
```

完成：

- bridge；
- Recipe input；
- structured result；
- executionId correlation；
- cancellation；
- calculator end-to-end 示例。

### P2｜统一 External Task Runner

目标：

```text
Script Runner
→ OpenDesk / Python / Node / Go / LFX task
```

完成：

- 显式任务声明；
- runtime profile；
- Run / Stop；
- state；
- logs；
- results；
- artifact；
- missing-runtime guidance。

### P3｜按真实需求增加

只有出现明确产品需求时再评估：

- streamed subprocess；
- bidirectional IPC；
- PTY；
- Python runtime bundling；
- Node runtime bundling；
- workflow dashboard；
- durable distributed orchestration。

---

## 15. P0 完成标准

至少满足：

- OpenDesk JS 能通过现有命令能力运行 Python worker；
- worker 接受结构化 input；
- worker 返回结构化业务 result；
- 非法类型、越界、缺字段、requestId 不匹配必须失败；
- Python 超时后不得继续桌面动作；
- OpenDesk Execution 取消后 Python 进程必须被清理；
- Python 异常不得被当成业务成功；
- stderr 与业务 stdout 不混淆；
- secret 不进入日志；
- 计算器示例的业务结果来自 UI 真实读取；
- 模型结果只影响指定动态节点；
- ESM Loader、`LLM.generate()`、`Agent.run()` 未完成时，该方案仍然可以独立工作。

---

## 16. P1 完成标准

至少满足：

- Python/LangGraph 能启动 OpenDesk Recipe；
- 输入通过统一 JSON 进入 `Execution.input`；
- 能获得结构化业务终态，而不是解析任意 console 文本；
- 保存并关联 OpenDesk execution ID；
- 外部 workflow cancel 能停止活动中的 OpenDesk execution；
- Recipe 失败不能被 LangGraph 误判为成功；
- checkpoint 恢复前重新检查桌面业务状态；
- 非幂等操作不进行无条件重放；
- 同一桌面 session 默认只有一个 mutation execution；
- 完成真实 Calculator 混合自动化验收。

---

## 17. 最终推荐架构

OpenDesk 长期不应该被限制为：

```text
一个 Goja JavaScript Runtime
```

更合适的产品定位是：

```text
OpenDesk Desktop Automation Runtime
│
├─ Native deterministic automation
│      └─ OpenDesk JavaScript Recipe
│
├─ In-script intelligent calls
│      ├─ LLM.generate()
│      └─ Agent.run()
│
├─ External runtime bridge
│      ├─ Python / LangGraph
│      ├─ Node / LangGraph JS
│      ├─ Go tools
│      └─ Langflow / LFX
│
└─ Shared execution contract
       ├─ input
       ├─ result
       ├─ cancel
       ├─ logs
       ├─ artifact
       ├─ permission
       └─ correlation
```

最终原则：

> **不要为了支持 LangGraph 把 OpenDesk 变成 LangGraph。**

> **不要为了支持 Python 把 Python 嵌进 Goja。**

> **不要让模型控制所有确定性桌面步骤。**

> **把 OpenDesk 做成可靠的桌面执行层，并允许成熟语言与工作流生态通过稳定合同使用它。**
