# 提示词快捷栏 R21：实际 Claude Code 工作区

核验日期：2026-10-28（Asia/Shanghai）。工作目录 `/Users/shopme/Documents/workspace/opendesk`，现有 `master`，HEAD `b7280bef765a4fe5c6076643d5c8313733d39e2b`。本记录对应未提交工作区，不表示该 HEAD 已包含改动；没有创建分支、提交或推送。

## 结果及未完成目标

**当前候选通过了显示、管理器、翻页、Code/Cowork 资格切换及拒绝写入后的全文复制验证；完整安全追加仍未实现，因此不能称为 Claude Code 完整适配。**

保留既有原生产品：OpenDesk logo、三个槽位、下一组，合计五个业务按钮；logo 打开现有左右分栏管理器。范围固定为精确 PID/executable，只有实际 Code 场景资格通过才显示。没有更换为预览入口。

完整追加的验收目标仍是：空草稿写完整正文；非空草稿 D 逐字保留并追加两个换行与正文；不 trim、整框覆盖、全选重填或发送 Enter。同时要求真实 IME、选区、并发修改及窗口/编辑器身份安全，可能已发生输入或结果 unknown 时停止并锁止。复制只是明确反馈的回退，不计追加成功。

## 修改与归属

R21 接续时已有的实现包括：

- `automation/accessibility_types.go` 将显式树深上限提高至 64；默认深度、节点和期限预算保持原值。独立 UI menu facade 的上限仍为 32。
- `automation/accessibility_backend_darwin.m` 在 AXTitle 为空或缺失时以 AXDescription 规范化 name；配套 `types/Accessibility.d.ts`、`docs/api/accessibility.md`、生成的 `docs/api/agent/elements.md` 和 `tests/runtime-api/accessibility.js`。
- `examples/custom-ui/codex-prompt-shortcuts/targets.js` 的 `claude-code` profile 与场景门：完整有界树、唯一 heading/pane/editor、同 AXWebArea、Terminal/Files 和经过校准的窗口内 bounds。
- `main.js` 每次重新资格化 Code 场景，窗口/场景变化失效输入引用，按实际 pane/composer 放置；瞬时观察错误不永久锁定原几何；scoped poll 不在深层同步尚未完成时重复提交请求。
- `insert.js` 允许明确选择的内部发现深度到 64；保持拒绝不安全写入。三个对应 Node 测试文件覆盖这些边界；storage/lock/recovery 等既有源码资产保留。

本次接续新增此正式记录、更新业务 README，并完成 `direct-03` 实窗验证；没有进一步更改 native 或业务 JavaScript。工作区还有大量更早的并行修改和未跟踪源码，本记录不把整个 dirty diff 归为 R21。

## 构建、加载、视觉与功能分别核验

| 层次 | 证据与结论 |
| --- | --- |
| 代码已修改 | 接续的上述实现和回归已存在；本次源码哈希与交接一致。最后两处恢复/轮询修复由 direct-03 加载验证。 |
| 构建 | 复用 build-02，主程序与 UI host 时间分别为 2026-10-28 17:53:43/17:53:42 +0800；本次无 native 新改动。`codesign --verify --deep --strict dist/OpenDesk.app` 本次返回 0。签名不代替功能证明。 |
| 实际已加载 | 正式 `main.js` 从仓库根一行启动，direct-03 的 `script_snapshot.js` 与当前文件 SHA-256 完全相同。主 PID 87507，host PID 89120。READY 于启动后首个工具等待周期内输出；初始为 hidden，随后前台 Code 场景通过并显示。没有测量 500ms 指标。 |
| 视觉已确认 | 精确原生栏 ID 170786，60×280pt，坐标 (608,348)；五按钮、1/2/3 与 4/5/6 均实窗确认。精确管理器 ID 170791，稳定尺寸 760×600pt；左右栏、换行、输入框、按钮对齐和第 6 条选中态无明显裁切或异常留白。截图分别对应各精确窗口，并非叠层合成图。 |
| 功能已验证 | logo 打开管理器，选择合成 6 并逐字读回完整正文，关闭管理；下一组原生读回为 4/5/6。两次 Code→Cowork→Code 往返，Cowork 资格为 null，原栏不在屏幕上，返回 Code 同一栏 ID 恢复显示。 |
| 输入回退 | 点击合成 6：`rejected / EXISTING_DRAFT / not_started`；独立读回 `draftUnchanged:true`、长度 1、`composition:unknown`，剪贴板等于合成 6 完整正文，`appendEnabled:false`。未发送 Claude 消息或启动模型任务。 |
| 安全追加 | 未实现、未通过。空/非空/IME/非空选区/并发编辑/窗口重建等成功写入矩阵没有运行，不能由拒绝、复制或截图替代。 |

实际 Claude 为 `/Applications/Claude.app` 4.29.0，bundle `com.anthropic.claudefordesktop`，主 PID 42296，executable `/Applications/Claude.app/Contents/MacOS/Claude`。本轮新观察的窗口为 `darwin:42296:native:170722`、1200×800pt、(304,124)。PID/window ID 都是本轮观察，不是可永久复用的配置。

实际 Code 编辑器为 AXDescription `Prompt` 的唯一 AXTextArea，现有树深 44；前台观察选择 `{role:'textField',name:'Prompt'}`、深度 64。当前正文长度 1，不能按视觉空白推为空稿。选区 `{location:0,length:0}`，marked range 为 NoValue；这不能证明 IME inactive。

### Provenance

| 文件 | SHA-256 |
| --- | --- |
| `main.js` 与 direct-03 快照 | `fb8b861561081e1f7632ca8a8a710262b998fceb399a51568c8a628fad46be5e` |
| `targets.js` | `416ea92a16731c8dab2d9649c2092597bd70f2325c8b0972848170b8219e7577` |
| `insert.js` | `9250acad7499f23cf0cf1416112e96e97b769ff644703ab4af99f6e5e02841cb` |
| `dist/OpenDesk.app/Contents/MacOS/opendesk` | `ac6d790b97b8dea68bed0d081d13d14b5b2f1b7bbce3fb805bec508561f1c56e` |
| `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host` | `328eff93c8705b349cf838698cb49552c0676239b97116f05789199ea82e092c` |

固定构建入口为 `GO_BIN=/Users/shopme/.local/opt/go1.25.13-amd64/bin/go ./scripts/build_macos_app.sh`，沿用既有 App ID 和开发签名身份 `-`。本次只复用兼容构建，没有因外部 JS 验证重新构建/改签。

## 可复制的候选启动命令

从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/tests/codex-prompt-shortcuts-r21/claude-scoped.json OPENDESK_SHORTCUTS_LIBRARY_DIR=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-r21/synthetic-library ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-r21/direct-03
```

这条正式用户入口命令本次已从上述目录原样运行；依赖本机已准备的合成库、配置和配套构建。当前配置 schemaVersion 1，scope 为上述 Claude PID/executable、profile `claude-code`。进程变化时先重新核对身份，再更新隔离配置。已有本候选运行时使用其窗口；新一次验证使用新的日志目录，保留现存证据。默认入口会选择其他默认目标，本轮不使用无 scope 的命令。

正式自动化验证与普通启动分开：本次使用 OpenDesk JS 在精确自有窗口中进行 AX preflight/invoke/readback，并以精确原生 ID 查询和截屏取证；临时探针没有替换正式业务入口。没有运行历史全矩阵 gate。

## 证据索引与失败记录

运行产物根目录 `.runtime/tests/codex-prompt-shortcuts-r21/`，不进入版本控制。以下路径相对此根目录：

| 当前候选证据 | 内容 |
| --- | --- |
| `direct-03/{stdout.log,stderr.log,script_snapshot.js}` | READY、FOLLOW、写入拒绝、当前加载源码；有一次原生观察 TIMEOUT，后续同几何恢复并继续工作。 |
| `direct-03-probes/{toolbar.png,toolbar-page-02.png,toolbar-final.png,claude-code.png}` | 实际栏与精确 Claude 窗口截图；不是跨窗口叠层图。 |
| `direct-03-probes/{manager.png,manager-selected-06.png}` | 稳定管理器布局及选中态。 |
| `direct-03-probes/{manager-read,manager-select,manager-close,page}/` | 当前候选的实窗读回；manager-read 保存完整 native tree，manager-select 核对全文。 |
| `direct-03-probes/copy-rejection/` | 合成 6 回退、完整剪贴板和原草稿逐字不变证据。 |
| `direct-03-probes/{scene-cowork-02,scene-cowork-03,scene-return-code,scene-return-code-02}/` | Cowork 不资格化及 Code 重新测量；仅返回 Code 页面不等于追加通过。 |
| `direct-03-probes/cowork-bar-state-02.json` | 仅查询 ID 170786：`present:false,onScreen:false`；未枚举其他窗口。 |
| `direct-03-probes/{return-code-bar-state,return-code-bar-state-02}.json` | 同 PID/原生 ID 再次 onScreen，60×280pt、(608,348)。 |
| `direct-03-probes/{provenance,visual-verdict}.json` | 最终源码/构建/私人库哈希及本候选视觉判定；visual pass 与追加未实现分别记录。 |
| `node-tests-direct03.log` | 本次四模块 Node 回归 358 项：356 通过、0 失败、2 个缺显式 Browser model 路径的可选项跳过。 |

本次探针失败均保留：首次 scene-run 时 Claude 不在前台；manager-open 初版未 await `File.readJSON` 导致参数无效，后续改为同步读取 JSON；隐藏栏观察产生 STALE_TARGET；首次按钮计数把无名的原生窗口按钮算入，改为业务按钮核对；manager-open-06 的 logo invoke 已 acknowledged，随后管理器动画使读回校准过期，改为新窗口几何的只读观察，没有重放 logo；scene-cowork 初版误把场景 null 当作未拒绝；首次精确 CG 探针将隐藏窗口的空结果错误当作 fatal，保留输出后修正为正常记录 absent。它们不计成功验证，后续对应读回见上表。

旧 direct-01/02 及 `copy-rejection-01/02`、`logo-final` 等失败和旧截图保留；direct-02 快照 `45d3d483cff7fe941b6180c32fa3502baf665d35a00fb4bfbc8a8ec369522604` 不等于当前 main.js，不能替代最后两处修复的加载证明。R20 OpenCode 的 `draft-check-01 unchanged:false` 原因未定，不能宣称历史全程草稿不变。

接续前已执行的 Runtime JS `ax-claude-01` 为 5/5，通过深树/Prompt/unknown IME 等只读合同；本次没有重跑该测试，原生构建和相应源码未进一步改变。接续前 API 文档 generate/check 没有 errors、contract 检查为 `API_DOC_CONTRACT_OK`，但仍有既有 canonical source gaps；不等于全仓合同认证。本次未修改 API 文档，不重复运行生成器。

## 安全追加能力缺口与有界研究

native owner 为 `automation/`，没有在 polyfill 复制能力或伪造 provider 状态。`prepareTextAppend` 仅有选区准备语义，参数没有 suffix；当前 capability 为 false，所有 provider composition 均 unknown。现有外部 AX 身份/全文/选区观察是独立请求，缺少编辑器 revision 和在实际提交时的 expected 草稿比较，无法保证并发修改安全。

本次只读源码复核重点为 `accessibility_backend_darwin.m` 的状态读取/准备门、`accessibility_runtime.go` 的进程/窗口身份检查，以及 `insert.js` 的 `DIRECTED_APPEND_UNAVAILABLE` 和 unknown 锁止路径。没有可直接启用的隐藏追加能力。可写选区、AXSelectedText settable、AXReplaceRangeWithText 名称或空 marked range 都不补足事务保证。既有 Chromium/Electron/WebKit 研究及拒绝理由保留在业务 README。

2026-10-28 有界核查三个官方资料：

- [Claude Code Desktop reference](https://code.claude.com/docs/en/desktop)：描述 Code prompt box 和 MCP connectors，未提供外部 composer 条件追加事务。
- [Local MCP servers / Desktop Extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)：描述本地 MCP server 接入，未给出宿主草稿/IME/选区编辑事务能力。
- [Desktop Extensions 架构](https://www.anthropic.com/research/desktop-extensions)：描述 MCP server、manifest/tools/prompts 打包，不是对现有 composer 的 compare-and-append 合同。

这些是滚动文档，没有把此类接口绑定到 Claude.app 4.29.0。本次只能得出“未发现符合完整安全契约的公开入口”，不能声称所有内部或未公开能力已被穷尽。没有为核查安装扩展、开启调试端口、注入脚本或修改 Claude。

继续实现的前置依赖是受支持的目标编辑器内部事务入口：同一提交中核验生命周期、expected draft/revision、真实 composition 和选区，仅插入后缀，处理同步事件重入，返回明确提交状态/可查询凭证；外部独立读回确认，unknown 不重发。在此依赖缺失时，无法在本仓库安全完成完整追加；这仍是未完成目标，不是改成复制功能的验收。

尚未验证：新会话/普通聊天完整矩阵、多应用实窗位置隔离、拖动后重启、500ms 指标、跨平台 live。窗口/场景变化失效与按应用位置隔离的源码/Node 契约保留，不扩大成现场覆盖。

## 数据与进程保护

本次只使用 6 条合成库。私人库 `~/Library/Application Support/OpenDesk/codex-prompt-shortcuts/library.json` 在接管开始与最终复核的 SHA-256 均为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`；没有输出其正文、迁移或覆盖该库。

本次未访问 `com.openai.codex` 的 UI/AX/窗口内容，未用全局窗口/应用清单或全桌面截图；前台门只查询系统 front ASN/PID 标识。未调用 `window.current`。只操作实际 Claude 和本任务精确自有窗口，保留 Claude/OpenCode 会话及草稿，没有发送消息或执行输入补偿。

安装版 `/Applications/OpenDesk.app` PID 84099/84111 及其他归属不明服务保留。最终复核时 direct-03 主 87507/host 89120 仍运行供实窗查看；旧 direct-01/02 没有重启。进程状态属于本次观察，后续操作仍需重查。
