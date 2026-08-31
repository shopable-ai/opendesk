# 为什么 OpenDesk 现在不急着增加 Lua

> 状态：Draft
>
> 类型：否定型 / 技术取舍 Blog
>
> 这是一篇面向外部解释产品与技术边界的文章草稿，不是当前 Runtime 能力声明。

很多自动化 Runtime 都支持多种脚本语言，所以当 OpenDesk 已经拥有 JavaScript Runtime 后，一个自然的问题是：

> 是否也应该增加 Lua？

答案不是“Lua 没有价值”，而是：

> **当前阶段，Lua 增加的能力与 JavaScript 高度重叠，而它带来的长期维护成本高于当前真实收益。**

## Lua 能解决什么

Lua 是成熟、轻量、适合嵌入的软件脚本语言。

如果 OpenDesk 增加 Lua，用户未来可以使用类似：

```lua
mouse.click(100, 200)
window.find(...)
Vision.detectUI(...)
```

而不是 JavaScript：

```js
mouse.click(100, 200);
window.find(...);
Vision.detectUI(...);
```

它真正增加的是另一种脚本入口：

```text
Go Native Capability
├── JavaScript Runtime
└── Lua Runtime
```

如果已经存在大量 Lua 用户、Lua 自动化资产或强 Lua 生态需求，这会很有价值。

## Lua 不能直接解决什么

OpenDesk 更重要的扩展问题并不是“再多一种脚本语法”，而是：

> 用户在没有 OpenDesk Core 源码的情况下，怎样增加 Runtime 当前不存在的底层能力？

例如：

```text
Apple Vision Framework
Windows COM
特殊设备 SDK
工业硬件
专有 C/C++ SDK
高性能图像算法
企业内部 Native 集成
```

增加 Lua 本身不能创造这些能力。

如果 OpenDesk 没有向 Lua 暴露对应 Host Function，那么 Lua 同样无法调用它。

因此：

```text
Lua
= 新的脚本语言

Native Process / Wasm / Native ABI
= 新的能力扩展机制
```

这是两个不同问题。

## 多一套脚本语言意味着什么

Lua 看起来只是再嵌入一个 VM，但长期维护并不只是增加解释器。

OpenDesk 还需要考虑：

```text
Go → JavaScript Binding
Go → Lua Binding

JavaScript async / Promise
Lua coroutine / async model

JavaScript error contract
Lua error contract

JavaScript docs
Lua docs

JavaScript examples
Lua examples

JavaScript tests
Lua tests

JavaScript editor support
Lua editor support
```

每新增一个公开 Runtime API，都可能需要同时确认两套语言行为是否一致。

当核心能力本身仍在快速建设时，过早增加第二种主要脚本语言会扩大长期维护面。

## 当前更值得解决的问题

OpenDesk 当前更需要把资源投入到真正扩大能力边界和可靠性的事情上，例如：

```text
桌面动作可靠性
Detect UI / Layout
Execution / Evidence
MCP / HTTP
Recorder
应用 Adapter / Workflow
异常诊断与恢复
Native Process Extension
```

尤其 Native Process Extension 可以让第三方：

```text
使用 Go / Rust / Swift / C++ / Python 等语言
→ 编译独立 Extension Process
→ 通过稳定协议接入 OpenDesk
```

这不要求第三方得到 OpenDesk 核心源码，却能真正增加新的 Native 能力。

## 为什么 JavaScript 暂时足够承担脚本层

OpenDesk 已经拥有 JavaScript Runtime，并且当前 Polyfill / Runtime API / examples / types / tests 都围绕 JavaScript 建立。

如果只是希望脚本更简单，很多问题可以通过：

```text
JavaScript helper
API facade
Workflow
Skill
Recorder-generated script
Prompt / Agent
```

解决，而不一定需要增加另一种语言。

例如用户最终可能更关心：

```js
await clickText("发送");
```

而不是这行代码究竟是 JavaScript 还是 Lua。

## 什么情况下会重新考虑 Lua

OpenDesk 并不是永久拒绝 Lua。

以下任一条件开始真实出现，就值得重新评估：

1. 有明确用户持续要求 Lua。
2. 有大量现成 Lua 自动化资产需要迁移。
3. OpenDesk 进入 Lua 占主导的垂直生态。
4. OpenDesk 产品定位升级为多语言 Automation Runtime。
5. 共享 Capability Registry 已经成熟，新增语言 Binding 的边际成本显著下降。

这时可以重新评估：

```text
GopherLua
LuaJIT
其他 Lua VM
```

并通过真实 Benchmark 与用户需求决定。

## 当前结论

当前决策不是：

> Lua 不好。

而是：

> **现在增加 Lua 主要扩大语言选择，却不会显著扩大 OpenDesk 的能力边界。**

因此更合理的顺序是：

```text
先把核心自动化能力做可靠
→ 建立真正的 Native Extension 能力
→ 等真实 Lua 需求出现
→ 再决定是否增加 Lua Runtime
```

技术路线的价值不只来自“可以做多少功能”，也来自知道：

> **哪些功能现在不值得做。**

## 内部参考

后续事实与路线变化优先查看：

```text
docs/plans/runtime/runtime-extension-roadmap.md
docs/frameworks/runtime-api-extension-framework.md
docs-user-api/custom-api.md
```

如果这些正式工程文档发生变化，本 Blog 草稿应重新校准后再发布。
