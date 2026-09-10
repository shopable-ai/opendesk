# Protected Recipe 当前状态

## Current stage

```text
P0｜Protected Package Foundation
Status: In progress
```

## 当前真实交付点

网页 GitHub 会话已经把 P0 foundation 写入 `master`，最近一次正式 checkpoint：

```text
38ba981f11a87dcdd059d106e1663c2aeb9fee99
feat: add protected recipe package P0 foundation
```

该 checkpoint 只用于历史定位。恢复工作时必须先读取当前 `master / HEAD`，不得 reset 到该提交，也不得覆盖该提交之后其他会话产生的修改。

当前已写入的主要范围包括：

- `pkg/scriptpackage/`
- `pkg/licensing/`
- `pkg/scriptloader/`
- `internal/protectedcli/`
- `internal/packagecli/`
- `cmd/opendesk/protected_recipe_route.go`
- 对应 package / loader / disclosure / routing Go tests

网页环境没有提供本地 Go 编译与 Runtime 执行证据，因此当前状态不能写成 `Completed`。

## Next action

下一步不是进入 P1，而是先完成 P0 的本地验证与集成收口：

```text
current master
→ gofmt
→ narrow go tests
→ go build
→ 修正真实 compile/test failure
→ 收敛 ai run / direct source loading
→ plain .js regression
→ protected disclosure regression
→ package CLI smoke
→ docs/api/ai-cli.md 同步
→ final cross-file review
→ P0 Completed
```

重点已知收口项：

- `ai run .odpkg` 不应长期依赖 root `init()` interception；应尽量收敛到 `internal/aicli/runCommand` 的统一 `.js/.odpkg` source loading。
- Direct `.odpkg` 应复用现有 Config、取消/替换、Custom UI、SQLite deny-list、console 与 artifact 生命周期，不保留第二套长期 parser/lifecycle。
- production Publisher/License/ContentKey provider 仍应 fail closed；测试成功链路通过 injected provider 证明，不能靠内置万能 key。

详细门禁见 [`p0-foundation.md`](p0-foundation.md)。

## P0 完成后的切换动作

只有 P0 全部门禁通过后：

1. 将 [`p0-foundation.md`](p0-foundation.md) 的状态改为 `Completed`，记录通过的测试/构建命令与最终 checkpoint。
2. 将本文件 `Current stage` 改为：

```text
P1｜Device-bound Offline License MVP
Status: In progress
```

3. 将 `Next action` 改为读取并执行 [`p1-device-bound-license.md`](p1-device-bound-license.md)。
4. 不需要重新推导 P0，也不要把 P2 在线 License Server 提前塞进 P1。

## 当前阻塞

没有架构阻塞；当前缺的是本地编译、测试、CLI smoke 与集成收口证据。

## 恢复时最短指令

新会话只需要给 Agent：

```text
读取 AGENTS.md、docs/architecture/execution/protected-recipe-package.md、
docs/plans/runtime/protected-recipe/README.md 和 STATUS.md；
以当前 master / HEAD 为真实基线，继续 Current stage 的未完成 Acceptance Gates，
完成后更新 STATUS.md 和对应阶段文件。不要从零重做已完成阶段。
```