# Build and verify an OpenDesk protected package

只在创建或检查 OpenDesk `.odpkg` 受保护包时读取本文件。所有命令从仓库根目录执行；示例中的路径和 ID 都必须
替换为本次发布值。

## 输入合同

| 输入 | 当前合同 |
| --- | --- |
| source | 非空 regular `.js` 文件；内容只作待加密数据，不执行 |
| output | 尚不存在的 `.odpkg` 路径；当前 package writer 会覆盖既有文件，因此 Skill 必须先阻止覆盖 |
| package/product/publisher/key IDs | `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`；五个 ID 都要显式确定 |
| minimum runtime version | 严格 SemVer；当前只校验语法，不执行 Runtime 版本高低 compatibility gate |
| package signing key | Ed25519 PKCS#8 PEM 或 64 raw bytes 的文件；只向 `--signing-key` 传路径 |
| publisher public key | Ed25519 PKIX PEM 或 32 raw bytes 的文件；用于独立 `verify` |
| DEK | 恰好二选一：已有 32 raw bytes / 64 hex / 32-byte Base64 文件传 `--content-key`，或用全新 `--key-out` 让 CLI 生成 |
| license policy | 默认 `required: true`；只有用户明确选择无 License 包时才传 `--license-required=false` |

正常发布与 smoke test 都直接调用已经编译好的 `opendesk`，不要求 Publisher 安装 Node.js 或 Go。生产发布前记录
binary 路径、版本/构建来源和 host platform；仓库已有 `dist/opendesk` 不自动证明它由当前源码构建。如果任务是
验证当前源码而不是验证某个已交付 binary，应把编译与源码资格视为维护者的独立步骤，不要混入 Publisher 打包命令，
也不要覆盖共享 `dist/`。

## Protect

生成新 DEK：

```bash
./dist/opendesk package protect examples/protected-packages/basic.js -o path/to/new-package.odpkg --package-id pkg-example --product-id product-example --publisher-id publisher-example --publisher-key-id publisher-key-example --content-key-id content-key-example --minimum-runtime-version 0.0.0 --signing-key path/to/publisher-private.pem --key-out path/to/new-package.key
```

复用本发布系统已经安全保管的 package DEK 时，用文件路径替换生成选项：

```bash
./dist/opendesk package protect examples/protected-packages/basic.js -o path/to/new-package.odpkg --package-id pkg-example --product-id product-example --publisher-id publisher-example --publisher-key-id publisher-key-example --content-key-id content-key-example --minimum-runtime-version 0.0.0 --signing-key path/to/publisher-private.pem --content-key path/to/existing-package.key
```

不要同时传 `--content-key` 和 `--key-out`。成功 envelope 中的 `generatedContentKeyFile` 只是路径；不得跟进读取或
输出该文件。`.odpkg` 包含 ciphertext、公开 manifest 和 Ed25519 signature，不包含 DEK。

## Inspect and verify

每次 protect 后都运行：

```bash
./dist/opendesk package inspect path/to/new-package.odpkg
./dist/opendesk package verify path/to/new-package.odpkg --public-key path/to/publisher-public.pem
```

解析 JSON envelope，而不只看退出码：

- `inspect` 必须为 `ok: true`，公开 manifest 的 package/product/publisher/publisher-key/content-key ID、License
  policy 与 minimum runtime version 必须和请求一致；记录 `packageDigest`。
- `verify` 必须为 `ok: true`、`signatureVerified: true`，identity 与 digest 必须和 inspect 一致。
- 输出不得包含输入 JavaScript marker、private key bytes、DEK 的 raw/hex/Base64 表示或任何 credential。

`inspect` 不解密 payload；`verify` 不验证 License/entitlement。错误时保留 machine-readable code 和最小安全
message，不为诊断打印密钥或源码。若输出文件、DEK 文件或 manifest identity 与预期不一致，停止交付。
