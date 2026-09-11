# Platform qualification

只在用户要求平台验证或支持声明时读取。先记录当前 HEAD、dirty tree、运行主机、目标 OS/arch、二进制 provenance
和实际执行命令；历史 checkpoint 不能替代当前验证。

## 证据等级

| 证据 | 可以声明 | 不能声明 |
| --- | --- | --- |
| source/static review | 当前接口和依赖边界已核对 | build 或运行通过 |
| host narrow tests | 该 host 上指定 owner tests 通过 | 另一平台可运行 |
| Windows/amd64 cross-build | 指定 owner 可生成 Windows PE32+ x86-64 产物 | Windows live、DPAPI 行为、完整应用或安装资格 |
| Windows live CLI | 实际执行过的精确命令和结果 | 未执行的 Runtime、full app、package/installer 路径 |
| Windows full-app/package/install | 实际安装物与目标机链路通过 | 超出该版本、架构或安装形态的支持 |

## 当前冻结边界

P2 checkpoint 记录了 macOS real TLS/Keychain 的 P1/P2 live 链路。Windows/amd64 记录的只有
`CGO_ENABLED=0` owner cross-build：`pkg/licensing`、`pkg/deviceidentity`、`pkg/entitlement`、
`pkg/entitlementservice`、`pkg/scriptloader`、`internal/licensecli`、`internal/packagecli` 和 reference entitlement
server 生成 PE32+ x86-64。

这不构成以下资格：

- Windows 真机上 DPAPI create/read/reopen、用户范围与 ACL、损坏恢复行为的 live 验证；
- Windows 真机上 `opendesk package protect/inspect/verify`、P1 device/issue/verify/install/Runtime 或 P2
  activate/status/refresh/deactivate 的 live 验证；
- 完整 `opendesk` Windows app build、UI/native host、正式应用 package、installer 或安装后运行验证。

完整 host 的既有 RobotGo CGO/native 限制必须单列，不能归因成 package/license owner cross-build 失败，也不能
用 owner cross-build 掩盖。只有在真实 Windows 环境逐项取得证据后，才把对应行从 `not qualified` 改为 live。

## 与 Skill 变更相称的验证

结构与文档变更至少执行：

```bash
python3 /Users/mac/.codex/skills/.system/skill-creator/scripts/quick_validate.py workflows/protected-packages/skills/build-odpkg
git diff --check -- AGENTS.md workflows/protected-packages workflows/README.md docs/api/README.md docs/api/index.md docs/api/ai-cli.md docs/api/runtime-api.ai.json docs/api/protected-packages.md docs/architecture/execution/protected-package-terminology.md docs/architecture/execution/protected-recipe-package.md docs/plans/runtime/protected-recipe/README.md docs/plans/runtime/protected-recipe/STATUS.md docs/plans/runtime/protected-recipe/p2-online-entitlement.md
```

Publisher/使用者侧完整命令验证应运行 [runtime-equivalence.md](runtime-equivalence.md) 中的 Skill entry。它由
已经编译好的 `./dist/opendesk` 执行 Skill 内薄 JavaScript 入口，再调用 `tests/protected-packages/` 的 canonical
implementation，完成 basic、parameterized 和 real native UI 的 source/package/P1/execute/compare。safe evidence
位于 `.runtime/tests/protected-packages/`；此路径不使用 Node.js 或 Go。报告必须记录 binary provenance；现成
binary 的 live 结果不能自动外推为当前 dirty source 已构建。

只有相关 owner 源码发生变化，或用户明确要求重新证明源码/cross-build 时，才进入维护者 build/test。Skill/doc-only
变更不需要冒充全仓 Runtime 或桌面验收。

需要重新证明 Windows owner cross-build 时，把它作为维护者专用验证，把产物写入
`.runtime/tests/protected-packages/windows/`，逐个
执行 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c -o <artifact> <owner-package>`，并对
`./tests/protected-recipe/tools/entitlement-server` 执行同环境的 `go build -o <artifact>.exe`。使用 `file` 确认 PE32+
x86-64；不要在非 Windows 主机尝试运行这些 `.exe`，也不要把这组命令扩写成完整 app 已通过。
