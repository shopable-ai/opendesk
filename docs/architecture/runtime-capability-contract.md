# Runtime Capability Contract

## 目标

OpenDesk 的多个公开对象都提供 `getCapabilities()`，但它们面对的资源不同：桌面 UI、Accessibility、Recorder、Command、App Mode、LLM 与 Agent 并不需要返回完全相同的对象。

本合同冻结的是**共享字段的语义**，而不是强迫所有 API 共用一个大而全的数据结构。

目标：

- 同名字段在不同公开 API 中表达同一件事；
- 调用方能区分“未授权”“未实现”“配置不完整”“当前不可用”和“尚未探测”；
- `getCapabilities()` 保持只读诊断能力，不被误解成业务调用前的强制握手；
- canonical 文档、类型声明与 Runtime 行为使用同一语义；
- 不新增没有必要的全局 `Capabilities` API。

## 非目标

本轮不做：

- 不引入 `Capabilities.get(name)`；
- 不把所有现有 capability 返回类型强制改成同一个 TypeScript interface；
- 不因为字段缺失而给旧 API 人工补假值；
- 不把真实网络请求、CLI 登录、系统授权弹窗或其他副作用塞进只读 capability 查询；
- 不把 `available: null` 自动转换为 `false`。

## 共享字段语义

公开 capability 对象只要使用下列字段名，就必须遵守这里的定义。

| 字段 | 统一语义 | 不能表示 |
| --- | --- | --- |
| `enabled` | 当前 Execution 的 policy / authorization 是否允许使用这项能力。 | 不代表平台一定实现，也不代表真实调用会成功。 |
| `supported` | 当前 Runtime、平台或已选 backend 是否有对应实现。 | 不代表已配置、已授权或当前可访问。 |
| `configured` | 本次选择所需的静态配置、Profile 或参数是否完整到可以尝试调用。 | 不代表密钥真实有效、CLI 已登录或远端服务可达。 |
| `available` | 对“此刻是否已知可以执行”的结论。允许 `true`、`false`，对明确不做 live probe 的 API 允许 `null`。 | `null` 不能解释为 `false`。 |
| `reason` | 当前 API 暴露该字段时，对 disabled / unsupported / unavailable 的机器可读原因。 | 不应塞入密钥、完整环境、服务响应正文或用户隐私内容。 |
| `checked` | 当前对象暴露该字段时，是否已经执行了它所定义的更深层探测。 | 不能仅因为静态配置完整就变成 `true`。 |
| `authenticated` | 当前对象能够可靠判断的认证状态；允许 `"unknown"` 表示未探测。 | `configured` 不能被当成认证成功。 |

### available 的三态

`available` 是最容易产生误解的字段：

```text
true   = 当前实现已经有足够证据认为可以执行
false  = 当前实现已经有足够证据认为不能执行
null   = 该 API 刻意没有进行足以得出 true/false 的探测
```

因此：

```text
available: null
!= unavailable
```

典型例子是 `LLM.getCapabilities()` 和 `Agent.getCapabilities()`：为了保持无副作用，它们不会真实调用模型、启动 CLI 做版本探测、测试登录或自动安装，所以 `available` 保持 `null` 是正确行为。

## API 映射

### automation.app

`automation.app.getCapabilities()` 判断当前 execution 是否处于可使用 App Shell 的 App Mode 环境，因此可以直接报告 `enabled` 与布尔 `available`。它不是 App Mode 启动握手；专用 `main.js` 不需要先调用它才能 `onAction()`。

### Command

`Command.getCapabilities()` 当前只需要表达 Execution policy 与 Runtime 实现，因此 `enabled` / `supported` 已足够。不要为了字段齐全而虚构 `configured` 或 `available`。

### LLM / Agent

这两类能力有明确的配置选择阶段，因此使用：

```text
enabled
supported
configured
checked
authenticated
available
```

其中 capability 查询保持无副作用，`available: null` 不表示 backend 不可用。

### ui / UI / Accessibility / Recorder

桌面能力可以拥有平台、driver、permission、implementation、子能力矩阵等更丰富字段。它们无需迁就 LLM/Agent 的对象形状；只要复用共享字段名，就遵守本合同定义。

## getCapabilities() 的产品语义

默认规则：

> `getCapabilities()` 是诊断、环境适配和可选分支判断接口，不是每条正常业务链路都必须执行的 preflight。

例如正常业务优先展示：

```js
const result = await LLM.generate({ prompt: "返回 OK" });
const agentResult = await Agent.run({ prompt: "返回 OK" });
automation.app.onAction(event => console.log(event.id));
```

而不是把下面写成强制第一步：

```js
LLM.getCapabilities();
Agent.getCapabilities();
automation.app.getCapabilities();
```

只有具体 API 的安全/平台合同明确要求调用方根据 capability 分支时，文档才应把该检查放进主链路。

## 演进规则

- 新增共享字段前先确认是否真的具有跨 API 稳定语义；否则使用 API 专属字段名。
- 已存在的共享字段不得在另一个 API 中复用成不同含义。
- `null`、`false`、`"unknown"` 必须保留差异，不做方便但错误的布尔化。
- capability 查询不得为了把 `available` 变成 boolean 而偷偷增加网络请求、CLI 启动、登录、安装、系统授权提示或桌面遍历。
- breaking shape 变化仍由各 API 自己的 schema/version 合同管理；本页不是统一返回类型版本号。

## 文档、类型与维护检查

需要同时保持一致：

```text
Runtime / native or polyfill implementation
→ types/*.d.ts
→ docs/api/<canonical-reference>.md
→ tests/runtime-api/manifest.js + Runtime contract
```

Agent 能力目录只负责按需导航到这些正式资料，不是第二套事实源。维护者修改这些边界后应运行：

```bash
node scripts/api-docs.js check
node scripts/check_api_docs_contract.js
```

用户侧如何读取这些字段见 [Capability 状态模型](../api/capabilities.md)。
