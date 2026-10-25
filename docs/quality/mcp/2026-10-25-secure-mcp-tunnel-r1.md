# OpenDesk MCP 与 Secure MCP Tunnel R1 验收

日期：2026-10-25。范围：现有 stdio MCP 的最小修复、无密钥真实 Mac 桌面闭环、官方客户端本地兼容与后续接入说明。
官方云端调用不在本轮已执行范围内。

## 真实结果

| 验收项 | 结果与证据 |
| --- | --- |
| MCP 协议 | PASS：真实 stdio initialize、tools/list、tools/call；本地 gate 协商 2025-06-18，只读模式协商 2025-11-25 |
| 编译与实际加载 | PASS：新建 darwin/arm64 `dist/opendesk-mcp`，两个 MCP 子进程确实加载该文件，退出 0 |
| 桌面观察 | PASS：真实权限查询、窗口枚举、活动窗口与 fixture PID/窗口号交叉核对 |
| 桌面执行 | PASS：仅向本轮新启动的仓库 AppKit fixture 输入一次 `OpenDesk MCP 实机 713f7ae2` |
| 独立结果 | PASS：应用自己记录的 AppKit 状态与独立只读 AX observer 的字段值一致；实际 PNG 已人工查看 |
| 截图边界 | PASS：MCP/AX 窗口范围 720×442；当前 display scale=2；实际 source=clip、PNG=1440×884；前后身份与范围一致 |
| 只读策略 | PASS：仅发现 7 个只读工具；4 个禁止调用被拒绝；canary 文件与字段内容未改变；无调用方截图输出路径 |
| 官方客户端 | PASS：官方 v0.0.18 的本地 stdio adapter 对最终同一 SHA 完成 initialize/list/tm_status；health 为 same_child；退出 0 |
| ChatGPT 云端调用 | NOT_TESTED：无 runtime key、未创建托管 Tunnel、未操作 ChatGPT 插件网页 |

最终二进制 SHA-256：`6c218fb7258ea84afcb621117371a385b50787fa43263b9286a5831bf7b9ea0f`。
构建基线为 master `f5ab7a2d7f00d6cfbcdb76210592ebe32b2a879a` 加工作区修改，Go build info 如实记录 `vcs.modified=true`。
仓库原有 Browser 并行修改保留；这份证据不是干净发行包或已安装 OpenDesk 应用更新的证明。

代码已修改、实际已加载、视觉已确认、功能已验证四项均有本轮证据；没有修改产品 UI。
画面中测试文本完整、控件对齐、窗口无异常拉宽、裁切或大片空白。fixture 与两个 MCP 子进程均已清理。

## 已有能力与本轮修复

继续使用 `cmd/opendesk-mcp`、`pkg/mcpserver` 和现有 native Runtime。真实状态、权限、窗口、聚焦、PID 定向输入和截图已可用，
无需第二套 MCP Host、桌面引擎、OpenDesk HTTP 服务或自制 Tunnel 客户端。

本轮修复的具体缺陷：

1. 原初始化固定返回旧版本，未按请求协商；补齐已实现的 2024-11-05、2025-06-18、2025-11-25 协商。
   不宣称实现 2025-03-26 的 batch 或 2026-07-28 的新发现协议。旧版本不返回 annotations。
2. 缺少工具副作用元数据及受控远程集合；补齐 MCP hints，新增同一服务的 `--read-only` allowlist，发现和调用两层均校验。
   截图完整模式可能覆盖调用方指定文件，保守标为写；只读模式拒绝路径及别名，默认内存 base64。
3. ID/params 与通知处理不够严格；无 ID 通知不再触发工具副作用，非法 ID/参数明确报协议错误。
4. 原生执行失败与协议错误混用、结构化失败可能缺失 `isError`；现在执行失败使用 MCP tool result 的 `isError:true`。
5. PID 定向输入之后的 Enter 原本会成为全局按键；组合请求现在在发送任何文字前拒绝。实机负例确认字段不变。
6. macOS display 元数据旧 API 在本机 Retina 返回 points；使用当前 mode 的 backing ratio 修正 pixel dimensions 与 scale，
   只查询、不更改显示模式，Copy/Release 配对并检查数值有效性。SDK 与独立 native probe 确认 points/pixels 差异。
7. 验收工具自身经独立审查修复：不保存原始错误/无关窗口/原始 stderr；显式 clip 阻断全屏回退；
   两个客户端关闭并解析尾部输出后才决定 PASS；畸形 content 不使审计过滤器抛异常；非法响应 ID 在任何字符串转换前拒绝，不跳过清理。

## 修改归属

| 文件 | 原因 |
| --- | --- |
| `cmd/opendesk-mcp/main.go` | 现有服务增加只读启动选项 |
| `pkg/mcpserver/server.go` | 协议协商、通知/参数/错误、工具策略接入 |
| `pkg/mcpserver/protocol_policy.go` | 集中声明 hints、独立只读 allowlist 与 ID 校验 |
| `pkg/mcpserver/protocol_policy_test.go` | 协议、元数据、策略和拒绝路径回归 |
| `pkg/mcpserver/server_test.go` | 将 6 个旧测试小数 ID 改为合法字符串，保留业务断言 |
| `pkg/mcpserver/runtime.go` | 在任何输入前拒绝 PID 输入加全局 Enter |
| `automation/display_darwin.go` | 修正实际观察到的 Retina 像素尺寸与 scale |
| `tests/mcp/tools/macos-smoke/main.js` | 导出现有 stdio client/PNG 检查供复用，支持启动参数并拒绝非法响应 ID |
| `tests/mcp/tools/desktop-control/main.js` | 明确 opt-in、单次输入、受控 fixture 的真实桌面 gate |
| `tests/mcp/tools/desktop-control/observe.m` | 测试专用只读 AX 结果与窗口 bounds oracle，无动作接口 |
| `tests/mcp/tools/desktop-control/safety.js` | 验收日志隐私、截图范围与最终关闭检查 |
| `tests/mcp/desktop-control-safety.test.js` | 失败注入回归，明确不冒充实机证据 |
| `docs/integrations/mcp/README.md` | 实机入口、只读边界、取消与后续授权限制 |
| `docs/integrations/mcp/secure-mcp-tunnel.md` | 官方来源、精确客户端参数、无密钥证据与后续在线步骤 |
| `docs/quality/go-test-file-classification.md` | 在原增量章节登记新增 Go 私有 adapter 测试 |
| 本报告 | 分离本地、官方客户端与云端结论，保留失败与限制 |

## 执行命令与证据

所有命令从仓库根目录执行。该机器的 Go 可执行文件为
`/Users/shopme/.local/opt/go1.25.13-amd64/bin/go`；以下以 `OPENDESK_GO` 指代该路径。
构建、Go 定向测试和 vet 均使用 `GOARCH=arm64 CGO_ENABLED=1`，未改用户全局 toolchain。

| 实际执行内容 | 结果 | `.runtime/tests/mcp-tunnel/` 内证据 |
| --- | --- | --- |
| `GOARCH=arm64 CGO_ENABLED=1 "$OPENDESK_GO" build -o dist/opendesk-mcp ./cmd/opendesk-mcp` | PASS | `r1-20261025/build-reviewed.log` |
| `GOARCH=arm64 CGO_ENABLED=1 "$OPENDESK_GO" test -count=1 ./pkg/mcpserver ./cmd/opendesk-mcp ./tests/mcp/tools/stdio-smoke` | PASS | `r1-20261025/final-go-test.log` |
| `GOARCH=arm64 CGO_ENABLED=1 "$OPENDESK_GO" vet ./pkg/mcpserver ./cmd/opendesk-mcp` | PASS，已有 native/deprecation warnings 保留 | `r1-20261025/final-vet.log` |
| `node --test tests/mcp/desktop-control-safety.test.js` | PASS，8 项 | `r1-20261025/desktop-safety-regression.log` |
| `OPENDESK_GO=/Users/shopme/.local/opt/go1.25.13-amd64/bin/go node tests/mcp/tools/desktop-control/main.js --allow-fixture-input --evidence .runtime/tests/mcp-tunnel/r1-20261025/desktop-verified` | PASS，一次真实输入 | `r1-20261025/desktop-verified/summary.json` |
| 官方 `tunnel-client dev proxy` 经 sandbox 仅允许 loopback/Unix 出站 | PASS，同一最终 SHA | `official-client-local-probe-final/launch.json`、`result.json`、`requests-responses.json`、`exit.json` |
| 独立无密钥 profile 的 `doctor --explain` / `doctor --json` | 退出 2；缺 `CONTROL_PLANE_API_KEY`，不标 PASS | `config-doctor-evidence.json`、`cli/` |
| `node scripts/audit_test_architecture.js` | FAIL，已有台账基线错误 | `r1-20261025/test-architecture-after.log`、`architecture-summary.json` |
| `git diff --check`、Go/Node 语法格式检查 | PASS | Git/检查输出；未触发无关 UI、全目录 Runtime gate |

实机核心证据：`desktop-verified/fixture-before.json`、`fixture-after.json`、`field-before.json`、`field-after.json`、
`target-window.json`、`fixture-after.png`、`macos-smoke-desktop-control.ndjson`。
对应构建来源见 `r1-20261025/source-provenance-final.json`，视觉观察见 `visual-verdict.json`。

测试架构审计的 62 项错误包括 60 个未登记现有 Go 测试及两类分类/总数错误；60 个文件均已存在于基线 HEAD。
新增 `protocol_policy_test.go` 已成功登记。没有扩大到修理其他 Agent/历史台账，也没有把该审计表述为通过。
此前 `desktop-policy` 的 data URL 解码错误、`desktop-reviewed` 的 Retina scale 不一致均保留为失败尝试，最终结论仅取修复后的 `desktop-verified`。

## 官方接入与权限归属

逐条配置和后续命令见 [官方 Tunnel 接入指南](../../integrations/mcp/secure-mcp-tunnel.md)。
正式接入顺序为：Platform 正确组织/ChatGPT 工作区与 Tunnel RBAC → 创建/选择真实 tunnel ID →
环境引用 runtime key → `doctor` 与正式 `run` → readiness/轮询 → ChatGPT Plugins 的 Tunnel 自定义 MCP → 实际 `tm_status`。
本轮未执行这些云端步骤，不能把 dev proxy 的本地 URL 填入 ChatGPT 当成正式 Tunnel。

当前官方页面未证实“ChatGPT Pro 固定只读”，也未核验本账户是否可用；不能发明套餐限制或以错误 hint 绕过它。
Tunnels Read+Manage（创建）、Read+Use（运行/选择）、组织/工作区关联及插件可用性属于官方账户/工作区层面。
已通过的 OpenDesk stdio、本机权限与只读策略不受“没有 runtime key”否定。

完整本地模式尚无按远程用户/应用/窗口/动作的统一授权边界；macOS TCC、旧 Authority 的包信任、窗口 title guard
不能替代该授权。当前安全交付是远程 profile 固定 `--read-only`，不开放远程写入、不新增权限 UI。
同步 handler 未接入每次原生调用的 MCP cancellation；终止自己启动的服务能阻止后续动作，不能撤销输入或保证中断已发出的原生调用。
未来写操作仍需复用现有 Runtime/Execution，接入明确授权、目标白名单、取消令牌、脱敏审计和独立 readback；未知动作状态不得自动重放。

截图仍涉及隐私；clip 能消除全屏回退，但矩形区域在采集期间可能被遮挡，前后检查不能证明瞬间没有竞态。
本次只验证单台 Mac 内建 Retina、旋转 0°，未验证旋转屏、混合 DPI、多屏及其他系统 live Runtime。
官方客户端包已匹配 release digest/校验和，未验证 Sigstore provenance 签名。

## 独立质量评估

由未参与写入的独立 code-reviewer 对本轮增量和实际证据复核。最终结论为 COMMENT（无阻塞发现），
原审查发现已逐项关闭；已确认待修 P0/P1/P2 均为 0。失败尝试与审查提出的问题均保留在运行证据/审阅记录中。

| 维度 | 百分制评分 | 证据与保留限制 |
| --- | --- | --- |
| MCP 协议与副作用边界 | 96 | 真实握手、协商、错误和通知回归；不宣称支持未实现的新协议 |
| 只读策略 | 96 | allowlist 发现/调用双层限制、4 项真实拒绝及文件 canary |
| native 与截图契约 | 95 | 独立 SDK/probe、修复 scale、实机 PNG；仅单屏旋转 0° 已验证 |
| harness 隐私与清理 | 95 | 脱敏错误/日志、显式 clip、非法 ID/畸形 content 防护与关闭后判定 |
| 本轮验证完整性 | 95 | 8 项失败注入、真实 AppKit/AX/图片、同 SHA 官方客户端 probe、Go test/vet |

算术平均分：`(96 + 96 + 95 + 95 + 95) / 5 = 95.4/100`。本轮评分维度没有低于 95 的项。
这不是独立第三方认证；评分仅覆盖本轮无密钥交付，不给未执行的云端调用或尚未开放的远程写控制打通过分。
历史架构审计失败如上单列，不冒称全仓库检查通过。LSP diagnostics 不可用已披露，编译/vet/实际执行证据均有效。
