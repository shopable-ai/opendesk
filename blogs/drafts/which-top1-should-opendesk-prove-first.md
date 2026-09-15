# OpenDesk 最应该先争哪个“全球第一”？先从 OPC 自动化交付开始

状态：Draft  
更新时间：2026-09-16

> 本文讨论的是准备通过公开 Benchmark 和真实交付去争取的有限竞争位置，不是“OpenDesk 已经全球第一”的声明。

## 先说结论

OpenDesk 不应该为了制造“第一”，去宣传：

> 唯一支持桌面 + 浏览器 + 手机的自动化平台。

Appium、UiPath 等已经证明，多平台覆盖本身并不稀缺。

现在最值得先争的更小位置，可以用一个很短的名字表达：

> ## **OPC 自动化交付**

这里的 OPC 指 One Person Company / 一人公司。

一句话：

> **一个人做自动化，也能像公司一样交付。**

目标用户包括：

- OPC / 一人公司；
- AI 自动化顾问；
- 独立自动化开发者；
- 小型自动化实施团队。

他们真正的问题不是“AI 会不会点电脑”，而是：

> **我已经能用 AI 做出自动化，怎样把它可靠地交付给客户，并重复卖第二次？**

## 为什么先争 OPC 自动化交付

OpenDesk 当前已经接近这条链：

```text
Agent / Recorder
→ Workflow
→ 参数化
→ 验证
→ 客户机器运行
→ Evidence
→ 诊断 / 维修
→ 第二客户复用
```

这比马上补完整 Browser 和 Mobile 更接近现有产品，也更容易通过真实第二台机器、真实客户和真实维护工时证明价值。

Cua 更偏 Agent Computer Use；Peekaboo 更偏 macOS Agent automation；Appium 是成熟的多平台 UI automation 底座；UiPath 和 Automation Anywhere 在企业自动化交付上更完整。

OpenDesk 要争的不是“功能比他们都多”，而是一个更窄的问题：

> **OPC 能不能用 OpenDesk，把 Agent 做出的自动化变成可重复交付的业务资产？**

## Appium 为什么让这个结论更清楚

如果只看平台覆盖，很容易把下面的组合当作差异：

```text
macOS
+ Windows
+ Browser
+ iOS / Android
```

但 Appium 的 Driver 生态已经覆盖浏览器、macOS、Windows、Android、iOS 等多个 Surface。

因此：

> **多端是能力，不是自动形成的护城河。**

OpenDesk 真正需要统一的是更高一层：

```text
任务
→ 选择最合适的控制方式
→ 执行
→ 验证结果
→ 保存证据
→ 形成可复用 Workflow
→ 维修
→ 再交付
```

## 第二个位置：双入口 RPA

第二个值得争的位置也可以收成四个字：

> ## **双入口 RPA**

意思是：

```text
普通用户 Recorder ─┐
                    ├→ 同一种 Workflow
Codex / Claude ─────┘
```

真正的竞争点不是“有 Recorder”，也不是“有 Agent CLI”。

而是：

> **人演示一次和 Agent 探索一次，最后能不能变成同一种可维护、可验证、可复用的自动化。**

这条的强对手包括 UiPath Delegate、OpenAdapt、ADH 和 Codex Record & Replay。

## 第三个位置：可复用 Agent RPA

这是更适合官网和长期品牌传播的主山头：

> ## **可复用 Agent RPA**

一句话：

> **AI 做一次，以后自动做。**

它比 OPC 自动化交付更宽，所以竞争也更强。

当前更合理的目标是先建立 Top 3 证据，而不是先喊 Top 1。

## 长期扩张：多端 Agent RPA

等桌面主链证明以后，再扩：

```text
Desktop
+ Browser
+ Mobile
        ↓
同一种 Workflow
        ↓
Verification / Evidence / Delivery
```

Browser 可以接 CDP / Playwright；Mobile 可以同时探索手机镜像和 Appium XCUITest / UiAutomator2。

这条可以简称：

> **多端 Agent RPA**

但它目前还是扩张目标，不是已经完成的产品能力。

## 最合理的顺序

```text
1. OPC 自动化交付
2. 双入口 RPA
3. 可复用 Agent RPA Benchmark
4. Browser Adapter
5. Mobile / Appium Adapter
6. 多端 Agent RPA
```

这个顺序的核心思想很简单：

> **先证明一个人能把自动化稳定卖出去，再增加更多可以自动化的设备。**

## 什么时候才可以说“第一”

至少需要：

- 明确竞争范围；
- 预先选出 3—5 个最接近的替代方案；
- 同一个 Workflow 从作者机器交付到第二台机器；
- 统计安装、参数化、首次成功和维修工时；
- 至少一个外部独立环境或真实付费交付；
- 未测试竞品不能按失败处理；
- 公开最强对手在哪些维度更强。

在这些证据出现以前，准确说法是：

> **OpenDesk 正在优先验证“OPC 自动化交付”这个 Top 1 候选位置。**

而不是：

> OpenDesk 已经全球第一。
