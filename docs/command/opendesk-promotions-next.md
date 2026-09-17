# OpenDesk：按 v4 图片推广 Oracle 完成 Native renderer 与正式产品接线

仓库：`shopable-ai/opendesk`

目标分支：`master`

不要创建新分支，不要 reset / force push。存在并行会话；开始和每次写入前重新读取当前 `master` HEAD 与目标文件，不能覆盖其他会话的新修改。

本轮直接修改、测试并写回仓库，不停留在设计、审计或重新画一套 HTML 原型。

## 一、先读取真实基线

必须先完整读取：

```text
AGENTS.md

docs/architecture/opendesk-promotions.md
apps/opendesk/prototypes/promotions/index.html
apps/opendesk/prototypes/promotions/samples.js

apps/opendesk/promotions/core.js
apps/opendesk/promotions/controller.js

tests/promotions/core.test.js
tests/runtime-api/promotion-surface.js

docs/api/ui.md
pkg/customui/** 中与 HTML surface、image、placement、event、focus 相关实现

apps/opendesk/main.js
apps/opendesk/script-runner-simple.js
apps/opendesk/script-runner/controller.js
apps/opendesk/script-runner/player-controller.js
apps/opendesk/script-runner/shortcut-controller.js

Recorder / Measurement / Agent / Scheduler 的真实生命周期 owner
apps/opendesk/.release/app-mode-runtime-files.txt
```

`apps/opendesk/prototypes/promotions/index.html` 已经是 **v4 浏览器视觉 / 交互 Oracle**。不要重新设计成旧版，也不要把当前 Native 实现反过来当 Oracle。

## 二、v4 固定需求

### 1. 第一广告位

是独立推广浮层，不扩张紧凑 Runner：

```text
默认：Runner 上方、右边缘对齐、间隔 12 logical units
可选：当前显示器 work area 右下角、边距 16
```

同屏最多一张。空间不足时不显示；禁止覆盖 Run / Stop，禁止偷偷改到其他位置。

### 2. 五种展示场景

正式 renderer 必须覆盖同一套组件的五种场景：

```text
静态大图
GIF / WebP 动图
素材自带文案（media-only）
图片 + 文字
纯文字
```

关键新增是 **media-only**：

> 当图片或 GIF/WebP 本身已经包含标题、卖点、价格、品牌口号等完整广告文案时，OpenDesk 不再额外叠加 title / description。

media-only 只保留：

```text
推广 · 广告主
⋯
×
CTA（例如 了解详情 →）
```

不要把 media-only 实现成新的网络格式或另一套窗口。它只是 renderer 的 presentation mode，可以同时支持静态 image 和 animated-image。

### 3. 图片是广告画布

图片型广告不增加独立 footer 背景。

目标尺寸：

```text
静态大图 / GIF / media-only：360 × 240
图片 + 文字：约 360 × 268
纯文字：约 360 × 196
```

推荐素材 3:2。普通图文可以使用轻量透明渐变和文字阴影；media-only 的遮罩必须更弱，避免破坏已经设计好的广告素材。

CTA 是明确的可点击文字动作。禁止把整个图片变成无提示的隐形链接。

### 4. 动图

广告内部**没有播放 / 暂停按钮**。

```text
显示
→ GIF/WebP 自动播放一次
→ 最多约 5 秒
→ 切回静态 poster
→ 本次展示不再次自动播放
```

reduced-motion 已知为 true 时，从一开始只显示 poster。

隐藏、关闭、开始任务、页面后台化时必须停止动画并清理 timer / image resource。

### 5. 关闭语义

右上角固定：

```text
⋯   ×
```

`×` 只关闭本次，不写长期偏好。

`⋯` 菜单：

```text
今天不再显示
7 天不再显示此推广
关闭所有推广
```

7 天规则按 `campaignId`，更换 creativeId 不能绕过。关闭所有推广必须有明确恢复入口。

## 三、本轮必须完成的正式实现

### P0 — v4 Gap Matrix

先比较：

```text
Prototype v4
vs
promotions/core.js
promotions/controller.js
vs
Custom UI host
vs
现有 tests
```

列出真实 Gap，但不要停在报告；立即继续修复。

重点找旧行为：

```text
promotionMotion / 播放暂停按钮
旧 footer
旧 296 / 380 / 228 尺寸
× = 7 天屏蔽
只有 4 种展示类型
image layout 隐式等同“不显示 copy”而无法区分 media-only
旧测试仍断言 motion button
```

### P1 — 正式 renderer v4

修改正式 `apps/opendesk/promotions/**`：

- 建立明确 presentation/layout 字段或等价稳定模型，使普通 image 和 media-only 不混淆。
- validation 必须 fail closed，未知 presentation 不接受。
- media-only 不生成 title / description DOM 控件。
- 删除正式广告内部 playback UI。
- 对齐 v4 尺寸、overlay、CTA、`⋯ / ×`。
- `×` 调用 transient close，不走 campaign dismissal。
- `⋯` 三种偏好分别有稳定动作。
- 不允许远程 HTML / script / inline handler / command 获得执行能力。

不要为了广告修改通用 Runner 的商业语义。

### P2 — 正式产品接线

在 OpenDesk 官方产品层创建并管理唯一 promotion controller。

完成：

```text
OpenDesk main product
→ promotion owner
→ Runner actual bounds
→ promotion show / move / hide / close
```

Runner 移动时重新 anchor；Runner 隐藏/关闭时推广一起收起；脚本列表打开时收起。

不要修改 `script-runner-v1`。

### P3 — 全局自动化安全抑制

广告不能只观察 Runner。

必须用真实 owner 汇聚：

```text
Runner execution
Agent execution
Scheduler execution
Recorder active
Measurement active
```

最低状态合同：

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

任何来源未知时 fail closed。

进入任务前：

```text
禁止推广点击
→ await promotion close/hide
→ 再允许自动化输入
```

不能只依赖轮询；要处理“广告正在异步 create/show，而自动化同时开始”的竞态。

### P4 — 偏好与频次持久化

写入官方 `appDataRoot`，不能写 Recipe 目录。

支持跨重启：

```text
今天不再显示
campaign 7 天屏蔽
关闭所有推广
恢复推广
```

`×` 不产生持久记录。

继续保留起始频控：每日最多 2 次、间隔至少 30 分钟，除非有新的明确产品决定。

### P5 — 图片 / GIF Native readiness

`window.show()` 成功不代表 `<img>` 已解码成功。

必须核验真实 Native HTML surface 是否已经有 image load/error 可观察契约。

如果没有：

- 先设计最小正式能力；
- 按 `docs/api/.rules.md` 修改 API 文档；
- Runtime API 测试必须使用 JS；
- 不要用 Go 白盒测试替代可由 JS 观察的公共行为。

图片加载失败必须取消此次展示，而不是留下空广告框。

### P6 — 原生 Focus / Esc / Interaction Group

验证：

- 初次广告 show 不抢当前应用焦点；
- 点击 Runner 与推广之间不会产生错误的 outside close；
- `Esc` 行为与 HTML Oracle 一致；
- 不要假设 floating window 自动支持 normal window 的 keyEvents；
- 不允许用 blur + timeout 伪造 interaction group。

### P7 — 发布边界

正式 Runtime 只打包生产所需：

```text
promotions/core.js
promotions/controller.js
正式 creative / assets（如有）
```

Prototype、测试 fixture、演示 GIF 不得因为方便而全部进入 release payload。

更新 `apps/opendesk/.release/app-mode-runtime-files.txt`。

Windows 缺 WebView2 时：推广禁用或降级，不得阻塞 OpenDesk 启动、Run、Stop 或其他核心功能。

## 四、测试要求

先跑并修复：

```bash
node --test tests/promotions/core.test.js
```

更新所有旧断言。至少新增覆盖：

```text
5 种 presentation
media-only 静态图
media-only animated-image
media-only 不产生 title/description 控件
无 promotionMotion
GIF 5 秒后 poster
reduced-motion poster-only
× 只 close、不写 campaign dismissal
今天 / 7 天 / 全局关闭
campaignId 防 creativeId 绕过
并发 show single-flight
create/show 中途自动化开始
图片 decode/load 失败
Runner move / hide / list open
Agent / Scheduler / Recorder / Measurement 抑制
WebView2 unavailable 隔离
```

Native Runtime smoke：

```bash
./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
```

如果 smoke 还是旧 UI，同步更新测试 fixture；不要为了让旧测试通过恢复旧产品行为。

## 五、真机资格验证

macOS / Windows 分开记录事实。

至少核对：

```text
Runner 上方位置
屏幕右下角位置
media-only
普通图文
GIF 自动播放并停止
无 playback button
× 临时关闭
⋯ 三个偏好
Runner 移动跟随
开始自动化前广告消失
Esc / outside interaction
不抢焦点
多显示器 / DPI / taskbar / Dock work area
```

截图、日志等运行产物写 `.runtime/tests/promotions/`，不要提交运行产物。

没有真机证据不能写“macOS / Windows 全部通过”。

## 六、本轮不要做

```text
腾讯 / Google / Carbon 等广告平台 SDK
远程计费曝光
竞价系统
远程 HTML / JS 创意
视频广告
复杂广告后台
```

平台接入是下一阶段，不得阻塞 v4 本地/官方推广能力闭环。

## 七、最终报告

必须明确：

```text
开始 HEAD / 最终 HEAD
修改文件
Prototype v4 → Native Gap Matrix
正式 renderer 已对齐哪些 v4 行为
media-only 如何表示和渲染
生产入口怎样创建/关闭推广
自动化安全抑制覆盖哪些 owner
偏好保存位置
测试命令与真实结果
Native / macOS / Windows 证据
仍未验证的风险
release payload 是否正确
master / git status 状态
```

不要只给方案或提示词；直接修改代码、测试、文档并写回 `master`。
