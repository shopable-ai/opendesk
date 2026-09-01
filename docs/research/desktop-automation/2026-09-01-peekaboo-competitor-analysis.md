# Peekaboo 竞品分析：OpenDesk 的 macOS Driver 边界、Codex 视觉辅助与可固化自动化

日期：2026-09-01

> 类型：Research / Competitor Profile / Build-vs-Integrate 决策输入。
>
> 本文将 Peekaboo 正式纳入 OpenDesk 的核心桌面自动化竞品集合。它不是对 2026-08-31 深度重叠审计的重复，而是补充产品边界、Codex 低 Token 视觉辅助、已知窗口/ROI 截图，以及“首次探索后固化为脚本/Recipe”的新判断。

## 0. 结论

Peekaboo 应正式视为 OpenDesk 在 **macOS Native Desktop Automation / Desktop Perception / Accessibility Driver** 层的直接竞品，同时也是值得集成的底层 Provider。

当前建议：

```text
macOS Native Driver                 → Integrate-first / 停止大规模重复建设
Accessibility / Window / System UI  → Peekaboo 优先作为成熟参考或 Provider
Codex 通用桌面观察                  → Peekaboo 可直接使用
OpenDesk 已知窗口/ROI 精确截图       → Keep / 强化低 Token 调用方式
OpenDesk JS / Recipe 固化            → Build
Recorder → Script / Flow Compiler    → Build
业务级 Postcondition / Evidence      → Build
失败后 Agent / Peekaboo fallback     → Integrate
```

核心产品判断：

> OpenDesk 不应通过复制 Peekaboo 的 macOS primitive catalog 获得差异化。
>
> 更值得建设的是：**让 Agent 只在第一次未知任务中付出感知与推理成本；一旦成功，就把窗口、ROI、动作、前置条件、验证和回退路径固化成可重复执行的脚本/Recipe，后续尽量不再重新看整屏、不再重新理解同一个 UI。**

因此二者并非只有“谁替代谁”的关系：

```text
Peekaboo
≈ macOS 通用感知 + Accessibility + Native UI Driver + CLI/MCP/Agent

OpenDesk
≈ Desktop Automation Runtime
 + targeted perception
 + deterministic script / recipe execution
 + verification / evidence
 + recorder/compiler
 + workflow / business automation
 + provider fallback
```

## 1. 当前事实基线

### 1.1 OpenDesk

仓库：

```text
https://github.com/shopable-ai/opendesk
```

本轮写入前 `master` 最新观察 HEAD：

```text
cdf8a4b6cf3a763d736f85336dacd480f2d93359
```

### 1.2 Peekaboo

仓库：

```text
https://github.com/openclaw/Peekaboo
```

本轮读取 `main` HEAD：

```text
8d5e638e6ac9e93fae7d8dcb2ac0a0f01f3d49ec
```

README 当前明确定位为：

```text
macOS CLI + menu-bar app
screen capture
accessibility inspection
native UI automation
agent
MCP
```

并明确提供 MCP 接入 Codex、Claude Code、Cursor 等客户端的方式。

当前 README 还明确展示：

```text
window list --app ... --json
see --app ... --json
click / type / press / scroll / drag
set-value / action
app / window / menu / menubar / dock / dialog / space
agent / capture / mcp
```

因此不能把 Peekaboo 仅视为“截图工具”。它已经是完整度较高的 macOS Desktop Automation Driver / Tooling Stack。

## 2. 与既有研究的关系

已有深度研究：

```text
docs/research/desktop-automation/2026-08-31-clawdesk-vs-peekaboo.md
```

该文已经完成：

- macOS Native Driver 重叠审计；
- Accessibility / Window / Screenshot / Permission / Background Input 对比；
- Build / Integrate 判断；
- OpenDesk 上移到 Verified Business Automation 的建议；
- Recorder Compiler、App Adapter、Evidence / Recovery 的差异化分析。

另有：

```text
docs/research/desktop-automation/2026-05-19-peekaboo-runtime-mcp-design.md
```

用于 Peekaboo Runtime / MCP 设计研究。

本文新增的是：

```text
Peekaboo 作为正式竞品的长期定位
+ Codex screenshot helper 场景
+ 已知窗口 / ROI 的低 Token 执行
+ “首次探索 → 固化脚本 → 低成本复用”的产品差异化
```

## 3. 为什么 Peekaboo 必须列为核心竞品

Peekaboo 与 OpenDesk 在最底层能力上存在明显重叠：

```text
Screen / Screenshot
Window inventory / control
Mouse / Keyboard / Scroll
Accessibility / UI inspection
OCR / structured observation
Native UI actions
Dialog / Menu / Dock / Space
CLI
MCP
Agent-facing tools
```

如果 OpenDesk 在 macOS 上继续逐项追求 primitive parity，会进入：

```text
高维护
+ 平台专有
+ TCC / 签名 / 权限复杂
+ Accessibility edge case 多
+ Window / Space / Dialog 兼容成本高
+ 与成熟开源项目高度重复
```

这部分不应成为 OpenDesk 的主要研发投入。

## 4. Codex 截图辅助：OpenDesk 并非没有价值

### 4.1 问题不是“能不能截图”，而是“截图前知道多少”

对于 coding agent / desktop agent，一个常见低效路径是：

```text
需要确认一个按钮
→ 截整个桌面
→ 把大量无关像素交给模型
→ Vision 理解
→ 再定位目标
```

如果任务已经知道：

```text
目标程序
目标窗口
窗口位置
目标 ROI / 业务区域
```

则更合理的是：

```text
find target window
→ resolve current window bounds
→ capture known ROI only
→ 必要时 OCR / Vision
→ act
→ capture verification ROI only
```

这类执行链可以显著减少：

- 无关截图面积；
- 视觉上下文；
- Agent 重新定位步骤；
- 重复的全屏理解；
- 执行延迟。

因此，OpenDesk 当前已有的窗口、截图、区域裁剪能力应继续保留，并围绕 **Targeted Observation** 使用，而不是为了追求 Peekaboo parity 再造完整 ScreenCaptureKit / AX 基础设施。

### 4.2 Full Screen 应是 fallback，而不是默认动作

建议视觉成本层级：

```text
L0  已固化 Recipe，无截图
L1  Window metadata / state
L2  已知 ROI 局部截图
L3  OCR / Image / Color / Layout
L4  Accessibility / Peekaboo structured observation
L5  Window screenshot
L6  Full desktop screenshot / Vision Agent
```

原则：

> 越往下成本越高；重复任务应尽量停留在 L0-L3。

## 5. OpenDesk 真正可能优于“每次重新感知”的地方：Recipe 固化

这是当前最重要的新差异化判断。

### 5.1 第一次未知任务

例如第一次自动完成某个桌面流程：

```text
Codex / Agent
→ 找应用
→ 找窗口
→ 观察 UI
→ 找目标
→ 执行动作
→ 验证结果
→ 必要时恢复
→ 成功
```

第一次任务中，Peekaboo 的强项非常明显：

```text
see / Accessibility
exact window targeting
semantic actions
background-capable native input
system UI surfaces
```

OpenDesk 不需要复制这些探索能力。

### 5.2 成功后不应再付第二次相同 Agent 成本

一旦流程成功，应将可稳定信息固化：

```text
Application identity
Window selector
Window-relative ROI
Normalized geometry
Semantic anchors
Action sequence
Preconditions
Postconditions
Verification ROI
Fallback locator
Risk / policy
```

形成：

```text
Recipe / Flow IR / Generated JS
```

后续执行：

```text
Agent request
→ match existing Recipe
→ resolve current window
→ deterministic execution
→ lightweight verification
→ pass
```

只有失败时才升级：

```text
Recipe failure
→ targeted observation
→ Peekaboo / Accessibility / Vision
→ repair locator / geometry / state rule
→ verify
→ update Recipe
```

这形成：

```text
Explore once
→ Compile
→ Reuse
→ Detect drift
→ Repair
→ Recompile
```

这比“每次都让通用 Agent 重新看、重新理解、重新决定”更适合大量稳定重复业务任务。

## 6. 坐标固化的正确方式

OpenDesk 不应把低质量的绝对屏幕坐标作为核心资产：

```text
BAD:
x = 1472
y = 931
```

应优先保存窗口相对坐标：

```text
window selector
+ local x/y
+ local width/height
```

运行时：

```text
screenX = currentWindow.x + localX
screenY = currentWindow.y + localY
```

对于窗口尺寸可能变化的 UI，可进一步保存归一化 geometry：

```text
xRatio
yRatio
widthRatio
heightRatio
```

并组合：

```text
fixed anchor
+ relative geometry
+ OCR / color / image feature
+ semantic fallback
```

目标不是让坐标永不变化，而是：

> 用最便宜、最确定的 locator 优先执行；只有当前 locator 不再可信时才调用更昂贵的感知层。

## 7. 竞品能力矩阵

| 能力 | Peekaboo | OpenDesk 当前/方向 | 决策 |
|---|---|---|---|
| macOS Screen Capture | 强 | 已有基础能力 | 不追底层 parity |
| 精确窗口定位 | 强 | 已有窗口层能力 | 保留 facade，必要时接 Provider |
| 已知 ROI 截图 | 可实现 | 与现有 Runtime 很契合 | Keep / 强化 |
| Accessibility Tree | 强 | 不应重复建设完整体系 | Integrate |
| Semantic UI Action | 强 | 可作为上层 Target 的 Provider | Integrate |
| Background Input | 强 | 重建成本高 | Integrate |
| Menu / Dialog / Dock / Space | 强 | 部分能力可存在，但不追全量 parity | Integrate-first |
| CLI | 强 | 可继续提供 | Keep |
| MCP | 强，明确支持 Codex | OpenDesk 也有 MCP 价值 | 保留统一 facade |
| Agent 探索陌生 UI | 强 | 可组合 Vision / Provider | Peekaboo 优先 |
| JS Runtime | 非核心差异 | OpenDesk 核心现有资产 | Build around it |
| 固化可重复脚本 | 可脚本化 | OpenDesk 应作为核心产品方向 | Build |
| Recorder → Compiler | 非其主要定位 | OpenDesk 高价值方向 | Build |
| Business Postcondition | primitive success 不等于业务成功 | OpenDesk 应重点建设 | Build |
| Evidence / Verdict | 有工具级证据 | OpenDesk 应做跨 Provider 业务证据 | Build |
| Recipe 自修复 | Agent 可重新探索 | OpenDesk 可形成“失败→修复→再固化”闭环 | Build |

## 8. 竞争关系应该分层，而不是二选一

### 8.1 直接竞争层

在以下层级，Peekaboo 是直接竞品，并且多数情况下成熟度更高：

```text
macOS Native Driver
Accessibility
Window authority
Screen capture authority
System UI automation
Background native interaction
Desktop observation primitives
```

OpenDesk 不应继续以“功能数量追平”为目标。

### 8.2 可集成层

Peekaboo 可以成为：

```text
DesktopProvider
ObservationProvider
AccessibilityProvider
FallbackProvider
RecoveryProvider
```

OpenDesk 保持自己的稳定 public facade / runtime contract。

### 8.3 OpenDesk 差异化层

重点建设：

```text
Target / Locator Bundle
Window-relative ROI assets
Recipe / Flow IR
Generated JS
Recorder Compiler
Verified Action
Business Postcondition
Evidence / Verdict
Recovery / Repair
App Adapter
Workflow / Scheduler
Agent escalation policy
```

## 9. 对 Codex 的推荐组合

不建议单独开发一个庞大的 “OpenDesk Screenshot Plugin”。

更合理的结构：

```text
Codex
  │
  ├─ Known task
  │    → OpenDesk Recipe / JS
  │    → known window / ROI
  │    → targeted verification
  │
  └─ Unknown / failed task
       → OpenDesk orchestration
       → Peekaboo / Accessibility / Vision
       → discover / repair
       → compile back into Recipe
```

这样 Codex 的主要价值从“每一步看图并点击”转变成：

```text
首次生成自动化
处理变化
修复失败
维护 Recipe
```

而稳定步骤由本地 Runtime 低成本执行。

## 10. Build / Integrate / Stop 判断

### Stop / Avoid

```text
重新开发完整 macOS Accessibility Driver
重新开发 Peekaboo 等级的 Window / Space / Dock / Menu 全套系统
为了 Codex 单独再造截图引擎
逐项追求 Peekaboo CLI primitive parity
```

### Integrate

```text
Peekaboo as macOS provider
Accessibility observation
unknown-UI exploration
native semantic actions
background input
system UI fallback
```

### Keep

```text
OpenDesk current window API
screen / region capture facade
HTTP / MCP / JS runtime
cross-provider normalized contracts
```

### Build

```text
Known-window / Known-ROI low-cost perception
Agent → Recipe compiler
Recorder → Flow IR → JS
Window-relative / normalized geometry
Locator Bundle
Precondition / Postcondition
Evidence / Verdict
Failure escalation
Recipe repair / versioning
App Adapter / reusable automation asset
```

## 11. 产品定位建议

不建议：

```text
OpenDesk = another Peekaboo
```

建议：

```text
OpenDesk = reusable desktop automation runtime
```

更完整地说：

> **OpenDesk 应把通用 Agent 的一次成功操作，转换为以后可以确定性、低 Token、低延迟重复执行的桌面自动化资产；Peekaboo 则可以承担 macOS 上高复杂度、未知 UI 和 Native Accessibility 的底层 Provider。**

一句话差异：

```text
Peekaboo：不知道目标在哪里时，帮 Agent 看见并操作。
OpenDesk：已经成功找过一次后，尽量不要再让 Agent 为同一件事重新看第二次。
```

## 12. 后续验证建议

不要先继续扩功能，先做小型 benchmark：

```text
A. 全屏 Vision
B. Peekaboo see / exact window
C. OpenDesk window screenshot
D. OpenDesk known ROI screenshot
E. OpenDesk compiled Recipe + lightweight verification
```

对同一组 10-20 个重复桌面任务记录：

```text
任务成功率
平均执行时间
截图次数
全屏截图次数
视觉输入大小 / context 增长
Agent 推理轮次
失败恢复次数
UI 变化后的修复成本
Recipe 二次执行成功率
```

如果 E 在稳定任务上明显优于 A-D，则可以直接证明 OpenDesk 的差异化价值不在“另一套 Screenshot/AX Driver”，而在：

```text
Agent-discovered automation
→ deterministic reusable asset
```

## 13. Sources

OpenDesk：

```text
https://github.com/shopable-ai/opendesk
```

Peekaboo：

```text
https://github.com/openclaw/Peekaboo
https://github.com/openclaw/Peekaboo/blob/main/README.md
https://github.com/openclaw/Peekaboo/blob/main/docs/MCP.md
https://github.com/openclaw/Peekaboo/blob/main/docs/automation.md
```

内部相关研究：

```text
docs/research/desktop-automation/2026-08-31-clawdesk-vs-peekaboo.md
docs/research/desktop-automation/2026-05-19-peekaboo-runtime-mcp-design.md
docs/research/desktop-automation/2026-08-31-computer-use-agent-competitor-rescan.md
docs/research/desktop-automation/2026-03-02-experience-script-asset-strategy.md
```
