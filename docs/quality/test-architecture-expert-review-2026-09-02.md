---
title: 2026-09-02 test architecture expert review
description: OpenDesk 测试架构重构的 50 轮专家与反方审计、当前源码证据和最终评分。
order: 23
---

# 2026-09-02 test architecture expert review

本报告只接受当前源码产生的证据。统一入口是 `./scripts/validate_test_architecture.sh`；结果写入 `.runtime/tests/test-architecture/final/summary.json`，Runtime 子 gate 写入 `.runtime/tests/runtime-api/20260902-test-architecture-final/`。最终 `audit-before.json` 与 `audit-after.json` 的 source closure hash 必须一致，否则整个结论失效。

## 先给 `*_test.go` 处置结论

本轮主线不是“让一个大 gate 变绿”，而是逐文件判断迁移前 145 个 Go 测试资产。迁移 3 个纯
生成/可视化伪测试后，当前 142 个文件全部有唯一处置；逐文件表为每个文件记录
`privateAccess`、测试边界、外部依赖、断言价值和具体结论，不再只给路径、标签和单字母依据。

| 处置 | 数量 | 面向人的结论 |
| --- | ---: | --- |
| `KEEP_PACKAGE` | 85 | 仅私有算法、backend、状态机、并发/EventLoop、CLI/MCP/持久化或 native seam 的 Go 白盒继续同包。 |
| `MOVE_GO_BLACKBOX` | 29 | 只依赖 exported Go API 的 Browser、Container、Custom UI、execution、desktopvision、runtime、Scheduler、recorder、semanticexec、benchmark、operator、runtimeconfig 测试已移入顶层 `tests/` 外部 package。 |
| `SPLIT_JS_CONTRACT` | 14 | Go 文件只保留 native/private seam；每行都给出对应 `tests/runtime-api/unit/*.test.js`，公共行为以 JavaScript 为准。 |
| `MOVE_TOOL` | 3 | 两个 layout 输出文件合并为 image-layout-lab，一个 WeChat 可视化文件迁为 visualize-layout；旧 `_test.go` 已不存在。 |
| `OPT_IN_LIVE` | 2 | CoreAudio 设备枚举与 NSPasteboard metadata 读取默认 skip，只有显式环境变量才接触真实系统。 |
| `VENDOR_ONLY` | 4 | kbinani/RobotGo 位于嵌套上游 module，不进入根 `go test ./...` 成功率。 |
| `ARCHIVE_ONLY` | 8 | 同步历史副本只用于追溯，不恢复、不运行、不重复计分。 |

代表性判断不是一套模板：`automation/image_layout_test.go` 因直接断言私有 flood-fill/boundary
算法保留；`pkg/container/container_test.go` 虽只用 exported API，仍验证 Go ownership 而非 JS
surface；`automation/app_test.go` 把 fake backend、取消、分组与 EventLoop 留在 Go，同时把用户
可观察的 `App` 契约交给 JS；三个只有生成/看图职责的旧文件则真正移出 `go test`。

完整 145 行证据见 [Go 测试逐文件分类清单](go-test-file-classification.md)。审计会在任一逐文件
字段缺失、出现占位/重复判断、14 个 JS 路径不存在、迁移目标不匹配或 live opt-in 条件缺失时
失败。

## 被拒绝的旧验证

上一轮完整 validation 的 required commands 虽运行到 `audit-after`，但 source closure 从
`8f271e...` 漂移到 `50a6a7...`，`source-no-drift` 失败。该轮整体无效，本报告的 PASS 和评分
不得引用它；下表只接受完成逐文件文档后重新产生、且 before/after hash 一致的 final run。

## 实际验证矩阵

| 命令 | 结果 | 证据等级 | Evidence |
| --- | --- | --- | --- |
| `node scripts/audit_test_architecture.js` | PASS | 静态架构/完整清单 | `.runtime/tests/test-architecture/final/audit-after.json` |
| `./scripts/audit_repo_layout.sh` | PASS | 仓库布局与退役根输出路径 | `.runtime/tests/test-architecture/final/repo-layout.log` |
| `go test ./... -count=1` | PASS | 根模块 package | `.runtime/tests/test-architecture/final/go-test-root.log` |
| `go build -o .runtime/tests/test-architecture/final/bin/opendesk ./cmd/opendesk` | PASS | 当前源码本机 build | `.runtime/tests/test-architecture/final/bin/opendesk.sha256` |
| `./scripts/test_runtime_apis.sh smoke`（固定 run id） | PASS | 当前 run-local binary 的 JS contract/unit/smoke/negative/async cleanup | `.runtime/tests/runtime-api/20260902-test-architecture-final/` |
| `./scripts/test_runtime_apis.sh sound-cancel`（独立 run id） | PASS | 当前 run-local binary 的 SIGINT/native Sound teardown | `.runtime/tests/runtime-api/20260902-test-architecture-sound-cancel/sound-cancel/result.json` |
| 两个 Darwin live Go case 在无 opt-in 时运行 | PASS，均 SKIP | 默认 gate 不冒充 live | `.runtime/tests/test-architecture/final/go-test-live-default-skip.log` |
| `go run ./tests/automation/tools/image-layout-lab all ...` | PASS | 独立工具 | `.runtime/tests/test-architecture/final/tools/image-layout/` |
| `go build ./tests/wechat/tools/visualize-layout` + 越界输出探测 | PASS；越界以 2 拒绝 | 工具 compile + fail-closed | `.runtime/tests/test-architecture/final/tool-output-boundary.log` |
| Linux/Windows `go test -c ./pkg/nativeextension` | PASS | cross-compile/package-only | `.runtime/tests/test-architecture/final/bin/nativeextension-*` |
| `go test -tags opencv ./automation -run '^TestImageColorFindPosUsesOpenCVBackend$'` | PASS | 本机 tagged package | `.runtime/tests/test-architecture/final/opencv-tagged-package.log` |
| kbinani nested module compile | PASS | vendor compile-only | `.runtime/tests/test-architecture/final/vendor-kbinani-compile.log` |
| RobotGo nested module compile | PASS | `third_party/robotgo/go.mod` replace 到本仓库 macOS 13 兼容 screenshot 实现；vendor compile-only，不计根模块 PASS | `.runtime/tests/test-architecture/final/vendor-robotgo-compile.log` |
| `./scripts/test_runtime_apis.sh live/custom-ui/dialog` | 未运行 | live 未宣称 | 无 |

## 50 轮专家评审

每轮均记录当前结论、证据、可能反方意见、反方是否成立、修复/保留决定及评分影响。第 35、40、45、48、49、50 轮为强制反方审计。

| 轮次 / 角色 | 当前结论 | 支持证据 | 可能反方意见 | 是否成立 | 修复或保留决定 | 对评分影响 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Go package 架构专家 | package-private 测试应与 Go 实现同包 | 85 个 `KEEP_PACKAGE` 的逐行私有/native seam 证据；29 个 exported-only 测试已作为 `MOVE_GO_BLACKBOX` 迁出 | JS 背景意味着所有测试都应搬到 `tests/` | 不成立；会失去未导出 seam 与 Go test 语义 | 保留真正白盒测试；公开 Go 黑盒移到顶层 tests | 目录边界 +3 |
| 02 前端测试架构专家 | 用户可观察 Runtime 契约以 JS 为正式入口 | `tests/runtime-api/manifest.js:5-90`；unit runner 当前 PASS | Goja 测试用 Go 写更方便 | 不成立；方便不能替代用户语言边界 | 保留 JS-first catalog/unit | JS-first +3 |
| 03 后端测试架构专家 | backend fake、状态机、并发继续由 Go 断言 | `pkg/execution/*_test.go`、`pkg/scheduler/*_test.go` 根 gate PASS | 这些也可黑盒化 | 部分成立但会降低故障定位 | 保留白盒并另设 JS contract | Go 合理性 +2 |
| 04 JavaScript Runtime 专家 | 29 个 Runtime object catalog 与行为层可从 JS 校验 | `scripts/audit_test_architecture.js:122-134`；Runtime smoke PASS | 静态 catalog 不等于真实 Runtime | 成立 | 以真实 run-local JS smoke 作主证据，静态 audit 只作闭合检查 | JS-first +2 |
| 05 Goja/反射映射专家 | allowlist 是唯一通用反射公开入口 | `automation/runtime_hardening_test.go:18-45`；`goja-binding-model.md` | exported Go 方法可能被自动暴露 | 不成立；未知 type 不映射 | 保留 allowlist existence/no-leak Go seam | 映射 +2 |
| 06 API 设计专家 | 同步反射、显式注册、polyfill 三类 owner 已区分 | `runtime-api-development-workflow.md:13-27` | 所有 API 都放 polyfill 更统一 | 不成立；native 资源 owner 会被复制 | 保留 owner 决策表 | 映射 +1 |
| 07 生命周期与并发专家 | Runtime owner 必须 Cancel、Wait、计数并回 EventLoop | `automation/utils.go:184-272` | 只看总 workers 足够 | 不成立；分 owner 泄漏会被掩盖 | 保留总数与分项双重证据 | 映射 +1 |
| 08 macOS 原生自动化专家 | 真实设备/剪贴板测试必须显式 opt-in | `audio_backend_darwin_test.go:10-13`；`clipboard_rich_darwin_test.go:10-13` | 只读系统状态无副作用，可默认跑 | 不成立；仍依赖主机状态且可能泄露元数据 | 加环境变量 gate | 目录边界 +1 |
| 09 CI/CD 专家 | 单一验证脚本可重放核心验收并保存退出码 | `scripts/validate_test_architecture.sh`；final summary PASS | 本地脚本不等于 CI workflow | 部分成立 | 给可复制入口；不虚构远端 CI | 可复现 +1 |
| 10 文档维护专家 | docs/types/manifest 的每个 catalog link 都存在 | `audit-after.json` 的 `catalogDocsAndTypesExist=true` | 文件存在不等于内容一致 | 成立 | Runtime contract 继续校验 surface；人工矩阵校验语义 | 文档 +1 |
| 11 安全与权限专家 | destructive/system/live 方法不在普通 unit 中执行 | `tests/runtime-api/manifest.js:142-179` restricted map | contract-only 可能漏实现 | 部分成立 | surface 必测；危险行为留 dedicated live | 安全边界维持 |
| 12 可维护性专家 | 分类不是一次性文档，新增或空泛 `_test.go` 记录都会使 audit 失败 | `audit_test_architecture.js` 校验唯一性、五字段、占位/重复文本、J/MOVE/live 证据 | 固定计数和纯文档都可能脆弱 | 成立但有意 fail-closed | 新文件必须先读源并补具体判断；机器只拒绝缺失，不能代写判断 | 长期维护 +1 |
| 13 反方审计专家 | 迁移前 145 与当前 142 数量闭合 | 分类文档数量表及 audit PASS | 迁移旧文件已不存在，145 无法复算 | 部分成立 | 清单保留 3 个 MOVE_TOOL 旧路径，当前 find 复算 142 | 目录边界维持 |
| 14 Go package 架构专家 | 无 Test 函数的 helper 文件不等同伪测试 | `automation/test_output_test.go:11-37`、`layout_test_helpers_test.go` 被同包测试引用 | 文件名仍是 `_test.go` | 不成立；它们仅参与 test build 且提供 private helper | `KEEP_PACKAGE` | Go 合理性 +1 |
| 15 JavaScript Runtime 专家 | Page raw bridge 与 facade 是同一 owner 两层投影 | manifest `page` 与 `polyfills/000-page.js`；unit PASS | `page____Inject` 可能泄露成用户 API | 当前 contract 未发现泄露 | 保留内部名、不进 types/catalog | 映射 +1 |
| 16 Goja/反射映射专家 | `createJSMethodWrapper` 的 bytes/error/nested Page 投影由 Go seam 测 | `automation/utils_test.go`、`runtime_hardening_test.go` 根 gate PASS | 应全改成 JS | 不成立；这些是 wrapper 私有实现 | `KEEP_PACKAGE` | Go 合理性 +1 |
| 17 API 设计专家 | Sound 同时有 start 与 stop/stopAll/handle.stop | `manifest.js:76`；`unit/sound.test.js` PASS | Go 有方法不代表 JS 已暴露 | 反方原则成立，但本项有显式 `registerSound` 证据 | 保留显式注册和 JS 测试 | 映射 +1 |
| 18 生命周期与并发专家 | Sound wait callback 回 owner EventLoop，SIGINT 可释放阻塞播放且 teardown 计数可见 | `sound-cancel/result.json` + cleanup required fields `test_runtime_apis.sh:972-982` | 一次本机音频 smoke 不代表所有设备 | 成立 | 只声明本机取消链路通过 | 可复现 +1 |
| 19 API 设计专家 | Audio 是同步设备控制，不应伪造 start/stop | `manifest.js:77-80`；surface audit | “Audio” 名称意味着必须录制 | 不成立；当前文档未承诺录制 | 保留同步 API；若新增 stream 再纳入 lifecycle | 文档 +1 |
| 20 生命周期与并发专家 | Notifications 曾有 cleanup 假阴性，现已修复 | `utils.go:207-208,248-263`；新 Go test `runtime_hardening_test.go:120-130` | `AsyncCounts` 已计入，没必要修 | 不成立；分项 cleanup/IsZero 仍遗漏 | 同步修复 struct、event、shell gate | 映射 +2 |
| 21 前端测试架构专家 | Notify 全局 facade 与 Notifications namespace 职责不同 | `runtime-api-surface-audit.md`；两个 JS unit 文件 PASS | 两套名字是重复实现 | 不成立；一个 one-shot send，一个 interaction/query | 保留但文档明确 | 文档维持 |
| 22 后端测试架构专家 | Screen recording 返回可 stop session 且 execution 强制 finalize | `manifest.js:31-35`、`screen_capture_test.go` | namespace 没有 `stopRecording` 就不对称 | 不成立；stop 属于 session handle | 保留 handle 模型与 JS contract | 映射 +1 |
| 23 API 设计专家 | mouse/keyboard down 与 up 对称 | `manifest.js:13-14`；unit 做无副作用校验，mouse live 覆盖真实行为 | unit 曾移动真实指针，受并发用户输入影响 | 成立 | 移除 unit 的真实指针读写，保留既有 live JS 行为测试 | JS-first维持 |
| 24 macOS 原生自动化专家 | Window 操作均 one-shot；真实坐标/可见性另属 live | `manifest.js:24-30`；live suite 未运行 | unit PASS 不能证明窗口视觉 | 成立 | 明确 live 未验证并扣可复现分 | 可复现 -1 |
| 25 JavaScript Runtime 专家 | Vision/ImageColor 公共调用不再读取私有 backend identity | `image_color_opencv_test.js:29-40`；tagged Go test PASS | JS 无法证明用的是 OpenCV | 成立 | backend 用 tagged Go seam；JS 测公开结果 | 边界 +1 |
| 26 前端测试架构专家 | WeChat 可视化改用文档化 `Vision.annotateRegions` | `wechat_complete_test.js:116-147` | 该脚本仍需要真实微信 | 成立 | 归为领域 live JS，不计普通 unit | JS-first维持 |
| 27 文档维护专家 | 公开示例中的已知退役/未公开调用已清零 | audit forbidden call list `audit_test_architecture.js:143-161` | 规则只覆盖已知旧方法 | 成立 | 保留 fail-closed known-regression list，Runtime contract 负责 catalog | 文档 +1 |
| 28 Go package 架构专家 | image layout progressive tests有断言，不是生成器 | `automation/image_layout_progressive_test.go` 多级 separator asserts；输出 helper限制 `.runtime` | 它也生成 PNG，应全部搬走 | 不成立；PNG 是确定性输入/失败证据，测试有算法断言 | `KEEP_PACKAGE` | Go 合理性 +1 |
| 29 可维护性专家 | 纯生成/可视化职责已迁为独立命令 | `image-layout-lab/main.go:1-85`；`visualize-layout/main.go:1-59` | 新工具仍 import automation，像测试 | 不成立；它们是显式 main package 且不进 go test assertions | `MOVE_TOOL` | 目录边界 +2 |
| 30 安全与权限专家 | 工具拒绝 `.runtime` 外输出 | 两工具 `runtimeOutputDir`；越界探测 status 2 | symlink 仍可能逃逸 | 部分成立；当前是路径级防误写，不是安全 sandbox | 保留并在文档不声称 sandbox | 长期维护 +1 |
| 31 CI/CD 专家 | 根模块与 nested vendor 结果已分开 | root、kbinani、RobotGo compile 均 PASS；RobotGo 以显式 local replace 绑定兼容实现 | local replace 可能掩盖上游依赖漂移 | 成立；replace 在 nested `go.mod` 可审计，且 compile command 单列 | `VENDOR_ONLY`，不把 vendor live 混入根 gate | 可复现维持 |
| 32 文档维护专家 | developer test catalog 给出 root cwd 与直接/runner区别 | `developer-test-catalog.md`；workflow `:61-93` | `./dist/opendesk` 可能是旧 binary | 成立 | 当前验收用 run-local；公开命令未声称本轮通过 | 可复现 -1 |
| 33 安全与权限专家 | NativeExtensions 正常面 manifest-bound，unsafe V0 分 gate | `manifest.js:58-66`；JS native-extension unit PASS | 动态方法可能绕过 allowlist | 当前不成立；immutable manifest closure | 保留 Go security seam + JS contract | 安全维持 |
| 34 可维护性专家 | workflow 强制七处同步与证据等级 | `runtime-api-development-workflow.md:29-93` | 文档可能被忘记 | 成立 | audit + contract 机械化最小闭环 | 长期维护 +1 |
| 35 反方审计：测试仍与源码混合 | 85 个同包文件逐一说明 private/native seam 与 assertion value；29 个 exported-only 测试已迁至顶层 `tests/` | 145 行逐文件表；外部 package 检查；代表性 `image_layout_test.go`、`tests/execution/runner_test.go`、`process_driver_test.go` | 文件与源码同目录本身就是失败，或同包保留是机械行为 | 不成立；无私有 helper 依赖的候选已实际迁出，剩余逐行有具体 seam 理由 | 审计要求旧路径消失、目标是 external package | 目录边界满分成立 |
| 36 后端测试架构专家 | cmd/package tests访问 `package main` 内部函数有保留价值 | `cmd/opendesk/*_test.go`，含信号控制器测试 | CLI 可全用进程黑盒 | 部分成立 | 保留 unit seam，公开 CLI另行黑盒 | Go 合理性维持 |
| 37 Goja/反射映射专家 | browser Go tests保留内部容器状态，JS test负责 facade | `browser_compat_test.go` 标 J；browser/context unit PASS | 重复测试浪费 | 不成立；两个边界不同 | `SPLIT_JS_CONTRACT` | JS-first +1 |
| 38 API 设计专家 | Scheduler不是 Runtime global，不应强塞 JS catalog | `pkg/scheduler/service.go` Start/Close；scheduler docs | 核心目标列出 Scheduler，必须有 JS global | 不成立；目标要求检查，不要求制造 API | 保留服务/package tests及 inline fixture | 文档维持 |
| 39 CI/CD 专家 | Linux/Windows Native Extension仅标 compile-only | 两个 `go test -c` PASS | cross-compile 可称跨平台通过 | 不成立 | 报告坚持 package-only，无 live | 可复现维持 |
| 40 反方审计：JS 公共接口仍由 Go 测试代替 | 14 个 J 类逐行引用存在的 JS test；Go只保留 fake/backend/EventLoop seam | classification 的 JS 路径；manifest unitBehavior；Runtime smoke PASS | restricted 方法只有 contract，没有真实行为 | 部分成立但属安全分层，不是 Go 替代 | audit 强制 J 类 JS 路径存在；危险行为留 dedicated live | JS-first满分成立 |
| 41 文档维护专家 | archive 全量列出但排除当前质量 | audit report `archiveFileCount=302` 与完整 paths | 历史文件含测试，可能提高数量 | 不成立；A 类 8 个 Go tests不进 gate/得分 | `ARCHIVE_ONLY` | 目录边界 +1 |
| 42 后端测试架构专家 | third_party 4 个 Go tests单独分类 | 分类表末尾 V 类；两个 nested module compile 均单列 PASS | 根 `go test ./...` 看不到它们，可能漏风险 | 成立 | 显式运行并记录 vendor compile；RobotGo live 仍另行 opt-in | 可复现维持 |
| 43 Go package 架构专家 | OpenCV backend identity属于 private tagged seam | tagged package PASS；JS fixture调用公开方法 | tagged Go test可能依赖本机库 | 成立 | 标为本机 tagged package，不称通用跨平台 | Go 合理性维持 |
| 44 生命周期与并发专家 | source closure前后相同才接受测试结果 | `audit-before/after.json` + `source-no-drift.log` | dirty worktree无法证明源码 | 不成立；dirty可接受，闭包 hash锁定实际输入 | 保留 hash/no-drift gate | 可复现 +2 |
| 45 反方审计：仍有 `_test.go` 实际只是工具 | 扫到 4 个无 Test 函数文件，均为被引用 helper或 build-tag seam；输出型 3 个已迁 | 全清单 + `MOVE_TOOL` target + root PASS | `image_layout_progressive_test.go`生成 PNG也是工具 | 不成立；它有稳定算法断言，输出受 `.runtime` 限制 | 保留有断言者，迁移纯输出者 | 89 分 cap解除 |
| 46 安全与权限专家 | 所有持久测试输出路径锁在 `.runtime` | `test_output_test.go:18-35`、工具边界探测、`audit_repo_layout.sh` PASS | `t.TempDir()`不在仓库 `.runtime` | 不成立；它是 Go隔离临时目录，不是仓库持久 Evidence | 保留 t.TempDir，禁止仓库 root temp/artifacts | 79 分 cap解除 |
| 47 可维护性专家 | JS/tools/fixtures/archive路径都有机器清单 | `audit-after.json` 含 308 JS、27 tool roots、10 fixture roots、302 archive paths | 只有 JSON，不便人工看 | 部分成立 | catalog与质量文档给人工摘要，JSON保留全量 | 长期维护维持 |
| 48 反方审计：docs/types/allowlist/polyfill/实现/测试不一致 | Runtime contract + audit link检查 + API surface矩阵均通过；已修退役示例调用 | manifest、surface audit、Runtime smoke | 静态 grep无法证明参数语义 | 成立 | 参数/错误由 JS behavior tests；live语义不宣称 | 89 分 cap解除 |
| 49 反方审计：旧 binary/archive/vendor/live/命令污染证据 | run-local Runtime、run 目录隔离、Native Extension helper 每轮重建、binary hash、source no-drift；archive/vendor/live均单列 | `test_runtime_apis.sh` run-id validation/clean staging rebuild、final summary 与 Runtime context | 未原样执行每个公开 example；真实 live未跑 | 成立 | 修复固定 run id 复用旧 helper/fixture-ready；明确未通过项并扣 2 分 | 可复现 8/10 |
| 50 反方审计：95+ 结论缺乏证据 | 七分项均有文件/行、命令、退出码与 source hash；cap条件已逐项排除 | 本报告、final summary、classification、surface audit | 评分仍含专家判断 | 部分成立；长期维护项需判断 | 采用保守 98，不给 live/公开示例满分；若 source hash漂移则自动失效 | 最终 98/100 |

## 最终评分

| 评分项 | 满分 | 得分 | 证据与扣分 |
| --- | ---: | ---: | --- |
| 测试目录与源码边界 | 25 | 25 | 145 条逐文件五字段结论闭合；3 个伪测试迁移；live/vendor/archive 不混计 |
| JS-first 公共 API 测试 | 20 | 20 | Runtime catalog 与 unit/smoke 当前构建 PASS；J 类不以 Go 替代 JS |
| Go 内部测试保留合理性 | 15 | 15 | 85 个同包文件逐项说明 private/state/concurrency/backend/helper/native seam；29 个只依赖 exported Go API 的黑盒测试已迁至顶层 `tests/`；纯输出伪测试移出 |
| Go→Goja→JS 映射完整性 | 15 | 15 | allowlist、显式注册、raw bridge、polyfill、EventLoop 与 cleanup 全链路闭合 |
| 文档、类型、示例同步 | 10 | 10 | catalog docs/types link PASS；退役示例调用清零；新增 workflow/surface audit |
| 可复现测试命令与运行证据 | 10 | 8 | 当前 source closure/build/root/Runtime/cross/tool证据完整；未运行真实 live UI，未逐个原样运行所有公开 examples；RobotGo vendor compile 已由 nested local replace 恢复并单列 |
| 长期维护性 | 5 | 5 | 新增 JS audit 与统一 validation；新增文件/越界输出/source drift均 fail-closed |
| **总分** | **100** | **98** | 高于 95；没有触发 89/79 分上限条件 |

## 结论边界

真正通过：当前源码根模块 package、当前 run-local JavaScript contract/unit/smoke/negative/async cleanup、Sound SIGINT cancellation、本机 OpenCV tagged case、两个 Native Extension cross-compile、kbinani vendor compile、两个迁移工具的 build/run/output boundary。

只属于 compile/package：Linux/Windows Native Extension；kbinani nested module；OpenCV tagged Go package不是跨平台 live。

明确未执行：RobotGo 的鼠标、键盘、剪贴板和屏幕 upstream live 用例；真实 Runtime live、Custom UI、Dialog、音频设备、剪贴板 opt-in 以及所有公开 examples 的逐命令体验未在本轮执行，因此不得据此声称真实桌面视觉或权限已通过。
