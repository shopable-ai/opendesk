# Protected Package 开发与测试指南

本文面向 OpenDesk Runtime 开发者、测试工程师和需要在本地验证 `.js` → `.odpkg` → authorized execution 闭环的维护者。

公开 CLI 参数和返回值以 [受保护包 CLI](../../api/protected-packages.md) 为准；安全边界与平台化密钥模型见 [Protected Package Security Model](../../architecture/execution/protected-package-security-model.md)；Publisher / 管理员密钥运维见 [Protected Package Publisher 与密钥运维](../../maintenance/protected-packages.md)。

## 1. 当前关键文件

开发和测试首先检查这些真实文件：

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

tests/protected-packages/basic-runtime-smoke.js
tests/protected-packages/runtime-equivalence.js
tests/protected-packages/KEYS.md
tests/protected-packages/README.md

docs/api/protected-packages.md
docs/architecture/execution/protected-recipe-package.md
docs/architecture/execution/protected-package-security-model.md
```

`.odpkg` 当前是“单 JavaScript entrypoint 的受保护包”，不是完整桌面应用安装包。

## 2. 开发者首先运行什么

普通开发验证优先运行快速 Basic Smoke Test：

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" \
  -console-mode script
```

它只验证 Protected Package 核心闭环，不依赖 Screen Recording、Accessibility、OCR、Calculator 或 native dialog：

```text
examples/protected-packages/basic.js
    ↓
plain execution
    ↓
generate ephemeral Publisher keypair
    ↓
generate separate ephemeral License issuer keypair
    ↓
create isolated device identity
    ↓
package protect --key-out
    ↓
per-package random 256-bit DEK
    ↓
package inspect / package verify
    ↓
P1 license issue / inspect / verify / install
    ↓
remove Publisher-side DEK + raw .odlicense
    ↓
run generated basic.odpkg
    ↓
plain/protected business-result.json exact comparison
    ↓
source disclosure checks
    ↓
secret cleanup
```

成功时输出：

```text
[PROTECTED-PACKAGE-BASIC] passed {...}
```

失败会带上 phase 和 evidence directory，优先查看：

```text
.runtime/tests/protected-packages-basic/<Execution.id>/basic-runtime-smoke-summary.json
```

当前这个 P1 live smoke 使用 production macOS Keychain device provider，并通过专用临时 Keychain 隔离测试设备私钥，因此当前真实快速测试要求 macOS。它不要求 UI 权限。Windows 的 protected-package unit/cross-build 验证不能冒充 Windows 真机 P1 smoke；Windows live fixture 需要单独资格化。

## 3. 第一步：单独运行明文 basic.js

也可以先独立确认示例本身正常：

```bash
./dist/opendesk \
  -script "$PWD/examples/protected-packages/basic.js" \
  -console-mode script
```

`basic.js` 会生成确定性的：

```text
business-result.json
```

并输出类似：

```text
protected-package-basic:business-result-written token=ODPKG-BASIC-VERIFY-4C91A7E2 total=136
```

其中 `verificationToken` 是固定的随机样式测试值，目的是让开发者肉眼确认 plain/protected 两次拿到的是同一业务 payload；它不能使用真正随机值，否则 exact equivalence 会失去意义。

`basic.js` 还包含一个 source-only sentinel：

```text
OPENDESK_PROTECTED_SOURCE_SENTINEL_7A4F19C2D86E31B5
```

这个 sentinel 只存在于源码，不写入业务结果，也不打印到日志。Smoke Test 用它检查 `.odpkg` 和 protected execution text artifacts 中没有直接出现源码明文。

## 4. 测试密钥在哪里

仓库**不提交可复用 private test key 或静态 AES key**。

原因不是缺少测试材料，而是测试本身必须证明 key generation、key separation、DEK generation 和 cleanup 都真实工作。

快速测试每次运行自动生成：

```text
Publisher Ed25519 keypair
License issuer Ed25519 keypair（与 Publisher 完全分离）
per-package random 256-bit DEK
production P1 device identity
```

本次运行期间可以在以下位置看到文件：

```text
.runtime/tests/protected-packages-basic/<Execution.id>/
├── keys/
│   ├── publisher-private.pem          # 临时；结束删除
│   ├── publisher-public.pem           # 安全证据；保留
│   ├── license-issuer-private.pem     # 临时；结束删除
│   └── license-issuer-public.pem      # 安全证据；保留
├── package/
│   ├── basic.odpkg                    # 加密包；保留
│   ├── basic.content-key              # 临时 DEK；protected run 前删除
│   └── basic.odlicense                # 原始 test License；protected run 前删除
├── device-public.json                 # public identity；保留
├── installed-p1/                      # 临时 installed state；结束删除
└── p1-device.keychain-db              # 临时 macOS Keychain；结束删除
```

关键要求：

```text
Publisher private key != License issuer private key
每个 package 使用新的 DEK
DEK 不进入 .odpkg / manifest / log
protected Runtime 启动前删除 Publisher-side DEK
protected Runtime 启动前删除 raw .odlicense
Runtime 只能依赖安装后的正式 P1 provider chain
```

完整密钥说明、手工 throwaway key generation 命令和生产边界见：

```text
tests/protected-packages/KEYS.md
```

## 5. Basic Smoke Test 生成的 `.odpkg` 在哪里

快速测试保留真实生成的包：

```text
.runtime/tests/protected-packages-basic/<Execution.id>/package/basic.odpkg
```

测试开始和最终 PASS 输出都会打印本次 `runDir` / `packagePath`。

不要把历史 Execution ID 写死到脚本、README 或 CI。

## 6. Smoke Test 实际验证什么

它不是“调用 encrypt helper 看能不能 round trip”，而是真正调用当前公开 CLI / Runtime：

```text
package protect
package inspect
package verify
license device
license issue
license inspect
license verify
license install
opendesk -script basic.odpkg
```

而且在执行 protected package 之前主动删除：

```text
basic.content-key
basic.odlicense
```

所以如果 Runtime 偷偷依赖 Publisher 侧 raw DEK / raw License，Smoke Test 会直接失败。

Plain 和 protected 两次分别读取真实：

```text
lanes/plain/business-result.json
lanes/protected/business-result.json
```

最终执行 exact JSON equality，而不是只看 process exit code。

## 7. 明文泄露检查

快速测试至少断言：

- `.odpkg` 存在且非空；
- source `.js` 与 `.odpkg` SHA-256 不同；
- `.odpkg` 的 printable strings 中不存在 source-only sentinel；
- `package protect / inspect / verify` 的公开 JSON envelope 不包含 sentinel；
- protected execution 不创建 `script_snapshot`；
- protected `summary.json` 不声明 `scriptSnapshotPath`；
- protected stdout / stderr 不包含 sentinel；
- protected JSON / NDJSON / log / txt artifacts 不包含 sentinel；
- Publisher private key、License issuer private key、DEK、raw License 不作为保留证据留下。

这证明的是“没有明显的 plaintext disclosure regression”。它不等于宣称管理员级攻击者绝对无法调试 Runtime 或读取成功解密后的进程内存。

## 8. 手工生成 `.odpkg`

如果开发者需要单步检查，可以手工创建 throwaway Publisher key：

```bash
mkdir -p .runtime/protected-demo/keys

openssl genpkey \
  -algorithm ED25519 \
  -out .runtime/protected-demo/keys/publisher-private.pem

openssl pkey \
  -in .runtime/protected-demo/keys/publisher-private.pem \
  -pubout \
  -out .runtime/protected-demo/keys/publisher-public.pem
```

然后：

```bash
./dist/opendesk package protect \
  examples/protected-packages/basic.js \
  -o .runtime/protected-demo/basic.odpkg \
  --package-id demo-basic \
  --product-id demo-basic \
  --publisher-id local-demo \
  --publisher-key-id local-demo-key \
  --content-key-id local-demo-dek \
  --signing-key .runtime/protected-demo/keys/publisher-private.pem \
  --key-out .runtime/protected-demo/basic.content-key
```

检查：

```bash
./dist/opendesk package inspect .runtime/protected-demo/basic.odpkg

./dist/opendesk package verify \
  .runtime/protected-demo/basic.odpkg \
  --public-key .runtime/protected-demo/keys/publisher-public.pem
```

这只证明 package 已生成并且 Publisher signature 正确；对默认 `license.required: true` 的 package，仍然不等于当前设备已经获得执行授权。

如果目标是验证“真正可运行”，不要手工拼一堆 P1 参数，优先使用 `basic-runtime-smoke.js`。

## 9. 完整 Runtime Equivalence Test

发布前 / 资格验证再运行：

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/runtime-equivalence.js" \
  -console-mode script
```

完整测试在基础 protected-runtime 闭环之外还验证：

```text
parameterized ai run --input-file
native UI semantic behavior
window geometry
screenshot
Apple OCR-visible layout
security / cleanup assertions
```

完整测试 evidence 根目录：

```text
.runtime/tests/protected-packages/<Execution.id>/
```

因为含 native UI lane，它还要求 macOS Screen Recording、Accessibility 和 Apple OCR capability。UI 权限失败不应被误判为 AES / package / P1 basic-runtime 核心失败；先运行 Basic Smoke Test 分层定位。

## 10. 测试层级

| 层级 | 当前入口 | 用途 |
| --- | --- | --- |
| Go unit / integration | `go test ./...` | crypto、parser、loader、CLI、License 等代码级回归 |
| Basic Runtime Smoke | `tests/protected-packages/basic-runtime-smoke.js` | 无 UI 依赖的 `.js → .odpkg → P1 → protected Runtime → exact compare` |
| Full Qualification | `tests/protected-packages/runtime-equivalence.js` | parameterized + native UI + OCR/geometry + security cleanup 完整资格测试 |

修改 package / loader / CLI 后至少运行对应 Go tests，并在提交前运行：

```bash
go test ./...
```

不要根据文档猜不存在的 Go package path；以当前仓库 `go list ./...` / 实际目录为准。

## 11. 测试环境与生产环境隔离

测试 secret 必须：

- 每次重新生成；
- 不复用 production Publisher / License issuer credentials；
- 只位于 `.runtime/` 临时测试范围；
- private key / DEK 不进入 Git；
- private key / DEK 不打印内容；
- raw License / DEK 在 protected Runtime 之前删除；
- 测试结束删除 private material 和 installed test state；
- 只保留 public key、public identity、encrypted package、digest、safe envelope 与业务结果等安全证据。

生产 Publisher / License issuer key 管理见 `docs/maintenance/protected-packages.md`，不要把本地测试 key policy 直接当成生产 KMS/HSM 策略。

## 12. 本地验收清单

一次 Basic Smoke 验收至少必须回答：

1. plain `basic.js` 是否真实运行成功；
2. Publisher / License issuer 是否生成了两套独立临时 signing key；
3. `package protect --key-out` 是否真实生成新的 per-package DEK；
4. 是否真实生成 `basic.odpkg`；
5. `package inspect` 是否成功；
6. Publisher signature 是否验证成功；
7. isolated device / P1 License 是否完成 issue / verify / install；
8. Publisher raw DEK 和 raw License 是否在 protected Runtime 前删除；
9. `basic.odpkg` 是否通过正式 `-script` Runtime 入口真实执行；
10. plain / protected `business-result.json` 是否 exact equal；
11. `.odpkg` / protected artifacts 中是否没有 source-only sentinel；
12. protected execution 是否没有 decrypted source snapshot；
13. private key / DEK / raw License / installed test state 是否按策略清理。

只有生成 `.odpkg`，没有授权、真实执行与行为比较，不算完整验收。
