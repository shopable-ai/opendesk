# AI 客服替代入口清理（2026-10-30）

用户最新纠偏：错误版本指确认「左侧聊天、右侧约 380px 助手，能观察消息并填入草稿」之前的替代版本，不以“两 Tab”作为文件删除条件。当前可用的六业务 Tab 原生 Demo 保留，本轮不重新设计界面或增加功能。

## 留档与范围

清理前已在现有 `master` 创建本地恢复提交 `1a6ca3a89d7219f8e8662f0c22d59333ed166dd5`，保存 147 个客服相关文件；未推送。57 个其他任务的未提交文件排除在本轮暂存与修改范围之外。

独立引用审计与清单复核后，限定删除 34 个已留档文件：旧 `desktop/main.js/panel.html/panel.css` 渲染、adapter/core/图片/构建与专属测试；独立「未连接」App Mode 的 manifest、入口、host、哈希、staging 与专属测试；依赖该入口的三个实窗验收启动器。同时移除专属 npm 命令、一条 staging 测试及其 import、哈希生成与 CI 暂存引用。没有批量清理未跟踪目录、运行证据或已安装应用。

当前正式运行链路为 `scripts/run-desktop.sh` → `native-demo.js` → `desktop/native-adapter.js` / `query-api-adapter.js` / `business-files.js` + 唯一 `preview/index.html`。React `src/`、domain/state、fixtures、接入实现、文件桥及 validator 均保留。聊天身份、前台状态与草稿安全停止条件不变。

工作区/映射的可复用原生 controller 和场景保留，其旧 App Mode runner 已删除。迁移到当前原生入口以及重新进行实窗操作/视觉验收明确延期；本轮不声称迁移完成。历史质量报告保留原正文并增加退役说明。

## 验证与运行边界

清理前回归：`npm --prefix examples/ai-customer-support test`，265/265 通过。清理后同一命令 259/259 通过，减少的 6 项只属于已退役 App Host 和 staging。`run typecheck`、`run build`、修改过的 JavaScript 语法检查及 `git diff --check` 通过；本例没有独立 lint/security 脚本。

额外运行 R23、R23 safety、R24 probe 和 R30b query 的宿主静态测试：94 项中 84 项通过，10 项 safety 测试失败。10 项均为 VM harness 缺少 `authorizationGeneration`；在隔离的 `.runtime/` 目录取出恢复提交的原始测试、adapter 和 native-demo 后，同样 10/10 失败，三份文件与当前逐字节一致。因此记录为既有测试夹具问题，本轮不修改安全源码或将该套件表述为通过。

构建后比对：100 个保留的既有客服文件哈希未变，包括全部 `src/`、`preview/index.html`、`native-demo.js`、当前启动器、业务文件桥和生成 validator；13 个有意修改的既有文件仅涉及构建/命令/专属测试引用、控制器注释和文档。清理前登记的 57 个其他任务文件哈希未变；期间另一任务新增框架方案文档及客服 README 的“框架方案与示例归属”段落；仅对其中已失效的客服入口引用作最小修正，保留其余正文。该未跟踪文档和新增 README 段落仍属于对方未提交改动，不纳入本轮清理提交。修正后活动引用检查未发现遗留的旧入口依赖；历史路径仅作退役/恢复说明。

普通体验仍从仓库根目录执行：`./examples/ai-customer-support/scripts/run-desktop.sh`。本轮未重新启动或操作真实窗口，不覆盖既有签名宿主、不改系统权限、不终止其他服务；没有新的实际加载、视觉或真实平台接入通过声明。用户先前确认当前界面可用；清理通过源文件与生成字节不变检查保护该基线。

具体删除清单、前后哈希与检查日志保存在本地 `.runtime/tests/ai-customer-support/cleanup-20261030/`，不进入版本控制。若需恢复某个已退役文件，可从上述恢复提交按路径取回；不要重置整个包含其他任务修改的工作区。
