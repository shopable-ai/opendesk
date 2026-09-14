# Protected Package 开发与测试指南

本文面向 OpenDesk Runtime 开发者、测试工程师和需要在本地验证 `.js` → `.odpkg` → authorized execution 闭环的维护者。

公开 CLI 参数和返回值以 [受保护包 CLI](../../api/protected-packages.md) 为准；安全边界与平台化密钥模型见 [Protected Package Security Model](../../architecture/execution/protected-package-security-model.md)；Publisher / 管理员密钥运维见 [Protected Package Publisher 与密钥运维](../../maintenance/protected-packages.md)。

## 1. 当前关键文件

当前实现和测试首先检查以下文件，不要另起一套重复链路：

```text
internal/packagecli/packagecli.go
internal/packagecli/packagecli_test.go

pkg/scriptpackage/
pkg/scriptloader/protected.go
pkg/scriptloader/loader.go

examples/protected-packages/basic.js
examples/protected-packages/parameterized.js
examples/protected-packages/native-ui.js
examples/protected-packages/README.md

tests/protected-packages/runtime-equivalence.js
tests/protected-packages/README.md

docs/api/protected-packages.md
docs/architecture/execution/protected-recipe-package.md
docs/architecture/execution/protected-package-security-model.md
```

`.odpkg` 当前是“单 JavaScript entrypoint 的受保护包”，不是完整桌面应用安装包。

## 2. 本地测试的目标

核心验证链路是：

```text
basic.js
    |
    +--> plain execution
    |        `--> business-result.json
    |
    +--> package protect
    |        `--> basic.odpkg
    |
    +--> package inspect / verify
    |
    +--> device / License authorization
    |
    +--> protected execution
    |        `--> business-result.json
    |
    `--> compare plain result == protected result
```

测试不能只验证“成功生成 `.odpkg`”，必须证明生成后的 package 能通过正式受保护加载链路真实运行，并且业务结果与明文脚本一致。

## 3. 第一步：直接运行明文 JavaScript

从仓库根目录执行：

```bash
./dist/opendesk \
  -script "$PWD/examples/protected-packages/basic.js" \
  -console-mode script
```

当前 `basic.js` 会写入一个确定性的 `business-result.json`，并输出：

```text
protected-package-basic:business-result-written
```

这个步骤确认业务脚本本身正常，不把 package / License 问题和业务脚本问题混在一起。

## 4. 当前推荐：运行完整 Protected Package 等价性测试

当前仓库已经存在正式共享测试：

```text
tests/protected-packages/runtime-equivalence.js
```

执行：

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/runtime-equivalence.js" \
  -console-mode script
```

这个测试由已经编译好的 OpenDesk Runtime 自己执行，不依赖 Node.js 作为测试 runner。

当前完整测试会自动完成：

```text
plain source execution
-> generate Publisher / License test identities
-> package protect
-> create License-required .odpkg
-> package inspect
-> package verify
-> device identity
-> license issue
-> license inspect / verify / install
-> protected package execution
-> compare business result
-> parameterized lane
-> native UI lane
-> disclosure / cleanup assertions
```

成功时应看到最终 PASS 输出；失败时以测试打印的 phase、command、stderr 和 evidence directory 为准定位问题。

## 5. 生成的 `.odpkg` 在哪里

完整测试会在以下根目录创建唯一 evidence directory：

```text
.runtime/tests/protected-packages/<Execution.id>/
```

其中 basic lane 的 package 形态为：

```text
.runtime/tests/protected-packages/<Execution.id>/packages/basic/basic.odpkg
```

测试开始时会打印本次 evidence directory。不要把某个历史 Execution ID 写死到脚本或文档中。

测试保留适合审阅的 encrypted package、public keys、safe JSON envelopes、execution logs 和 UI evidence；private signing keys、DEK、原始 `.odlicense`、临时安装状态和测试 device Keychain 必须按测试清理策略删除。

## 6. 手工生成 `.odpkg`

正式底层命令仍然是：

```text
./dist/opendesk package protect <script.js> -o <package.odpkg> ...
```

它保护的是一个 JavaScript entrypoint，不是把整个 OpenDesk App 打包。

当前 Publisher 级命令要求显式描述 package / product / publisher / key identity，并提供 Publisher signing key 与 content key 来源。示意：

```bash
mkdir -p .runtime/protected-demo

openssl genpkey \
  -algorithm ED25519 \
  -out .runtime/protected-demo/publisher-private.pem

./dist/opendesk package protect \
  examples/protected-packages/basic.js \
  -o .runtime/protected-demo/basic.odpkg \
  --package-id demo-basic \
  --product-id demo-basic \
  --publisher-id local-demo \
  --publisher-key-id local-demo-key \
  --content-key-id local-demo-dek \
  --signing-key .runtime/protected-demo/publisher-private.pem \
  --key-out .runtime/protected-demo/basic.content-key
```

这一步只证明 package 已生成。对于 `license.required: true` 的 package，不能把“生成成功”误认为“当前设备已经有权运行”。真实运行还必须完成当前正式 License / Entitlement 链路。

开发验证优先使用 `runtime-equivalence.js`，因为它会自动建立隔离的测试 Publisher、DEK、device identity 和 P1 License，并在执行后清理 secret material。

## 7. Package 生成后的检查

生成 `.odpkg` 后至少验证：

```bash
./dist/opendesk package inspect <package.odpkg>
```

以及使用对应 Publisher public key：

```bash
./dist/opendesk package verify \
  <package.odpkg> \
  --public-key <publisher-public-key-file>
```

`inspect` 只能用于读取公开 manifest / digest；`verify` 证明 package 与指定 Publisher public key 匹配。二者都不等于“当前设备已经获得运行授权”。

## 8. Protected Package 真实运行

完成当前正式授权链路后，受保护 package 使用与普通脚本一致的通用执行入口：

```bash
./dist/opendesk \
  -script "$PWD/path/to/basic.odpkg" \
  -console-mode script
```

也可以走支持 `.odpkg` 的 `ai run` 路径。

Runtime 必须遵守：

```text
verify package
-> verify authorization
-> resolve content key
-> decrypt in memory
-> existing ScriptSource
-> existing pkg/execution.Run()
```

不得为了测试方便增加一个会绕过 production License decision 的受保护包执行后门。

## 9. Plain / Protected 等价性验证

测试应分别保存并读取真实业务结果：

```text
plain/business-result.json
protected/business-result.json
```

比较业务字段，而不是仅比较 process exit code。

对于当前 `basic.js`，至少比较：

```text
schemaVersion
contract
values
weightedTotal
label
```

expected 不应由测试脚本绕过 Runtime 自己重新计算后冒充执行结果。

## 10. 明文泄露 Smoke Check

Protected Package 测试至少持续检查：

- `.odpkg` 存在且非空；
- package raw bytes 不等于原始 `.js`；
- `.odpkg` raw bytes 中不存在已知完整 source sentinel / marker；
- `package inspect` 不返回 payload plaintext；
- manifest 不包含 DEK；
- protected execution 不生成 decrypted `.js` snapshot；
- stdout / stderr / events / summary / artifact 中不出现受保护源码 marker；
- private signing key、DEK、License secret 不进入日志。

这证明的是“没有明显明文泄露回归”，不是证明管理员级攻击者永远无法观测进程内存中的明文。

## 11. 建议新增的快速 Basic Smoke Test

当前仓库还没有独立的：

```text
tests/protected-packages/basic-runtime-smoke.js
```

后续实现时建议增加，用于日常开发的无 UI 快速验证。

它应只完成：

```text
basic.js plain execution
-> real package protect
-> inspect / verify
-> isolated device + License authorization
-> real basic.odpkg execution
-> compare business result
-> plaintext disclosure assertions
-> secret cleanup
```

这个快速测试不得依赖：

```text
OCR
Screen Recording
Accessibility permission
Calculator
native dialog interaction
```

建议成功输出：

```text
[PROTECTED-PACKAGE-BASIC] passed
```

失败输出至少包含：

```text
phase
command
exit code
stderr
artifact directory
```

在该文件真正实现之前，不要在 README 或 CI 中把它写成已可执行测试。

## 12. 完整测试与快速测试的职责

| 测试 | 当前状态 | 用途 |
| --- | --- | --- |
| `tests/protected-packages/runtime-equivalence.js` | 已存在 | 完整 plain / protected、P1、parameterized、native UI、security / cleanup 资格测试 |
| `tests/protected-packages/basic-runtime-smoke.js` | 建议新增 | 无 UI 权限依赖的日常核心 `.odpkg` 快速测试 |

完整测试中的 native UI lane 可能需要 macOS Screen Recording、Accessibility 和 OCR 能力。相关权限失败不应被误判为 AES / package / basic protected-runtime 核心链路失败。

## 13. Go 层测试

修改 package / loader / CLI 后至少运行对应 Go tests，并在提交前运行全量测试：

```bash
go test ./...
```

如果只做快速定位，可以先运行涉及 `pkg/scriptpackage`、`pkg/scriptloader`、`internal/packagecli` 的真实 Go package tests，再回到 `go test ./...`。

不要根据文档猜不存在的 package path；以当前仓库 `go list ./...` / 实际目录为准。

## 14. 测试环境与生产环境隔离

测试可以临时生成：

- Publisher test signing key；
- License issuer test signing key；
- per-package test DEK；
- isolated device identity；
- temporary License / entitlement state。

但必须满足：

- 测试 secret 不复用生产 secret；
- 测试 secret 默认位于 `.runtime/` 等临时 evidence 范围；
- private key / DEK 不进入 Git；
- 测试结束按 owner 规则清理 private material；
- 保留的 review evidence 只包含安全的 public / encrypted / digest 信息。

## 15. 本地验收清单

一次完整的本地 Protected Package 验收至少回答：

1. plain `basic.js` 是否真实成功运行；
2. 是否真实生成 `basic.odpkg`；
3. `package inspect` 是否成功；
4. Publisher signature 是否验证成功；
5. 当前设备 / 隔离设备是否获得真实授权；
6. `basic.odpkg` 是否通过正式 Runtime 入口真实执行；
7. plain / protected business result 是否相同；
8. package / artifact 中是否未出现已知 plaintext source marker；
9. protected execution 是否没有 decrypted source snapshot；
10. private key / DEK / raw License 是否按测试策略清理。

只有生成 `.odpkg`，没有执行与行为比较，不算完整验收。
