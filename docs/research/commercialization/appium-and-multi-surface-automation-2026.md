# Appium 与 Multi-surface Automation 竞争基线

更新时间：2026-09-16

> Research / Competitive Evidence。本文补齐此前竞品研究中遗漏的 Appium，并判断 Desktop + Browser + Mobile 对 OpenDesk 的战略意义。不是当前能力承诺或全球排名证明。

## 核心结论

Appium 必须进入 OpenDesk 的竞品与架构参照集合。它不是 Agent-driven RPA 同类产品，而是成熟的 multi-platform UI automation substrate。

Appium 官方当前将自身描述为覆盖 mobile、browser、desktop、TV 等多类 UI automation 的开源生态；官方 drivers 包括 Chromium、Gecko、Safari、Mac2、Windows、UiAutomator2、Espresso 与 XCUITest。

因此：

> `Desktop + Browser + Mobile` 本身不能成为 OpenDesk 的 Top 1 依据。

真正值得竞争的交集需要继续包含：

```text
Agent-first + Human-first
+ best-surface routing
+ Automation-as-Code
+ business verification
+ deterministic replay
+ repair evidence
+ commercial delivery
```

## Appium 对 OpenDesk 的三个重要启示

### 1. Multi-surface 已有成熟先例

Appium 通过统一 Server + Driver / Plugin extension + WebDriver contract 覆盖多个不相关平台。OpenDesk 如果扩展 Browser / Mobile，不应仅以“覆盖平台更多”作为领先主张。

### 2. Mobile 应考虑双轨

Consumer / low-setup：

```text
phone mirroring
→ desktop-window perception/input
→ workflow
```

Professional semantic：

```text
iOS → Appium XCUITest adapter
Android → Appium UiAutomator2 adapter
```

前者适合本地用户与快速使用，后者更适合 semantic selector、专业测试、unattended 与 device-farm 场景。

### 3. Browser / Mobile 更适合 Adapter，而不是重写核心

候选架构：

```text
OpenDesk Workflow
        ↓
Surface Router
        ├→ Desktop: AX / UIA / Vision
        ├→ Browser: CDP / Playwright adapter
        ├→ iOS: Appium XCUITest adapter
        ├→ Android: Appium UiAutomator2 adapter
        └→ Mirrored mobile: desktop-window adapter
        ↓
Verification / Evidence
        ↓
Reusable Recipe
```

## Appium 与 OpenDesk 的结构差异

| 维度 | Appium | OpenDesk 当前 / 目标 |
| --- | --- | --- |
| 核心定位 | Multi-platform UI test / automation framework | Agent-driven local automation / RPA runtime |
| Agent-first authoring | 非核心产品合同 | 核心竞争方向 |
| Human Recorder → Workflow | 非核心产品合同 | Recorder 已有，完整 qualification 待闭环 |
| Automation asset | Test/client code | JavaScript Workflow / Recipe |
| Business verification | 由测试作者定义 assertion | 目标是 workflow qualification 的一等合同 |
| Client workflow packaging/licensing | 非主产品 | OpenDesk 已有 protected package / license 基础 |
| Desktop + Browser + Mobile | 成熟生态 | Desktop 当前为核心；Browser real driver、Mobile 尚未成为正式能力 |

## 加入 Appium 后，最应该优先争的 Top 1 小山头

### Priority A — 第一优先

> **Agent-authored Local Automation Delivery Runtime for independent developers / automation consultants**

中文：面向独立自动化开发者、AI 自动化顾问和小型实施团队，把 Agent 做出的本地自动化打包、授权、部署、验证、诊断和维护给客户的一体化 Runtime。

优先原因：

1. 离 OpenDesk 当前能力最近，不需要先完成 Browser / Mobile；
2. 已有 JavaScript Recipe、`.odpkg`、Execution artifacts、签名 / License / device-bound authorization 等基础；
3. 当前产品方向覆盖 macOS + Windows，可直接验证跨机器交付；
4. Cua、Peekaboo、Appium 的主定位都不是独立开发者的业务 workflow 商业交付 Runtime；
5. 可以直接用第二台机器、第二个独立环境和真实付费交付验证。

当前结论：这是 OpenDesk **最应该优先尝试证明 Top 1** 的有限小山头，不是已经取得的排名。

### Priority B — 第二优先

> **Human demonstration + Coding Agent exploration → same maintainable macOS/Windows Workflow**

要求 Recorder UI 与 Agent CLI 最终汇合到同一种 Workflow / Recipe contract。强对手包括 UiPath Delegate、OpenAdapt、ADH、Codex Record & Replay。

### Priority C — 长期更大山头

> **Local Multi-surface Agent RPA Runtime: Desktop + Browser + Mobile → one verified reusable workflow model**

长期潜力高，但当前不能优先铺开：OpenDesk 正式 Browser 架构尚无 real browser driver，Mobile 也没有正式 public surface / qualification；Appium 与 UiPath 已证明“多平台”本身不稀缺。

推荐顺序：

```text
Delivery Runtime
→ Human + Agent same workflow
→ Browser adapter
→ Mobile adapter
→ Multi-surface benchmark
```

## 来源

- https://appium.io/
- https://appium.io/docs/en/latest/ecosystem/drivers/
- https://appium.io/docs/en/latest/developing/build-drivers/
- https://appium.io/docs/en/3.2/developing/

研究日期：2026-09-16。