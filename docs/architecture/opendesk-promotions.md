# OpenDesk 图片推广浮层：展示层 v1

日期：2026-09-17。状态：展示核心、受限 Native UI 适配器和中文交互原型已存在；**浏览器视觉 Oracle 已进入 v4，Native renderer 与正式产品生命周期尚未完成 v4 对齐，也未完成 macOS / Windows 实窗资格验证**。

## 产品决定

第一广告位是独立推广浮层，不扩张紧凑 Runner，也不使用系统通知替代。默认显示在 Runner 上方、右边缘对齐，间隔 12 logical units；可显式配置为屏幕工作区右下角，边距 16。同一时刻只有一张；空间不足时不展示，不遮挡 Run / Stop，也不偷偷切换位置。

素材来源、排版、媒体类型和位置相互独立。首版不接视频、远程 HTML、第三方脚本或广告 SDK。

## v4 视觉 / 交互 Oracle

`apps/opendesk/prototypes/promotions/index.html` 是当前浏览器视觉与交互基准。原型提供五种场景：

| 场景 | 规则 |
| --- | --- |
| 静态大图 | 图片为主，可叠加标题、说明和 CTA |
| GIF / WebP 动图 | 与静态大图同布局；无播放/暂停按钮；最多约 5 秒后切回 poster |
| **素材自带文案（media-only）** | 图片/GIF 内已经包含标题、卖点、视觉文案；**不再叠加外部标题和说明**，只保留推广标识、`⋯`、`×` 和最小 CTA |
| 图片＋文字 | 图片负责视觉，外层补充标题、说明、CTA |
| 纯文字 | 无媒体时的退化/官方文本推广 |

media-only 是排版语义，不是新的网络媒体格式。它可以承载静态图片，也可以承载 animated-image。不能要求广告主为了切换 media-only 再生成另一套 Runtime 窗口。

### 卡片与位置

- 静态大图 / 动图 / media-only：目标 360×240 logical units，推荐素材 3:2。
- 图片＋文字：目标约 360×268。
- 纯文字：目标约 360×196。
- 图片是广告画布；不增加独立 footer 背景。
- 普通图文仅用轻量透明渐变和文字阴影提高可读性。
- media-only 的底部渐变更弱，因为素材内部已经完成主要信息层级；不得再盖一层标题说明。
- 顶部永久显示“推广 · 广告主”；右上角 `⋯` 与 `×` 默认无填充背景。
- CTA 是显式文字动作；整张图片不能成为无提示隐形链接。

### 关闭语义

`×` **只关闭本次展示**，不写长期偏好。

`⋯` 菜单负责持久偏好：

```text
今天不再显示
7 天不再显示此推广
关闭所有推广
```

“7 天不再显示此推广”以 `campaignId` 为单位，更换 creativeId 不得绕过。关闭所有推广必须有明确恢复入口。

### 动图合同

广告内部**不显示播放/暂停按钮**。GIF/WebP 自动播放一次，最多约 5 秒，之后切回静态 poster；本次展示不再次自动播放。系统/产品已知 reduced-motion 时，从第一帧开始只显示 poster。

隐藏、关闭、进入自动化任务、后台化时必须清理计时器并停止动态图资源。首版不自动轮播、不连续补弹、不播放音频。

## 当前实现与漂移

已交付：

- `apps/opendesk/promotions/core.js`：内容校验、媒体约束、几何、频次和偏好规则。
- `apps/opendesk/promotions/controller.js`：Custom UI Native surface 适配器。
- `apps/opendesk/prototypes/promotions/index.html`：**v4 浏览器 Oracle，包含 media-only**。
- `apps/opendesk/prototypes/promotions/samples.js`：本地 PNG / GIF fixture。
- `tests/promotions/core.test.js`。
- `tests/runtime-api/promotion-surface.js`。

当前 `core.js` / `controller.js` 的 Native renderer 仍可能包含旧尺寸、footer、motion 控件和关闭语义，且尚未支持 v4 media-only 作为正式渲染合同。因此不能把浏览器 v4 表述成已经安装后的产品效果。

下一轮必须先做 `Prototype v4 → Native renderer → Product integration` Gap Matrix，再修改正式实现；禁止为了减少修改量把原型重新降回旧 UI。

## 生命周期与安全

内容只接受严格结构化字段及受限 raster data。拒绝远程 HTML、SVG、业务 script、inline handler、命令和未知动作。后续若引入远程素材，必须单独增加可信下载、字节/像素预算、实际图片解码、签名/有效期和失败回退；当前 data URI fixture 校验不等于远程广告安全沙箱。

正式生产状态提供者必须明确覆盖：

```js
{
  ready: true,
  ownerVisible: true,
  automationIdle: true,
  recorderIdle: true,
  measurementIdle: true,
  listOpen: false,
  fullscreen: false,
  presentationMode: false
}
```

这里的 `automationIdle` 不能只代表 Runner；必须覆盖 Agent、Scheduler 和其他可驱动桌面的任务。任何来源状态未知时 fail closed，不展示广告。进入任务状态前应先禁用广告点击并 await surface 收起，不能依赖低频轮询。

Native 使用真实 logical desktop bounds 与 host work area。不能用浏览器 CSS 像素冒充原生坐标。Runner 移动、多屏、DPI、显示器 work area 改变和空间不足都需要真实 host readback 与重验。

## 偏好与频次

当前默认策略仍为：每日最多两次、间隔至少 30 分钟；该策略是产品起始默认值，不是广告平台结算规则。

- `×`：仅本次，不持久化。
- 今天不再显示：到下一个本地午夜。
- 7 天不再显示：按 campaignId。
- 关闭所有推广：持续到用户主动恢复。

正式偏好必须写入 OpenDesk appDataRoot，而不是 Recipe 目录。原型 localStorage 只用于交互样机。

## 原型与 Native 的差异不能隐藏

浏览器原型里的 Esc、组外点击、拖动 Runner 锚点、模拟 Run/List 抑制、文件上传和 reduced-motion 控件都只是 Oracle / fixture。Native 需要通过现有 Custom UI / App owner 能力逐项实现或明确记录 Gap。

Windows HTML surface 依赖 WebView2；不可用时只禁用推广，不得阻塞 OpenDesk 启动、Runner、Stop 或任务执行。任何展示不得抢夺当前前台输入焦点。

## 验证状态

历史纯 JS/fake-host 回归曾达到 18/18；该结果覆盖旧核心行为，不代表 v4 Native 已对齐。

v4 浏览器原型已经解决：

- 无播放/暂停按钮；
- `×` 只关闭本次；
- 三种长期偏好进入 `⋯`；
- 五种展示模式，新增 media-only；
- media-only 不叠加标题和说明；
- 图片/动图主卡收敛到 3:2 目标比例。

下一轮需要更新旧测试断言，并进行真实 Runtime / macOS / Windows 视觉证据验证。没有实窗证据不得写“双系统已通过”。

## 下一步

执行 `docs/command/opendesk-promotions-next.md`。本轮优先完成 v4 Native 对齐和正式产品接线；远程广告清单、广告平台 SDK、计费和视频属于后续独立 Goal。
