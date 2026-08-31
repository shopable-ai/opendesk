# Runtime 扩展、资源内嵌与第三方 Native Extension 路线计划

## 状态

本文件记录 Clawdesk Runtime 扩展体系的候选演进路线。

它是 Plan，不代表当前能力已经实现。

当前事实以：

```text
源码
→ 可重复测试 / Runtime Evidence
→ docs-user-api/
→ 本计划
```

为准。

## 一、为什么现在只做计划，不立即实现所有扩展机制

Clawdesk 当前还处于核心能力、可靠性、Recorder、Layout、MCP / HTTP 等基础能力持续建设阶段。

目前还没有足够真实用户证明以下功能已经成为高频阻塞：

- User Extension 独立目录。
- Project Extension 自动加载。
- Embedded Core JS。
- 第三方 Native Plugin Marketplace。
- JavaScript 混淆 / 逆向保护。

因此本计划采用：

```text
先把边界和升级路径设计清楚
→ 保留低成本当前用法
→ 出现真实复用 / 发行 / 性能需求后再实现对应层
```

不要因为架构上“应该有”就提前制造插件框架。

---

# 二、当前 JavaScript 自定义已经能解决什么

当前一个 `polyfills/` 目录本身已经可以加载多个 `.js` 文件。

所以未来 Core / User / Project 分层**不是为了支持多个 JS 文件**。

真正解决的是：

```text
谁维护这段 JS？
它影响一个项目还是所有项目？
升级 Clawdesk 时是否会被覆盖？
用户是否需要修改官方 Runtime 资源目录？
如何避免命名 / global 冲突？
如何知道 Runtime 最终加载了哪些扩展？
```

如果目前只是开发者自己使用：

```text
把一组 JS 文件复制到当前完整 polyfills/ 目录
→ 按文件名排序加载
```

已经可以完成多数共享脚本需求。

因此正式 User / Project Loader 目前属于便利性和治理增强，不属于必须立即实现的基础能力。

---

# 三、当前 Polyfill 文件加载事实

当前 Runtime：

```text
选中一个 polyfills/ 目录
→ 读取该目录第一层 *.js
→ Go sort.Strings() 排序
→ 逐个执行
```

加载顺序不是数值排序，而是完整文件名字符串排序。

当前 Core 文件中还存在：

```text
url-search-params.js
```

这样的无数字前缀文件。

因此：

```text
900-custom.js
```

不代表它一定在所有官方 Polyfill 之后。

这一事实已经同步到：

```text
docs-user-api/custom-api.md
```

### 后续低成本治理项

即使暂时不做正式 Extension Loader，也可以择机统一官方 Core 文件命名：

```text
000-...
001-...
002-...
...
```

要求：

- 固定宽度数字前缀。
- 顺序表达真实依赖。
- 不用文件名保存版本历史。
- 重命名前先验证是否存在硬编码路径引用。

这属于低风险可维护性工作，不等于开发插件系统。

---

# 四、候选 JavaScript 分层

长期候选模型：

```text
Core Polyfills
User Extensions
Project Extensions
```

而不是：

```text
Core Polyfills
User Polyfills
Project Polyfills
```

因为 `polyfill` 应保留为 Clawdesk Runtime 官方实现概念；用户自己的 JavaScript 更适合称为 Extension。

## 4.1 Core Polyfills

```text
维护者：Clawdesk
作用域：所有 Runtime
生命周期：跟随 Clawdesk 版本
用途：公开 API facade、兼容、默认值、Runtime 基础能力
```

## 4.2 User Extensions

未来候选位置：

```text
~/.clawdesk/extensions/*.js
```

作用于当前用户的所有 Clawdesk 使用场景。

适合：

- 通用 helper。
- 公司内部公共 JavaScript API。
- 用户自己的日志 / 文件 / HTTP 工具。
- 多项目重复使用的封装。

## 4.3 Project Extensions

未来候选位置：

```text
<project>/.clawdesk/extensions/*.js
```

只作用于一个项目。

适合：

- App Adapter。
- Layout / Locator helper。
- Recorder 生成的项目稳定脚本。
- 当前项目 Workflow helper。
- 私有业务 API。

## 4.4 为什么当前优先级较低

没有正式 Loader 时，开发者已经可以通过：

```text
复制 JS 文件
→ 放入当前完整 polyfills/
→ 调整文件名顺序
```

完成主要功能。

正式分层 Loader 的增量价值主要是：

- 不污染 Core。
- 不怕升级覆盖。
- 自动区分用户 / 项目作用域。
- 冲突检查。
- Evidence。
- 更适合二进制发行。

只有这些痛点开始真实出现后，再进入正式实现更合理。

---

# 五、未来正式加载模型

当实现 User / Project Extension 时，目标顺序候选为：

```text
Go Native Registry
→ Core Polyfills
→ Core JS Libraries
→ Stack / Compatibility Facade
→ Execution Context
→ User Extensions
→ Project Extensions
→ User Script
```

核心原则：

> User / Project Extension 应看到最终稳定的公开 Runtime API，而不是中间 Raw Bridge。

层内多个 JS 文件仍使用确定性排序。

推荐：

```text
100-base.js
200-file.js
300-vision.js
400-actions.js
```

固定宽度，避免字符串排序误解。

正式实现时必须补：

- missing directory = 正常；
- syntax / execution error 带 scope + filename；
- Reserved Global 冲突检测；
- disable user / project extension；
- 加载 Evidence；
- CLI / HTTP / MCP Runtime 一致性。

---

# 六、Embedded Core JavaScript：记作发行计划，而不是当前安全工程

当前 macOS App 构建仍会把：

```text
polyfills/
jslibs/
```

复制到 App 目录，因此官方 JavaScript 仍以明文文件存在。

长期候选方案：

```text
Go embed / embed.FS
```

实现：

```text
Core Polyfills
→ 编译期嵌入 binary

Core JS Libraries
→ 许可允许的前提下嵌入 binary
```

运行时：

```text
Embedded FS
→ 排序
→ 读取
→ goja 执行
```

## 6.1 当前真正价值

Embedded JS 目前更应该因为以下原因进入计划：

- 单 binary / App 自包含。
- 构建和安装更简单。
- 不再因为外部 `polyfills/` 路径错误导致 Runtime 初始化失败。
- 用户不能误删 / 误改官方 Core 文件。
- Core 与 User Extension 边界更自然。

而不是因为：

```text
防止专业逆向
```

## 6.2 当前不优先做逆向保护

目前没有足够用户或商业发行规模，因此：

```text
minify
obfuscation
自定义加密
反调试
```

都不是当前值得优先投入的工作。

Go embed 也不能等同于密码学意义上的不可逆闭源。

如果未来出现真正需要保护的核心算法，优先把高价值逻辑移动到：

```text
Go Native Implementation
```

或者必要时：

```text
Remote Proprietary Service
```

而不是依赖 JavaScript 混淆。

## 6.3 jslibs 注意事项

`jslibs/` 中存在第三方 JavaScript。

未来 Embedded 前必须检查：

- license；
- copyright notice；
- 是否需要 THIRD_PARTY_NOTICES；
- 当前版本来源。

把第三方代码嵌入 binary 不会消除许可证义务。

---

# 七、更重要的长期问题：用户没有 Clawdesk 源码，怎样开发高性能底层扩展

这比单纯增加 Lua Runtime 更值得设计。

目标应该是：

> 用户只获得稳定的 Extension SDK / ABI，不需要 Clawdesk 核心源码，也可以使用 Go、Rust、C/C++ 或其他语言开发扩展。

长期建议把扩展能力分成五档：

```text
A. JavaScript Extension
B. Out-of-Process Native Extension
C. WebAssembly Extension
D. Trusted Native Shared Library
E. Source-level Core Extension
```

---

# 八、A：JavaScript Extension

用途：

```text
组合已有能力
业务 helper
Adapter
Workflow support
```

优点：

- 开发最快。
- 不需要源码。
- 不需要编译。
- 最容易分发。

缺点：

- 不能创造 Runtime 没有暴露的 OS Native 能力。
- 不适合极端性能任务。

这是普通用户默认扩展层。

---

# 九、B：Out-of-Process Native Extension——推荐的第一种无源码高级扩展

用户编写一个独立程序：

```text
Go
Rust
C++
Python
Node
Java
...
```

编译 / 打包成独立可执行程序。

Clawdesk：

```text
启动 Extension Process
→ Handshake
→ RPC
→ Structured Result
```

用户不需要得到 Clawdesk 核心源码。

## 9.1 为什么推荐优先做这个

进程边界天然解决：

- Clawdesk 与 Extension 编译器版本解耦。
- Extension 崩溃不一定直接破坏主 Runtime。
- 多语言支持。
- Windows / macOS / Linux 更容易统一。
- 可以单独升级。
- 可以对 CPU / memory / timeout / kill 做治理。

## 9.2 V1 协议候选

最简单：

```text
stdio
+ JSON-RPC / line-delimited JSON
```

例如：

```text
clawdesk → extension stdin
extension → clawdesk stdout
```

适合控制型调用。

后续如果图像、大块二进制数据成为瓶颈，再升级：

```text
Unix Domain Socket / Named Pipe
+ length-prefixed binary protocol
+ MessagePack / Protobuf / CBOR
```

大图片还可以使用：

```text
temp file
memory-mapped file
shared memory
```

避免 base64 反复复制。

## 9.3 Extension SDK

未来可以公开：

```text
protocol schema
manifest schema
Go SDK
Rust SDK
Python SDK
examples
conformance tests
```

而不是公开 Clawdesk 核心源码。

这是最适合作为第三方高级扩展 V1 的方向。

---

# 十、C：WebAssembly Extension——安全、跨平台的计算扩展候选

用户可以使用：

```text
Rust
TinyGo
C/C++
其他可编译到 Wasm 的语言
```

生成：

```text
extension.wasm
```

Clawdesk 内嵌 Wasm Runtime，加载执行。

优点：

- 不要求 Clawdesk 源码。
- 跨平台。
- 内存隔离。
- 可以通过 Host Functions 精确开放能力。
- 比直接加载任意动态库更容易建立安全边界。

适合：

- 图像 / 数据计算。
- 解析器。
- 规则引擎。
- 纯算法扩展。
- 希望一个 Extension binary 跨多个平台运行的场景。

限制：

- Wasm 默认不能任意访问宿主 OS。
- 新 Native OS API 仍然需要 Clawdesk Host Function 或 WASI 能力支持。
- Host/Guest ABI、内存和数据传输需要额外设计。

因此 Wasm 很适合作为中期“安全高性能扩展”，但不是当前第一优先级。

---

# 十一、D：Trusted Native Shared Library——最高性能但风险最高

真正要求进程内 Native 性能时，可以设计稳定 C ABI。

Extension 可以由：

```text
Go -buildmode=c-shared
Rust cdylib
C / C++
Zig
...
```

编译为：

```text
macOS  .dylib
Linux  .so
Windows .dll
```

Clawdesk 动态加载。

## 11.1 不要暴露 Go struct ABI

推荐只设计稳定 C ABI，例如概念上：

```text
clawdesk_extension_abi_version()
clawdesk_extension_init(host_v1, extension_v1)
clawdesk_extension_invoke(method, input_bytes, output_bytes)
clawdesk_extension_shutdown()
```

数据边界优先：

```text
opaque handle
byte buffer
JSON / MessagePack / Protobuf
```

不要让第三方 Extension 直接依赖 Clawdesk 内部 Go struct、interface 或 package layout。

这样用户只需要：

```text
clawdesk_extension.h
ABI spec
sample SDK
```

不需要 Clawdesk 核心源码。

## 11.2 风险

进程内共享库：

- crash 可以直接带崩 Clawdesk；
- 内存安全问题更严重；
- 平台 ABI / codesign / notarization 更复杂；
- 动态库生命周期复杂；
- 安全信任要求高。

因此只应作为：

```text
Trusted / Advanced Native Extension
```

而不是普通插件默认方式。

---

# 十二、为什么不建议把 Go `plugin` 作为主扩展机制

Go 标准 `plugin` 的优点是同进程、调用直接、性能高。

但它不适合成为 Clawdesk 的主要第三方插件 ABI：

- 平台支持不完整，尤其不适合作为 Windows / macOS / Linux 统一方案。
- 主程序与插件需要高度一致的 Go toolchain / package 构建环境。
- 部署和版本兼容脆弱。
- 官方文档本身也列出多项重要限制和警告。

因此：

```text
Go plugin
→ 可以做内部实验
→ 不作为正式跨平台 Extension SDK 主路线
```

需要 Go 用户开发无源码扩展时，更推荐：

```text
Go executable + RPC
```

或者高级模式：

```text
Go -buildmode=c-shared
→ C ABI
```

---

# 十三、Lua 要不要加入

目前不建议因为“可扩展”而单独嵌入 Lua Runtime。

Clawdesk 已经有 JavaScript Runtime，因此 Lua 只能在出现以下真实需求时再考虑：

- 大量目标用户已经拥有 Lua 脚本资产。
- 某个游戏 / 应用 / 自动化生态以 Lua 为核心。
- 有成熟 Lua SDK 必须直接复用。

否则：

```text
JavaScript
+ Native RPC Extension
+ Wasm
```

已经覆盖大部分需求。

增加 Lua 会新增：

- 第二套脚本 API 映射；
- 第二套类型 / 文档；
- 第二套错误模型；
- 第二套测试矩阵；
- JS / Lua 行为一致性问题。

所以 Lua 当前为：

```text
Not Planned / Demand-driven
```

而不是 Extension V1。

---

# 十四、E：Source-level Core Extension

如果用户或合作方确实拥有 Clawdesk 核心源码和构建权限：

```text
直接 Go package 开发
→ Native Registry
→ Raw Bridge
→ Public API / Polyfill
→ tests
→ build
```

仍然是集成最深的方式。

适合：

- 核心 OS 能力。
- Runtime 生命周期修改。
- 关键性能路径。
- 官方长期维护能力。

但第三方生态不能把“获取整个核心源码”作为唯一扩展前提。

---

# 十五、推荐长期扩展梯度

最终希望形成：

```text
普通业务组合
→ JavaScript Extension

已有独立能力 / 多语言
→ Native Process Extension

跨平台安全计算
→ WebAssembly Extension

极端低延迟 / 大数据吞吐
→ Trusted Shared Library C ABI

修改 Runtime 核心
→ Source-level Go Extension / Maintainer Customization
```

这个梯度比简单的：

```text
JS
→ 改 Go 源码
```

更加完整。

---

# 十六、未来 Extension Package 候选

只有出现正式 Extension Loader 需求后再实现。

概念结构：

```text
my-extension/
├── extension.json
├── js/
│   └── index.js
├── bin/
│   ├── darwin-arm64/
│   │   └── extension
│   ├── windows-amd64/
│   │   └── extension.exe
│   └── linux-amd64/
│       └── extension
└── README.md
```

或者 Wasm：

```text
my-extension/
├── extension.json
└── extension.wasm
```

Manifest 未来可以包含：

```text
id
version
extensionApiVersion
type: js | process | wasm | native-library
entry
platforms
capabilities
permissions
```

但在没有真实用户之前，不要提前建立 Marketplace / Registry / dependency solver。

---

# 十七、优先级

## 当前 P0

```text
继续保证现有 Runtime API 正确性
补全真实测试 / Evidence
明确当前 Polyfill 加载规则
避免文档声称不存在的扩展能力
```

## P1：出现明显 JS 重复复制 / 多项目污染后

```text
User Extensions
Project Extensions
确定性排序
冲突检测
加载 Evidence
```

## P1 / P2：进入正式二进制发行、安装复杂度成为问题后

```text
Embedded Core Polyfills
Embedded Core JS Libraries
self-contained binary / app
第三方 license audit
```

Embedded 的第一价值是发行可靠性，不是逆向保护。

## P2：出现第三方高级能力需求后

优先研究 / Prototype：

```text
Out-of-Process Native Extension SDK
```

其次：

```text
WebAssembly Extension
```

## P3：有明确极端性能客户后

```text
Trusted Shared Library C ABI
```

## 暂不优先

```text
Lua Runtime
Go plugin 生态
JavaScript 混淆
Extension Marketplace
在线自动安装
复杂权限系统
```

---

# 十八、进入实现阶段前必须回答的问题

任何 Extension 机制真正立项前，先回答：

```text
1. 谁是实际用户？
2. 当前手工复制 JS 为什么不够？
3. 是作用域问题、升级问题、安全问题还是性能问题？
4. 数据量和调用频率是多少？
5. Extension 是否可信？
6. Extension 崩溃能否接受带崩 Clawdesk？
7. 是否必须跨 Windows / macOS / Linux？
8. 是否需要访问 Clawdesk 内部能力？
9. 是否需要访问任意 OS Native API？
10. 是否真的需要进程内性能？
11. API / ABI 的兼容周期是多少？
12. 用户是否有源码、SDK，还是只有发行 binary？
```

只有这些问题有真实答案后，再选择 JS / Process / Wasm / Shared Library / Source-level Go。

---

# 十九、当前推荐结论

当前阶段：

```text
文件加载顺序
→ 立即文档化

User / Project JS 分层
→ 保留计划，暂不作为高优先级实现

Embedded JS
→ 作为 self-contained distribution 计划
→ 暂不投入逆向保护工程

无源码高级扩展
→ 优先规划 Out-of-Process Native Extension SDK
→ 中期评估 Wasm
→ 极端性能再设计稳定 C ABI Shared Library

Lua
→ 暂不增加第二套脚本 Runtime

Go plugin
→ 不作为跨平台正式插件主路线
```

这能保持当前 Clawdesk 简单，同时为未来用户、自定义开发和商业集成保留足够大的扩展空间。
