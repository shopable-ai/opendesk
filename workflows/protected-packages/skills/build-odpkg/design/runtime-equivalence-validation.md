# Runtime equivalence validation design

本设计定义 `.odpkg` 正确性的最小完整证据链。只完成打包、`inspect` 或
`verify` 不能称为 Runtime equivalence；必须按下列顺序证明同一份业务行为在
保护前后等价：

```text
1. 运行 plain JS
2. 记录 plain 业务结果
3. package protect
4. package inspect
5. package verify
6. 准备并安装隔离 P1 License
7. 运行已授权 .odpkg
8. 比较 plain/protected 业务结果
```

## 为什么顺序不能缩短

- 第 1–2 步建立保护前基线。没有基线，`.odpkg` 能运行也无法证明行为没变。
- 第 3–5 步只证明包已生成、结构可读、Publisher 签名有效；不证明客户已获权，
  也不证明 Runtime 能解密和执行。
- 第 6 步必须走真实 P1 device → issue → License inspect/verify → isolated install
  链路。`package inspect/verify` 不能替代授权。
- 第 7 步必须在删除 Publisher 侧 DEK 和 raw License 后运行，证明生产
  content-key provider 能通过已安装 License 和 OS device private key 取回内容密钥。
- 第 8 步只比较稳定业务 Oracle；成功退出、完整日志相似或包摘要存在都不是业务等价。

## 三层验证使用同一条链

| Lane | Plain / protected 启动方式 | 业务 Oracle | 附加验收 |
| --- | --- | --- | --- |
| basic | 直接 `-script` | deterministic `business-result.json` 完全相等 | plain 有 source snapshot；protected 无 snapshot |
| parameterized | 两侧使用同一 `ai run --input-file` | 规范化订单字段及金额完全相等 | 同一输入文件、独立校验期望总额 |
| real UI | 直接 `-script -ui`，使用配套 UI host | 真实交互后 approved 语义相等 | 窗口、截图、OCR、几何和人工视觉检查分别留证 |

三条 lane 各自执行完整八步链，不能用 basic 的 package/P1 结果替代另外两条 lane
的 package/P1 证明。每包使用新的 DEK。

## 证据所有权与目录

- 可读业务输入：`examples/protected-packages/`。
- 唯一正式断言实现：`tests/protected-packages/runtime-equivalence.js`。
- Skill 薄入口：`../scripts/runtime-equivalence.js`，只调用正式实现，不复制断言。
- 可操作步骤：`../references/runtime-equivalence.md`。
- 本设计：当前文件，说明证据链、Oracle、边界和结果模型。
- 每次运行证据：`.runtime/tests/protected-packages/<execution-id>/`。生成物不写入
  Skill 源码目录。

自动化每次运行必须产生：

- `acceptance-ledger.json`：按 lane、按上述八步排序的通过状态和证据索引；
- `runtime-equivalence-summary.json`：完整 failure-class、provenance、lane 和清理报告；
- `commands/*.json`：protect/inspect/verify 与 P1 issue/inspect/verify/install 的安全
  JSON envelope；
- ledger 中索引的 plain/protected `business-result.json`：保护前后业务结果（直接
  Runtime lane 位于 `lanes/`，`ai run` lane 使用其标准嵌套 artifact directory）；
- `lanes/ui/screenshots/{plain,protected}.png`：真实窗口视觉证据；
- `binary-provenance.json`：已编译 Runtime/UI host 与当前 checkout 的来源边界。

运行者完成截图审阅后，在同一 run directory 追加 `human-visual-review.json`，记录
内容自适应、留白、换行、对齐和裁切结论。自动化功能成功不能代替这份视觉结论。

## Acceptance ledger 判定

`acceptance-ledger.json` 是正式断言结果的有序投影，不是第二套断言。一个 lane
只有八步全部为 `passed` 才能称为该 lane 的 macOS live Runtime equivalence
通过。失败时先看未通过步骤，再回到 summary 中对应 failure class：

| 八步边界 | Failure class |
| --- | --- |
| plain execute / record | `plainRuntime` |
| protect / inspect / verify | `packageStructureSignature` |
| isolated P1 | `p1Authorization` |
| protected execute | `protectedRuntime` |
| basic compare | `protectedRuntime` |
| parameterized compare | `parameterEquivalence` |
| UI compare | `uiSemanticAcceptance` + `uiVisualAcceptance` |
| 最终秘密和安装态清理 | `securityCleanup` |

## 只比较预期行为

不得做 whole-log、whole-artifact-tree 或 pixel-perfect 比较。source hash/package
digest、`scriptPath`/`scriptDir`、source snapshot presence、execution ID、时间戳和
artifact path 是预期差异。UI 功能成功不代表视觉通过；语义与视觉必须分别有
证据。

## 安全与平台边界

Package signing key、License issuer signing key、per-package DEK 和 device key
相互独立。秘密只通过文件路径传给 CLI，不进入命令值、日志、JSON 或报告。每次
运行精确删除 private keys、DEKs、raw Licenses、临时 device Keychain 和 isolated
P1 install root，只保留公开密钥与安全证据。

本设计不使用 `--license-required=false`，不实现 P3，不调用 P2 或外部服务。
macOS 是本测试的 live 资格结果；Windows/amd64 owner cross-build 仅是历史证据，
Windows live DPAPI/package/P1/P2/Runtime/full-app/package/install 仍未资格化。
