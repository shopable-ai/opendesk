---
title: Flow 包 CLI
description: OpenDesk .odflow v1 的构建、检查与候选发布者验签命令，以及严格 Manifest 和安全边界。
order: 615
docType: cli
---

# Flow 包 CLI

`.odflow` 是 OpenDesk 正式 Flow 分发容器。B0 只建立**可构建、可检查、可验签**的包内核；安装注册、Trust Store、entitlement、activation 与业务执行属于后续工作包，`flow pack / inspect / verify` 都不会执行 Flow 的 `main.js` 或解密执行 `main.odpkg`。

从仓库根目录使用与源码匹配的 OpenDesk binary：

```bash
./dist/opendesk flow pack ./my-flow -o ./.runtime/my-flow.odflow ...
./dist/opendesk flow inspect ./.runtime/my-flow.odflow
./dist/opendesk flow verify ./.runtime/my-flow.odflow --public-key ./publisher-public.pem
```

## `.odflow` v1 容器

`.odflow` v1 是 ZIP 容器，所有内容都必须由 `flow.json` 的显式清单覆盖；不允许未签名 `.odflow`。

普通 Flow：

```text
hello.odflow
├── flow.json
├── flow.sig
├── main.js
├── assets/...
└── trust/publisher.pub
```

受保护 Flow：

```text
protected.odflow
├── flow.json
├── flow.sig
├── main.odpkg
├── assets/...
└── trust/
    ├── publisher.pub
    └── license-issuer.pub
```

`flow.json` 和 `flow.sig` 不进入 `files[]`；其余 archive entry 必须且只能出现一次于 `files[]`。路径使用 `/`，必须为 ASCII 可移植相对路径，不能包含 `..`、反斜杠、绝对路径、盘符/ADS 语法或仅大小写不同的重复路径。

## `flow.json` v1

作者侧 JSON Schema 位于 `schemas/flow/flow.schema.json`。Runtime reader 仍执行独立的严格校验；Schema 不是安全边界的替代品。

```json
{
  "schemaVersion": 1,
  "flowId": "com.example.invoice-export",
  "name": "Invoice Export",
  "version": "1.0.0",
  "publisherId": "com.example.publisher",
  "publisherKeyId": "publisher-2026-01",
  "entry": "main.js",
  "minimumRuntimeVersion": "2.0.1",
  "platforms": ["darwin", "windows"],
  "files": [
    {
      "path": "main.js",
      "sha256": "<64 lowercase hex characters>",
      "size": 1234
    },
    {
      "path": "trust/publisher.pub",
      "sha256": "<64 lowercase hex characters>",
      "size": 113
    }
  ]
}
```

商业/授权声明存在时增加：

```json
{
  "commercial": {
    "productId": "com.example.invoice-export",
    "licenseIssuerKeyId": "license-issuer-2026-01",
    "purposes": ["run"]
  }
}
```

v1 规则：

- `schemaVersion` 只能为 `1`；未知字段、缺少必填字段、重复 JSON key 和 trailing JSON 都失败。
- `flowId`、publisher/product/key ID 最长 128 字符并使用稳定 ASCII ID 语法。
- `version`、`minimumRuntimeVersion` 必须为严格 SemVer。
- `entry` 只能是根级 `main.js` 或 `main.odpkg`，并且必须出现在 `files[]`。
- `platforms` 和 `files[]` 必须唯一且按字典序排列；pack 命令会把 platform 与文件清单规范化排序。
- `files[]` 保存真实 SHA-256 与字节大小；reader 拒绝缺失、额外、重复、大小变化或 digest 变化的 archive entry。
- 每个 `.odflow` 必须包含可解析的 Ed25519 `trust/publisher.pub`。存在 `commercial` 时必须包含可解析的 `trust/license-issuer.pub`。
- `main.odpkg` 必须存在 `commercial`，并复用 `.odpkg` reader/signature 校验；内外 `publisherId`、`publisherKeyId`、`productId` 和 `minimumRuntimeVersion` 必须一致。此检查不需要 activation，也不会解密/执行 payload。

限制：package 最大 64 MiB；最多 256 个清单文件；单文件最大 32 MiB；`flow.json` 最大 256 KiB；`flow.sig` 必须是一个 64-byte Ed25519 signature。

## 签名域

`flow.sig` 使用 Ed25519，对下列**精确字节**签名：

```text
"OpenDeskFlowPackage/v1\0" || raw(flow.json)
```

不能重新序列化 `flow.json` 后再验签，也不能复用 `.odpkg` 的 `OpenDeskProtectedPackage/v1` 签名域。固定向量由 `pkg/flow/signature_test.go` 锁定。

发布者信任与签名校验是两件事：包内 `trust/publisher.pub` 只是候选公钥。`flow verify --public-key` 要求外部传入的候选公钥与包内公钥一致并验证签名，但 **B0 不写 Trust Store、不声明发布者已受信任、不产生 entitlement、也不授权运行**。

## `opendesk flow pack`

```bash
./dist/opendesk flow pack ./my-flow \
  -o ./.runtime/my-flow.odflow \
  --flow-id com.example.my-flow \
  --name "My Flow" \
  --version 1.0.0 \
  --publisher-id com.example.publisher \
  --publisher-key-id publisher-2026-01 \
  --entry main.js \
  --minimum-runtime-version 2.0.1 \
  --platform darwin \
  --platform windows \
  --file main.js \
  --file assets/template.txt \
  --file trust/publisher.pub \
  --signing-key ../publisher-private.pem
```

`--file` 是重复参数，pack **只读取显式列出的文件**，不会扫描整个目录。`--signing-key` 必须解析到 input root 之外；输入文件必须是真实普通文件，不能是符号链接。输出必须使用 `.odflow`，且已有目标文件不会被覆盖。

商业/受保护 Flow 同时提供：

```text
--product-id <id>
--license-issuer-key-id <id>
--purpose run
--file trust/license-issuer.pub
```

`main.odpkg` 仍由既有 `opendesk package protect` 生成；`.odflow` 不发明第二层源码加密。

## `opendesk flow inspect`

```bash
./dist/opendesk flow inspect ./.runtime/my-flow.odflow
```

`inspect` 严格读取容器、Manifest、文件清单、公钥材料和受保护入口结构，但不执行入口，也不把候选签名等同于信任。成功结果明确包含：

```json
{
  "verification": {
    "signature": "not_checked",
    "publisherTrust": "not_evaluated",
    "authorization": "not_evaluated"
  }
}
```

输出只包含公开 Manifest、package digest 和上述状态，不输出 JavaScript 源码、`.odpkg` ciphertext、私钥、DEK、token 或其他 secret。

## `opendesk flow verify`

```bash
./dist/opendesk flow verify ./.runtime/my-flow.odflow \
  --public-key ./publisher-public.pem
```

成功表示：容器/清单/文件完整性成立；候选 public key 与 `trust/publisher.pub` 一致；`flow.sig` 对原始 `flow.json` 字节验签成功。成功状态仍然是：

```json
{
  "verification": {
    "signature": "verified_candidate_key",
    "publisherTrust": "not_evaluated",
    "authorization": "not_evaluated"
  }
}
```

因此 `verify` 成功**不等于**安装成功、发布者受信任、会员有效或 Flow 获准执行。

## 错误分类

B0 稳定 Flow 错误码：

```text
unsupported_format
invalid_package
package_too_large
invalid_manifest
invalid_path
file_mismatch
invalid_signature
protected_package_invalid
output_exists
```

CLI 参数错误使用 `invalid_argument` 并返回退出码 `2`；包读取、完整性或验签失败返回退出码 `1`。成功退出码为 `0`。所有失败都在 stdout 返回 `{ok:false,...}` JSON envelope；调用方必须同时检查进程状态和 JSON `ok`。
