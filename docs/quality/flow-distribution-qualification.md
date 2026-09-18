# OpenDesk Flow Distribution / Installation Qualification

本报告只记录当前 checkout 已实际执行并保留的证据。A=真实 macOS
`dist/OpenDesk.app` / App Shell / Finder / Runner 实窗，B=仓库根目录用当前
`dist/opendesk` 直接执行的 Runtime gate，C=CLI/Node controller，D=Go 白盒测试。
C/D 不能单独替代原生入口或视觉资格。

## Checkout、最终产物与边界

- branch：`master`
- HEAD：`f7f6daeb511efa06daf9fad826a593dea345d41b`
- 状态：dirty；保留用户和并行会话修改，未 commit、未 push、未 reset、未
  checkout、未创建或切换分支。
- 平台：Darwin `x86_64`。
- 最终主二进制：`dist/OpenDesk.app/Contents/MacOS/opendesk` 与
  `dist/opendesk`，SHA-256
  `2c8ce9407a62dd9778d7ded0b695426e719fc770b2778551a0593f721370f37b`。
- 最终 UI host：`dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host`，SHA-256
  `330d9d205e794ea02774a28b5edb6a9998881decd7f02e86af57d7e1791f5da0`。
- 最终 bundle 为 ad-hoc 签名；`codesign --verify --deep --strict` PASS，CDHash
  `61ed50fdd5f8dc343ec01121cea6ca6f3aa0fe20`。`Info.plist` 只注册
  `com.opendesk.flow` / `.odflow`，没有注册 `.js` 或 `.mjs`。
- Flow 相关源码时间早于 22:35 最终构建；收口复核期间最终二进制和 UI host
  哈希未变化。共享 checkout 的其他 dirty 文件不属于本报告的交付声明。

## 四栏状态

| 栏目 | 状态 | 结论 |
| --- | --- | --- |
| 代码已修改 | PASS | Finder/LaunchServices、native drop、产品 picker 都归一化后调用同一 `pkg/flowinstall.Service`；Runner 接受 `flow-*`/`local-*` 并在安装 activation 后 rescan。 |
| 实际已加载 | PASS | 最终签名 bundle 由 PID `69488`（cold/hot LaunchServices）和 PID `77893`（隔离 JS drop 补证）从精确 `dist/OpenDesk.app/Contents/MacOS/opendesk` 加载；进程路径、app-data 与哈希均已核对。 |
| 视觉已确认 | PASS（macOS 本轮范围） | cold trust、安装后列表、hot document、`.js`/`.mjs`/`.odflow` drop、显式 run、重启发现、picker 三选与卸载空列表均有真实窗口截图；未见异常拉宽、过高、大面积空白、裁切或错位。 |
| 功能已验证 | PARTIAL（整体） | macOS 普通 Flow 原生入口与 B gate 通过；Windows live 文件关联/drop/picker 未运行，P1/P2 protected License/activation 未获授权，不能写整体 Production PASS。 |

## Evidence

| ID | 证据 | 结果 |
| --- | --- | --- |
| E0 | `git branch --show-current`、`git rev-parse HEAD`、`git status --short` | `master` / `f7f6daeb`；dirty 保留。 |
| E1 | 默认 `./scripts/build_macos_app.sh` 产物；`shasum -a 256`、`codesign --verify --deep --strict`、`codesign -dvvv`、`PlistBuddy CFBundleDocumentTypes` | PASS；最终哈希、CDHash 与仅 `.odflow` 文件关联见上节。 |
| E2 | `OPENDESK_RUNTIME_API_RUN_DIR=.runtime/tests/runtime-api/flow-direct-20260917-2235-signed-final OPENDESK_RUNTIME_API_BINARY=$PWD/dist/opendesk ./dist/opendesk -script tests/runtime-api/flow-distribution.js -console-mode script` | B PASS；console 为 `.runtime/tests/runtime-api/flow-direct-20260917-2235-signed-final-console.log`，结果目录为同名目录；覆盖 pack/inspect/verify、trust refusal、安装不执行、list、不同 cwd run、uninstall 和 plain `.js`。测试临时 OpenSSL Ed25519 私钥已在 `finally` 删除，源码和证据中不含固定私钥。 |
| E3 | `go test ./pkg/customui ./pkg/appshell ./pkg/flowinstall ./pkg/flowpackage ./internal/flowcli ./pkg/execution ./pkg/appdata -count=1`；`node --test tests/custom-ui/flow-runner.test.js` | PASS；Node 29/29。覆盖路径边界、service/install、Catalog、稳定 install ID、明确 run、安装不自动执行和刷新。 |
| E4 | `.runtime/tests/native-flow-signed-final-20260917-2236/` 的 `process-and-bundle.txt`、`screens/01-cold-launchservices-trust.png`、`02-cold-installed-no-run.png`、`hot-launchservices-pids.txt`、`03-hot-launchservices.png` | A PASS（最终签名 bundle）：cold LaunchServices 到达系统 Documents 提示和 publisher trust；确认后 Runner 为 1 项且 `flow-data` 为空；hot `open -a` 仍只有 PID `69488`，catalog 保持 1 项。 |
| E5 | 同目录 `screens/05-mjs-drop.png`、`06-odflow-drop.png`、最终 app-data records 与 22:40 Runner run logs | A PASS（最终签名 bundle）：`.mjs` 与 `.odflow` 外部 drop 被安装；安装时没有业务结果。22:40 用户明确点击运行 `local-119593…` 后才生成 `mjs-ran.txt`，`flow.run` 为 `succeeded`。 |
| E6 | `.runtime/tests/native-flow-signed-js-final-20260917-2245/` 的 `process-and-result.txt`、`screens/03-finder-single-selected.png`、`04-after-js-drop.png`、隔离 app-data 与 app run logs | A PASS（最终签名 bundle）：只含 `裸脚本.js` 的 Finder 窗口明确单选后拖入 Runner；catalog 从 0 刷新为 1，安装 `local-2c972315e71b1f0f3d8ee07ec71c1df8`、`entry=payload/main.js`、`origin=js`。全目录没有 `js-ran.txt`、`mjs-ran.txt` 或 `run.json`，证明安装没有自动执行。PID `77893` 的 executable、app-data 和最终哈希已核对，补证后普通 `SIGTERM` 正常退出。 |
| E7 | `.runtime/tests/native-flow-final-20260917-2216/` 的 screenshots、app-data、`app.log`、`app-restart.log`、`process-cold-launchservices.txt` | A PASS（最终重建前、同一功能源码的完整 macOS 矩阵）：`.js`/`.mjs`/`.odflow` drop；明确 Run 产生结果；重启发现；cold/hot LaunchServices；状态栏“安装 Flow…”picker 同时选择三种文件；卸载后 list 空；中文、空格、`[#]` 路径。关键截图为 `07`/`08` trust+安装、`09` explicit run、`11`～`13` cold LaunchServices、`14`～`17` menu/picker、`18` uninstall empty。最终重建只移除重复 drag-type registration；最终 artifact 的 cold/hot 与三种 drop 另由 E4～E6 精确复核。 |
| E8 | `examples/flow-distribution/` README 一行命令与 `.runtime/examples/flow-distribution/` inspect/verify/install/list/run/uninstall 记录 | PASS；业务结果只在明确 `flow run` 后出现；`.odflow` 不含私钥，临时 private key 已删除。 |
| E9 | `node scripts/check_api_docs_contract.js`；`git diff --check` | PASS；文档契约与补丁空白检查在最终文档更新后执行。 |
| E10 | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c` for `pkg/flowinstall` / `pkg/flowpackage` | PASS（cross-build only）；产物在 `.runtime/tests/flow-distribution/windows/`。没有 Windows 目标系统 live Runtime、文件关联、DPAPI、drop 或 picker 证据。 |
| E11 | `go test ./cmd/opendesk -count=1` 与 `node scripts/audit_test_architecture.js` 的已有结果 | 非 Flow 降断言项：`cmd/opendesk` 全包静态断言与并行 Product App 源码不一致；architecture audit 还看到并行未登记 Go tests / `types/custom-ui.d.ts` 缺失。未删除或放宽断言，也未把这些写成 Flow PASS。 |

E4～E6 是最终签名 artifact 的直接 A 证据；E7 是完整交互矩阵和重启/卸载闭环，
不用于冒充最终哈希。两层证据分别陈述，未混写 provenance。E2 是正式 B gate；
Node/Go 只作为 C/D 辅助证据。

## FLOW-01 ～ FLOW-25

| ID | 最高证据 | 结果 | 证据 / 未完成范围 |
| --- | --- | --- | --- |
| FLOW-01 | A/B | PASS | E2、E4～E8：plain `.js`/`.mjs` 与 `.odflow` 能安装；所有入口安装后均不自动执行，只有明确 run 才产生业务结果。 |
| FLOW-02 | B | PARTIAL | 普通签名 `.odflow` 通过；真实 P1/P2 protected License/activation 未授权。 |
| FLOW-03 | B | PARTIAL | 裸 `.odpkg` 的既有 protected `-script` 入口保持；可信材料成功执行及缺 key/授权 live matrix 未完成。 |
| FLOW-04 | B | PASS | package gate 覆盖 manifest、签名、entry/resource tamper 拒绝且无业务执行。 |
| FLOW-05 | B/D | PASS | canonical reader/writer 与 package gate 覆盖 ZIP 路径、symlink、特殊文件、越界和安装树边界。 |
| FLOW-06 | D | PARTIAL | 重复、大小写/NFC、保留名和冲突路径有 Go 证据；缺独立 B/A 全矩阵。 |
| FLOW-07 | B/D | PASS | bounds、文件数、截断/结构限制通过；未把压力型压缩炸弹测试写成 A。 |
| FLOW-08 | A/B | PASS | 未知 publisher 默认阻断；最终 signed cold trust UI 明确区分 Flow scope 与 publisher scope。 |
| FLOW-09 | D | PARTIAL | authority/official/market identity seam 有测试；无 production root/market live。 |
| FLOW-10 | D | PARTIAL | rotation/revocation/rollback seam 有测试；无在线撤销服务 live。 |
| FLOW-11 | D | PARTIAL | 多 publisher/key/包隔离有 Go coverage；无真实多包 production trust UI 资格。 |
| FLOW-12 | D | PARTIAL | package/product binding seam 有测试；无多个独立真实授权信封 live。 |
| FLOW-13 | D | BLOCKED | P1/P2 device、过期、撤销和真实 License 未获授权。 |
| FLOW-14 | — | BLOCKED | 没有可核验 production activation endpoint/credentials；未调用外部 entitlement service。 |
| FLOW-15 | B | PASS | 仓库 cwd 与 alternate cwd run，`Flow.root`/`Flow.dataDir` 与安装绑定；越界 resolve 被拒绝。 |
| FLOW-16 | A/B | PARTIAL | 普通 Flow execution/错误边界和显式 Runner run 通过；protected execution 无 P1/P2 live evidence。 |
| FLOW-17 | D | PARTIAL | journal/staging/rollback/recovery 有 Go evidence；无真实进程中断 A/B gate。 |
| FLOW-18 | A/B/C/D | PARTIAL | macOS cold/hot `.odflow`、trust、picker、三种 drop、service lock/并发边界均有证据；Windows live 原生安装入口未运行。 |
| FLOW-19 | D | PARTIAL | run lease/update/uninstall seam 有测试；没有真实桌面运行中 update/uninstall 竞态。 |
| FLOW-20 | B/D | PARTIAL | platform/runtime/run/install 通过；同版本冲突、降级主要为 D，未做完整 A。 |
| FLOW-21 | A/B/C | PASS | E2/E7 的 uninstall/remove-data 通过；真实 Runner 最终为空，业务结果已移除。 |
| FLOW-22 | C | PARTIAL | Runner 保留 legacy recipe/`.odpkg` 入口；AI/Scheduler/旁置资源迁移无完整 B/A 证据。 |
| FLOW-23 | A/C | PASS | Runner 发现 `flow-*`/`local-*`、安装后刷新、明确 run、重启发现和不自动运行均有真实窗口与 controller 证据。 |
| FLOW-24 | A | PARTIAL | macOS Finder/LaunchServices cold/hot、trust、drop、picker、Runner refresh 和视觉检查通过；Windows desktop live 未运行。 |
| FLOW-25 | A/B/D | PARTIAL | canonical package boundary、旧 `.js/.mjs/.odpkg` CLI、macOS 单实例与 native entry 兼容通过；Windows 文件关联/live 仍未完成。 |

## Owner 与入口合同

- canonical package owner：`pkg/flowpackage/`；install owner：`pkg/flowinstall/`。
  Product App Mode 和 CLI 使用同一 product-bound service 构造。
- Finder/LaunchServices native document path 只接受 `.odflow`。macOS bundle 只声明
  `.odflow`；`.js` / `.mjs` 仅由用户在 Runner 外部拖放或“安装 Flow…”picker 中显式选择。
- picker、drop 与 document path 最终都经过 `cmd/opendesk/main.go` 的共同边界：绝对
  real regular file、非 symlink、最多 32 项、每条路径最多 4096、后缀限
  `.odflow/.js/.mjs`。热单实例 document transfer 进一步只允许 `.odflow` 并拒绝重复。
- `pkg/customui/machost/native_darwin.m` 和 Windows host bridge 只把原生 host 取得的
  文件路径送入受限私有 `fileDrop`；页面 JavaScript 不能伪造该事件或读取任意路径。
- 所有安装入口只安装并激活 Runner rescan，不运行 Flow。Runner 以稳定 install ID 显示、
  明确运行、重启发现和卸载；业务执行另建 Execution。
- `tests/runtime-api/flow-distribution.js` 只在运行时生成临时 OpenSSL Ed25519 key 并在
  `finally` 删除；不得恢复硬编码私钥。

## 剩余边界与结论

macOS 普通 Flow 的目标入口已收口：Finder/LaunchServices `.odflow` cold/hot、Runner
外部 `.odflow/.js/.mjs` drop、产品“安装 Flow…”三种文件、trust、安装不执行、Runner
刷新、明确运行、重启发现和卸载均有分层证据。最终 signed artifact 的 hash/signature、
cold/hot 与三种 drop 已精确复核；完整 picker/restart/uninstall 矩阵保留在 E7，未混写为
同一个最终 artifact run。

整体仍为 PARTIAL，而不是 Production PASS：Windows 当前只有 package/install
cross-build，没有目标系统 live；P1/P2 需要真实 License、device binding、Publisher key
lifecycle 与 activation service 授权，FLOW-13/14 保持 BLOCKED。并行 dirty checkout 的
`cmd/opendesk` 静态断言和 test-architecture audit 失败也保持原样，没有通过降断言掩盖。
