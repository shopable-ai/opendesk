# 官方 MCP 文件 Bridge：Native 接线、部署与核心实测（2026-11-03）

当前结果：**原 Native 专用接线与 MCP/Tunnel 文件模式已实现、通过限定范围的独立审查，并完成隔离签名部署；真实网页验收尚未通过**。用户已明确授权本对话判断和解决 Native 缺口。目标未完成，同一精确窗口控制／有效登录条件连续三轮未满足，已完成阻塞审计；没有将源码、单测、签名构建或本地 fixture 当作 ChatGPT 文件闭环通过。

## 当前验收状态

| 阶段 | 状态 | 证据与限制 |
|---|---|---|
| M1 认证 Native 接线 | 实现与代码审查通过 | 复用原 Host 同一个 nativeFiles；专用 capability、可信 grant/revoke、CLI lease、精确文件和每次调用授权检查。ACL 和 grant 配额问题已修，owner 注册竞态也已修复，独立复审 APPROVE，无剩余 HIGH/MEDIUM。 |
| M2 定向检查 | PASS（组件） | Native/CLI 定向与包测试、race/vet，MCP 四工具/CLI 测试及 vet，Tunnel files 29 项及原 nonce 回归通过；具体命令和失败日志保留。不能代替 M3/M4。 |
| 编译／安装 | 最终签名产物已重建并注册，尚未实际加载 | ARM64、原 com.opendesk.cli、原稳定开发签名；通过现有 setup 仅注册到独占 Profile。尚无实际 Native PID/Chrome hello，未部署到活跃共享实例。 |
| M3 官方 Tunnel 四工具联通 | NOT_TESTED | 文件模式已实现，尚未启动真实 Tunnel。沿用既有资源、官方 client 和私有 key 引用。 |
| M4 官方 ChatGPT 文件闭环 | NOT_TESTED | 尚无可信文件 grant、网页工具调用、写后磁盘对账或撤权回执。 |

完整 CI、跨平台矩阵、压力／变异、UI 缩放及重新评分继续延期。

## 范围与实际部署

仓库 `/Users/shopme/Documents/workspace/opendesk`，现有 `master`，基线 HEAD `909effdc2e1cbeca57ba0e265b6d6f7a57f42041`。未创建分支/worktree，未提交或推送，保留其他 owner 的改动和服务。

本轮专用 Native instance 为 `mcp-files-core`，稳定部署目录：

`/Users/shopme/.opendesk-browser/native-agent-instances/mcp-files-core/runtime/OpenDesk.app`

使用 `scripts/build_macos_app.sh` 的正式暂存、签名与发布入口，GOARCH=arm64、CGO_ENABLED=1，未修改签名身份或 App ID。首轮和最终构建均退出 0，构建期间相关源码 SHA 未变化；磁盘 `codesign --verify --deep --strict`、签名元数据和 `go version -m` 检查退出 0。最终 Native SHA 为 cdcd39a08677db8879e2332e884aa1a0b28f0fee542cbe5b5c855310d6366d52，MCP SHA 为 a24b52cdb1525f54521c2ca4745c101eb70be505afb4500e9175b999564ec614，均为 ARM64。最终 MCP 定向测试和已编译程序缺失凭据失败关闭检查通过。

现有 `browser setup --extension-id ccfcjegpkdlgbclopjmadlcjedelidmf --browser cft --user-data-dir /Users/shopme/.codex/browser-profiles/chatgpt/test-chatgpt-03/user-data` 在该 instance 环境执行成功，manifest 仅写入本对话 Profile，指向专用 wrapper。ID 从该浏览器真实扩展 service worker 取得，未猜测或扩大 allowed_origins。

个人 Chrome、`/Applications/OpenDesk.app`、默认 Native、其他 owner 的独立 Native、全局 CLI wrapper 均未覆盖或停止。旧路径、旧 PID、旧程序 SHA 的只读盘点保留在本轮 evidence/，仅作历史观察，开始真实验收时重查。签名有效、manifest 注册和启动受理都不证明进程已加载。

## 唯一测试目录与授权

本轮 run：`/Users/shopme/Documents/workspace/opendesk/.runtime/tests/mcp-files-core/20261102T170354Z-b26e145f/`。

- `fixture/roundtrip.txt`：拟通过可信 CLI 精确批准 read-write。
- `fixture/readonly.txt`：拟精确批准 read。
- `fixture/unapproved.txt`：不进入 MCP grant，作越范围对照。
- 目录 0700、文件 0600，均为已存在的合成 UTF-8 文本。可信 workspace add 已成功，workspaceId 为 workspace-efc02ea3-86a3-4a57-961a-c9be10087983；仅两文件的私有 approval 已准备，但 capability 尚未签发；原随机 marker 未进入提示词或终端输出。
- `private/oracle-before.json` 私有保存初始 marker/SHA/字节数；`evidence/local-oracle-before-commands.json` 保存独立 Mac shasum/wc 命令和退出码。
- `run-state.json` 保留稳定写入 UUID、追加行、精确范围和阶段。未知结果不换 ID、不自动重放，只查询原回执或读取当前磁盘。

## 浏览器与官方 Tunnel

已应用个人 `chatgpt-test-profiles` Skill，独占 `test-chatgpt-03`。其他 owner 正常释放 UI 锁后，本对话成功取得锁并启动自己的可见浏览器，主 PID 80089、实际扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf。CUA 按准确 bundle 路径的两次只读选择却都返回 `test-chatgpt-01` 的 Browser Test Lab 窗口；准确 executable 路径返回 Invalid app。当前 macOS CUA 接口没有 PID/windowId 选择参数，本实例也未出现在其 browser provider 清单，因此判定 **BLOCKED_WINDOW_BINDING**，没有点击或输入。已仅正常关闭自己的可见浏览器、释放自己的 UI 锁，未停止或操作另一 Profile。

随后仅在自己的无界面 Profile，按专用 Skill 从用户既有 Cookie 文件导入一次，工具报告导入 25 项，页面仍为验证页（`challenge: true`、`login: NOT_VERIFIED`）。未打印或复制 Cookie 正文、未绕过验证、未重复导入或发送消息；自己的无界面浏览器亦已正常停止。扩展 Native 开关此前观察为关闭，真实权限和 Host 加载仍未验证。窗口绑定和正常登录是两个独立未解决条件，缺失 Native owner 已不再是阻塞。

第三轮现场复核再次取得自己的 UI 锁，启动独占可见实例 PID 82614，并核对了准确 user-data-dir；CUA 准确 bundle 路径仍返回 `test-chatgpt-01`。仅对自己 CDP 端口的只读页面检查进一步确认：ChatGPT 显示“无法加载你的账户”“登录会话已过期”“请重新登录以继续使用应用”，Native 开关仍关闭。没有再次导入 Cookie、点击或输入。自己的 PID 已正常关闭，自己的 UI 锁已释放。当前恢复条件为可精确控制的本测试窗口及新的有效测试登录态；不能通过提取个人 Chrome Cookie、绕过验证、操作其他任务窗口或伪造 Native hello 解决。

沿用 `~/.opendesk/tunnels/opendesk-web-file.json` 的既有 Tunnel 与官方 client 引用，没有读取 key 正文或改写 index。新增显式 files 模式，固定候选和 client 的 SHA、60KiB 完整帧、只含允许元数据的审计；正文、capability、_meta 和任意底层错误不进入日志。默认旧 nonce 模式保留，不用于本轮成功证明。

为真实 UNKNOWN 验收，已为本机 relay 增加默认关闭、指定稳定 requestId、一次性标记的回包丢失开关。最终隔离修复会先完整转发此前请求的响应，再单独准入目标写入，并暂停后续请求；目标回包到达后消费一次性标记、丢弃该回包并关闭所属子进程。最终 21 项定向反例及原 files/nonce 回归通过，独立审查重新执行 21 项后 APPROVE，无剩余 HIGH/MEDIUM。42→7 仅准入并丢弃 42，7 未准入；7→42→8 先交付 7，再准入并丢弃 42，8 未准入。该测试工具不增加 Runtime API 或文件执行器；官方 client 的未知结果、网页原 ID 对账及不重放行为尚未实测。

## 检查结果与限制

- Native executor：认证、grant/read/SHA-write/readback、精确范围、只读/旧 SHA、重复 ID/冲突、撤权/status receipt、TTL/lease/ABA、私有凭据、真实 Unix IPC 丢包不重连等；详细 RED/GREEN 见 native-implementation/。
- MCP adapter：定向 `TestFilesBridge*` 与 vet 退出 0，错误仅转发安全 code/outcome，不泄露底层信息，调用一次。
- Tunnel：files 29 项、旧 prepare 11 项、旧 relay 10 项、launcher 回归和 Python 语法通过。一轮并行合成 relay 启动超时及独立重跑通过均保留，不隐藏失败。
- 测试目录审计未通过：仓库原有未登记 Go 测试、7 个旧格式行与缺失 single-entry 引用；本轮三个新增 Go 测试已登记到原分类账本唯一增量章节，没有扩大为全仓迁移或掩盖旧问题。
- 独立安全审查发现的 ACL 和已撤销 grant 占额问题已修；短 TTL prune 与 owner 注册竞态已由锁内存在性/活跃/TTL检查修复，确定性 expire→prune→resume 反例与 race/vet 通过，独立复审 APPROVE。

## 证据索引

- `native-implementation/`：Native/CLI RED/GREEN、race/vet/构建与安全修复反例。
- `mcp-implementation/`：adapter RED/GREEN、vet、目录审计原始结果。
- `tunnel-implementation/implementation-result.json`：文件模式、旧模式回归、命令和源 SHA。
- `tunnel-implementation/drop-gating-implementation-result.json`、`tunnel-review/drop-response-hwbz1tml/result.json`：最终 21 项故障隔离回归与独立复核。
- `deployment/build-native-final.json`、`build-native-final.log`、`build-mcp-final.json`：正式签名构建及源码稳定性。
- `deployment/candidate-provenance.json`、`native-setup.json`、`workspace-add.json`：磁盘签名/build info 和隔离注册。
- `browser-evidence/headless-target-inventory.json`：独占浏览器/实际扩展 ID；不是登录或原生功能成功。
- `browser-evidence/window-binding-blocker.json`、`browser-evidence/login-after-single-import.json`：窗口绑定失败、无输入处理与一次登录准备的结果。
- `evidence/final-safe-branch-provenance.json`：最终源码及三个实际程序的指纹一致；三份 fixture 未变，capability 尚未签发。
- `browser-evidence/current-login-expired.json`、`current-native-disabled.json`：第三轮对独占实例的只读现场结果。
- `evidence/goal-continuation-3-provenance.json`、`goal-continuation-3-blocked-audit.json`：最新指纹、逐项未完成审计、三轮相同阻塞和已释放本任务资源的证据。
- `evidence/`：前期部署盘点、命令限制、初始磁盘 oracle 与历史阻塞审计；旧阻塞已由用户授权取代。

M3/M4 的网页 URL、真实调用、写后 SHA、撤权及 UNKNOWN 结果仍未产生，不能填作成功。
