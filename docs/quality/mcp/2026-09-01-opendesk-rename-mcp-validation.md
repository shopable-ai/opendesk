# OpenDesk 重命名收口与 MCP 最终验收

日期：2026-09-01（Asia/Shanghai）

## 结论

本轮以新的 `cmd/opendesk-mcp` 构建 `dist/opendesk-mcp`，完成 stdio、工具注册与 dispatch、保护门、macOS 只读、Calculator 真实动作以及 Codex Host 重连验收。最终候选二进制的 wrong-target click、panic、hang 和 stdout pollution 均为 0。

```text
MCP_READY_FOR_RECORDER=true
```

这只表示 MCP 前置门已通过；本轮没有开发或测试 Recorder，也没有执行微信测试。

## Git 与工作区基线

- 仓库：`/Users/mac/Documents/workspace/clawdesk`
- 分支：`master`；未创建、切换或推送分支。
- 执行前 HEAD：`e7606aa784eae4c59d847e1cdb053853e1ba6ecd`
- 执行前 `origin/master`：`e7606aa784eae4c59d847e1cdb053853e1ba6ecd`（已重新 fetch 并核对）。
- 验收完成时 HEAD：`e7606aa784eae4c59d847e1cdb053853e1ba6ecd`，工作区为 dirty；构建元数据也明确标记 `vcs.modified=true`。
- 聚焦提交后的准确 HEAD 由提交回执记录；报告所在提交即本轮执行后提交。
- 工作区原有大量用户与并行任务修改；本轮没有使用 `git reset --hard`、`git clean`、`git add -A`，没有删除或覆盖无法确认归属的文件。

## 重命名与保留分类

### 必须改名

- 命令与二进制：`cmd/clawdesk-mcp` → `cmd/opendesk-mcp`，`cmd/clawdesk` → `cmd/opendesk`，`dist/opendesk-mcp` 为唯一验收二进制。
- UI Host：构建、候选发现与 macOS App Helper 统一为 `opendesk-ui-host`。
- MCP prompt：`prompts/mcp/clawdesk-*` → `prompts/mcp/opendesk-*`。
- Go module/import、当前产品文档、构建脚本、测试命令、schema 与示例中的本项目 canonical 名称改为 OpenDesk。
- Custom UI 可见品牌、WebKit handler 和 JS bridge 使用 OpenDesk canonical 名称；拖动属性使用 `data-opendesk-drag`。
- Runtime 项目配置的 canonical 文件名为 `opendesk.runtime.json`。

### legacy compatibility

- `clawdesk.runtime.json` 仅在同目录不存在 canonical 文件时作为显式 fallback；测试覆盖 canonical 优先和 legacy fallback，文档要求项目迁移到新名称。
- Custom UI 原生渲染器暂时接受 `[data-clawdesk-drag]`，源码注释明确它只是旧 HTML 的兼容 selector；新内容使用 `data-opendesk-drag`。
- `~/.clawdesk/clawdesk/storage.json` 保留为 AppStorage 的改名前迁移来源；新 canonical 路径是 `~/.opendesk/opendesk/storage.json`。

### historical/archive

- `.archive/`、既有历史报告和日期化研究快照中的历史称呼不作为当前产品品牌处理。
- 历史审计文件名或正文若明确描述当时名为 Clawdesk 的项目，可保留，并须保持历史语义。

### third-party/competitor

- `clawdesk/clawdesk`、`clawdesk.dev`、`clawdesk-runtime`、`clawdesk-browser` 等是第三方项目、URL 或包名，不能错误替换。
- 竞品研究文档已把本项目改为 OpenDesk，同时保留上述第三方真实名称。

### local-only identifier

- 本地仓库目录 `/Users/mac/Documents/workspace/clawdesk` 未改名。
- 本地 `lan` remote、Terminal/Safari 旧窗口标题等是本机标识或外部应用状态，未在脏工作区擅自更改。
- canonical `origin` 已核对为 `git@github.com:shopable-ai/opendesk.git`。

## stdio 竞态修复

`tests/mcp/tools/stdio-smoke/main.go` 现在先完整 drain stdout/stderr，再执行 `Wait`；超时才 kill，并在进程结束后校验 trailing stdout。这样不再把 `StdoutPipe` 被 `Wait` 并发关闭造成的 `file already closed` 当成协议污染，同时真正的 trailing 非 JSON stdout 仍会失败。

新增回归测试覆盖：

- helper 在退出前连续输出 256 行，验证 drain-before-wait 且无死锁/pipe close race；
- trailing 非 JSON 文本仍被判为 MCP protocol violation。

`go test ./tests/mcp/tools/stdio-smoke` 通过；最终二进制连续 50 次 stdio smoke 全部通过。

## 唯一事实二进制

- 路径：`/Users/mac/Documents/workspace/clawdesk/dist/opendesk-mcp`
- 大小：约 22 MiB（23,570,120 bytes）
- 文件：Mach-O 64-bit executable x86_64
- SHA-256：`0342cb0a00def5c142dbecbaebc1288a23ea7f85359ab042185cff1a1cbbf894`
- Go：`go1.25.13`
- module path：`opendesk/cmd/opendesk-mcp`
- module：`opendesk v0.2.3-0.20260831144944-e7606aa784ea+dirty`
- VCS revision：`e7606aa784eae4c59d847e1cdb053853e1ba6ecd`
- VCS modified：`true`，与本轮当前 HEAD + dirty 构建事实一致。

旧 `dist/clawdesk-mcp` 仅记录为 stale generated artifact，没有用于任何最终验收，也不进入提交。

提交前重建曾使候选 SHA 发生变化，因此早期 `53ab1832…` 候选的结果没有被沿用；本节和下述所有最终门均已针对稳定复现的 `0342cb0a…f894` 重新执行。

## MCP 验收结果

| 门槛 | 最终结果 | 关键事实 |
|---|---|---|
| Go unit/build | PASS | `go test -count=1 ./pkg/mcpserver ./cmd/opendesk-mcp`；随后重新构建最终二进制 |
| stdio protocol | PASS 10/10 | initialize、notification silence、ping、tools/list、schema、dispatch 与错误响应均通过；clean exit 10/10 |
| stdio race regression | PASS 50/50 | failed=0、timeout=0、panic=0、non-JSON stdout=0、protocol violation=0 |
| registry/schema/dispatch | PASS | 25 tools，135 个 schema nodes，registry hash 十次稳定 |
| guard smoke | PASS 5/5 | preview、dry-run、stale、ambiguous、错误 expectedWindowTitle 全部 `executed=false` |
| macOS read-only | PASS 5/5 | status、permissions、displays、windows、active window、screenshot、inspect 顺序完成；权限 5/5 ready |
| screenshot quality | PASS | 5 张 PNG 均为 1920×1080、可解码、opaque ratio=1.0、non-black ratio≈0.999877；人工确认是真实当前桌面与 Calculator |
| Calculator direct action | PASS | preview `executed=false` 后，对唯一 Calculator/PID 78109 的“7”按钮执行一次 guarded click，`executed=true` |
| Codex Host | PASS 3/3 | 三个独立 fresh Codex Host 进程均以 server `opendesk` 完成 initialize 与工具调用；第三次含 guarded Calculator click |
| global failure counters | PASS | wrong-target click=0、panic=0、hang=0、stdout pollution=0 |

最终 SHA 的直接 Calculator action 人工截图检查确认显示从 `7777` 变为 `77777`。Codex Host 第三次的前后截图确认显示从 `77777` 变为 `777777`；两者都只在 fresh perception、唯一窗口、精确身份、权限、expected window/text、freshness 与 preview 门通过后执行。

## Codex Host 配置与重连

磁盘上的正式配置已核对为：

```toml
[mcp_servers.opendesk]
command = "/Users/mac/Documents/workspace/clawdesk/dist/opendesk-mcp"
```

没有旧 `[mcp_servers.clawdesk]`，也没有 `/bin/sh`、管道、`awk` 或 `2>/dev/null` 包装。`codex mcp get opendesk` 返回 enabled stdio server 和上述绝对路径。

Host 结果来自三个新的 `codex exec --ephemeral` 进程，而不是复用本桌面会话的缓存：

1. reconnect-01：`tm_status`、`tm_list_windows`、`tm_screenshot` 全部成功；
2. reconnect-02：相同只读序列全部成功；
3. reconnect-03：status/windows/screenshot，Calculator preview `executed=false`，真实 action `executed=true`，after screenshot，wrong-target=0。

当前已打开的 Codex 桌面会话仍显示启动时缓存的旧 tool namespace；要让这个现有 GUI 会话也显示 `opendesk` namespace，需要重启 Codex。它没有被计入上述 Host 3/3，也没有用旧 namespace 伪造验收。

## Evidence

原始运行产物统一位于：

```text
.runtime/tests/mcp/20260831T175114Z-opendesk-rename-mcp/
```

关键子目录/文件：

- `final-binary-and-config.txt` 与最终命令回执：binary SHA、`go version -m` 与 Codex 注册事实；
- `final-unit-tests-post-stage.log`：最终 Go 单测；
- `final-0342-stdio-10/`、`final-0342-stdio-50/`：最终 SHA 的 stdio 原始 NDJSON、tools/list 与汇总；
- `final-0342-guard/contract-results.json`：最终 SHA 的 registry/schema/dispatch 与五个保护门；
- `final-0342-read-only/`：最终 SHA 的 5/5 运行、截图与像素分析；
- `final-0342-calculator-action/`：最终 SHA 的直接 preview/action、前后截图和 summary；
- `final-0342-host/`：最终 SHA 的三次 fresh Host events、stderr 与截图。

这些 Evidence、`dist/` 和截图均不提交。

## 剩余 blocker

MCP 验收没有剩余 blocker。唯一操作提醒是：当前已打开的 Codex 桌面会话需要重启后才会刷新磁盘上的 OpenDesk server 名称；真实 fresh Host 3/3 已完成，因此不影响本报告的 MCP readiness 结论。
