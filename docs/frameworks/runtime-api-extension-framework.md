# Runtime API 扩展与定制框架（Runtime API Extension Framework）

## 定位

本文件定义 OpenDesk 在新增、封装和交付 Runtime API 时的长期扩展框架。

它回答：

> 用户、集成开发者、源码维护者和商业定制分别应该在哪一层扩展能力？什么时候只写 JavaScript，什么时候使用 HTTP / MCP，什么时候必须修改 Go Runtime？

本文件是长期框架，不承担单个接口的用户教程。项目作者只想用 JavaScript 组合现有接口时，阅读 [Custom JavaScript API authoring](../implementation/runtime/custom-javascript-api.md)。

## 一、扩展能力四级模型

OpenDesk 不应把所有“自定义”混成一种方式。

推荐分成四级：

```text
L1 JavaScript 自助扩展
→ L2 HTTP / MCP 外置扩展
→ L3 Native / Go Runtime 扩展
→ L4 作者 / 维护者商业定制
```

### L1 JavaScript 自助扩展

适合：

- 默认参数。
- 参数校验。
- 返回值规范化。
- 多个已有 API 的组合。
- 应用 helper / adapter。
- 轻量兼容层。

原则：

```text
只依赖公开 API
不依赖 ____Inject
不修改 Go Runtime
不要求重新编译
```

这是普通用户首先应该选择的方式。

### L2 HTTP / MCP 外置扩展

适合能力本身已经存在于另一个进程、服务或语言生态的场景：

- Python / Node.js 服务。
- 模型服务。
- 数据库服务。
- 企业内部 API。
- 长时间任务服务。
- 独立 Agent / Workflow 服务。

推荐结构：

```text
OpenDesk
→ HTTP / MCP
→ External Capability Service
→ Structured Result
```

这一级不需要为了“能调用”而强行把第三方能力编译进 OpenDesk。

### L3 Native / Go Runtime 扩展

只有在以下情况才进入原生扩展：

- Runtime 当前根本没有所需 OS 能力。
- 需要新的系统原生 API。
- 需要设备、驱动或底层 SDK。
- 需要原生性能或资源控制。
- 需要新的权限模型。
- 需要改变 goja Runtime 的注册、生命周期或数据桥。
- 能力必须成为 CLI / HTTP / MCP 共用的核心能力。

这一层需要源码权限、重新构建、Runtime 级测试和文档同步。

### L4 作者 / 维护者商业定制

如果用户没有源码权限、使用的是二进制发行版，或者需要正式支持的原生能力，应允许其直接进入作者 / 维护者定制路径。

典型交付：

- 定制原生 API。
- 定制二进制构建。
- 企业内部软件 Adapter。
- 专有 OCR / Vision / 模型 provider。
- 专有 MCP Tool / HTTP API。
- 私有 Workflow / Skill。
- 权限、部署、长期运行和可靠性方案。
- 企业技术支持与维护。

这一层既解决“用户无法自己修改源码”的现实问题，也可以成为 OpenDesk 的商业服务入口。

## 二、默认决策顺序

新增需求时，不应默认修改 Go。

统一先问：

```text
1. 已有公开 JS API 能组合完成吗？
2. 能否通过 HTTP / MCP 调用外部服务完成？
3. 是否确实需要新增 Native / Go 能力？
4. 用户是否拥有源码和构建权限？
5. 如果没有，是否进入作者 / 维护者定制？
```

推荐决策：

| 需求 | 首选方式 |
| --- | --- |
| 组合已有能力 | JavaScript |
| 统一默认值 / 校验 | JavaScript |
| Python/Node 已有能力 | HTTP / MCP |
| 模型或数据库服务 | HTTP / MCP |
| 新 OS API | Native / Go |
| 新驱动 / SDK | Native / Go |
| 无源码但需要 Native | 联系作者 / 维护者定制 |
| 企业专有应用自动化 | Adapter + Workflow；必要时商业定制 |

## 三、Runtime API 的标准分层

核心 API 推荐使用以下结构：

```text
Native Capability
→ Native Adapter
→ Raw Bridge
→ Polyfill / Public Facade
→ Public API
→ Type / Docs / AI Index
```

### Native Capability

真实完成系统、设备、网络、视觉或数据工作的 Go 能力。

### Native Adapter

把底层实现转换成 Runtime 适合消费的参数、返回值和错误模型。

### Raw Bridge

Go 注入 goja 的内部桥对象。

建议内部命名类似：

```text
xxx____Inject
```

Raw Bridge 不属于普通脚本的稳定 API。

### Polyfill / Public Facade

负责：

- 用户友好的参数结构。
- 默认值。
- 参数检查。
- 兼容行为。
- 多个原生方法组合。
- 公开对象所有权。

### Public API

普通用户最终调用的对象，例如：

```text
page
window
Vision
axios
```

## 四、公开对象只有一个 owner

这是 Runtime 扩展最重要的规则之一。

正确：

```text
Go
→ custom____Inject
→ Polyfill
→ globalThis.custom
```

错误：

```text
Polyfill 设置 globalThis.custom
→ 后续 Go 又 runtime.Set("custom", ...)
```

后一种会把 Polyfill 增加的校验、默认值、拦截器和兼容逻辑静默覆盖。

因此每个公开 global 必须明确 owner：

```text
publicName
ownerLayer
rawBridge
polyfillFile
sourceFile
status
```

## 五、统一 Runtime Builder

所有执行入口必须构造同一套核心 Runtime。

包括：

```text
CLI file
CLI inline
CLI stdin
HTTP execution
legacy HTTP entry
MCP / Agent
runtime tests
```

入口只负责传递：

- script source。
- stack mode。
- timeout。
- execution context。
- logging / evidence configuration。

不得在不同入口私自注册不同 API。

目标结构：

```text
Entrypoint
→ Runtime Builder
→ Native Registry
→ Raw Bridges
→ Core Polyfills
→ User/Extension Polyfills
→ JS Libraries
→ Stack Facade
→ Script
```

## 六、Native Registry

原生能力应逐步从零散的 `runtime.Set()` 收敛成统一 Registry。

概念结构：

```text
RuntimeRegistry
├── console
├── http
├── system
├── window
├── clipboard
├── file
├── storage
├── sound
├── imageColor
├── OCR
├── Vision
├── page
├── browser
├── context
└── extensions
```

统一 Registry 的价值：

- CLI / HTTP / MCP 保持一致。
- 可以自动检查 global 冲突。
- 可以自动生成 API manifest。
- 可以给每个能力标记平台、权限和成熟度。
- 可以为商业定制增加受控扩展点，而不是修改多个入口。

## 七、Core Polyfill 与 User Extension 分离

长期不建议把官方核心 Polyfill 和用户自定义文件永久混在一个目录。

推荐未来加载顺序：

```text
1. Native Registry
2. Core Polyfills
3. User Polyfills
4. Project Polyfills
5. JS Libraries
6. Stack Facade
7. User Script
```

候选目录：

```text
polyfills/                     # 官方核心
~/.opendesk/polyfills/         # 当前用户
.opendesk/polyfills/           # 当前项目
```

加载方式应该是 **merge / append**，不是“找到第一个目录就完全替代其他目录”。

在这一机制正式实现前，用户文档必须明确当前限制，不能假装已经有成熟插件系统。

## 八、参数、返回值和错误契约

### 参数

公开 API 优先使用对象参数：

```js
custom.run({
  target,
  timeout,
  strict
});
```

优点：

- 可向后兼容增加字段。
- 易于 Agent 生成。
- 易于类型声明。
- 易于 HTTP/MCP 映射。

### 返回值

业务能力优先返回结构化结果：

```json
{
  "ok": true,
  "status": "completed",
  "data": {},
  "evidence": {}
}
```

不要长期使用含义模糊的：

```text
true
false
null
"ok"
```

作为复杂业务能力唯一结果。

### 错误

错误至少应能区分：

```text
invalid_input
unsupported
permission_denied
not_found
ambiguous_target
timeout
native_failure
verification_failed
```

Polyfill 不应吞掉真实 Native 错误后返回假成功。

## 九、同步与异步边界

普通 Go → goja 方法映射本质上不因为 JavaScript 外层写了 `async` 就自动变成异步后台任务。

长时间原生任务优先采用任务模型：

```text
start(options) → jobId
status(jobId)
cancel(jobId)
result(jobId)
```

或者使用专门设计并经过并发安全验证的 Promise Bridge。

不要让一个普通 API 在不可取消的 Go 调用中无限阻塞 Runtime。

## 十、接口状态与成熟度

新增接口默认不能直接标记 Stable。

推荐：

```text
Experimental
→ Conditional / Secondary
→ Stable
```

进入 Stable 至少需要：

- 公开 API 契约已稳定。
- Native / Polyfill owner 明确。
- 成功路径真实运行。
- 失败路径有测试。
- 权限和平台边界明确。
- CLI / HTTP / MCP 需要共享时行为一致。
- 文档、类型、机器索引同步。
- 有可重复 Evidence。

## 十一、源码权限与发行版边界

文档不能默认所有用户都有源码，也不能默认所有用户都只有二进制。

应使用条件式表述：

```text
如果拥有源码和构建权限
→ 可以由维护者进行 Native / Go 扩展

如果只有二进制发行版
→ 无法自行修改已编译 Go Runtime
→ 优先 JavaScript / HTTP / MCP
→ 必须增加 Native 时联系作者 / 维护者定制
```

这样既保持技术事实准确，也为不同发行模式保留空间。

## 十二、商业定制应该产品化，而不是临时接活

“联系作者定制”不应只是一句话。

建议形成标准需求入口：

```text
需求提交
→ 技术分层判断
→ 方案选择
→ 范围和验收条件
→ 商业报价 / 排期（如适用）
→ 实现
→ 测试与 Evidence
→ 定制构建 / Adapter / Service 交付
→ 后续维护
```

### 定制需求最小输入

```text
业务目标
操作系统 / 应用版本
输入
输出
现有 API 缺口
权限约束
部署方式
运行时长
失败成本
验收标准
是否允许通用能力回馈核心项目
```

### 可以形成的服务类型

```text
Native API 定制
企业应用 Adapter
Workflow / Skill 开发
MCP / HTTP 集成
OCR / Vision provider 集成
模型和 Agent 集成
长期运行与可靠性工程
私有构建
部署支持
优先维护 / SLA
```

### 核心项目与私有定制的边界

定制需求完成后需要决定：

```text
通用、低风险、可维护能力
→ 可以上收核心

客户专有业务逻辑
→ 保留私有 Adapter / Workflow

敏感配置和凭据
→ 永远不进入核心仓库
```

商业定制不能破坏核心 Runtime 的统一注册、测试和安全边界。

## 十三、联系入口治理

用户文档可以明确写：

> 需要原生能力、企业集成或定制构建时，请联系 OpenDesk 项目作者 / 维护者。

但不建议在多个 API 页面分别写私人邮箱、微信号等硬编码联系方式。

长期应建立一个统一官方入口，例如：

```text
SUPPORT.md
GitHub Issue template
GitHub Discussions
官网 Support / Contact 页面
统一商务邮箱
```

然后所有文档只链接这一处。

这样更容易：

- 更换联系方式。
- 区分 Bug、功能建议和商业定制。
- 统计需求。
- 建立报价与交付流程。
- 避免个人联系方式散落在仓库中。

## 十四、与现有框架的关系

- `automation-framework.md`：自动化总体分层与执行闭环。
- `capability-development.md`：能力从简单到复杂的成熟度路径。
- `app-development-framework.md`：具体应用 Adapter / Skill / Workflow 的开发方式。
- `../implementation/runtime/custom-javascript-api.md`：项目作者的 JavaScript 自定义指南。
- `../architecture/`：长期系统结构和契约。
- `../implementation/runtime/`：当前 Runtime 实现细节。
- `../quality/`：测试、Gate 和 Evidence。
