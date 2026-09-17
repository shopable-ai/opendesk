# OpenDesk 图片推广浮层：展示层 v1

日期：2026-09-17。状态：展示核心、受限 Native UI 适配器、中文交互原型和测试已实现；**尚未接入生产主程序的自动展示生命周期，也未完成 macOS / Windows 实窗资格验证**。

## 产品决定

第一广告位是独立推广浮层，不是管理窗口内的底部文字条，也不扩张紧凑 Runner。默认在 Runner 上方、右边缘对齐，间隔 12 logical units；可配置为屏幕工作区右下角，边距 16。两种位置共享同一展示器，同一时刻只有一张。不能遮挡 Run / Stop；空间不足时不展示，不偷偷切换到其他位置。

借鉴桌面右下角图片弹层形态，但不复制其他软件品牌、权限提示、强制弹窗或关闭后反复出现的行为。它是 OpenDesk 自己的窗口，不是系统通知中心，也不改变 `ui.toast()` 的业务反馈职责。

类型按三个正交维度划分：

| 维度 | 首版 |
| --- | --- |
| 排版 layout | image（大图）、image-text（图文）、text（文字） |
| 素材 media.kind | image（PNG/JPEG）、animated-image（GIF/WebP＋静态 PNG/JPEG poster） |
| 位置 placement.mode | runner-above、screen-bottom-right |

原型提供静态大图、动图、图片＋文字、纯文字四个预设，不因此复制四套窗口代码。首版不接视频、远程 HTML、第三方脚本和广告 SDK。素材来源独立于排版；平台接入不是展示本地内容的前置条件。

## 已交付文件

- `apps/opendesk/promotions/core.js`：内容校验、安全转义、受限 HTML/CSS、纯布局计算、频次/关闭规则。
- `apps/opendesk/promotions/controller.js`：真实 `ui.createWindow` / `setRelativeTo` / `setPlacement` / `control.update` 的产品适配，单实例、竞态取消、暂停/关闭、可注入状态与持久化。
- `apps/opendesk/prototypes/promotions/index.html`：中文可交互浏览器原型；当前视觉 Oracle 已进入 v3。
- `apps/opendesk/prototypes/promotions/samples.js`：本地 PNG 和三帧 GIF 测试素材；只用于演示，不是已审核商业创意。
- `tests/promotions/core.test.js`：Node 侧纯 JS / fake-host 回归。
- `tests/runtime-api/promotion-surface.js`：真实 Runtime 手动 smoke，显示两个位置，CTA 仅打印，不运行自动化或发送广告统计。

没有修改 `main.js` / 通用 Runner / 官方 URL 配置 / Recipe 目录。拉取这些源码不等于已安装软件会开始弹出广告。

## 视觉与交互合同

### 原型 v3（后续 Production 的目标视觉）

图片就是广告画布。广告标识、标题、说明和 CTA 直接叠加在素材内部，不再为文字或按钮增加独立 footer 背景。底部只允许轻量透明渐变和文字阴影，避免形成第二块“表单区域”。

- 静态大图 / 动图：360×240 logical units，3:2。
- 图片＋文字：360×260。
- 纯文字：360×196。
- 图片使用固定比例容器；推荐广告素材本身按 3:2 输出，避免重要内容依赖被裁切区域。
- 顶部永久显示“推广 · 广告主”；右上角只有 `⋯` 与 `×`，默认无填充背景。
- CTA 是覆盖在素材右下角的透明文字动作，不把整张图片设为隐形链接。
- `⋯` 菜单只在用户主动展开时出现实体背景。

`×` **只关闭本次展示**，不写七天屏蔽。长期偏好放入 `⋯` 菜单：

```text
今天不再显示
7 天不再显示此推广
关闭所有推广
```

这样“临时关闭”和“持久偏好”语义分离，避免误操作。7 天屏蔽仍以 `campaignId` 为单位，更换 creativeId 不得绕过。

### 动图合同

广告内部**不显示暂停/播放按钮**。GIF/WebP 自动播放一次，最多约 5 秒，随后替换为静态 poster；本次展示不再次启动动画。系统或产品已知处于 reduced-motion 时，从第一帧起只显示 poster。

这条规则的目的不是让无限循环动图缺少控制，而是让首版动效本身在短时间内自动停止。隐藏/关闭必须清理计时器和动态图资源；不自动轮播、不连续补弹、不播放音频。

### 当前 Native 漂移必须显式保留

`apps/opendesk/promotions/core.js` / `controller.js` 仍是上一版 Native renderer：尺寸、footer、X 关闭语义和手动 motion control 与原型 v3 **尚未全部对齐**。在完成下一轮 Production 接线前，不得把浏览器原型 v3 误报成原生产品已经实现。

生产接入时应以本节 v3 视觉/交互为目标，同时保留 Native 安全与生命周期合同。若原生宿主能力与 v3 冲突，先记录 Gap 并修正规范/宿主/测试，不得静默恢复旧 UI。

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

**状态提供者现在是注入合同，不是已经存在的全局任务监控。**生产接入必须从 Script Runner、Agent、Scheduler、Recorder、Measurement 等真实 owner 汇聚；进入不安全状态前 await `refreshContext()` / `close()` 完成，不能只用低频轮询，也不能凭没有 Runner 任务就断言全局空闲。无法可靠获知的自动化来源下，关闭自动广告。原型按钮与 Native smoke 中的状态仅是受控 fixture。

核心频次默认每自然日最多两次、间隔至少 30 分钟；`×` 不改变持久偏好；“今天不再显示”持续到下一个本地午夜；“7 天不再显示此推广”按 `campaignId` 记录；“关闭所有推广”直到用户主动恢复。计数是客户端“展示记录”，不是计费曝光。没有任何遥测请求。正式 appDataRoot 的持久化接线仍待完成；原型 localStorage 与 Native smoke 不写正式用户偏好。

控制器关闭原生 window 后不复用已关闭 ID；再次展示生成新 ID，符合现有 Custom UI 合同。图片加载就绪、原生 Esc、同组焦点、DPI/多屏变化都不能用 Fake Host 结果当作已验收。

## 原型与 Native 的差异不能隐藏

浏览器原型已具有 Esc、组外点击、拖动锚点跟随、模拟 Run/List 收起、系统减少动态效果；这些依赖 DOM 的行为不自动变成 Native 功能。当前 native adapter 有独立 `interactionGroup` 和 `interactionOutside`，提供 `reanchor()` / `refreshContext()`；正式 Runner 组归属及生命周期事件订阅尚未接线。浮窗 keyEvents 的现有公开支持范围不能随意扩大；原生 Esc 要验证现有宿主能力，必要时修正规范、源码与 JS 回归后再启用。

生产初次展示、广告展开时的焦点、关闭前后的键盘目标、点 Runner 是否意外关广告，需要真实系统验收。Windows HTML surface 需要 WebView2；缺少时只禁用广告，不能让 Runner 启动失败。依据为 `docs/api/ui.md`、`pkg/customui/validate.go`，不是假设 Electron。

## 验证记录

历史展示核心回归：`node --test tests/promotions/core.test.js` 曾为 18/18 通过。该结果覆盖上一版核心与 fake-host，但**不能证明 v3 原型的 Native 对齐已经完成**。

本轮 v3 原型在写入前完成静态检查：确认不存在 `promotionMotion` / `autoPlay` 控件，存在三种持久偏好菜单动作，并对最终 inline JavaScript 执行 `node --check` 通过。浏览器真实渲染和 macOS/Windows 实窗仍需后续重新验收。

从仓库根目录的后续命令：

```bash
node --test tests/promotions/core.test.js
./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
```

Native smoke 会依次出现上方与右下角两个测试浮层，各自关闭/到时后进入下一项。由于 Native renderer 当前仍可能显示旧 motion/关闭语义，下一轮应先完成 v3 对齐再把 smoke 作为最终视觉证据。

## 下一步

详见 `docs/command/opendesk-promotions-next.md`。先把 Native renderer 对齐本页 v3，再完成产品接线、真实素材就绪/失败状态、原生交互组和资格验证。远程清单、签名发布、广告平台、计费与视频不属于本次展示层完成声明。
