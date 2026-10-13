# GOAL：OpenDesk Reset Clock R2.3 Native —— 已确认渐变 Banner 卡片、三条常显与原生实窗验收

日期：2026-10-13。默认中文。

## 0. 唯一任务

**直接把用户已确认的 R2.3 C 视觉原型落实到现有 Go 原生桌面客户端，完成代码、回归、真实截图、文档和安全 master 提交。**

本任务不再提出全新 UI 架构，不另建 GUI 系统，不停留在方案/提示词。

仓库：https://github.com/shopable-ai/opendesk

**只允许在 master 修改、提交、推送，不创建分支、Worktree 或 PR。** 不强推、不破坏性 reset/clean、不覆盖其他 Agent 的未提交内容。先检查 git status、HEAD、origin/master 与并行任务，有冲突时只暂停冲突文件。

## 1. 强制继承的视觉来源

**唯一批准的新版 HTML：**

examples/desktop-reset-clock/prototypes/r23-c-approved-hero.html

**唯一正式的图片素材（真实 JPEG，220×187，非在线加载）：**

examples/desktop-reset-clock/internal/desktop/assets/r23-reset-clock-wallet-promo.jpg

不得把整张用户生成效果图当成一个不可交互的纹理；必须保留可动态更新的真实倒计时、日期、三条动态和按钮。HTML 保留完整交互供验收，但正式产品依然使用 AppKit/Win32 原生控件。保留旧 R1.1/R2/R2.2/A/B/B2 原型，不覆盖或重命名它们。

先阅读：

- AGENTS.md
- docs/plans/desktop-reset-clock.md
- docs/quality/desktop-reset-clock/design-review.md
- examples/desktop-reset-clock/README.md
- internal/app、internal/desktop、internal/news、internal/history、internal/feed、internal/reminder、internal/settings、internal/membership（以上 internal 均相对 examples/desktop-reset-clock）
- cmd/demo 和 cmd/desktop-reset-clock
- .github/workflows/reset-clock-ci.yml

## 2. 框架原则

- 原数据模型和业务判断依旧由 Go 内部的 App、Feed、History、News、Reminder、Membership 负责，UI 只渲染经过业务验证的 Display 数据。
- 尽量复用现有 Display / Action 和已实现的 R2.2 原生界面，不建立第三套状态管理。
- 不引入 Electron、WebView、动态 CDN、第三方 GUI 或重复的新闻采集后端。
- 完整继承原有 HTTPS 来源安全校验、Feed 修订/撤回、历史证据、提醒去重/可靠性。
- 真实官方 Feed 和商家付款服务未获验证时必须保持演示标识，不得虚构官方重置时刻或生产支付能力。

## 3. 桌面卡片的可见结果

- 以 386 逻辑像素为宽度设计基线，高度按紧凑三条资讯自动适配。
- 深青绿渐变背景、轻微光晕和曲线融合效果，不允许把右上角广告变成硬边框矩形。
- 右上半部从同一张 JPEG 读取金色钱包、账号充值 Banner 插画；使用原生渐变遮罩/透明混合，保证主时间前景清楚。
- 视觉顺序必须是：Reset Clock 品牌 / 顶部「记录与动态 ›」胶囊入口 / 距离预计重置 / 大号剩余天小时分钟 / 预计本地时间 / 三条常显动态 / 克制底部说明。
- 主数字必须高对比近白色，小时分钟单位使用清晰薄荷色，不得灰暗、过小或被图片干扰。
- 不显示系统当前时钟；不显示倒计时秒数；内部仍使用精准时间调度。
- 普通预告隐藏冗余「来源预告·未确认」标签；更正、撤回、来源异常、无数据有清晰而克制的特殊状态。
- 三条有效动态**直接常显**，左侧 MM/DD，右侧单行省略号标题，统一分隔线；不要再显示「最新动态/查看全部」标题行、额外分类 chips、6 秒轮播或展开按钮。
- 超长标题、有效消息不足 3 条、无数据都必须安全布局。历史撤回与来源失效资讯只保留在审计详情，不能误进入有效三条。
- 默认不会为每分钟倒计时或画面刷新重新请求网络；仅重绘缓存数据。
- 卡片点击穿透被锁定时，必须由系统托盘/菜单栏提供等价的「记录与动态」入口；非锁定状态卡片入口可用。

## 4. Banner 与商业边界

- 演示 JPEG 的账号充值、安全稳定、快速到账均为**示意广告文案**，不是已核实的服务承诺；预览和 Demo 必须可见标识「推广·示意」。
- 未建立合法商户、隐私与付款授权之前，不得加入真实充值、账号 Cookie/代充、支付链接、竞品导流或未核验广告效果宣称。
- 正式生产态如果没有有效合法广告配置，允许使用原型已具备的纯渐变装饰模式，不要展示虚假商家可购买行为。
- 图片统一从 internal/desktop/assets 的唯一文件来源加载并嵌入运行包（Go embed 或等效方式）；不要复制另一套 CDN 或依赖当前工作目录。
- 当前 JPEG 是 220×187 的轻量预览素材；**Retina/200% DPI 视觉验收必须核查插画的真实像素密度**。单纯放大低分辨率 JPEG 不能算高分辨率修复。若需要 2×/3× 高分辨率版本，应依据用户已批准的完整效果图忠实导出/重建，并确认一致性；禁止悄悄更换美术风格或宣称低清图已达视觉 95 分。

## 5. macOS / Windows 原生实现

**macOS：** 增量修改 native_darwin.m 和最少必要的桥接源码，使用已有 AppKit/CoreAnimation 在真窗口绘制渐变、JPEG、曲线、原生文本与胶囊按钮。兼容 Retina、Spaces、多屏负坐标、屏幕边缘、点击穿透、菜单栏及通知。不因每秒数据更新重复图片解码或频繁触发 resize。

**Windows：** 增量修改 native_windows.go，保留现有 Win32/WorkerW/GDI 宿主。JPEG 使用 Windows 系统原生 WIC/GDI+ 等合适的解码/绘制能力或受控构建时转换；避免运行期网络加载和 WM_PAINT 重复解码。兼容 100%、150%、200% DPI、多显示器、Explorer 重启、系统托盘、点击穿透和中文高可读性。

**共享语义：** AppKit 与 Win32 的状态、三条动态内容与入口行为一致，视觉呈现可以遵循原生平台绘制差异，但信息层级不得偏离批准 HTML。

## 6. 记录与动态详情

继续复用现有独立的「概览 / 历史记录 / 资讯」三页：

- 最近 30 天和本月两种时间范围；预告、独立确认完成、赠送、用户观察分别统计。
- 归档覆盖不完整显示「数据不足」而不是 0；同一事件修订不重复计数。
- 历史时间线保留发布、更正、完成和撤回的原始 HTTPS 证据。
- 新闻完整列表保留有效/修订/撤回/来源失效各状态，以及标题、摘要、来源类型、更新时间。
- Free/模拟 Pro 差别复用已有权益逻辑。详情首页不堆积充值广告或真实收费入口。
- 所有公共重置公告都不能证明特定用户账户的配额实际恢复。

## 7. 执行与证据

按顺序执行：

1. 读取现有源码、可交互 HTML 和仓库中唯一 JPEG 资产；核查已有代码是否实现相同功能。
2. 修复/扩展 Go 共享显示合同，添加状态与三条常显列表的确定性单测及负向测试。
3. 先完成至少一端可截图的原生卡片并与批准 HTML 对照；发现明显布局错位先修复再继续堆功能。
4. 再完成另一平台绘制、菜单/点击穿透、详情和屏幕边缘可靠性。
5. 在 examples/desktop-reset-clock 下运行：go test ./... -count=1；go test -race ./... -count=1；go vet ./...；go build ./cmd/desktop-reset-clock。完成 Windows amd64 交叉编译、Mac CGO AppKit 原生编译和现有 CI 所需矩阵。
6. Mac 设备具备时从仓库根**原样执行 README 公布的一条 Demo 命令**，实际操作状态栏、窗口、按钮并截图。Windows 真机缺失时标记 NOT_TESTED，不能用跨编译冒充真机。
7. 把日志和实际截图放到仓库根 .runtime/tests/desktop-reset-clock/r23/，不提交临时截图；修复回归、更新 README 与质量评审，安全提交推送 master。

必须覆盖：正常预告、更正、撤回、来源异常、无数据、长中文/英文、Free/模拟 Pro、缩放、键盘/读屏、边缘、多屏、恢复及 Banner 缺失安全降级。

## 8. 不可用综合均分代替独立 95 分门槛

每项独立打分并写出扣分、证据和测试状态：

1. 内容准确性。
2. 信息价值与来源可信度。
3. 视觉层级/字体/排版。
4. 色彩和对比度。
5. 空间密度与 386px 窗口适配。
6. 三条动态与详情交互。
7. 详情信息架构。
8. 键盘/辅助功能。
9. macOS 原生窗口行为。
10. Windows 原生窗口行为。

各维度目标均为 ≥95/100；任意单项不达标必须继续修改，不能综合平均抵消。

必须将 STATIC_REVIEW、BROWSER_RENDERED、MAC_NATIVE、WINDOWS_NATIVE 分开。未实际测过的一律 NOT_TESTED，不得给“已完成 95”或把 Chromium 图片冒充系统窗口。

## 9. 交付

最终首先展示用户实际看到的效果与对应的 HTML / 原生窗口证据（不存在的截图不得提供）；随后汇报关键源码路径、Go 测试与 CI 运行结果、独立评分/扣分、两个平台真实 PASS/NOT_TESTED/BLOCKED、提交 SHA 和 push 状态、下一步最短可执行动作。

**结果必须是真实源文件与原生应用修改，而不是下一份设计提案。**
