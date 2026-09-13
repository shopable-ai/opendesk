---
title: Capability 状态模型
description: 理解 getCapabilities() 中 enabled、supported、configured、available 与 reason 的统一语义。
order: 305
docType: concept
---

# Capability 状态模型

OpenDesk 的 `UI`、`ui`、`Accessibility`、`Recorder`、`Command`、`automation.app`、`LLM`、`Agent` 等对象会按需要提供 `getCapabilities()`。

这些对象**不要求拥有完全相同的返回结构**。桌面能力需要平台和权限信息，LLM/Agent 需要 Profile/backend 配置信息；但只要出现相同字段名，就遵守同一语义。

| 字段 | 含义 |
| --- | --- |
| `enabled` | 当前 Execution 是否被 policy / authorization 允许使用该能力。 |
| `supported` | 当前 Runtime、平台或 backend 是否存在对应实现。 |
| `configured` | 所需静态配置/Profile 是否完整到可以尝试调用。 |
| `available` | 当前是否**已知**可以执行；部分无副作用探测允许返回 `null`。 |
| `reason` | API 暴露该字段时，对 disabled / unsupported / unavailable 的机器可读原因。 |
| `checked` | API 暴露该字段时，是否已经执行它定义的更深层探测。 |
| `authenticated` | API 能可靠得出的认证状态；`"unknown"` 表示未探测。 |

最重要的区别是：

```text
available: true   → 已知当前可用
available: false  → 已知当前不可用
available: null   → 没有进行足以判断可用性的 live probe
```

因此 `available: null` **不是失败，也不是 false**。

例如 `LLM.getCapabilities()` 与 `Agent.getCapabilities()` 为保持无副作用，不会真实调用模型、启动 CLI 做版本/登录探测或自动安装，所以它们可以在配置完整时仍返回 `available: null`。

## getCapabilities() 不是统一握手

正常业务代码通常应直接调用业务方法：

```js
const result = await LLM.generate({ prompt: "返回 OK" });
console.log(result.data);
```

```js
const result = await Agent.run({ prompt: "返回 OK" });
console.log(result.data);
```

App Mode 的专用 `main.js` 也可以直接注册：

```js
automation.app.onAction(event => {
  console.log(event.id);
});
```

`getCapabilities()` 主要用于：

- 同一模块可能运行在多种 Execution mode，需要选择分支；
- 需要显示诊断信息；
- 需要区分 policy disabled、platform unsupported、configuration incomplete 与 intentionally-not-probed；
- Experimental/跨平台能力需要先呈现当前能力矩阵。

不要把它机械地加到每条业务链路开头。

## 常见对象之间的差异

- `automation.app` 可以直接判断当前 execution 是否拥有 App Shell，所以 `available` 是 boolean。
- `Command` 当前只需要报告 Execution policy 与实现支持，因此不必虚构 `configured`。
- `LLM` / `Agent` 有 Profile/backend 选择，所以会额外报告 `configured`、`checked`、`authenticated` 等信息。
- `ui`、`Accessibility`、`Recorder` 可以继续报告平台、driver、permission、实现子能力等 API 专属字段。

完整的维护者语义合同见 [Runtime Capability Contract](../architecture/runtime-capability-contract.md)。具体对象的字段仍以各自 canonical API Reference 为准。
