# Codex Prompt Shortcuts R1.2 验证记录

日期：2026-10-27（Asia/Shanghai）。本轮范围是原生纵向提示词栏 UI，复用 quick-replies / FloatingWindow 及现有管理器。用户最新纠偏要求不用图片、优先无图标或空图标、无红色文字背景、短文字居中，并以真实截图独立评审五项平均至少 95 分。旧红色角标截图按用户反馈判为 FAIL。

## 实现与兼容边界

五个固定原生 40×40pt 按钮：三个提示词、“下一”、“管理”。短文字居中，空槽显示“空”并禁用；分页信息在 tooltip 中。窗口总宽 60pt，当前 macOS 实测总高 280pt。显示后只更新按钮，不重建栏。

原生按钮新增显式 `{text:'审阅'}` 内容，与内置图标、脚本内 PNG/JPEG 三选一。保留 label 的独立 tooltip/Accessibility 语义及旧图标调用；正常文字不用 badge。纯文字忙碌态居中显示“稍候”，旧图标模式保留进度动画。宽字形按实测字形尺寸等比收进 32×32pt 内容区，不依赖最小字号下限。关闭与拖动继续由原生 owner 管理。

只复制完整正文，始终 `COPY_ONLY_PENDING_AX_VALIDATION`；不粘贴、不改写编辑器、不发送 Enter。Browser 正式 v1/v2 JSON 的追加、去重、图片降级确认、导出和本地库锁/revision/原子读回协议保留。本轮不扩展管理器功能。刷新中的关闭会取消旧窗口剩余更新；异步回读按原生确认的 revision 组装。

## 视觉评审

第一轮独立评审实际查看正常、末页、悬停尝试、忙碌和 tooltip 尝试的原图；后两项捕获不足如实标记。分数为排版对齐 96、文字可读性 93、视觉一致性 94、空间比例 94、交互状态 86，算术平均 **92.6，FAIL**。主要问题是忙碌转圈偏暗，以及悬停证据不足。

补图后的第一轮平均为 93.0：悬停和完整 tooltip 已确认，tooltip 横跨栏体遮住下一项。第二轮改为纯文字“稍候”、13pt regular 字重、vertical tooltip 优先在侧边显示，使用先移出再进入的指针预检及有界 tooltipVisible 读回来捕获悬停。

第二轮独立评审（Leibniz）逐张查看 `text-ui/candidate2/` 下的正常、忙碌、悬停、完整 tooltip、末页及宽字形压力图，给出 **95.4/100，PASS**：

| 维度 | 分数 | 实窗依据 |
| --- | ---: | --- |
| 排版对齐 | 96 | 五项纵轴、间距及短文字居中稳定，忙碌替换无可见位移。 |
| 文字可读性 | 96 | 常规两字和“稍候”清晰，tooltip 全句可读。 |
| 视觉一致性 | 96 | 字体、圆角、边框和文字状态统一，无图片、图标或红色文字背景。 |
| 空间比例 | 94 | 栏体留白协调；tooltip 与栏体分隔仍偏紧，属于可选微调。 |
| 交互状态 | 95 | 悬停增亮、忙碌蓝框与文字、禁用空位可辨，tooltip 不遮挡其他按钮。 |

算术平均 `(96+96+96+94+95)/5=95.4`。宽字形压力图仅证明字形被容纳、不溢出，不作为常规文字可读性的加分依据。键盘、焦点、动画时序及屏幕边缘 tooltip 翻转不在截图评分覆盖内。

评分只覆盖提示词栏的可见排版与状态，不代表用户认可、Codex 全链路或完整产品评分。未以静态测试、Promise 成功或预填分数充当视觉通过。

## 构建与加载来源

固定开发入口：`GO_BIN=/Users/shopme/native-client-validation/r8.4b/toolchains/go/bin/go scripts/build_macos_app.sh`；产物 `dist/OpenDesk.app`，配套 host 在 `Contents/Helpers/opendesk-ui-host`。使用现有 Bundle ID 和 ad-hoc 开发签名；未安装到 `/Applications`，不代表 Developer ID、公证或发布包验收。

构建基线为 `540be7506846a1ac2479cb3aa1ce5c5a23c518d7` 加本轮未提交源码，`vcs.modified=true`。本地运行证据保存命令、PID/父链、主程序及 host 的 SHA-256、生产脚本 SHA-256 和运行脚本快照。不得将其描述为干净提交构建。

最终候选在 2026-10-27 03:18:54 +08:00 启动：Runtime PID 49680、自有 host PID 49681，二者均来自上述 `dist/OpenDesk.app`。配套构建及 `codesign --verify --deep --strict dist/OpenDesk.app` 通过。`text-ui/candidate2/provenance.json` 记录完整校验值；主程序 SHA-256 为 `3ead896a4dfd6f6de07f7b681129b708af169288dadf1e45e9b033b81ecf6b56`，host 为 `f1a512bbf9be19a9a478eacb6f4c27c34404a7207890962916c32989b31f6547`，实际加载的生产 `main.js` 为 `6208ac5caf74857804c4218a49603b0533689fd5c20f32c672caa023363d808d`。

## 验证与限制

- Node 内存回归：111 项，109 通过，2 项可选 Browser oracle 默认跳过。包括分页复制映射、末页禁用、长正文完整性、窗口精确身份、保存冲突、位置保存、管理器恢复及刷新中关闭。
- 另行启用 Browser model 的只读格式对照：2 项通过；不是用户真实 Browser 导出迁移，未修改 Browser 仓库或其服务。
- `tests/runtime-api/custom-ui-toolbar-text.js`：正式 JS Runtime 测试通过，覆盖 7 个非法声明、4 个非法更新、文字/图标切换、独立 label、忙碌实际文字及 192 个并发响应的 revision/字段一致性，保留旧图标兼容。最初测试以无序对象的 JSON 字符串作指纹导致失败；改为按字段值生成指纹后通过，未删除任何字段一致性断言。最终运行脚本 SHA-256 为 `7ce9375912d3a7467f7477cce414bed66858f2796ab4283e86dcd5607374c2ae`。
- 自有 OpenDesk 窗口探针：内存 fixture，屏蔽外部 App/window 查询；五按钮回读、仅自身 host PID 的 AXPress 分页及独立后置读回、四次移动、hide/show、末页禁用、管理器关闭后的未保存草稿恢复、快捷栏关闭后管理器恢复。未改写用户 `library.json`。
- `go test ./pkg/customui ./tests/custom-ui` 通过；既有 `TestFloatingWindow` 检查以 `-vet=off` 通过。`go vet ./pkg/customui/toolbar ./pkg/customui/machost` 通过。
- 更大范围 `go vet ./automation ...` 因既有 `automation/file_handle.go:135` 的 variadic Seek 签名告警失败；本轮未修改该文件。目录审计因既有 Go 测试台账 360/预期 300 不一致失败，本轮没有新增 Go 测试。不把这些检查写成全仓通过。
- API docs/catalog 与 API contract 检查通过；生成的 presentation 导航随正文/类型同步。
- Windows owner 同步文字绘制与校验，但本机无 dotnet，未编译或 live 验收；Linux 无正式 native UI host。当前真实视觉证据仅 macOS。
- 独立代码复审未发现本轮阻碍项。图片模式为并发回读保存每 revision 的轻量 path/renderingMode 描述，未保存历史 raster；描述历史目前随更新累积，后续可在在途读回结清后回收。本例纯文字栏不使用该历史。

示例 README 中普通一行命令的完整 Codex 链路为 **NOT_TESTED**。Codex 界面访问受 Computer Use 限制，本轮只验收自有 OpenDesk 窗口，不通过其他通道绕过。Codex 前后台/草稿、双屏/Retina/负坐标目标实窗、Space/全屏、正式用户命令完整链路、真实 Browser 导出迁移、安全插入及同步服务均延期。自有窗口截图为 Retina 2×，不等于已验收 Codex Retina 跟随。

所有运行产物在 `.runtime/tests/codex-prompt-shortcuts-r12/text-ui/` 及 `.runtime/tests/custom-ui-toolbar-text/`，不提交。最终截图位于 `text-ui/candidate2/`；本次自有探针正常退出并清理其窗口。

| 交付项 | 结果 |
| --- | --- |
| 代码已修改 | 原生文字模式、快捷栏、关闭竞态、类型与 API 文档已同步。 |
| 实际已加载 | 上述配套构建、PID/父链及脚本哈希对应最终候选。 |
| 视觉已确认 | 独立看图平均 95.4，达到本轮 95 分门槛。 |
| 功能已验证 | Node、正式文字 Runtime、仅自身窗口分页及恢复通过；跨应用及平台限制如上。 |
