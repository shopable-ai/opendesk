# P0｜Protected Package Foundation

## Status

```text
In progress
```

Implementation checkpoint 已写入 `master`，但本阶段仍缺本地编译、测试、CLI smoke 与最终集成收口证据。

## Goal

在不改变普通 JavaScript 直接运行体验的前提下，建立受保护 Recipe 的最小可信加载层：

```text
recipe.odpkg
→ package validation
→ publisher signature verification
→ entitlement verification
→ content-key resolution
→ in-memory AES-256-GCM decryption
→ existing pkg/execution.Run()
→ existing Goja
```

普通 `.js` 必须继续：

```text
recipe.js
→ direct/plain loading
→ existing pkg/execution.Run()
→ existing Goja
```

## Scope

P0 负责：

- `.odpkg` v1：固定 `manifest.json`、`payload.bin`、`signature.ed25519`。
- v1 只支持 `payloadType=javascript` 与 `entrypoint=main.js`。
- AES-256-GCM；每包独立随机 32-byte DEK；随机 nonce；raw manifest bytes 作为 AAD。
- Ed25519 publisher signature；签名 domain 与 package digest 范围固定。
- package/resource limits、unexpected entry、path traversal、duplicate JSON key 等 fail-closed 校验。
- `PlainScriptLoader` / `ProtectedPackageLoader` / file-backed source loader。
- `PublisherKeyProvider` / `LicenseVerifier` / `ContentKeyProvider` seam。
- production provider 不存在时明确 fail closed，不内置万能密钥。
- decrypted JavaScript 只进入现有 Execution，不创建第二套 Runtime。
- Protected Artifact Policy：不写 plaintext snapshot，不允许 `-save-last-script` 导出，不公开 plaintext hash。
- `package protect / inspect / verify` publisher-side 基础工具。
- direct `-script` 与 `ai run` 的最小 `.odpkg` 接入。

## Explicitly out of scope

- Device-bound License。
- Keychain / DPAPI 设备私钥。
- Online activation / License Server。
- 支付、订阅、商城。
- 多 Publisher Portal、复杂 PKI。
- Workflow IR、多语言 payload Runtime。
- JavaScript Crypto 公共 API。
- 第二套 Goja / Execution Runtime。

## Current implementation checkpoint

历史定位：

```text
38ba981f11a87dcdd059d106e1663c2aeb9fee99
feat: add protected recipe package P0 foundation
```

恢复时始终以当前 `master / HEAD` 为准。

## Remaining closure work

- 对新增 Go 文件执行 `gofmt`。
- 编译并修正真实 compiler error。
- 将 `ai run .odpkg` 从早期 root interception 尽量收敛到 `internal/aicli/runCommand` 的统一 source resolution。
- 检查 Direct `.odpkg` 是否还能进一步复用现有 `executeScript` 生命周期，避免长期保留重复 parser/request composition。
- 保证 protected caller 显式把 package digest 放入兼容 `ScriptHash`，从而阻止 Execution 自动计算 plaintext source hash。
- 保证 protected artifacts 的 `ScriptSnapshotPath` 在 emitter/summary 看到之前已经为空。
- 验证 `-save-last-script + .odpkg` 在导出前返回 `protected_source_export_denied`。
- 验证 HTTP/MCP/Scheduler 没有绕过统一安全边界；P0 不支持的 protected transport 明确 fail closed 或根本无 protected source input。
- 更新 `docs/api/ai-cli.md`，但只能记录最终实际通过的用户行为。

## Stable validation commands

先窄后宽：

```bash
go test ./pkg/scriptpackage
go test ./pkg/licensing
go test ./pkg/scriptloader
go test ./internal/protectedcli
go test ./internal/packagecli
go test ./internal/aicli
go test ./cmd/opendesk
go test ./pkg/execution/...

go build -o dist/opendesk ./cmd/opendesk
```

环境允许时再执行：

```bash
go test ./...
```

最终：

```bash
git diff --check
git status --short
```

## Plain JavaScript gates

必须真实验证：

```bash
./dist/opendesk -script .runtime/tests/protected-recipe-p0/plain.js -console-mode script
./dist/opendesk ai run .runtime/tests/protected-recipe-p0/plain.js
```

断言：

- 普通 `.js` 无 package / License / device identity 前置。
- `ai run` 的 input/env/timeout 语义不回归。
- 普通 `.js` 原有 snapshot 行为不被 protected policy 禁掉。
- protected routing 不截获 plain `.js`。

## Protected security gates

必须覆盖：

- AES-GCM round trip。
- payload bit flip / manifest tamper / wrong DEK / malformed nonce fail closed。
- signature bit flip / wrong public key fail closed。
- unsupported version、malformed ZIP、oversized/unexpected/traversal/duplicate entries fail closed。
- duplicate/unknown/trailing manifest JSON fail closed。
- invalid signature、license denied、content key unavailable 时 `pkg/execution.Run()` 调用次数为 0。
- injected providers 可以完成 `.odpkg → ScriptSource → existing pkg/execution.Run()`。

## Disclosure gate

测试源码使用不主动打印的固定 sentinel，例如：

```text
OPENDESK_PROTECTED_SOURCE_SENTINEL_P0_7F8A
```

运行 protected execution 后扫描文本 artifacts，断言 sentinel 与 plaintext source SHA-256 均不出现在：

- `stdout.log`
- `stderr.log`
- `events.ndjson`
- `summary.json`
- `agent_summary.json`
- `script_snapshot*`

Protected `ScriptHash` 的公开语义是 package digest，而不是 decrypted JavaScript hash。

## Package CLI gates

验证：

```text
package protect
→ source + publisher signing private key + DEK
→ .odpkg

package inspect
→ public manifest + package digest only

package verify
→ package structure + publisher signature only
```

若 `protect` 自动生成 DEK，必须要求显式 `--key-out`，使用严格文件权限保存给 Publisher；不得把 DEK 写入 `.odpkg`。

## Definition of Done

只有以下全部成立才能改为 `Completed`：

- package/parser/crypto/signature/loader tests 通过。
- protected zero-execution 与 disclosure tests 通过。
- `go build` 通过。
- ordinary `.js` direct 与 `ai run` 回归通过。
- `.odpkg` injected-provider 成功执行进入现有 Execution。
- production `.odpkg` 在没有可信 provider 时稳定 fail closed。
- protected snapshot / plaintext hash / `-save-last-script` 防护通过。
- package CLI smoke 通过。
- `docs/api/ai-cli.md` 与最终行为一致。
- `git diff --check` 通过。
- 无第二套 Runtime。

## On completion

更新本文件：

```text
Status: Completed
Final checkpoint: <commit>
Validated: <commands / evidence summary>
```

然后更新 [`STATUS.md`](STATUS.md)，把 Current stage 切换为 P1；下一阶段只读取 [`p1-device-bound-license.md`](p1-device-bound-license.md)，不要重新设计 P0。