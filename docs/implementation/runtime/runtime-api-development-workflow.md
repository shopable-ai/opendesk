---
title: Runtime API development workflow
description: OpenDesk 新增或修改 JavaScript Runtime API 时，从 native owner 到文档、类型、测试与证据的强制同步流程。
order: 15
---

# Runtime API development workflow

本流程适用于所有用户可从 JavaScript 观察的 Runtime 能力。`docs/api/` 是调用契约的唯一来源；Go 白盒测试只证明 native/private seam，不得代替 JavaScript contract。

## 1. 先定义 owner 和契约

先在相应 `docs/api/*.md` 写清：方法名、参数、返回值、错误字段、平台、权限、副作用、取消与 teardown。然后决定 owner：

| 能力性质 | owner |
| --- | --- |
| 平台驱动、真实资源、execution 生命周期、worker/callback | `automation/*.go` native owner |
| 普通同步 Go 参数/返回值且可安全反射 | `jsMethodAllowlist` + `AutoMapObject` |
| Promise、callback、句柄、结构化错误或资源控制 | 显式 `registerXxx` + `runtime.NewObject()` |
| 默认值、参数适配、多个已有 API 的纯 JS 组合 | `polyfills/*.js` |

不得在 polyfill 中复制同名 native global，也不得因为 Go 方法 exported 就默认将它公开。

## 2. 完成七处同步闭环

任何新增或变更都逐项检查；“不适用”也要在变更说明中写理由。

1. `automation/*.go`：实现、native owner、错误与资源边界；
2. `automation/utils.go` 的 `jsMethodAllowlist` 或对应显式 `registerXxx`；
3. `docs/api/*.md` 与 `docs/api/runtime-api.ai.json`；
4. `types/*.d.ts`；
5. `tests/runtime-api/manifest.js` 与 `tests/runtime-api/unit/<namespace>.test.js`；
6. `docs/implementation/runtime/` 与 `docs/quality/`；
7. 公开 `examples/`：只使用文档化 API，并给出仓库根目录的一行可复制命令。

Page 还必须检查 `page____Inject` 与 `polyfills/000-page.js`；Sound/Audio 必须检查 `registerSound` / `registerAudio`，不能只向 Go struct 增加方法。

## 3. 生命周期对称性

为每个创建状态或资源的动作回答“谁结束它”：

| 模式 | 必须存在的结束路径 | 例子 |
| --- | --- | --- |
| down/start/open session | up/stop/close 或 execution teardown | mouse/keyboard、Sound、Screen recording、Browser/Context |
| callback/subscription | unsubscribe/unregister/close | Events、globalShortcut、ui listeners |
| Promise worker | settle、cancel、Wait 且 callback 回到 owner EventLoop | App、Notifications、Dialog、HTTP、Sound wait |
| one-shot native call | deadline、process reap、no residual child | NativeExtensions |
| persistent service | Close/Shutdown 并等待 worker | Scheduler |

`RuntimeLifecycle.CancelAsync()`、`Wait()`、`ResourceCounts()`、`IsZero()` 与 cleanup event 必须包含同一组 execution-scoped owner。新增 owner 时只改其中一个位置属于验收失败。

## 4. 测试位置

| 目标 | 位置与入口 |
| --- | --- |
| JS 公共 surface、参数、返回值、错误、可观察 lifecycle | `tests/runtime-api/unit/*.test.js`；`OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` |
| catalog、文档、types 与 Runtime surface | `tests/runtime-api/contract.js`；`OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` |
| 真实 macOS 窗口、权限、设备、桌面副作用 | `tests/runtime-api/live/` 或领域 live gate；显式前置条件、watchdog、cleanup、`.runtime/` Evidence |
| Go private/state machine/concurrency/EventLoop/backend seam | 实现同包 `*_test.go`；`go test ./... -count=1` |
| 生成器、可视化器、转换器、手工或长运行工具 | `tests/<domain>/tools/<tool>/`；不得命名为 `*_test.go` |

## 5. 可复制验证顺序

以下命令都从仓库根目录执行：

```bash
node scripts/audit_test_architecture.js
go test ./... -count=1
OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

只有验收目标需要真实桌面时才运行：

```bash
OPENDESK_RUNTIME_API_MODE=live ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

公开示例必须另外原样执行它在文档中给出的命令。正式 gate 使用的 run-local binary 证明当前源码 gate，不等于其他 `./dist/opendesk ...` 示例命令已经通过。

## 6. 证据等级

| 等级 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| contract/unit | 当前构建的 JS surface 与确定性行为 | 真实桌面可见性、权限、设备 |
| Go package | native/private seam 与 package 回归 | JS 用户契约 |
| compile/package-only | 目标代码可编译或包可生成 | 目标系统 live Runtime |
| live | 本次机器、本次构建的真实资源行为 | 其他平台或未来环境 |
| vendor | 嵌套上游模块自己的状态 | 根模块产品质量 |
| archive | 历史参考 | 当前通过结论 |

所有 stdout、JSON、截图、临时配置、二进制与 hash 写入 `.runtime/`。验收报告必须记录当前 HEAD、dirty 状态、构建命令、run-local binary hash 和 Evidence 路径；旧二进制、旧日志、旧截图不得升级为当前证据。
