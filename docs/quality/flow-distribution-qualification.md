# OpenDesk Flow Distribution / Installation Qualification

本报告只记录本 checkout 已执行的证据。A=真实 dist/App Shell/Finder/Runner 实窗，
B=仓库根目录由当前 `dist/opendesk` 直接执行的 Runtime gate，C=CLI/Node controller，
D=Go 白盒测试。C/D 不能单独把产品资格写成成功。

## Checkout 与边界

- branch：`master`
- HEAD：`6930be2bb06526127d21c7b542313a932fc33ba9`
- 状态：dirty；本轮保留用户和并行会话修改，未 commit、未 push、未 reset、未切换分支。
- 平台：Darwin `x86_64`。
- 最终 bundle payload：`dist/OpenDesk.app/Contents/MacOS/opendesk`，`dist/opendesk`
  是其 symlink；SHA-256 `406d27ae27defa9c49b88e4c5efd4b005954f10a8d80d4494cfb747ba40cb6f2`。
- 本轮按授权结束了已确认的 `/Applications/OpenDesk.app` PID `99338`，随后只启动当前
  checkout 的 `dist/OpenDesk.app`，并使用隔离 `OPENDESK_APP_DATA_DIR`。
- 当前 bundle 的冷启动实际加载证据在
  `.runtime/tests/native-flow-20260917-2110/cold-restart.log`：记录了当前
  `dist/OpenDesk.app/Contents/MacOS/opendesk`、App Mode `packageRoot`、隔离
  `appDataRoot`、`SCRIPT_RUNNER_READY` 和 `OPENDESK_PRODUCT_APP_READY`。
- `.odflow` 冷启动确实到达真实 AppKit 信任对话框；截图
  `.runtime/tests/native-flow-20260917-2110/screens/02-foreground.png` 和
  `06-after-cgevent.png` 保留了真实的 `Unverified publisher` / `Install This Flow`
  窗口。但当前 Accessibility/System Events 无法取得该 modal window，也无法完成按钮
  点击；因此没有把这次 native install 写成 A PASS。临时 PID `37437` 在普通 `kill`
  未退出后按用户授权以 `kill -KILL` 结束，退出码 `137` 已保留在日志会话结果中。

## Evidence

| ID | 证据 | 结果 |
| --- | --- | --- |
| E0 | `git branch --show-current`, `git rev-parse HEAD`, `git status` | `master` / `6930be2b`；dirty 保留。 |
| E1 | `go test ./pkg/appshell ./pkg/flowinstall ./pkg/flowpackage ./internal/flowcli ./pkg/execution ./pkg/appdata -count=1` | PASS；AppKit/libuiohook 只有已有 deprecation warnings。 |
| E2 | `./dist/opendesk -script tests/runtime-api/flow-package.js -console-mode script` | B PASS，3/3；日志 `.runtime/runs/direct-20260917-204210-434000/`。 |
| E3 | `OPENDESK_RUNTIME_API_RUN_DIR=.runtime/tests/runtime-api/flow-direct-20260917-2047-final OPENDESK_RUNTIME_API_BINARY=$PWD/dist/opendesk ./dist/opendesk -script tests/runtime-api/flow-distribution.js -console-mode script` | B PASS，exit 0；覆盖 pack/inspect/verify、trust refusal、install 不执行、list、不同 cwd run、uninstall 和 plain `.js`。 |
| E4 | `examples/flow-distribution/` README 一行命令、`.runtime/examples/flow-distribution/` inspect/verify/install/list/run/uninstall 记录 | PASS；业务结果只在明确 `flow run` 后出现；package 内无私钥，`.runtime/.../keys/publisher-private.pem` 已删除。 |
| E5 | `make build`；`SKIP_CODESIGN=1 scripts/build_macos_app.sh`；`plutil -p dist/OpenDesk.app/Contents/Info.plist` | PASS；bundle 含 `CFBundleDocumentTypes`/`UTExportedTypeDeclarations` 的 `com.opendesk.flow`/`.odflow`。仅跳过 codesign，故不是签名发行资格。 |
| E6 | `node --test tests/custom-ui/script-runner-simple.test.js` | PASS，28/28；Flow Catalog、稳定 install identity、显式 run、安装不自动运行。 |
| E7 | `go test ./cmd/opendesk -count=1` | FAIL：既有 `TestProductAppUsesOnlyTheSharedAppLocalServicesRuntime` 静态断言与当前并行 Product App 源码不一致；未删断言。 |
| E8 | `node scripts/check_api_docs_contract.js` | FAIL：既有 `types/UI.d.ts` 缺少完整 `UI.tapTexts` contract。 |
| E9 | `node scripts/audit_test_architecture.js` | FAIL：Flow 新增测试已登记；剩余并行未登记 `pkg/appshell/product_about_localization_test.go`、`pkg/customui/about_markup_contract_test.go`、`pkg/measurement/candidate_suppression_test.go`、`pkg/runtimeversion/version_test.go`，以及既有 `types/custom-ui.d.ts` 缺失。 |
| E10 | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c` for `pkg/flowinstall`/`pkg/flowpackage` | PASS：cross-build 产物在 `.runtime/tests/flow-distribution/windows/`；Windows product `cmd/opendesk`/AppShell build 被既有 robotgo Windows symbols 阻塞，未写 live PASS。 |
| E11 | 当前 `dist/OpenDesk.app` 以 `.odflow` 参数冷启动；`screens/02-foreground.png`、`screens/06-after-cgevent.png`、`foreground.log`、`ui-tree-03.txt` | A PARTIAL：真实 AppKit publisher-trust modal 可见；System Events 报告 `count=0`，自动点击不可达；没有伪造“已确认安装”。 |
| E12 | 同一隔离 app-data 的 `00-list-before.txt`、`01-cli-install.txt`、`02-cli-list-after-install.txt`、`03-no-auto-run.txt`、`04-cli-run.txt`、`06-cold-restart-list.txt`、`07-cli-uninstall.txt`、`08-cli-list-after-uninstall.txt` | C PASS；另有当前 bundle 冷启动的 A 运行日志：安装成功且安装后无 `result.json`；明确 `flow run` 后业务结果和 `status=succeeded`；冷启动后新进程 list 仍发现；卸载 `dataRemoved=true` 且最终 list 为空。不是正式 B gate 的替代。 |

E3 是本轮正式 B qualification；E12 是同一隔离 app-data 的真实 bundle 冷启动 + CLI
闭环补充证据；generic catalog、Node controller、Go tests 只作为 C/D
辅助证据。E4 生成的 `.odflow` 是 `.runtime/` 下的可复现测试产物，不是稳定版本库资产：
公开稳定资产是 `examples/flow-distribution/main.js`、`assets/message.txt` 和 README；
示例源码、README、构建材料没有私钥。

## FLOW-01 ～ FLOW-25

| ID | 最高证据 | 结果 | 证据 / 未完成范围 |
| --- | --- | --- | --- |
| FLOW-01 | B | PASS | E3/E4/E12：plain `.js` 与公开 `.odflow` 都能安装；E12 安装后无结果，明确 run 后才产生业务结果。 |
| FLOW-02 | B | PARTIAL | E2/E3 普通签名 `.odflow` 通过；真实 P1/P2 protected license/activation 未授权，不能写完整 PASS。 |
| FLOW-03 | B | PARTIAL | E2 保持裸 `.odpkg` 的现有 protected `-script` 入口；可信材料成功执行与缺 key/授权 live matrix 未完成。 |
| FLOW-04 | B | PASS | E2 覆盖 manifest、签名、entry/resource tamper 拒绝且无业务执行；更广泛故障注入仍是 D。 |
| FLOW-05 | B/D | PASS | canonical reader/writer 与 B package gate 覆盖 ZIP 路径、symlink、特殊文件、越界和安装树边界。 |
| FLOW-06 | D | PARTIAL | 重复、大小写/NFC、保留名和冲突路径有 Go 证据；缺独立 B/A 全矩阵。 |
| FLOW-07 | B/D | PASS | bounds、文件数、截断/结构限制有 E2 和 canonical tests；未把压缩炸弹压力测试写成 A。 |
| FLOW-08 | B | PASS | E3 未知 publisher 默认 `flow_trust_required`；Flow scope 与 publisher scope 由显式选择区分。 |
| FLOW-09 | D | PARTIAL | authority/official/market identity seam 有 Go 测试；没有真实 production root/market live。 |
| FLOW-10 | D | PARTIAL | rotation/revocation/rollback seam 有 Go 测试；没有在线撤销服务 live。 |
| FLOW-11 | D | PARTIAL | 多 publisher/key/包隔离有 Go coverage；未做真实多包产品 UI 资格。 |
| FLOW-12 | D | PARTIAL | package/product binding seam 有测试；无多个独立真实授权信封 live。 |
| FLOW-13 | D | BLOCKED | P1/P2 device、过期、撤销和真实 License 未获授权；不能伪造通过。 |
| FLOW-14 | — | BLOCKED | 没有可核验 production activation endpoint/credentials；未启动外部服务。 |
| FLOW-15 | B | PASS | E3 从仓库 cwd 与 alternate cwd 运行，`Flow.root`/`Flow.dataDir` 与安装绑定；越界 resolve 被拒绝。 |
| FLOW-16 | B | PARTIAL | 普通 Flow execution/错误边界通过；protected execution 无 P1/P2 live evidence。 |
| FLOW-17 | D | PARTIAL | journal/staging/rollback/recovery 有 Go evidence；没有真实进程中断 A/B gate。 |
| FLOW-18 | A/B/C/D | PARTIAL | E11 证明真实 native trust modal 到达；service lock、重复/并发安装有 D，E12 完成同一 app-data 的安装闭环；native 双击/文件选择器成功点击和拖放仍无 A 证据。 |
| FLOW-19 | D | PARTIAL | run lease/update/uninstall seam 有测试；没有真实桌面运行中更新/卸载。 |
| FLOW-20 | B/D | PARTIAL | E3 覆盖平台/runtime/run/install；同版本冲突、降级主要是 D，未有 A。 |
| FLOW-21 | B/C | PASS | E3 与 E12 的 uninstall/remove-data 通过；E12 最终 list 为空且业务结果已移除。 |
| FLOW-22 | C | PARTIAL | Runner 保留 legacy recipe/`.odpkg` 入口；AI/Scheduler/旁置资源迁移无完整 B/A 证据。 |
| FLOW-23 | C | PARTIAL | E6 通过 Catalog name/stable key/refresh/run/stop/不自动运行；E12 冷启动日志记录 `SCRIPT_RUNNER_READY` 并选择 installed Flow；真实 Product Runner 视觉仍未确认。 |
| FLOW-24 | A | PARTIAL / A BLOCKED | E11 有真实 AppKit trust modal 截图，E12 有当前 bundle 冷启动/Runner ready 日志；但 modal 点击、成功 native install、Finder/LaunchServices 双击热路径、产品文件选择器和 Runner 外部 drag-drop 未完成 A 验证。现有 Custom UI host 没有安全外部文件路径桥接，不能发明协议；Windows 无 live。 |
| FLOW-25 | B/D | PARTIAL | canonical package boundary、旧 `.js/.mjs/.odpkg` CLI 路径和 AppMode 单实例协议有证据；native visual/function A 未完成。 |

## 本轮直接修改与 owner

- canonical package owner：`pkg/flowpackage/`；旧 `pkg/flow/` 保持并行 checkout 的删除状态，未恢复第二套实现。
- install owner：`pkg/flowinstall/`；新增 `NewProductService`，CLI 与 product App Mode 共享同一 app-data root/service 构造。
- CLI/docs/schema/tests：`internal/flowcli/flowcli.go`、`docs/api/flow*.md`、`schemas/flow/flow.schema.json`、`tests/runtime-api/flow-package.js`、`tests/runtime-api/flow-distribution.js` 和 harness；canonical writer 只接受显式重复 `--file`，拒绝 symlink/reserved/duplicate，输出不覆盖。
- public example：`examples/flow-distribution/main.js`、`assets/message.txt`、README；README 给出从仓库根可复制的一行构建命令，临时 private key 在 `.runtime` 且构建后删除。
- native P5：`cmd/opendesk/main.go`/`app_mode.go`、`pkg/appshell/instance*.go`、`shell.go`、`product_menu.go`、`native_darwin.{h,go,m}`、locales 和 `scripts/build_macos_app.sh`。Finder/LaunchServices、product menu picker、trust prompt、cold/hot document transfer 都只调用 product-bound `flowinstall.Service`，不拼 shell command。
- test architecture ledger：Flow Go tests 已追加到 `docs/quality/go-test-file-classification.md`；E9 的剩余失败属于并行 dirty files/既有 missing type，不通过降低断言处理。

## Native / cross-platform 分层交接

macOS 的代码修改、当前源码编译、App bundle staging、`Info.plist` 文档声明、当前
bundle 实际加载和冷启动持久发现已完成。真实信任 modal 截图已保留，但 Accessibility
无法点击该 modal；因此 native 成功安装、Finder cold/hot、菜单 picker、Runner
drag/drop 和实窗中的“安装后只刷新不运行”仍未完成，A 状态是 BLOCKED/PARTIAL，不是
PASS。CLI 同一隔离 app-data 的安装/不自动运行/显式运行/重启发现/卸载已完成。

现有 Custom UI host 的 drag overlay 是窗口内部拖动机制，不是外部 Finder file-path
transport；本轮没有发明未文档化的 WebView/drag protocol。要闭合 FLOW-24，需要在同一
native host owner 中增加可审计的 external file path bridge，并在真实 Runner 窗口完成
截图和功能 gate；同时需要可控的真实 modal 交互权限来完成 install button 的 A 验证。

Windows 仅有 Flow package/install cross-build 产物；product `cmd/opendesk` cross-build
被仓库当前 robotgo Windows symbols 阻塞，且没有目标系统 live Runtime、文件关联、
DPAPI 或 drag/drop 证据。不得把 macOS build 或 Go cross-build 表述为 Windows live PASS。

Protected P1/P2 未获得真实客户 License、Publisher key lifecycle 或 entitlement service
授权；受保护 live run 保持 BLOCKED。

## 结论

canonical `.odflow` format、安装事务、trust boundary、plain/local Flow Runtime B gate、
可复现公开示例、macOS 原生入口代码、当前 bundle 实际加载和同一隔离 app-data 的 CLI
安装闭环已完成；普通 CLI/B 资格通过。整体 Production qualification 尚未收口，剩余
硬 blocker 是 macOS native modal/Finder/picker/drag-drop 的 A 交互证据、Windows
product cross/live 边界、P1/P2 授权以及并行会话带入的既有测试/docs contract failures。
