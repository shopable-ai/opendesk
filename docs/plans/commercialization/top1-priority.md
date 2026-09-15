# OpenDesk Top 1 Priority

更新时间：2026-09-16

> Plan / Product Positioning。本文只冻结当前最优先争取的有限竞争位置与推进顺序，不表示 OpenDesk 已经取得全球第一。

## 1. 对外短名称

以后不再把很长的英文竞争定义直接用于中文传播。

| 优先级 | 短名称 | 含义 |
| --- | --- | --- |
| P0 | **OPC 自动化交付** | 一人公司 / 自动化顾问把 Agent 做出的自动化交付给客户 |
| P1 | **双入口 RPA** | Human Recorder + Coding Agent → 同一种 Workflow |
| P1 | **可复用 Agent RPA** | AI 做一次 → 可验证、可重复运行 |
| Long-term | **多端 Agent RPA** | Desktop + Browser + Mobile → 同一种 Workflow |

详细中文 OPC 定位见 [`OPC 自动化定位`](opc-automation-positioning.md)。

## 2. 当前第一优先：OPC 自动化交付

这是当前最应该先尝试证明 Top 1 的小山头。

核心用户：

```text
OPC / 一人公司
+ AI 自动化顾问
+ 独立自动化开发者
+ 小型实施团队
```

核心问题：

> **我已经能让 AI 帮我做出自动化，怎样把它可靠地交付给客户，并重复卖第二次？**

OpenDesk 要证明的链路：

```text
Agent / Human 做出自动化
→ Workflow
→ 参数化
→ 验证
→ 客户机器运行
→ Evidence
→ 诊断 / 维修
→ 第二客户复用
```

中文营销候选：

> **一个人做自动化，也能像公司一样交付。**

## 3. 为什么不是先争“多平台第一”

OpenDesk 长期可以形成：

```text
macOS
+ Windows
+ Browser
+ iOS / Android
+ API
```

但 Appium 与 UiPath 已经证明跨 Desktop / Browser / Mobile 的覆盖本身并不稀缺。OpenDesk 当前 Browser real driver 和 Mobile public surface 也尚未正式成立。

因此“平台更多”不能单独成为 Top 1。

## 4. Top 1 证明门槛

至少需要：

1. 冻结竞争范围：OPC / solo automation builders / consultants 的客户交付；
2. 冻结 3—5 个最接近的替代方案；
3. 同一个 Workflow 从作者机器交付到第二台机器；
4. 记录安装、权限、参数化、首次成功、失败诊断和升级工时；
5. 至少一个外部独立环境或真实付费交付；
6. 记录维护成本和第二客户复用时间；
7. 未测试的竞品不得按失败计分。

## 5. 第二优先：双入口 RPA

```text
Human Recorder ─┐
                ├→ Same Workflow
Coding Agent ───┘
```

目标不是证明“OpenDesk 有 Recorder”，而是证明普通用户演示和 Coding Agent 探索最终能形成同一种可读、可验证、可复用 Workflow。

## 6. 第三优先：可复用 Agent RPA

这是更适合官网长期传播的品牌主山头：

> **AI 做一次，变成可复用自动化。**

因为竞争集合更大，当前优先目标是建立 Top 3 证据，而不是先声称 Top 1。

## 7. 长期扩张：多端 Agent RPA

```text
Desktop
+ Browser
+ Mobile
        ↓
Same Workflow / Verification / Evidence / Delivery
```

推进顺序：

```text
OPC 自动化交付
→ 双入口 RPA
→ Browser Adapter
→ Mobile Adapter / Appium integration
→ 多端 Agent RPA Benchmark
```

Mobile 专业语义路线优先评估 Appium XCUITest / UiAutomator2 集成；普通用户路线可以独立探索 phone mirroring → desktop-window automation。

## 8. 当前一句话

> **先争 OPC 自动化交付第一，再扩成多端 Agent RPA。**

支撑研究：

- `../../research/commercialization/agent-driven-rpa-competitor-matrix-2026.md`
- `../../research/commercialization/appium-and-multi-surface-automation-2026.md`
- `../../quality/agent-driven-rpa-competitive-benchmark.md`
