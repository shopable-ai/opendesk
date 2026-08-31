# Clawdesk 商业化研究

更新时间：2026-08-31

本目录保存 Clawdesk 的**市场、竞品、收费方式、行业机会和商业模式研究**。

它属于 `docs/research/`，是产品与商业决策的输入，不是当前产品能力、架构事实或正式路线图。

## 当前研究文件

1. [`自动化软件竞品与商业模式研究.md`](自动化软件竞品与商业模式研究.md)
   - 研究 AutoHotkey、PyAutoGUI、RobotGo、pywinauto、Windows API 等底层能力为什么通常免费；
   - 研究 nut.js、Macro Recorder、Ui.Vision、Power Automate、UiPath 等如何向上层收费；
   - 归纳 Open Source、Recorder、Bot、Enterprise、Marketplace、Services、Vertical SaaS、Outcome-based 等商业模式。

2. [`电商软件市场自动化与商业机会研究.md`](电商软件市场自动化与商业机会研究.md)
   - 当前最高优先级商业研究；
   - 同时覆盖中国、跨境和海外电商；
   - 研究选品、竞品、流量、内容、广告、客服、订单、发货、售后、库存、财务等真实付费问题；
   - 研究 Helium 10、Jungle Scout、Triple Whale、Gorgias、Shopify Flow 等海外案例，以及千牛、店小秘、卖家精灵、蝉妈妈、飞瓜等中国/跨境样本池。

3. [`自动化商业化领域地图.md`](自动化商业化领域地图.md)
   - 电商保持 P0；
   - 罗列客服、销售、财务、办公、内容、物流、IT、QA、HR、制造业、房产等后续商业研究领域；
   - 只建立优先级和问题池，不代表项目立即扩张到这些行业。

## 与其他 Research 的边界

已有技术竞品和方案研究继续保留在：

- `docs/research/2026-04-07-desktop-automation-landscape.md`
- `docs/research/desktop-automation/`

两类 Research 的区别：

```text
技术 Research
→ 谁能做什么、怎么实现、Build/Buy/Integrate

商业化 Research
→ 谁愿意付钱、为什么付钱、怎么收费、Clawdesk 应该卖什么
```

不新建平行 `reference/` 目录。外部软件与市场信息如果只是事实来源，直接在 Research 文档中记录来源；需要机器可复用的外部参考 manifest 时，遵循仓库规则放到 `docs/research/external/`。

## 研究原则

1. 优先官方价格页、官方产品文档、官方 Marketplace、财报/公开经营数据。
2. 用户痛点可补充社区、论坛、Reddit、Freelancer/Upwork 等需求证据，但必须与官方产品事实区分。
3. “没有找到付费模式”不能写成“绝对没有收入”，应标记为公开证据不足。
4. 区分：
   - 框架作者收入；
   - 第三方生态收入；
   - 用户通过框架节省成本产生的间接价值。
5. 所有价格都带研究日期，后续可能变化。
6. 商业机会进入正式 Roadmap 前，必须再经过真实用户、付费或 ROI 验证。
7. 不因为某个市场很大就自动进入开发计划；优先研究 Clawdesk 是否具有结构性优势。

## 当前商业研究主线

```text
自动化底层商业模式
→ Recorder / Creator / Marketplace 商业模式
→ 电商软件真实付费点
→ 真实商家问题池
→ 3 个可收费 Workflow
→ 真实付费验证
→ 再决定是否扩大 Creator / Marketplace / Platform
```
