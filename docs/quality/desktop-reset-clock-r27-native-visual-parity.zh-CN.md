# Reset Clock R2.7 · 原生视觉一致性与真实 Mac 验收

日期：2026-10-14。本轮完成原生布局修复、mini 左下角拖动修复与真实 Mac 证据；离线 HTML 的严格字形／剩余绘制区域 gate 仍失败。**八维分别 ≥95 的整体门槛尚未达到**：原始批准图未找到，HTML仍有可测差异；其余项目按下面的独立审阅与实际范围计分。长期运行资格为 **NOT_QUALIFIED**。

## 需求与设计来源

依据用户本轮的原图优先、真实素材、AppKit 实窗和行为回归要求。原始批准 PNG `重置时间预览效果.png` 未在本轮已检查位置找到，不能声称对它完成像素还原。当前可核验基线为 [C3 HTML](../../examples/desktop-reset-clock/prototypes/r23-c3-reference-inspired-hero.html) 和 [原 C3 WebP](../../examples/desktop-reset-clock/internal/desktop/assets/r23-c3-reference-hero.webp)，二者未修改。WebP SHA-256：`0f3435f28a94c1b358368dc538c1e62a91b99d0ff6d38a43d29fd38056930392`。素材中原有的“ChatGPT 会员”文字保留；没有生成替代素材。

执行使用现有 master，起始 HEAD 为 `af934128818a898dacc6d15b98ad78d5b2a703ed`；未创建分支或 worktree。既有17项并行任务文件的 SHA-256 保持一致，未提交其中任何文件。截图、日志、fixture状态和构建均保存在 `.runtime/`，不进入版本控制。

## 源码与可见变化

- `internal/desktop/native_darwin.m`：插画改为顶部／右侧0间距，228×172pt；新闻专用 cell 按34pt行垂直居中；多天倒计时添加轻微暗色文字阴影，不改变数字字号或新闻结构。mini 收紧为88×44pt，默认在左下角，允许拖入底部 Dock 同高的空白区域；菜单明确锁定只作用于主卡片。
- `hero_art.go`／`hero_art_test.go`：AppKit 输出456×344的2× PNG，仅左侧20pt和底部36pt淡出；Win32仍输出228×172的预乘BGRA。覆盖边缘、不透明度、尺寸及损坏WebP错误路径。
- `native_darwin.go`：解码或 AppKit 图像加载失败时返回明确启动错误，避免把纯渐变误判为素材已加载。资源损坏测试在显式 CGO 的 macOS UI.Run 入口验证解码失败；尚未注入 AppKit NSImage 失败。
- [构建脚本](../../examples/desktop-reset-clock/scripts/build-macos-app.sh)：支持全新绝对输出目录，拒绝覆盖已有bundle，记录源码provenance，封装后签名并strict verify。开发identifier仍为`com.opendesk.resetclock`，未公证。
- [R27 HTML](../../examples/desktop-reset-clock/prototypes/r27-native-visual-parity.html)：内嵌原WebP和与Go字节相同的透明PNG；镜像原生几何、缓存状态和文字阴影。AppKit calibrated NSColor 经实际转换为sRGB后用于浏览器，修复数字RGB相同但显示颜色不同的问题。
- `settings.go`／现有偏好测试：macOS新状态默认显示mini，明确关闭与已保存坐标仍保留。
- Python入口分别负责[浏览器回归](../../examples/desktop-reset-clock/tests/r27_native_visual_parity_test.py)、[loopback合成fixture](../../examples/desktop-reset-clock/tests/r27_fixture_server.py)、[已有原生截图的像素检查](../../examples/desktop-reset-clock/tests/r27_native_screenshot_check.py)和[mini实窗位置检查](../../examples/desktop-reset-clock/tests/r27_mini_placement_check.py)。正式文档为本报告和模块README。

菜单、后台刷新、网页优先详情、主卡片／迷你挂件及单实例保留。合成数据不代表真实上游或个人额度恢复。

## 原生实窗和布局

证据根为仓库 `.runtime/tests/desktop-reset-clock/r27/`。build-02 的8张未经编辑的 WindowServer 截图由 [native-capture-manifest.json](../../.runtime/tests/desktop-reset-clock/r27/native-capture-manifest.json)绑定模拟标识、文件hash、PID64094、可执行文件、源码hash、feed_version、来源健康及窗口坐标。空列表和撤回截图应连同该sidecar一起使用。

| 场景 | 真正原生截图 | 实际尺寸pt |
|---|---|---|
| 三条 | [native-three.png](../../.runtime/tests/desktop-reset-clock/r27/native-three.png) | 386×333 |
| 两条 | [native-two.png](../../.runtime/tests/desktop-reset-clock/r27/native-two.png) | 386×299 |
| 一条 | [native-one.png](../../.runtime/tests/desktop-reset-clock/r27/native-one.png) | 386×265 |
| 空列表 | [native-empty.png](../../.runtime/tests/desktop-reset-clock/r27/native-empty.png) | 386×265 |
| 中文长标题 | [native-long.png](../../.runtime/tests/desktop-reset-clock/r27/native-long.png) | 386×333 |
| 过期缓存 | [native-stale.png](../../.runtime/tests/desktop-reset-clock/r27/native-stale.png) | 386×333 |
| 撤回 | [native-withdrawn.png](../../.runtime/tests/desktop-reset-clock/r27/native-withdrawn.png) | 386×265 |
| 多天倒计时 | [native-future-long-shadow.png](../../.runtime/tests/desktop-reset-clock/r27/native-future-long-shadow.png) | 386×333 |

[native-pixel-check.json](../../.runtime/tests/desktop-reset-clock/r27/native-pixel-check.json)检查三／二／一／长标题共9行：日期与标题中心差均0pt，二者相对行中心偏移均0.25pt；图片的不透明部分跨场景保持一致。0／1条不会留下三行空占位。

已有 [1496×967截图](../../.runtime/tests/desktop-reset-clock/r27/native-scaled-1496.png)、[深色桌面](../../.runtime/tests/desktop-reset-clock/r27/native-desktop-dark.png)、[浅色桌面](../../.runtime/tests/desktop-reset-clock/r27/native-desktop-light.png)属于build-01、阴影修复前的背景／分辨率验收。两种逻辑分辨率1728×1117、1496×967都来自同一内置2×屏幕，不能写成1×／1.5×物理DPI或多屏验证。原桌面“太浩湖白天”及默认分辨率已恢复；[受控重启桌面](../../.runtime/tests/desktop-reset-clock/r27/desktop-restart-bound.png)也显示原壁纸。

## 原生操作、重启与实际加载

[功能结果](../../.runtime/tests/desktop-reset-clock/r27/native-functional-check.json)记录真实隔离fixture操作：主卡片解锁拖动`(430,435)→(610,515)`；锁定命中Finder桌面、拖动不改变坐标；隐藏无窗口时同一PID55160仍从feed8刷新到9；第二次启动exit1且无第二个应用；迷你挂件拖动`(1320,240)→(1140,320)`。

旧重启桌面截图中的迷你位置与此前CG记录不同，未用它证明坐标恢复，也未把原因不明的变化称为已经修复的程序故障。随后受控重启build-02、PID79002，连续5次采样和额外后续采样都保持mini配置`(1140,320)`、WindowServer坐标`(1140,753)`；显示桌面后仍稳定。[restart-bound-manifest.json](../../.runtime/tests/desktop-reset-clock/r27/restart-bound-manifest.json)将同次截图及前后CG坐标绑定，消除了本次位置证据的对应缺口。早先变化原因未定，长期位置稳定性仍未资格化。

[菜单](../../.runtime/tests/desktop-reset-clock/r27/desktop-status-menu.png)、[设置](../../.runtime/tests/desktop-reset-clock/r27/native-settings.png)、[网页优先详情](../../.runtime/tests/desktop-reset-clock/r27/native-opened-web.png)已有实窗。菜单操作核验目标PID、bundle、exe和唯一AX入口后执行；点击穿透／拖动还核验实际命中对象，没有向其他应用重放动作。

最终交付包的正式位置为 `r27/final/Reset Clock.app`，须从已提交源码构建。构建／实际启动的HEAD、PID、路径、签名和当前窗口通过本地 [final-current-run.json](../../.runtime/tests/desktop-reset-clock/r27/final-current-run.json)核验，真实数据截图为 [final-native.png](../../.runtime/tests/desktop-reset-clock/r27/final-native.png)。这些文件实际生成并核验后才构成最终启动证据；应使用普通用户状态和唯一真实Bridge，并在收尾时停止合成fixture进程。这个来源核验与视觉矩阵是不同证据，不能把HTML或旧PID当作当前程序。

## mini 最新用户反馈与修复

用户要求 mini 默认处在 Mac 左下角、底部 Dock 左侧空白处，并报告拖不到那里。此前任意位置的受控重启证据不能覆盖这个验收目标。真实 build-02 / PID79002 的物理拖动把目标 AppKit(12,20)拉回(12,90)，确认了应用每次刷新使用 `visibleFrame` 排除整个 Dock 横带的问题。依据 Apple 的 [visibleFrame](https://developer.apple.com/documentation/appkit/nsscreen/visibleframe)／[frame](https://developer.apple.com/documentation/appkit/nsscreen/frame)定义，修复只放开 mini 的屏幕底边，仍保留菜单栏上边界；主卡片的定位边界保持原状。

原宽176pt无法完整放入当前 Dock 左侧空白，140pt、112pt实窗方案也在 Dock 加宽时被遮挡，均判视觉失败。最终88×44pt保留时钟入口、11.5pt短倒计时与独立拖动，新状态默认 AppKit(4,20)，已有用户坐标继续保留。位置锁定只控制主卡片，菜单和设置已明确写出。macOS新配置默认开启mini，已有明确关闭选择仍保留，保存／迁移与关闭偏好的回归测试通过。

当前 native 源码封装为严格核验的 build-06-mini，实际进程 PID22265／23281／24483；[manifest](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/mini-acceptance-manifest.json)绑定源码、签名bundle来源、真实窗口、截图和状态文件哈希。[默认实窗](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/default06-desktop.png)确认完整小挂件位于 Dock 左侧；[底边拖动](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/bottom-desktop.png)到 AppKit(4,0)，[主卡片锁定时拖动](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/main-locked-desktop.png)到(4,19)。受控 restart2 以新的即时前后观察及状态文件核验，保存(18,26)不变，PID23281→24483；[重启实窗](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/restart2-desktop.png)可对账。此前采样(4,19)与稍后保存(18,26)不同的原因未确定，不将其解释成长期可靠性通过。

[mini-placement-check.json](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/mini-placement-check.json)检查源码／bundle／截图哈希、单一客户端、窗口与保存坐标、底边可达、锁定主卡片后mini可拖、重新启动PID及完整桌面中的小挂件边缘。测试只读取证据，不发送输入。build-07-mini的全新状态文件启动没有预置config，实际PID31273、mini_show=true、AppKit(4,20)，[全新配置实窗](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/fresh-profile-desktop.png)与设置源码hash一起绑定到manifest。当前系统的底部 Dock 已实测；没有更改 Dock 设置，也没有侧边 Dock、多屏或隔夜证据。

## 浏览器和Go验证

[r27-browser-results.json](../../.runtime/tests/desktop-reset-clock/r27/r27-browser-results.json)最新正式执行记录10状态、18截图，exit 1。字号／几何／素材同源检查已完成，严格字形和剩余绘制区域gate仍失败：三条缓存中文标题，以及两个背景单元平均误差2.151、2.1406超过2。原WebP字节及原生2×PNG字节一致；此前背景／底栏区域和图片区边缘检查通过，不代替最新完整gate。没有发布整体图片相似率。

[go-checks.json](../../.runtime/tests/desktop-reset-clock/r27/go-checks.json)记录初始test／race／vet／client及Bridge构建通过，并补充最后显式`CGO_ENABLED=1 GOARCH=arm64 go test -race ./... -count=1`、`go vet ./...`通过。当前 mini 源码另有 [全套race](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/go-race-final.log)和[vet](../../.runtime/tests/desktop-reset-clock/r27/mini-fix/go-vet-final.log)通过。最后一轮包含真实AppKit编译和损坏资源的UI.Run错误测试。现有bundle重建被拒绝，原封印包未覆盖。Windows amd64交叉编译通过；没有Windows live证据。

普通用户命令见 [README](../../examples/desktop-reset-clock/README.md)：仓库根目录`open examples/desktop-reset-clock/prototypes/r27-native-visual-parity.html`；最终原生一行启动为`open '.runtime/tests/desktop-reset-clock/r27/final/Reset Clock.app' --args -feed http://127.0.0.1:8789/feed -allow-local-http`。正式浏览器及像素gate的结果与普通启动分别记录，二者不能互相替代。

## 八个维度的独立评分

每项目标≥95；分数是单个独立审阅者针对受测范围的判断，不是从测试数量推导的相似百分比。完整本地审阅为 [independent-review-final.md](../../.runtime/tests/desktop-reset-clock/r27/independent-review-final.md)及其评分JSON。

| 维度 | 分数 | 证据范围／限制 |
|---|---|---|
| 主图片还原度 | NOT_TESTED | 原始批准 PNG 缺失；只证明 C3 WebP／原生与 HTML 素材相同。 |
| 图片与背景融合 | 95 | 2× 顶部、右侧贴边；左20pt、底36pt淡出；实窗深浅壁纸。 |
| 三条动态的排版及垂直居中 | 96 | 9行日期与标题中心差0pt，行中心偏移0.25pt。 |
| 卡片整体视觉 | 95 | 动态高度、长标题、省略号、多天倒计时阴影已有实窗。 |
| HTML与AppKit一致性 | 92 | 同数据／过期缓存及已测颜色区域通过；最新严格字形／剩余绘制区域gate失败，未宣称全卡一致。 |
| macOS原生操作体验 | 95 | 菜单、设置、网页详情、拖动／穿透、隐藏刷新、单实例和受控重启。 |
| 多状态数据排版正确性 | 96 | 0／1／2／3条、中文长标题、未来日期、过期缓存及撤回。 |
| 回归测试与代码质量 | 93 | 显式 AppKit CGO 全套race、vet、资源损坏及mini证据检查通过；HTML严格gate失败。 |

原图缺失使全维≥95结论无法成立；不发布整体百分比。尚无其他物理DPI、多物理屏、Spaces／全屏、睡眠／唤醒、隔夜、完整设置／通知／导航失败矩阵及Windows live，长期运行结论为 **NOT_QUALIFIED**。当前结果适合继续本地开发验收，不构成发行／耐久资格。

历史基线：[R2.6 Mac验收](desktop-reset-clock-v1-r26-mac-acceptance.zh-CN.md)、[R2.6原生与网页](desktop-reset-clock-r26-native-web.zh-CN.md)。
