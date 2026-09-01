# OpenDesk 当前上下文

- 更新时间：2026-08-31
- 项目：OpenDesk
- 分支：`master`
- 本文件只记录当前仍影响后续开发的高层事实，不保存逐轮开发日志。

## 当前定位

OpenDesk 已形成三种主要使用面：

```text
CLI / JavaScript Runtime
HTTP execution / vision service
MCP desktop automation tools
```

核心价值是让人类或 Agent 能在桌面环境中完成：

```text
inspect / capture
-> perceive / find
-> plan / guard
-> act
-> verify
-> record evidence
```

## 当前仓库事实

### 文档

2026-08 文档结构整理已经完成：

- `docs/` 是项目/工程文档；
- `docs/api/` 是唯一用户 API 文档；
- `docs/` 根目录只保留 `README.md` 和分类目录；
- 历史阶段报告、Prompt、测试报告已经按生命周期迁移；
- `docs-api/`、`docs-api-user/`、`docs/api/` 已退役，不能恢复为并行文档源。

### Execution

当前 execution 默认产物目录：

```text
.runtime/runs/<executionId>/
```

典型产物：

```text
script_snapshot.js
stdout.log
stderr.log
summary.json
agent_summary.json
events.ndjson
```

### HTTP

DI/container 默认开启。当前新 HTTP 主线以：

```text
POST /executions
GET  /executions/{id}
GET  /executions/{id}/summary
GET  /executions/{id}/events
GET  /status
POST /vision/ocr
POST /vision/detect-ui
```

为主。

`USE_DI_CONTAINER=0` 属于历史兼容路径，不应作为新功能默认设计基线。

### MCP

当前 MCP server：

```text
cmd/opendesk-mcp/
```

推荐 Agent 主链路：

```text
tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target
```

当前安全语义已覆盖 preview/dry-run、窗口/目标文本 guard、stale/ambiguous target 阻断与部分 revalidation。

### Browser compatibility

当前 stack：

```text
legacy
upgraded
playwright
```

后两者是 compatibility facade，不代表完整 Playwright runtime。

### Layout

当前 `ImageColor.analyzeLayout` 默认 `cellColorMode=median`，`boundarySpanWidth=3`。正式实现说明：

```text
docs/implementation/layout/layout-recognition.md
```

## 当前外部前置条件

### macOS TCC

截图、输入和自动化行为可能受：

- Screen Recording
- Accessibility
- Automation / AppleEvents
- 输入控制

影响。

固定 App 身份与权限处理见：

```text
docs/implementation/macos/
```

### OCR Provider

依赖 OCR 的 MCP / Vision 链路需要实际 provider 配置。例如 Paddle 路径需要有效的 `PADDLE_OCR_ENDPOINT`。

缺少 provider 时应视为明确 external blocker，而不是无限重试或伪装成算法成功。

## 当前工程风险

### 1. 旧代码与兼容路径仍存在

仓库历史较长，部分源码、示例或 archive 中仍可能出现旧 TestMonkey 命名、legacy route 或旧执行模型。

处理原则：

- 不因历史文本存在就恢复旧架构；
- 当前功能先核对源码与测试；
- 真正需要保留的兼容行为必须显式标记为 compatibility。

### 2. 文档迁移后仍需持续做链接卫生

当前主入口和核心 project docs 已按新结构维护；Research / archive 中的历史路径可作为历史语境存在。

当历史材料被重新提升为当前文档时，必须重新验证所有链接与事实。

### 3. 真机能力不能只靠 contract test 宣称稳定

MCP、截图、OCR、窗口聚焦和输入仍需要真实 macOS 环境 smoke 来验证系统权限与目标应用行为。

自动化 contract test 与 manual smoke 的边界必须保留。

## 后续开发优先顺序

默认建议：

1. 以真实用户场景验证 `inspect -> find -> act -> verify`；
2. 补足高风险动作的 fresh evidence / postcondition；
3. 继续提高 target discovery、revalidation 和 ambiguity handling；
4. 收敛仍有价值的 Research 为 ADR / Architecture；
5. 不再新增平行文档体系或阶段性 `FINAL/V2` 文件。

具体功能优先级应由当前需求、真实失败证据和市场/用户验证重新决定，不由旧阶段计划自动继承。

## 当前验证声明

本轮 2026-08 的主要工作是**文档资产整理与事实校准**。

已核对关键源码路径与当前 API/CLI 事实，但本轮没有因为文档整理而宣称重新执行了全部仓库测试或所有真机 smoke。

任何“当前完全通过”的测试结论都必须来自新的实际测试运行，而不能从历史报告复制。

## 每次开始新任务时

先判断任务属于：

```text
project
architecture
implementation
quality
integration
scenario
research
plan
user API
```

然后：

```text
读取当前源码/证据
-> 读取对应 canonical docs
-> 再按需读取 Research / reports / archive
-> 执行
-> 验证
-> 更新当前 Source of Truth
```

不要从历史报告、旧 Prompt 或文件名中的 “FINAL” 推断当前完成状态。
