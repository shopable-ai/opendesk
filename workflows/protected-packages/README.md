# 受保护包发布工作流

本目录保存 OpenDesk `.odpkg` 受保护包的可复用发布侧作业方法。它不替代
[`docs/api/protected-packages.md`](../../docs/api/protected-packages.md) 的真实 CLI 契约，也不替代
[`docs/architecture/execution/protected-recipe-package.md`](../../docs/architecture/execution/protected-recipe-package.md)
的长期安全边界。

## 当前 Skill

- [`build-odpkg`](skills/build-odpkg/SKILL.md)：把 Publisher 侧 `.js` 发布为
  `.odpkg`，完成 `inspect` / `verify`，并按需交接 P1 离线 License、P2 在线 activation 和平台资格核对。

它只处理 OpenDesk 受保护包，不负责普通压缩包、应用安装包、Recorder 脚本精炼或 P3 Publisher key
lifecycle 实现。对话中可以用 `$build-odpkg` 显式调用；仓库 `AGENTS.md` 也为明确的
`.odpkg` 受保护包发布请求提供窄路由。

## 保护前后 Runtime 等价性

从仓库根目录用已编译 binary 运行 Skill 自带的薄入口：

```bash
./dist/opendesk -script workflows/protected-packages/skills/build-odpkg/scripts/runtime-equivalence.js -console-mode script
```

入口调用 `tests/protected-packages/runtime-equivalence.js` 中唯一的共享断言实现。它对 basic、同一
`--input-file` 参数和真实 native UI 三层执行 plain source → package/inspect/verify → P1
device/issue/verify/install → protected package → behavior compare；不是只看 package 命令成功。Publisher/test
workflow 由 OpenDesk JavaScript Runtime 执行，不调用 Node.js 或 Go，也不访问外部服务。

当次秘密与 isolated P1 store 都在结束时精确删除；safe envelopes、加密 package、public keys、execution
artifacts 和 UI screenshots 留在 `.runtime/tests/protected-packages/`。完整前置条件、Oracle、预期差异、失败分级和
清理规则见 [`runtime-equivalence.md`](skills/build-odpkg/references/runtime-equivalence.md)。

## 事实来源

使用 Skill 时仍以当前共享工作树、当前源码和当前 API 文档为准。阶段 checkpoint 只说明历史验收，不证明新
工作树或新平台已经通过。所有临时构建、命令输出和一次性校验材料写入 `.runtime/`，不得把验收私钥、DEK 或
token 变成可复用 fixture。
