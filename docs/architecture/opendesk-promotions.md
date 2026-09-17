# OpenDesk 图片推广浮层：v4 Native Product Integration

日期：2026-09-17。状态：**v4 产品模型、Native renderer、官方 Product Owner、自动化生命周期屏障、偏好持久化、release payload 与 JavaScript 回归已经接线；macOS / Windows 实窗资格验证仍必须在对应真机完成。**

## 1. Oracle 与职责边界

唯一 UI / Interaction Oracle：

```text
apps/opendesk/prototypes/promotions/index.html
```

正式链路：

```text
Prototype v4
→ apps/opendesk/promotions/core.js
→ apps/opendesk/promotions/controller.js
→ apps/opendesk/promotions/owner.js
→ apps/opendesk/main.js
→ Custom UI native surface
```

Script Runner 保持通用业务控制器；广告主、campaign、频次和商业策略不进入通用 Runner controller。

首版仍然只支持 Local / Official Promotion，不接第三方广告 SDK、远程 HTML/JavaScript creative、竞价、视频、曝光计费或广告后台。

## 2. v4 正式 Promotion Model

当前 schemaVersion 为 `2`，`presentation` 明确取值：

```text
image
animated-image
media-only
image-text
text
```

媒体类型仍只有：

```text
image
animated-image
```

`media-only` 是 presentation mode，不是媒体格式。它可以承载静态 image 或 animated-image，但正式校验拒绝额外非空 `title` / `description`，避免素材已经排版完整文案时被 OpenDesk 再覆盖一层标题说明。

未知 presentation、未知 media 字段、非法 raster data URI、未知 action 一律 fail closed。

## 3. v4 Native Renderer

### 3.1 尺寸

```text
image / animated-image / media-only: 360 × 240
image-text:                         360 × 268
text:                               360 × 196
```

默认位置：Runner 上方、右边缘对齐、间隔 12 logical units。可选位置：当前显示器 work area 右下角、边距 16。

空间不足或 placement/readback 无法确认时不显示，不覆盖 Runner，也不偷偷切换到其他位置。

### 3.2 视觉结构

普通 image / animated-image：

```text
media
+ 轻量底部渐变
+ title
+ description
+ CTA
+ 推广标识 / ⋯ / ×
```

media-only：

```text
media
+ 弱化 system chrome
+ CTA
+ 推广标识 / ⋯ / ×
```

没有旧 footer bar，没有明显 CTA 背景按钮，也没有播放/暂停按钮。

### 3.3 动图

正式 controller 总是先用静态 poster 创建并验证 image readiness；窗口确认可见后才把同一 img control 更新为 GIF / WebP source。

```text
poster ready
→ native window visible
→ animated source
→ 最多 5 秒
→ poster
```

单次展示只播放一次。`reducedMotion === true` 时保持 poster-only。

关闭、隐藏、自动化任务开始或 surface context 失效时会取消 display/motion timer 并关闭 promotion surface。

## 4. 关闭与偏好

`×` 只关闭当前一次展示，不写 campaign dismissal。

`⋯` 菜单负责：

```text
今天不再显示
7 天不再显示此推广
关闭所有推广
```

7 天 dismissal 绑定 `campaignId`，更换 `creativeId` 不能绕过。

关闭所有推广后，OpenDesk 托盘出现“恢复推广”入口；恢复后重新启用 promotion preference。

正式偏好路径：

```text
<OpenDesk appDataRoot>/promotions/preferences.json
```

不写 Recipe 目录，不写 `apps/opendesk` 源码目录。`×` 不产生持久记录。

默认频次仍是：

```text
每天最多 2 次
至少间隔 30 分钟
```

## 5. Promotion Owner

正式唯一 Owner：

```text
apps/opendesk/promotions/owner.js
```

Product 装配入口：

```text
apps/opendesk/main.js
```

Owner 职责：

- 持久偏好加载 / 保存；
- Runner surface bounds / visible state；
- show single-flight；
- scheduler/native product activity 状态刷新；
- 自动化开始前 promotion close barrier；
- Runner move / hide / close / list panel 生命周期；
- Windows WebView2 或 native surface 不可用时仅禁用 Promotion，不阻塞 OpenDesk 核心功能。

## 6. 自动化安全

最低展示上下文仍为：

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

`core.contextReason()` 对缺失、未知或非安全值 fail closed。

### 6.1 Runner / Recipe

`apps/opendesk/promotions/integration.js` 包装统一 `requestRun()` 边界：

```text
promotionOwner.beginAutomation()
→ promotion close/cancel intent
→ Runner requestRun()
→ promotionOwner.endAutomation()
```

因此 Toolbar、快捷键和程序化 requestRun 进入同一安全边界。

### 6.2 Agent

Assistant 注入的 `Agent.run()` 通过 `wrapAgent()` 进入同一 begin/end activity 生命周期；Calculator capability 也独立包装，避免规划阶段和桌面执行阶段之间出现推广 surface。

### 6.3 Scheduler / Recorder / Measurement

`cmd/opendesk/app_product_activity.go` 提供产品私有 activity coordinator，不暴露新的公共 Runtime API。

原生任务开始流程：

```text
native feature requests barrier
→ App Shell dispatches opendesk.activity.suspend
→ JS Product Owner closes/cancels Promotion
→ private loopback activity ack
→ Recorder / Measurement / Scheduler begins
```

barrier 有短超时；Promotion/UI 故障不得阻塞真实业务任务。超时或取消请求会清理 pending barrier，不遗留到下一次 activity ack。

Recorder tray action 与 Measurement 一样在菜单回调返回后再等待 barrier，避免占用 native menu tracking loop。

Scheduler executor 在真正执行 job 时进入 native activity coordinator，不只依赖前端 Scheduler Center 轮询。

## 7. 图片 readiness 公共合同

macOS WKWebView bridge 与 Windows WebView2 bridge 原本已经能读取：

```text
imageComplete
imageNaturalWidth
imageNaturalHeight
source
```

本轮把这些既有 native/browser 事实正式透传到 `pkg/customui.ControlState` 和 JavaScript `ControlHandle.getState()`。

公开类型文件已经与 canonical `ui` API 名称对齐：

```text
types/ui.d.ts
```

旧 `types/custom-ui.d.ts` 已移除。

图片 `imageComplete === true` 且 natural dimensions 为 `0` 代表加载/解码失败；Promotion 遇到该状态会取消本次展示，不留下空白广告框，也不记一次成功展示。

公共 JS 行为测试：

```text
tests/runtime-api/custom-ui-image-readiness.js
```

## 8. Interaction Group / Focus

Promotion HTML surface 使用与 Script Runner Player 相同的 interaction group：

```text
scriptRunnerPlayer
```

目标是让 Runner / List Panel / Promotion 之间的组内交互不被误判成 outside interaction。

Promotion 使用 floating surface，show 不应主动抢当前前台键盘焦点。组外 interaction 会关闭 Promotion 并让 Owner 停止继续自动补弹，直到 Runner 再发生真实 show/move/button interaction。

**Esc、nonactivating floating WebView 键盘事件、跨窗口 interactionOutside 在 macOS / Windows 上仍必须通过真机资格验证；没有真机证据不能写已通过。**

## 9. Prototype v4 → Native Gap Matrix

| v4 Oracle / 产品合同 | 当前代码状态 | 仍需真机证据 |
| --- | --- | --- |
| 5 种 presentation | 已实现 | 视觉一致性 |
| media-only static / animated | 已实现 | 视觉遮罩与 CTA |
| media-only 无 title/description | 正式 validation + renderer 已实现 | 实窗确认 |
| 无 promotionMotion / footer | 已移除 | 实窗确认 |
| GIF/WebP 一次播放 ≤5s → poster | controller 已实现 | GIF/WebP native playback |
| reduced-motion poster-only | 已实现 | 平台 reduced-motion provider/产品接线进一步验证 |
| × transient close | 已实现 | 点击命中区 |
| 今天/7天/关闭全部/恢复 | 已实现 | 跨重启手测 |
| campaignId dismissal | 已实现 | 跨 creative 手测 |
| Runner move/hide/list | 已接线 | 多屏 / DPI / 边界 |
| Runner / Agent / Scheduler / Recorder / Measurement 抑制 | 已接线 | 真实并发任务 |
| create/show 与 automation 竞态 | revision cancel + 非等待 barrier | native host 卡顿/并发 |
| image readiness | Runtime JS 可观察 | macOS WKWebView / Windows WebView2 |
| show 不抢焦点 | floating contract | 真机焦点证据 |
| Esc / interaction group | 已按现有 host contract 接线 | **必须真机验证** |
| Windows 无 WebView2 | surface failure 后 Promotion self-disable | Windows 真机 |

## 10. Release payload

正式 App Mode release 已包含：

```text
promotions/core.js
promotions/controller.js
promotions/integration.js
promotions/official-creative.js
promotions/owner.js
```

Prototype 和测试 fixture 不进入正式安装 payload。

## 11. 自动测试入口

纯 JavaScript 产品合同：

```bash
make test-promotions
# 等价核心：node --test tests/promotions/*.test.js
```

Public Runtime image readiness：

```bash
make test-promotions-native
```

手工 Native promotion surface：

```bash
./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
```

该手工 fixture 用于实际 GIF、poster、focus、Esc、点击、placement 和关闭体验；不能用 fake host 结果替代实窗证据。

## 12. Qualification 状态

当前仓库可以陈述：

```text
v4 Model / Renderer / Product Integration 已写入 master
正式 release payload 已接线
Promotion-specific JS gates 已注册
Public image readiness JS test 已存在
```

当前仓库**不能**陈述：

```text
macOS Native 全部通过
Windows Native 全部通过
Esc / focus / multi-display 已完成真机资格化
安装包实窗截图已经存在
```

下一步只做本地 build、自动测试、真实 OpenDesk App 运行和 macOS/Windows Native qualification；发现失败直接修复当前实现，不重新设计 v4 Oracle。
