---
title: Runtime API 测试模块与按接口运行
description: 薄入口、共享运行上下文、独立接口组门禁，以及不冒充全量覆盖的 unit 文件选择。
order: 23
---

# Runtime API 测试模块与按接口运行

## 结论与边界

`scripts/test_runtime_apis.js` 本来就是薄入口；接口断言也已按 `unit/<family>.test.js`
组织。本次拆分的是原来 960 行的 `gates/catalog-runner.js`，不是复制已有接口测试。
正式命令保持不变，默认仍为原来的 smoke 组合；不新增 Node Recipe Runner。

```text
scripts/test_runtime_apis.js          原命令入口
└── tests/runtime-api/gates/
    ├── catalog-runner.js             只验证请求、加载和分派
    ├── registry.js                   模式 → 导出函数 → 模块，唯一映射
    ├── runtime-context.js            构建来源、进程执行、证据与资源检查
    └── suites/
        ├── core.js                  contract、全量 unit、coverage 等基本阶段
        ├── catalog.js               smoke/live 的组合顺序与失败收尾
        ├── sqlite.js                SQLite 专用分层与清理
        ├── file-json.js             File JSON 及 ai run 验证
        ├── environment.js           环境文件、本地与 HTTP 隔离
        ├── path.js                  WorkDir 与文件/inline 来源
        ├── command.js               子进程与取消
        ├── sound.js                 声音取消
        ├── notifications.js         已安装 App 通知图标验收
        ├── custom-ui-config.js      UI 配置发现与优先级
        ├── live.js                  真实桌面/UI/Dialog seam 调用
        ├── language.js              既有 JavaScript 作者基线
        ├── native-extension.js      测试扩展构建准备
        └── unit-selected.js         指定 unit 文件的正式门禁
```

模块是有显式依赖的 factory，返回具名函数；不安装额外 Runtime global。dispatcher 按注册表
惰性加载并在单次执行内缓存模块，不用 glob 搜集任意脚本。各模块不是可以直接 `-script`
运行的入口。具体 API 断言继续留在 `tests/runtime-api/unit/`、`live/` 和既有专用文件中。

## 运行方式

所有命令从仓库根目录执行。使用与源码对应的 OpenDesk 构建；本页命令不表示已在当前
机器或目标系统验收通过。

### 原有组合入口

```bash
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

默认 smoke 的阶段顺序保留为 contract → language → unit → smoke case → async stacks →
failure-exit → negative。这里的历史 smoke 编排包含扩展构建和 loopback fixture，不是纯静态
检查，也不等价于 `tests/runtime-api/smoke.js` 的直接运行。

### 单个接口组：一条脚本命令

```bash
./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script
./dist/opendesk -script tests/runtime-api/single/path.js -console-mode script
```

`single/<family>.js` 是薄入口，与 `unit-selected.js` 复用同一个
`support/run-selected.js`，不再用 `eval` 拼装另一套断言或修改 `Execution.env`。
固定入口拒绝残留筛选变量；完整[开发者单项测试命令](../../tests/runtime-api/single/README.md)随 manifest 核验。
这些是单个 unit 文件的检查，不是每个方法单独的 runner，也不是整组所有层次已验收。

### 只运行一个或几个接口组

```bash
OPENDESK_RUNTIME_API_UNIT_FILTER=file ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
```

选择 ID 是现有 `RuntimeAPITestFiles.unit` 中文件的 basename，去掉 `.test.js` 或 `.js`。
例如 `file`、`file-json`、`path`、`sqlite`、`command`、`clipboard`；`geometry`、`geometry-layout`
和 `ui` 继续引用 manifest 中的既有根层 unit 文件。输入大小写归一、去重，并按 manifest 顺序
运行。没有额外维护第二份接口文件目录。

空选择、拼错 ID、任意路径、通配符和重复的 manifest ID 都会失败；已选文件必须实际注册
至少一个测试，不能用零测试得到绿色结果。不要直接运行依赖框架的 `unit/*.test.js`。

需要正式构建来源、run context、watchdog 和资源归零检查时，使用同一个正式入口：

```bash
OPENDESK_RUNTIME_API_MODE=unit-selected OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

这只选择 unit 文件，不隐含执行其所有专用验收层。只有选择 `native-extension` 才额外构建
测试扩展；其他文件不会仅因跑一个 File/path unit 而编译原生扩展示例。测试本身仍可能需要
对应平台、资源或 fixture；选择器不是依赖资源的模拟器。

### 接口专用完整门禁继续保留

例如 SQLite 的 contract、unit、scoped coverage 和 execution cleanup：

```bash
OPENDESK_RUNTIME_API_MODE=sqlite ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

原有 18 个 mode 均保留：`contract`、`unit`、`smoke`、`live`、`live-only`、`coverage`、
`negative`、`sound-cancel`、`notify-icon-live`、`custom-ui`、`custom-ui-config`、`dialog`、
`command`、`environment`、`file-json`、`path`、`language`、`sqlite`。
新增 `unit-selected` 不改变它们的范围。普通完整 gate 和直接 `unit.js` 收到筛选变量会明确
拒绝，而不是忽略筛选或把部分接口结果充当全量结果。

## 证据不混用

选定文件的结果写入 `.runtime/tests/runtime-api/<runId>/results/` 下的
`unit-selection.json` 与 `runtime-api-unit-selected.json`，使用独立标签
`RUNTIME-API-UNIT-SELECTED`。选择清单明确 `scope: selected-unit-files`、`fullCatalog: false`，
记录 IDs、文件路径和可选文件总数。失败同样记录选择失败状态。
它不生成完整 `unit.json`、coverage 或 quality 通过记录。
直接命令的 binary provenance 是 `direct-runtime`，没有伪造二进制 SHA；正式入口沿用
run-local 二进制及已有来源记录。

本次不改变原门禁的 timeout、seam、资源字段和失败退出约定。另将已有 runId 目录的
隐式删除改为明确失败：指定的新 runId 已存在时保留证据，要求换一个 ID，不覆盖历史结果。
共享上下文仍继承原 runner 的 POSIX 工具依赖（例如 shasum、uname、/bin/sh、python3）；
目录拆分不是 Windows 原生完整门禁移植。Windows 可使用 PowerShell 设置选择变量后运行
对应直接入口，但是否通过必须以目标平台实际 Runtime 证据为准：

```powershell
$env:OPENDESK_RUNTIME_API_UNIT_FILTER = 'file,path'
try { .\dist\opendesk.exe -script tests/runtime-api/unit-selected.js -console-mode script }
finally { Remove-Item Env:OPENDESK_RUNTIME_API_UNIT_FILTER }
```

## 后续新增接口怎样放

普通接口组：在既有 `unit/<family>.test.js` 增加断言，并在 `manifest.js` 登记；不把断言
加回 `scripts/` 或 dispatcher，不为每个 API 方法创建一份 runner。
需要跨 execution、取消、fixture 或特殊清理的接口：在 `gates/suites/<domain>.js`
实现其编排，并只在 `registry.js` 注册一次。共享上下文只接收真正通用的运行设施。
保留失败传播、清理顺序和专用资源检查，不能以拆文件为由减少测试范围。

## 维护检查

```bash
node --test tests/test-architecture/runtime-api-modules.test.js tests/test-architecture/runtime-api-entrypoints.test.js
```

这是宿主侧分派、依赖加载、选择器、组合顺序与失败路径检查，不证明 OpenDesk API、SQLite
native、真实 UI 或 Windows 运行行为。完整工作区还应跑现有架构审计，再在具备环境时执行
受影响的直接命令和正式 gate；静态解析和模拟结果必须与 Runtime/live 结果分别报告。
