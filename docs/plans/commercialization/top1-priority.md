# OpenDesk Top 1 Priority

更新时间：2026-09-16

> Plan / Product Positioning。本文只冻结当前最优先争取的有限竞争位置与推进顺序，不表示 OpenDesk 已经取得全球第一。

## 当前第一优先

> **Agent-authored Local Automation Delivery Runtime for independent developers / automation consultants**

中文定义：

> **面向独立自动化开发者、AI 自动化顾问和小型实施团队，把 Agent 做出的本地自动化打包、授权、部署、验证、诊断并长期维护给客户的一体化 Runtime。**

这是当前最应该先尝试证明 Top 1 的小山头。

## 为什么不是先争 Multi-surface 第一

OpenDesk 长期可以形成：

```text
macOS Desktop
+ Windows Desktop
+ Browser DOM / CDP
+ iOS / Android
+ API / HTTP
```

但 Appium 与 UiPath 已经证明跨 Desktop / Browser / Mobile 的自动化覆盖本身并不稀缺。OpenDesk 当前 Browser real driver 和 Mobile public surface 也尚未正式成立。

因此不能把“平台更多”本身当作 Top 1。

## 为什么 Delivery Runtime 应该先争

OpenDesk 当前已经拥有或正在形成一条相对完整的本地交付链：

```text
Agent / Human authoring
→ JavaScript Workflow / Recipe
→ structured input
→ Execution
→ run artifacts / evidence
→ protected package
→ publisher signature
→ License / device authorization
→ client machine execution
→ diagnosis / maintenance
```

这条链比重新建设 Browser 和 Mobile 更接近当前产品，可以更快用真实第二台机器、独立环境、付费交付与维护数据验证。

## Top 1 证明必须满足

不能用功能数量或内部评分宣称第一。至少需要：

1. 冻结竞争范围：独立开发者 / 自动化顾问、本地客户交付 Runtime；
2. 冻结 3—5 个最接近的替代方案；
3. 同一个 workflow 从作者机器交付到第二台机器；
4. 记录安装、权限、参数化、授权、首次成功、失败诊断和升级工时；
5. 至少一个外部独立环境或真实付费客户；
6. 记录源码保护、客户可运行性和维护成本；
7. 未测试的竞品不得按失败计分。

## 第二优先

> **Human demonstration + Coding Agent exploration → same maintainable macOS/Windows Workflow**

证明 Recorder UI 与 Agent CLI 最终形成同一种可读、可验证、可复用 Workflow，而不是两套互不兼容的生成链。

## 第三优先 / 长期扩张

> **Local Multi-surface Agent RPA Runtime: Desktop + Browser + Mobile → one verified reusable workflow model**

推进顺序：

```text
Delivery Runtime qualification
→ Human + Agent same Workflow
→ Browser Adapter
→ Mobile Adapter
→ Multi-surface Benchmark
```

Mobile 专业 semantic 路线优先评估 Appium XCUITest / UiAutomator2 集成，不从零重写成熟 driver；普通用户路线可以独立探索 phone mirroring → desktop-window automation。

支撑研究：

- `../../research/commercialization/agent-driven-rpa-competitor-matrix-2026.md`
- `../../research/commercialization/appium-and-multi-surface-automation-2026.md`
- `../../quality/agent-driven-rpa-competitive-benchmark.md`
