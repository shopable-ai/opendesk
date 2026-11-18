# macOS 本机开发签名验收记录（2026-10-29）

本轮已实现复用证书的本机构建流程，完成不同内容 A/B 构建的签名连续性验证；
真实已安装 App 的首次授权迁移、A→B 权限延续及权限窗口视觉验收尚未完成。
不能把下面的构建、Runtime smoke 或签名结果表述为 TCC 权限通过。

## 源码和构建范围

- 基线为 `master`、`edbeab59c7f340ce747de8dbb3e67406bfed2eeb`，改动尚未提交；未新建分支或 worktree。
- 默认构建、macOS Make 入口及稳定启动器共用固定证书策略；没有配置时明确失败。
  显式 ad-hoc/unsigned 仅为带警告的实验入口，不自动降级。
- 一次性配置建立专用钥匙串并固定证书指纹；重复设置复用原身份，不修改全局证书信任或 TCC。
  启动器仅使用公有指纹验证，不要求私钥在线。
- JavaScript 随完整 App 作为 `Contents/Resources` 中的密封资源发布；资源查找保留旧布局兼容。
  最终签名后的主程序摘要写在输出目录旁，避免自引用资源摘要失效。
- 既有权限窗口增加 unknown 状态的签名迁移说明及当前 App 原生查询的最小本机诊断日志。
  不改变授权状态语义、请求去重或系统授权边界。
- 其他任务的未提交文件和运行服务予以保留；本轮构建使用独立证据输出目录。

使用方法、恢复材料和正式发行边界见 [开发签名说明](../development/macos-signing.md)。

## 验证结果

| 验证项 | 结果及限制 |
| --- | --- |
| 签名策略及权限窗口单元测试 | 67/67 通过，零跳过；系统命令使用隔离 fixture，不是 TCC 证据 |
| 平台 payload 结构测试 | 20/20 通过 |
| `internal/appbuilder` 测试 | 通过；适配新的 Resources 布局 |
| 并发 JavaScript bundle cache 定向测试 | 通过 |
| shell 语法、`git diff --check` | 通过 |
| 当前源码完整 A/B App 构建 | 通过；A 为 `2.0.1+signing.a`，B 为 `2.0.1`，主程序为 darwin/amd64 |
| A/B 签名连续性 | 主程序字节及 CDHash 不同；完整严格验证通过；B 主程序和所有对应嵌套 Mach-O 均满足 A 的指定要求 |
| 负向签名验证 | 重新签成 ad-hoc 的副本被 A 的证书要求拒绝 |
| 独立工作目录 Runtime smoke | 签名包能加载内置 axios/Lodash；直接运行和稳定 CLI 启动器均通过，不涉及系统权限 |
| `go vet ./automation` | 未通过：未修改的 `file_handle.go:136` Seek 签名及 `window_app_scoped_darwin.go:111,209,269` unsafe.Pointer 提示；未扩大范围修复 |

本机材料和运行证据位于仓库根目录下 `.runtime/tests/macos-signing-20261029/`。
最终快照为 `provenance-final.json`，签名连续性为 `continuity-final.log`，
单元测试为 `unit-final.tap`，Runtime 日志为 `bundled-js-runtime/` 和 `stable-launch-runtime/`。
该目录是可清理的本机产物，不进入版本控制；私钥及密码不在该目录或仓库中。

## 安装与实窗验收的当前状态

| 层面 | 当前证据 |
| --- | --- |
| 代码已修改 | 是；对应修改及测试见上文 |
| 构建产物已加载 | 签名 B 的 Runtime smoke 已加载；桌面 App 尚未覆盖成 A/B |
| 已安装 App | `/Applications/OpenDesk.app` 仍为原 ad-hoc 版本；已保留原包备份 |
| 视觉已确认 | 否；Computer Use 按完整安装路径读取超时，可见应用列表未列出 OpenDesk；按 Bundle ID 选择又因现存多个副本而歧义 |
| 真实权限功能已验证 | 否；没有以 CLI child、fixture 或其他 App ID 代替实际 owner |

原桌面主进程在用户确认无未保存任务后已正常退出过，随后系统中出现新的原版本主进程。
覆盖前发现另一项 `opendesk-browser` 的 `browser dev` 服务仍使用同一安装二进制，因此未覆盖。
独立浏览器 native host 和另一任务使用的 `dist` UI 均未终止。
此处记录的是本次观察，续接时须重新核对 PID、路径、签名和任务状态。

## 剩余完成条件

1. 在同一安装目录的其他服务正常结束，或用户明确允许正常结束该服务后，受控退出实际桌面 App，
   安装已验证的 A 并正常启动，核对真正 owner PID 和加载来源。
2. 如首次 ad-hoc→固定证书迁移需要授权，由用户按需完成系统授权；不重置 TCC、不直接改数据库。
   重新启动 A 后逐项取得 Accessibility、Screen Capture、Input Monitoring 的原生状态及获准最小实测。
3. 正常退出 A，固定路径覆盖 B，正常启动并逐项重验；仅对有真实证据的服务报告权限延续。
4. 取得当前权限窗口的真实截图，确认长说明的尺寸、换行、留白和按钮对齐；在此之前视觉验收保持未完成。

Developer ID 正式发行、公证以及 Linux/Windows live 验收不属于本轮。
