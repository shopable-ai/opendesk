# Flow 多渠道安装资格矩阵

> 日期：2026-09-18  
> 状态：CURRENT_SOURCE_UPDATED / EXECUTION_EVIDENCE_INCOMPLETE  
> 本轮源码证据快照：`master @ a86dc7885744c0a6f9632b44d5d63d0c2e642740`（master 有并行写入，具体执行证据以下方 commit / run ID 为准）

本文件记录“多入口、单安装内核”本轮资格状态。它不把已有源码、历史截图或单元测试的存在自动换算成当前 PASS。

## 1. 资格目标

所有入口最终只负责取得 package / install intent 与 provenance：

```text
Web Marketplace ──────┐
In-App Marketplace ───┤
Double-click .odflow ──┤
Drag & Drop .odflow ───┤──► canonical Flow install owner
File Picker .odflow ───┤
CLI qualification ─────┘
                         ↓
                   .odflow verify
                         ↓
                  Publisher Trust
                         ↓
            Entitlement / Permission
                         ↓
                Transaction Install
                         ↓
                Local Flow Catalog
                         ↓
                    Flow Runner
                         ↓
                    USER RUN
                         ↓
                    Execution
```

必须始终成立：

```text
Discover / Purchase ≠ Install ≠ Run
```

安装入口不得调用 Flow 业务 JavaScript。

## 2. 当前 canonical owner 核验

当前源码职责收敛如下：

- `pkg/flowinstall.Service` 是正式 `.odflow` 安装安全内核。
- App Mode 的 picker / native drop / LaunchServices document path 都在 `cmd/opendesk/app_mode.go` 中复用同一个 product `flowinstall.Service`，最终进入同一 `Install` / `InstallScript` 边界。
- cold / hot document forwarding 复用同一安装闭包；安装成功后只激活 Flow Runner 刷新，不创建业务 Execution。
- `pkg/flowmarketplace.Installer.InstallURL` 负责 Marketplace 特有的 Install Intent、canonical Release、local confirmation、Marketplace entitlement、artifact download / digest / identity，然后委派 `FlowService.Install`；它不拥有第二套 package verifier / trust store / transaction installer。
- Marketplace attestation 只证明 Release identity；当前实现显式清空 `AuthorityProof`，不能把 Marketplace Verified 转换成 Local Publisher Trust。

当前仍存在两个产品接线缺口：

1. Web Marketplace 的 `opendesk://install/flow/...` OS protocol registration / openURL delivery / hot single-instance URL forwarding 尚未接到正式 App Mode。
2. In-App Marketplace 目前只有 HTML prototype 与 Marketplace package foundation，没有 Native/Product Marketplace 产品入口。

因此这两项不能为了矩阵全绿而写成 PASS。

## 3. 本轮统一测试 Flow

正式 Runtime qualification 与 Marketplace test backend 复用同一个非秘密业务 payload：

```text
tests/fixtures/flow-install-test/
├── main.js
└── assets/value.txt
```

每次资格运行再用临时 Ed25519 key 生成并签名隔离 `.odflow`：

```text
Flow ID: opendesk-install-test
Name: OpenDesk Install Test
Version: 1.0.0
Publisher: opendesk-install-test-publisher
```

Runtime 测试 package 输出到 `.runtime/tests/runtime-api/**` 下的中文、空格、深目录路径，不提交私钥或运行产物。Marketplace package test 同样读取该 payload，但使用测试进程自己的临时签名 key 与 loopback `httptest.Server`。

业务代码只有在显式 Run 时才写：

```text
install-test.marker
result.json
run.json
```

固定 marker 内容：

```text
OpenDesk Install Test: explicit run succeeded
```

测试必须证明：

```text
pack / verify 后 marker 不存在
→ install 前 marker 不存在
→ install 后 marker 不存在
→ 同 artifact 幂等重装后 marker 仍不存在
→ explicit flow run 后 marker / result 才出现
```

## 4. 本轮真实资格矩阵

状态只使用 `PASS / FAIL / BLOCKED / NOT_RUN`。  
这里的“Entry reached / Native evidence”表示本轮当前基线的实际执行证据，不表示源码中是否存在对应函数。

| Channel | Entry reached | Confirmation shown | Verify | Trust | Install | Catalog | Autorun = 0 | Explicit Run | Native evidence | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| File Picker | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Drag & Drop | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Double-click cold start | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Double-click hot / single instance | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Web Marketplace → OpenDesk | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| In-App Marketplace | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| CLI qualification | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NOT_RUN | PASS |

## 4.1 本轮已经实际执行的非 Native 检查

这些结果来自本轮直接读取当前仓库文件并实际执行，不是“文件存在即通过”：

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| Marketplace prototype model / 静态合同 | PASS | 最终 v1.1 HTML blob `2a1426b9...` + test blob `bb5f92f9...`，29 / 29 实际执行通过 |
| 帮助区桌面贴底 | PASS | 分类导航承担 `margin-bottom:auto`；帮助区自身不承担定位 margin |
| 帮助区自身四周 `margin = 0` | PASS | desktop / mobile 静态合同均实际执行通过 |
| 去独立 Card | PASS | `border-radius:0`、transparent、仅 top divider |
| 18px icon +「第一次使用？」同行 | PASS | v1.1 静态合同通过 |
| 固定两句文案 +「查看安装指南 →」 | PASS | v1.1 静态合同通过 |
| 窄屏 compact row 且非 fixed | PASS | v1.1 静态合同通过 |
| Prototype：Marketplace Verified ≠ Local Trust | PASS | model 行为测试通过 |
| Prototype：Flow-scoped 为默认 Trust | PASS | model 行为测试通过 |
| Prototype：Publisher-wide 需要额外 consent | PASS | model 行为测试通过 |
| Prototype：Purchase ≠ Install | PASS | model 行为测试通过 |
| Prototype：Install ≠ Run | PASS | model 行为测试通过 |
| Prototype：Cancel 零 Catalog / Trust 写入 | PASS | model 行为测试通过 |
| Prototype：transaction failure 保留旧状态 | PASS | model 行为测试通过 |
| ID-only Install Intent | PASS | model 行为测试通过 |
| Runtime Flow JS / shared fixture 语法 | PASS | `flow-distribution.js` 与 fixture 均完成解析；这不是 Runtime 行为 PASS |

Chromium v1.1 smoke 已在 Flow Commercial Qualification run `35300159654` 的 `Marketplace prototype` job 实际 PASS；29 项 Node model/静态合同与 Chromium smoke 均通过，并上传 `marketplace-prototype-evidence`。该证据仍不等于 Native OpenDesk / OS Deep Link。

## 4.2 GitHub Actions 已取得与待取得证据

Flow Commercial run `35300159654` 已实际执行当前 Flow 资格：

- Linux portable owners：PASS，包含 `flowpackage / flowinstall / flowmarketplace / appdata / execution / flowcli / packagecli`。
- Marketplace prototype：PASS，29 项 Node model/静态合同 + Chromium smoke 全部通过。
- macOS Runtime：PASS，包括 Marketplace vertical slice、当前 build、B0 direct/formal、`flow-distribution.js`、B1 direct/formal。
- 因此当前 shared fixture 的真实 macOS CLI 链路已经证明：签名包安装前后业务 marker 为零、幂等重装零执行、Catalog identity 正确、显式 Run 后 marker/result 才出现、中文/空格/深目录 package path 可工作。
- Windows Runtime：Marketplace vertical slice PASS、Windows distribution build PASS、B0 direct Runtime PASS；B0 formal Runtime gate FAIL，失败点是通用 Runtime API gate 仍调用 Unix `/bin/test` 检查 run-local binary，错误为 `START_FAILED`。该失败发生在 Flow 行为断言之前，不应解释成 Flow install FAIL。

Windows Core run `35300333899` 还存在 Recorder bundle / test-architecture audit 的独立失败；这不属于本 Flow 多渠道安装根因，不能为了本任务扩大成无关重构。

当前仍待本地/后续 CI 完成：

- Windows formal Runtime gate 的跨平台 harness 修复，随后实际运行 Windows `flow-distribution.js` / B1。
- macOS Native picker / drag-drop / double-click cold-hot 实窗证据。
- Web `opendesk://` product wiring 与 In-App Marketplace 产品接线仍是明确 IMPLEMENTATION GAP。

### 为什么本轮 Native 项不是 PASS

`docs/quality/flow-distribution-qualification.md` 保存过较早基线的 macOS Finder / picker / drop / cold-hot / explicit-run 实窗证据。那是有价值的回归参考，但不是本轮当前 `master` 的新执行证据，因此本表不继承其 PASS。

本轮仓库写入环境没有可运行的用户 macOS checkout、`dist/OpenDesk.app`、WindowServer / Finder 交互或当前 `.runtime/` 证据目录。不能用 GitHub 源码读取或 Go test 源码存在替代 OS / Native 资格。

## 5. 已写入但尚待执行的正式测试

### Runtime / CLI

`tests/runtime-api/flow-distribution.js` 当前覆盖：

- 正式 `flow pack / inspect / verify`；
- 未知 Publisher 不经明确 Trust 不安装；
- `--trust-flow` 安装；
- 安装完成业务 marker/result 为零；
- 同 artifact 重复安装必须幂等且仍为零执行；
- Catalog name / version / publisher；
- 显式 `flow run` 后固定 marker/result 出现；
- alternate cwd 下运行仍绑定 installed `Flow.root / Flow.dataDir`；
- uninstall + remove-data；
- 普通本地 JavaScript import 同样保持 Install ≠ Run；
- package 路径包含中文、空格、深目录。

从仓库根目录进行 macOS 当前构建资格时，可直接执行：

```bash
OPENDESK_RUNTIME_API_BINARY="$PWD/dist/opendesk" OPENDESK_RUNTIME_API_RUN_DIR="$PWD/.runtime/tests/flow-install-channels/cli" ./dist/opendesk -script tests/runtime-api/flow-distribution.js -console-mode script
```

正式执行结果写入：

```text
.runtime/tests/flow-install-channels/cli/results/flow.json
```

### Marketplace test backend

`pkg/flowmarketplace/marketplace_test.go` 使用 `httptest.Server`，它是 **test backend**，不是 Production Marketplace。

当前测试源码覆盖：

- ID-only deep link；
- canonical Install Intent / Release；
- Release attestation；
- 真实 HTTP artifact bytes；
- artifact digest；
- 真实签名 `.odflow`；
- Marketplace Verified 不绕过 Local Trust；
- entitlement deny 在 artifact download 前停止；
- invalid publisher signature 不安装；
- Marketplace local install confirmation cancel 后不下载、不写 Catalog、不写 Trust；
- canonical side-load installer 的 Trust cancel 也必须保持 Catalog / Trust / business marker 零变化（`TestInstallCancelLeavesCatalogTrustAndBusinessEffectsUntouched`）；
- side-load 与 Marketplace 对同一 artifact 收敛到同一个 Catalog `installId`；
- Marketplace 只追加 provenance，不复制 install owner。

Marketplace vertical slice 的上一版同源测试已在 Flow Commercial run `35297242961` 的 macOS 与 Windows runner 实际 PASS；当前源码新增了“安装后 marker/result/run.json 必须不存在”的业务结果级断言，这部分的新 run 尚未完成。因此第 4 节真实 Web / In-App Channel 仍不能写 PASS，也不能把 test backend 描述成 Production Marketplace。

## 6. 场景状态

| # | 场景 | 当前状态 |
| ---: | --- | --- |
| 1 | picker 正常安装 | NOT_RUN |
| 2 | drag/drop 正常安装 | NOT_RUN |
| 3 | double-click cold start | NOT_RUN |
| 4 | double-click hot start / single instance | NOT_RUN |
| 5 | Marketplace Install Intent 安装 | BLOCKED |
| 6 | 同一 Flow 不同入口产生一致 Catalog identity | PASS |
| 7 | 安装成功后业务零执行 | PASS |
| 8 | 显式 Run 后业务才执行 | PASS |
| 9 | 用户取消安装 → Catalog 无新增 | PASS |
| 10 | 未知 Publisher → 真实 Trust 决策 | PASS |
| 11 | Flow scope trust 不升级为 Publisher-wide | PASS |
| 12 | Publisher-wide trust 需要明确选择 | NOT_RUN |
| 13 | 签名损坏 → 失败且零执行 | PASS |
| 14 | Manifest / inventory 损坏 → 失败 | PASS |
| 15 | 平台 / Runtime 不兼容 → 阻止 | PASS |
| 16 | 同版本同 artifact 重复安装 | PASS |
| 17 | 同版本不同 artifact → 拒绝 | PASS |
| 18 | 事务失败无 ready 半安装 | PASS |
| 19 | 中文 / 空格 / 深目录路径 | PASS |
| 20 | 重启后仍可发现 | NOT_RUN |
| 21 | Runner 显示名称 / 版本 / Publisher | NOT_RUN |
| 22 | 移除测试 Flow 不破坏其他 Flow / Trust / entitlement | PASS |
| 23 | Browser 只控制 flowId / releaseId / intentId | PASS |
| 24 | canonical Release identity mismatch → 拒绝 | PASS |
| 25 | artifact digest mismatch → 拒绝 | PASS |
| 26 | Marketplace Verified ≠ Local Publisher Trust | PASS |
| 27 | Marketplace test backend 安装仍不自动 Run | PASS |

`BLOCKED` 的含义是对应产品 Channel 尚缺当前正式入口；`NOT_RUN` 表示已有可执行测试/实现基础，但本轮没有取得当前基线的真实执行证据。

## 7. Native / OS 资格执行合同

Native 验收必须使用当前构建并把证据写入：

```text
.runtime/tests/flow-install-channels/<run>/
```

每个入口至少保存：

```text
before/catalog.json
before/marker-state.json
screens/confirm.png
after-install/catalog.json
after-install/marker-state.json
screens/runner-installed-not-run.png
after-run/result.json
screens/runner-run-result.png
app.log
provenance.json
```

cold / hot double-click 还必须保存当前 App bundle hash、PID / executable path 与单实例证据。

只有真正完成 Native 操作并核对这些业务状态以后，才能把第 4 节对应单元从 `NOT_RUN` 改为 `PASS`。

## 8. Production Gap

### Web Marketplace

当前缺：

- Production Marketplace HTTPS API / Install Intent backend；
- production attestation root 配置；
- macOS URL scheme registration + openURL delivery；
- Windows protocol registration；
- hot single-instance Deep Link forwarding；
- 正式 Marketplace local confirmation UI；
- Desktop account / entitlement adapter。

现有 `httptest.Server` 只能证明 Desktop 协议 vertical slice，不能写成 Production Marketplace 已上线。

### In-App Marketplace

当前 HTML 位于：

```text
apps/opendesk/prototypes/marketplace/
```

它是可交互 UI Oracle，不是 Native/Product integration。不得为了 PASS 新建第二套 Marketplace installer；未来产品接线必须复用 `flowmarketplace.Installer → flowinstall.Service`。

## 9. 本轮完成边界

本轮已经把 Marketplace v1.1 帮助区、正式 Runtime 测试 Flow 以及 Marketplace 同 owner / cancel 合同写入仓库。

本轮尚未取得：

- v1.1 Chromium DOM / 截图证据：已 PASS（Flow Commercial run `35300159654`）；
- macOS Runtime distribution gate 已 PASS；Windows formal catalog gate 仍因 Unix-only `/bin/test` harness 失败，Windows Flow direct/distribution 需在修复后补跑；
- 当前 macOS Native picker / drop / double-click cold-hot 截图与业务状态；
- Windows live 原生证据；
- Web Deep Link 产品接线；
- In-App Marketplace 产品接线。

这些项目保持 `NOT_RUN` 或 `BLOCKED`，不通过历史结果、Mock 或源码存在改写成 PASS。
