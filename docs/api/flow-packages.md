---
title: Flow 包格式与 CLI
description: OpenDesk .odflow v1 的 canonical Manifest、签名、显式文件清单和安全边界。
order: 615
docType: cli
---

# Flow 包格式与 CLI

`.odflow` 是 OpenDesk 的签名 Flow 分发容器。安装是导入和注册，不会执行入口；执行必须由用户或调用方明确发起 `flow run <installId>`。

仓库内命令从仓库根目录使用当前源码匹配的 Runtime：

```bash
./dist/opendesk flow pack ./my-flow -o ./.runtime/my-flow.odflow \
  --flow-id com.example.invoice-export --name "Invoice Export" --version 1.0.0 \
  --publisher-id com.example.publisher --publisher-key-id publisher-2026-01 \
  --entry main.js --public-key ./publisher-public.pem --signing-key ../publisher-private.pem \
  --platforms darwin,windows --file main.js --file assets/template.txt
./dist/opendesk flow inspect ./.runtime/my-flow.odflow
./dist/opendesk flow verify ./.runtime/my-flow.odflow --public-key ./publisher-public.pem
```

## 容器布局

`.odflow` 是 ZIP。`flow.json`、`flow.sig` 和自动嵌入的 `trust/publisher.pub` 是固定安全材料；其余内容只能来自 `flow pack` 重复指定的 `--file`：

```text
flow.json
flow.sig
trust/publisher.pub
main.js 或 main.odpkg
assets/...
```

`--file` 必须是 source directory 内的真实普通文件相对路径，不能是符号链接；重复路径、保留路径、目录穿越和特殊文件都会被拒绝。签名私钥必须位于 source directory 之外，且永远不会进入 ZIP。pack 不扫描 source directory，也不把未列出的文件打包。输出文件不会被覆盖。

受保护 Flow 的入口是 `main.odpkg`，并可显式加入公开的 `trust/license-issuer.pub`；`.odflow` 不新增第二层加密。内层 `.odpkg` 必须通过既有签名校验，外层与内层的 publisher/key/product/package/content-key identity 必须一致。

## `flow.json` v1

作者侧 Schema 位于 [`schemas/flow/flow.schema.json`](/Users/mac/Documents/workspace/clawdesk/schemas/flow/flow.schema.json)。Runtime reader 仍执行独立严格校验，Schema 不是安全边界替代品。

```json
{
  "format": "opendesk-flow",
  "schemaVersion": 1,
  "flowId": "com.example.invoice-export",
  "name": "Invoice Export",
  "version": "1.0.0",
  "publisherId": "com.example.publisher",
  "publisherKeyId": "publisher-2026-01",
  "publisherFingerprint": "<64 lowercase hex characters>",
  "entry": "main.js",
  "minimumRuntimeVersion": "2.0.1",
  "platforms": ["darwin", "windows"],
  "files": [
    { "path": "main.js", "sha256": "<64 lowercase hex characters>", "size": 1234 },
    { "path": "trust/publisher.pub", "sha256": "<64 lowercase hex characters>", "size": 113 }
  ]
}
```

规则如下：

- `format` 必须为 `opendesk-flow`，`schemaVersion` 必须为 `1`；未知字段、重复 JSON key、trailing JSON 和非 canonical JSON 都失败。
- ID 使用稳定 ASCII 语法，最长 128 字符；名称为单行 bounded Unicode 文本；版本使用严格 SemVer。
- `entry` 是 source 内的 `.js`、`.mjs` 或 `.odpkg` 相对路径，必须在 `files[]` 中。
- `platforms` 唯一且按字典序排列，只能包含 `darwin`、`linux`、`windows`；pack 会规范化排序。
- `files[]` 只列 payload 与公开信任材料；`flow.json`/`flow.sig` 不在其中。清单路径唯一并排序，reader 要求声明文件与 ZIP 内容完全一致。
- 每个包最多 256 个清单文件；包最大 64 MiB；单个 payload 最大 32 MiB；`flow.json` 最大 256 KiB；`flow.sig` 必须是 64-byte Ed25519 signature。
- `.odpkg` entry 必须带 `protected` identity（productId、packageId、contentKeyId，以及可选 licenseIssuerKeyId）；普通脚本不能带该字段。

## 签名域

`flow.sig` 使用 Ed25519，对以下精确字节签名：

```text
"OpenDeskFlowManifest/v1\0" || SHA-256(raw flow.json)
```

验签使用原始 `flow.json` 字节，不重新序列化，也不复用 `.odpkg`、License 或轮换声明的签名域。固定向量位于 [`pkg/flowpackage/signature_test.go`](/Users/mac/Documents/workspace/clawdesk/pkg/flowpackage/signature_test.go)。包内 publisher key 只是候选公钥；验签成功不代表 publisher 已受信任、用户已批准或 Flow 有权运行。

## inspect 与 verify

`flow inspect <path>` 读取并校验容器、Manifest、文件清单、publisher key 和 protected entry，不执行 Flow。成功结果包含公开 `manifest`、`archiveDigest`、`manifestDigest` 和 `signatureVerified: true`，不包含脚本明文、`.odpkg` 解密内容、私钥或 token。

`flow verify <path> --public-key <path>` 另外要求外部候选公钥与包内 publisher key/fingerprint 一致，并返回 `candidateKeyVerified: true`。它不会写 Trust Store、建立 publisher trust、取得 entitlement 或授权运行。

## 稳定错误码

Flow package reader/writer 使用：

```text
unsupported_flow_format
invalid_flow_container
flow_too_large
invalid_flow_manifest
invalid_flow_signature
flow_payload_mismatch
flow_identity_mismatch
output_exists
```

CLI 参数错误为 `invalid_argument` 并退出 `2`；容器、完整性或验签失败退出 `1`；成功退出 `0`。stdout 始终是 `{ok,command,result|error}` JSON envelope，调用方必须同时检查退出状态和 `ok`。
