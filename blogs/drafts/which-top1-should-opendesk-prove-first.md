# OpenDesk 最应该先证明哪个“全球第一”？加入 Appium 后，答案更窄了

状态：Draft  
更新时间：2026-09-16

> 本文讨论的是一个准备通过公开 Benchmark 和真实交付去争取的有限竞争位置，不是“OpenDesk 已经全球第一”的声明。

## 结论

OpenDesk 现在最不应该做的，是为了制造“第一”而把竞争范围写成：

> 唯一同时支持 Desktop + Browser + Mobile 的自动化平台。

Appium 已经证明，一个成熟 UI automation 生态可以同时覆盖 mobile、browser、desktop 甚至更多设备 surface；UiPath 等企业 RPA 也已经覆盖桌面、浏览器和移动端。

所以“支持的平台多”本身不是 OpenDesk 的第一。

OpenDesk 目前最值得优先争取的更窄位置是：

> ## Agent-authored Local Automation Delivery Runtime for independent developers / automation consultants
>
> 面向独立自动化开发者、AI 自动化顾问和小型实施团队，把 Agent 做出的本地自动化真正打包、授权、部署、验证、诊断并长期维护给客户。

## 为什么先争这个，而不是先补所有平台

OpenDesk 当前真正接近完整闭环的资产不是 Mobile，也不是完整 Browser Driver，而是：

```text
Codex / Claude / Human Recorder
→ JavaScript Workflow / Recipe
→ structured input
→ local Execution
→ run artifacts / evidence
→ protected package
→ publisher signature
→ License / device authorization
→ client machine execution
→ diagnosis / maintenance
```

这条链已经接近一个非常具体的买方问题：

> 我已经能让 AI 帮我做出自动化，怎样把它可靠地卖给客户，而不是把源码、开发环境和我的电脑一起交出去？

Cua 很强，但它的主轴是给 Agent 一台能操作的电脑；Peekaboo 很强，但核心是 macOS native automation；Appium 很强，但核心是 multi-platform UI test / automation framework；UiPath 和 Automation Anywhere 在企业交付上更成熟，但它们面向的是完整企业 Automation Platform。

因此，“独立开发者 / 顾问 + 本地 Agent-authored automation + 商业交付 Runtime”是一个更窄、也更适合 OpenDesk 当前能力去验证的范围。

## Appium 为什么改变了我们的判断

此前很容易把下面这个组合当作潜在第一：

```text
macOS
+ Windows
+ Browser
+ iOS / Android
```

但 Appium 官方 driver 生态已经覆盖：

- Chromium / Gecko / Safari browsers；
- macOS Mac2；
- Windows；
- Android UiAutomator2 / Espresso；
- iOS / iPadOS / tvOS XCUITest。

这说明：

> **Multi-surface 是能力基础，不是自动形成的差异化。**

OpenDesk 真正需要把这些 surface 统一到更高一层：

```text
Goal
→ choose the most deterministic surface
→ execute
→ verify business result
→ save evidence
→ reusable workflow
→ repair
→ deliver to another machine / client
```

## 第二个值得争的位置

> **Human demonstration + Coding Agent exploration → same maintainable macOS/Windows Workflow**

如果普通用户通过 Recorder 演示，Codex / Claude 通过 Agent 探索，最后都能形成同一种可读、可验证、可复用 Workflow，这会比“我有 Recorder”或者“我有 Agent CLI”强得多。

它的强对手也更明确：UiPath Delegate、OpenAdapt、ADH、Codex Record & Replay。

所以这条需要直接公开对测，而不是靠功能清单宣布领先。

## 第三个长期位置

> **Local Multi-surface Agent RPA Runtime: Desktop + Browser + Mobile → one verified reusable workflow model**

长期可以形成：

```text
Desktop
→ macOS AX / Windows UIA / Vision

Browser
→ CDP / Playwright adapter

Mobile
→ phone mirroring for low-setup use
→ Appium XCUITest / UiAutomator2 for semantic automation
```

然后全部进入同一个 Workflow / Verification / Evidence / Delivery 模型。

但这应该是扩张路线，不是现在一次性开工的功能清单。

## 最合理的顺序

```text
1. 先证明 Delivery Runtime
2. 再证明 Human + Agent → same Workflow
3. 加 Browser Adapter
4. 加 Mobile Adapter
5. 最后做 Multi-surface Benchmark
```

如果第 1 步都不能让第二台机器、第二个独立环境或第一个真实客户低成本运行，那么增加更多 surface 只会扩大维护面积。

## 什么证据出现后才可以说“第一”

至少需要：

- 冻结一个有商业意义的竞争范围；
- 预先选出 3—5 个最接近的替代方案；
- 同一个 workflow 从作者机器交付到第二台机器；
- 统计安装、权限、参数化、授权、首次成功和维修工时；
- 至少一个外部独立环境或真实付费交付；
- 未测试竞品不能按失败处理；
- 公开最强对手在哪些维度更强。

在这些证据出现以前，最准确的说法不是“OpenDesk 全球第一”，而是：

> **OpenDesk 正在争一个更窄的位置：让独立开发者把 Agent 做出的本地自动化真正变成可以交付和维护的商品。**

这比“功能最多”更难，但也更有商业价值。