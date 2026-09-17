---
title: Flow CLI
description: OpenDesk Flow 打包、验签、安装、列举、运行和卸载命令。
order: 22
docType: cli
---

# Flow CLI

所有命令从仓库根目录或已安装 OpenDesk 的工作目录执行。命令 stdout 输出一个 JSON envelope：
成功为 `{"ok":true,"command":"...","result":...}`，失败为
`{"ok":false,"command":"...","error":{"code":"...","message":"..."}}`。

Flow 安装不会执行包内 JavaScript。安装后的执行只通过 `flow run <installId>` 明确触发。
`.odflow` 是安装容器；它不会创建第二套 Runtime。

## opendesk flow pack

把 source directory 中显式列出的入口和资源打包成全新签名 `.odflow`。

**签名**

```bash
./dist/opendesk flow pack <source-dir> -o <flow.odflow> --flow-id <id> --name <name> --version <semver> --publisher-id <id> --publisher-key-id <id> --entry <relative-path> --public-key <publisher-public-key> --signing-key <publisher-private-key> --platforms darwin,windows --file <relative-path> [--file <relative-path> ...]
```

`--platforms` 默认为 `darwin,windows,linux`，`--minimum-runtime-version` 默认为 `0.0.0`。
输出文件必须不存在；命令不会覆盖已有 `.odflow`。

## opendesk flow inspect

读取 `.odflow` 的公开 Manifest、archive digest、Manifest digest 和已验证签名状态；不执行
入口，也不提供 License 或 Content Key。

```bash
./dist/opendesk flow inspect releases/example.odflow
```

## opendesk flow verify

执行与 `inspect` 相同的容器解析和签名校验入口，并使用外部 `--public-key` 再次确认候选发布者
公钥。完整成功只表示 `.odflow` 结构和 publisher signature 通过，不表示当前用户已批准 publisher、拥有 License 或可以运行 protected entry。

```bash
./dist/opendesk flow verify releases/example.odflow --public-key ./publisher-public.pem
```

## opendesk flow install

把 `.odflow` 或普通 `.js/.mjs` 导入隔离的 Flow Catalog。

```bash
./dist/opendesk flow install releases/example.odflow --trust-flow
./dist/opendesk flow install workflows/example.js
```

未知 publisher 的 `.odflow` 没有显式 trust decision 时返回 `flow_trust_required`；
`--trust-flow` 只批准当前 Flow，`--trust-publisher` 才建立 publisher scope。普通 `.js/.mjs`
导入生成明确的 local manifest，不获得 publisher signature 或 publisher-wide trust。

`flow install` 不接受裸 `.odpkg` 作为明文脚本或无条件信任入口；受保护裸包继续使用既有
`package verify`/protected loader 和对应 P1/P2 授权路径。没有可信包材料时命令返回
`flow_trust_required`，不会降级执行源码。

## opendesk flow list

列出当前用户 Flow Catalog 中的已安装 Flow，按 display name 和 install ID 稳定排序。

```bash
./dist/opendesk flow list
```

## opendesk flow run

按 install ID 取得运行快照，绑定 `Flow.root`/`Flow.dataDir`，再调用既有 Execution Runtime。

```bash
./dist/opendesk flow run flow-0123456789abcdef0123456789abcdef --log-dir .runtime/runs/flow-example
```

`flow run` 不接受包内路径来绕过 Catalog、信任或授权；`--timeout` 默认为 `30m`。

## opendesk flow uninstall

卸载一个已安装 Flow。默认保留独立业务数据；仅传 `--remove-data` 才删除该 Flow 的
`flow-data/<installId>`。

```bash
./dist/opendesk flow uninstall flow-0123456789abcdef0123456789abcdef --remove-data
```

卸载不会删除其他 Flow 的发布者信任、产品权益或设备身份。
