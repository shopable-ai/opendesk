# OpenDesk 图片推广浮层：展示层 v1

日期：2026-09-17。状态：展示核心、受限 Native UI 适配器、中文交互原型和测试已实现；**尚未接入生产主程序的自动展示生命周期，也未完成 macOS / Windows 实窗资格验证**。

## 产品决定

第一广告位改为独立推广浮层，不是管理窗口内的底部文字条，也不扩张紧凑 Runner。默认在 Runner 上方、右边缘对齐，间隔 12 logical units；可配置为屏幕工作区右下角，边距 16。两种位置共享同一展示器，同一时刻只有一张。不能遮挡 Run / Stop；空间不足时不展示，不偷偷切换到其他位置。

借鉴用户提及的桌面右下角图片弹层形态，不复制其他软件品牌、权限提示、强制弹窗或关闭后反复出现的行为。它是 OpenDesk 自己的窗口，不是系统通知中心，也不改变 ui.toast() 的业务反馈职责。

类型按三个正交维度划分：

| 维度 | 首版 |
| --- | --- |
| 排版 layout | image（大图）、image-text（图文）、text（文字） |
| 素材 media.kind | image（PNG/JPEG）、animated-image（GIF/WebP＋静态 PNG/JPEG poster） |
| 位置 placement.mode | runner-above、screen-bottom-right |

原型提供静态大图、动图、图片＋文字、纯文字四个预设，不因此复制四套窗口代码。首版不接视频、远程 HTML、第三方脚本和广告 SDK。素材来源独立于排版；平台接入不是展示本地内容的前置条件。

## 已交付文件

- `apps/opendesk/promotions/core.js`：内容校验、安全转义、受限 HTML/CSS、纯布局计算、频次/关闭规则。
- `apps/opendesk/promotions/controller.js`：真实 ui.createWindow / setRelativeTo / setPlacement / control.update 的产品适配，单实例、竞态取消、暂停/关闭、可注入状态与持久化。
- `apps/opendesk/prototypes/promotions/index.html`：中文可交互浏览器原型，复用同一 renderer，不是第二套正式 UI。
- `apps/opendesk/prototypes/promotions/samples.js`：本地 PNG 和三帧 GIF 测试素材；只用于演示，不是已审核商业创意。
- `tests/promotions/core.test.js`：Node 侧纯 JS / fake-host 回归。
- `tests/runtime-api/promotion-surface.js`：真实 Runtime 手动 smoke，显示两个位置，CTA 仅打印，不运行自动化或发送广告统计。

没有修改 main.js / 通用 Runner / 官方 URL 配置 / Recipe 目录。拉取这些源码不等于已安装软件会开始弹出广告。

## 视觉与交互合同

窗口宽 360 logical units；大图/动图高 296，图文高 380，文字高 228。图片区高 180，左右各留 12，采用 contain 保留完整内容。PNG/JPEG/GIF/WebP 不被拉伸。长标题最多两行，说明最多两行；第一版只针对中文内容，英文/其他语言与系统主题适配属于生产接入验收。

头部永久显示“推广 · 广告主”和 32×32 的关闭命中区；关闭控件独立于素材。底部提供“今天不再显示”“关闭推广”以及详情按钮。只有详情按钮触发动作，不给整张卡片或图片设置隐形链接。正式第三方赞助需明确显示“广告”，不能伪装官方提示。

单次最多展示 15 秒；动图每次最多播放 5 秒，之后替换为静态 poster。再次播放需要明确点击。隐藏/关闭必须卸载素材并清理计时器。不自动轮播，不连续补弹，不播放音频。

Native 适配器默认 poster，点击才播放；浏览器原型有显式的“演示自动播放”开关。浏览器遵守 prefers-reduced-motion；在原生系统偏好与图片就绪事实尚未接线前，不能宣称 Native 已实现同样的自动播放行为或 GIF 原地暂停（当前是换成 poster）。WCAG 2.2.2 的参考：https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html 。

原型可导入本地素材（单文件≤2 MiB，尺寸≤2048×2048），生成静态封面，不上传。预览右下角时会明确将**模拟播放器**移到左上，以便比较两种位置；生产适配器不会移动真实 Runner。

## 生命周期与安全

内容仅接受严格结构化字段及有长度上限的 inline raster data。拒绝外部图片 URL、SVG、远程 HTML、未知字段、命令和脚本动作。data MIME/signature 校验不等于完整图片安全审计：后续接收远端素材时必须新增可信下载、字节及像素预算、实际解码与失败回退，不能把当前本地 fixture 校验当远程广告沙箱。

动作只允许 preview 或受审核的 `opendesk.home` / `opendesk.customize` 标识；调用方通过既有 Official Shell 解析目标。没有引入第二个官方 URL source。测试 CTA 不打开链接。

Native 使用 `kind:'floating'`，不调用 focus；调用方必须提供明确状态：

```js
{ready:true, ownerVisible:true, automationIdle:true,
 recorderIdle:true, measurementIdle:true,
 listOpen:false, fullscreen:false, presentationMode:false}
```

缺字段/未知状态一律不展示。show 在异步创建、定位、显示后均重验状态；关闭或取消后迟到窗口不会重新 show。Native 定位使用真实 logical bounds 和 host 工作区，不使用浏览器 CSS 像素冒充桌面坐标；实际定位后再检查与锚点重叠。

**状态提供者现在是注入合同，不是已经存在的全局任务监控。**生产接入必须从 Script Runner、Agent、Scheduler、Recorder、Measurement 等真实 owner 汇聚；进入不安全状态前 await refreshContext()/close() 完成，不能只用低频轮询，也不能凭没有 Runner 任务就断言全局空闲。无法可靠获知的自动化来源下，关闭自动广告。原型按钮与 Native smoke 中的状态仅是受控 fixture。

核心频次默认每自然日最多两次、间隔至少 30 分钟；X 关闭同活动七天、今天关闭到下一个本地午夜、全局关闭直到用户在设置中主动恢复。关闭记忆以 campaignId 为准，更换素材不能绕过。计数是客户端“展示记录”，不是计费曝光。没有任何遥测请求。正式 appDataRoot 的持久化接线仍待完成；原型 localStorage 与 Native smoke 不写正式用户偏好。

控制器关闭原生 window 后不复用已关闭 ID；再次展示生成新 ID，符合现有 Custom UI 合同。图片加载就绪、原生 Esc、同组焦点、DPI/多屏变化都不能用 Fake Host 结果当作已验收。

## 原型与 Native 的差异不能隐藏

浏览器原型已具有 Esc、组外点击、拖动锚点跟随、模拟 Run/List 收起、系统减少动态效果；这些依赖 DOM 的行为不自动变成 Native 功能。当前 native adapter 有独立 `interactionGroup` 和 `interactionOutside`，提供 reanchor()/refreshContext()；正式 Runner 组归属及生命周期事件订阅尚未接线。浮窗 keyEvents 的现有公开支持范围不能随意扩大；原生 Esc 要验证现有宿主能力，必要时修正规范、源码与 JS 回归后再启用。

生产初次展示、广告展开时的焦点、关闭前后的键盘目标、点 Runner 是否意外关广告，需要真实系统验收。Windows HTML surface 需要 WebView2；缺少时只禁用广告，不能让 Runner 启动失败。依据为 `docs/api/ui.md`、`pkg/customui/validate.go`，不是假设 Electron。

## 验证记录

在独立工作副本运行 `node --test tests/promotions/core.test.js`：18/18 通过。包含输入拒绝、素材/排版、几何、状态未知、频次、HTML 转义、并发 show、迟到创建、Native 重叠、手动动图切换、立即收起、持久化顺序与异常。

Chromium 渲染 DOM smoke：12 组场景通过，包括四种样式、两种位置、运行/列表抑制、Esc、会话关闭记忆、减少动态效果和窄工作区。没有页面异常及外部请求。环境禁止 file/HTTP 导航，测试使用 Playwright set_content 加载同一份内联后的原型；**没有把直接双击文件、跨重新加载 localStorage 或 macOS/Windows 实窗标记为通过**。浏览器截图仅为该渲染证据。

从仓库根目录的后续命令（本轮未执行 Native）：

```bash
node --test tests/promotions/core.test.js
./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
```

Native smoke 会依次出现上方与右下角两个测试浮层，各自关闭/到时后进入下一项。请在没有真实自动化运行时使用。需要核对 Runtime 与 UI host 构建来源；真正截图等运行产物写 `.runtime/tests/promotions/`，不提交。

## 下一步

详见 `docs/command/opendesk-promotions-next.md`。先完成产品接线、真实素材就绪/失败状态、原生交互组和资格验证，再决定自动展示开关。远程清单、签名发布、广告平台、计费与视频不属于本次展示层完成声明。
