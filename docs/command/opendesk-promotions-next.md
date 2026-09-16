# OpenDesk：将图片推广浮层接入生产 Runner 并完成原生验证

仓库 shopable-ai/opendesk，已有 master 分支。不要创建分支、reset、force push。存在并行会话；每次写入前刷新目标文件与 HEAD，不覆盖他人修改。

本轮直接修改、测试并写回代码，不停留在设计或重新画一套原型。

## 先读取已有成果

- AGENTS.md、当前 git status、master HEAD。
- docs/architecture/opendesk-promotions.md（实现边界和未验证项）。
- apps/opendesk/promotions/{core.js,controller.js}。
- apps/opendesk/prototypes/promotions/{index.html,samples.js}。
- tests/promotions/core.test.js 与 tests/runtime-api/promotion-surface.js。
- docs/api/ui.md、相关 Custom UI host/资源校验代码。
- apps/opendesk/main.js、script-runner-simple.js、script-runner/{controller.js,player-controller.js,shortcut-controller.js}。
- 当前 Recorder / Measurement / Agent / Scheduler 生命周期和发布白名单。

这些是可复用源码，不要宣称只剩运行一下：当前没有自动广告生产接线，也没有 Native 视觉资格证据。浏览器原型不自动成为原生合同；不要把原型独有行为遗漏后说“已对齐”。

## 固定产品需求

图片优先的独立浮层，默认紧贴 Runner 上方、右对齐、12 logical units 间隔；右下角是显式配置的第二位置，工作区边距 16。二选一，同屏最多一个。保持原生产播放器的按钮顺序、尺寸、皮肤、Stop 和快捷键；禁止修改 script-runner-v1。不能改成管理窗口的文字条或系统通知来替代。

使用同一 renderer 的大图、GIF/WebP 动图＋静态封面、图文、文字。广告标记/关闭区独立可见，默认 contain，不裁掉素材文字；只有明确 CTA 点击才导航。窗口宽360，四类尺寸和时长依设计文档。首版无音频、视频、任意 HTML 或广告 SDK。

## 需要完成的真实交付

1. 最小生产接线：在官方产品层创建并管理单个 promotion controller；不要让通用 Runner 认识广告主/商业策略。使用真实 Runner bounds 和当前显示器工作区；移动、隐藏、关闭、恢复、列表展开均有显式处理。空间不足不遮挡控制、不偷偷改位置。
2. 建立可证明的活动抑制：覆盖 Runner/Agent/Scheduler 执行、Recorder 和 Measurement；进入活动前同步禁止点击并等待 native surface 清除。未知状态保守关闭。不能仅用 Runner 状态或轮询掩盖启动竞态。无法覆盖的来源保留自动展示禁用并报告证据缺口。
3. 复用 appDataRoot 保存关闭和频次；用户脚本目录与官方资源保持分离。添加清楚的推广开关和恢复入口。X 关闭七天、当日不再显示、全局关闭都要跨重启生效，换 creativeId 不能绕过 campaignId。
4. 核验 native 图片就绪和解码失败：不能把 show() 可见直接当图片已成功呈现。缺少能力时最小补齐正式接口及 JS 回归，不放松 HTML/script 安全边界。动图可真实播放、切回封面，隐藏清理计时器/资源；原生减少动态效果没可靠事实时保持 poster-first。
5. 解决真实交互组和 Esc：不要假设 floating 支持 normal 的 keyEvents；明确验证/补齐 macOS+Windows native 路由。点击推广或 Runner 不应意外触发错误的组外关闭。不能用 blur 延迟模拟交互组。任何展示不抢前台输入焦点。
6. 内置正式图片创意与测试素材分开。第一条可使用官方推广，CTA 复用 Official Shell；先检查真实目标可用，不伪造服务页面/URL。不修改官方配置前先按 AGENTS 对应 skill 执行。没有可用落地页时不自动投放，不以待开放空链接占位。
7. 更新 release allowlist 和必要文档/本地化；测试、原型和示例 GIF 不混入正式安装包。Windows WebView2 不可用时广告失败隔离，不阻塞启动/运行/停止。
8. 跑已有18项纯JS回归并扩充生产接线、时序、持久化、失效图片及 native 相关测试。必须保留失败事实。真机确认 actual Runtime/UI host 来源及构建新旧，再按原文一行命令执行 smoke，留存上方/右下角/暂停/关闭/运行抑制/多屏/DPI证据。

不要接腾讯/Google/Carbon 或发送计费请求；平台准入不属于本轮。远程下载/签名投放系统另开 Goal，不允许把远程脚本塞进具备桌面权限的窗口。

## 最终报告

说明修改文件、已接通的真实入口、如何替换图片/动图、如何预览/关闭、测试命令与结果、实窗截图路径、哪些能力尚未得到原生证据、提交 SHA 与 master 状态。界面契约和实窗资格分开。没有真机证据不能写“Windows/macOS全部通过”，没有生产接线不能写“安装后会显示”。
