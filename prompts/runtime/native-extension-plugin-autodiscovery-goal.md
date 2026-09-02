# Native Extension Plugin Auto-Discovery & Immutable JS Binding V1 Goal

## 一、背景与问题

当前仓库已经有 Native Process Extension V0：Host 可以通过 stdin/stdout JSON
协议 one-shot 调用独立 executable，低层 JavaScript 入口形态类似：

```js
NativeExtension.call({
  extension: "native-ext-go-basic",
  method: "hello",
  params: { name: "OpenDesk" }
});
```

这个接口可以验证 process、protocol 和源码隔离，但它仍然暴露了 executable 路由
细节。它不是理想的日常插件体验。

本轮要把它推进为一个最小的 **Native Extension 自动发现与不可变 JavaScript Binding
Prototype**：第三方把完整插件 bundle 放进 OpenDesk 规定的目录，Runtime 自动发现和
严格校验 manifest，再由 Host 按 manifest 生成只读 JavaScript 对象和方法 closure。
业务脚本只传业务参数，不再在每次调用时传 `extension`、`executable`、`method` 或
protocol 字段。

已经评估“让插件携带自定义 JS 文件完成接口映射”的方向。它适合未来提供参数重载、
组合和兼容层，但当前 Runtime 中第三方 JS 与 `File`、`System`、`page`、原型链及其他
global 处于同一个 Goja realm。把它像 polyfill 一样自动加载，会让 discovery 直接变成
全权限代码执行，无法达到本轮 95 分以上的安全和可验证标准。因此 **V1 主线不执行
第三方 facade.js**；先完成 manifest-generated binding。自定义 facade 只作为 V1.1 的
后续设计项，必须先有独立 capability-scoped realm 或同等级隔离边界。

## 二、唯一核心目标

真实证明：

```text
OpenDesk binary
+ Native Extension bundle in a documented default directory
+ public manifest
+ Native Process Protocol V0
```

即可在没有 OpenDesk Core 源码的环境中自动发现插件，并运行：

```js
NativeExtensions.goBasic.hello({ name: "OpenDesk" });
NativeExtensions.goBasic.add({ a: 20, b: 22 });
NativeExtensions.macosVision.ocr({ imagePath: "/absolute/path/input.png" });
```

上面的 `NativeExtensions.<namespace>.<method>(params)` 是本轮首选目标形态。开始
修改前必须检查当前 Runtime API 命名、Goja 动态对象能力和类型治理；如果确有架构
冲突，可以选择等价但同样不暴露 executable/method 路由字段的 facade，并在实现前
记录理由。不得退回到让日常业务脚本继续传 executable path。

### 专家架构结论（本 Goal 的强制分层）

V1 采用三层，但路由和公开 binding 都由 Host 从严格 manifest 生成：

```text
Layer 1: manifest + registry
  负责发现、身份、版本、namespace、native method 白名单、路径和 timeout

Layer 2: host-generated immutable JS binding
  为每个 plugin 创建 namespace 和 method closure
  closure 已绑定 plugin id、canonical executable、wire method 和 timeout policy
  用户不能在调用参数中改变路由

Layer 3: existing Native Process Host V0
  负责 executable、one-shot process、JSON protocol、timeout、errors 和 Evidence
```

运行时按 manifest methods 自动生成
`NativeExtensions.<namespace>.<method>(params, options?)`。`NativeExtensions` 是唯一公共
owner，每个插件只拥有自己的 namespace；root、namespace 和 method properties 都必须
不可写、不可配置并冻结。对象参数是当前仓库最一致、最易演进的公开调用方式，不是
transport 参数泄漏。

当前 Runtime 的 core polyfills/jslibs 是按文件名排序后直接在共享 global realm 中
`goja.Compile + RunProgram`；event loop 还隐式提供通用 CommonJS `require`，但它可以从
host filesystem/cwd 搜索模块，既不受 plugin bundle containment 约束，也不是插件隔离
边界。本轮不得复用 polyfill loader 或通用 `require` 加载第三方插件 JS，也不得为了
facade 顺便建设完整 ESM/module system。

## 三、术语校准：自动加载不等于发现即执行

本轮的“自动加载”固定表示：

```text
Runtime 初始化
→ 搜索受控默认目录
→ 读取 manifest
→ 校验 bundle、executable、method allowlist 与 bounds
→ 建立 immutable registry
→ 由 Host 注册 inert JS namespace/method closures
```

发现阶段不能启动 Extension process，也不执行第三方插件 JS。Extension process 仍保持
V0 one-shot，并在生成的 JavaScript method 真正被调用时才启动：

```text
NativeExtensions.goBasic.hello({name: "OpenDesk"})
→ immutable closure 使用已绑定的 wire method / timeout
→ registry 定位 plugin + executable + method
→ 启动一次 process
→ Protocol V0 request/response
→ process exit
→ 返回 result
```

仅仅把 bundle 放进目录，不能导致 native executable 或任意第三方 JS 在 Runtime 启动时
执行。否则任意文件投放都会变成本地代码执行入口，并且会迫使本轮引入 persistent
lifecycle、heartbeat、shutdown 和 crash recovery。真正的 custom JS facade、startup
activation / daemon extension 留到独立 Goal，不得混入本轮。

## 四、状态和兼容边界

- 新的 discovery、manifest 和 JS binding 只能标记为 **Experimental**。
- 复用现有 `pkg/nativeextension` Host 和 Protocol V0，不再实现第二套 RPC Host。
- 保留低层 `NativeExtension.call({ executable, ... })` 作为诊断/兼容入口，但用户文档
  必须把自动发现后的 facade 作为日常入口。
- 不得把 Prototype 写成 Stable Plugin Platform、Stable ABI 或完整 SDK。
- 不创建或切换 Git 分支；在用户指定的主分支工作。
- 当前工作树可能很脏，必须保护用户和并行任务已有改动。

最终结论必须分别列出：

```text
Implemented
Tested
Verified
Experimental
Not Implemented
```

## 五、默认目录

开始实现前先审计当前 binary、`.app`、polyfills/jslibs、配置和 OS path abstraction。
至少提供两种不依赖源码目录的正式发现根：

```text
1. portable / app-bundled root
2. current-user OS-standard root
```

macOS 候选约定：

```text
Portable CLI:
<opendesk executable dir>/native-extensions/

App bundled:
OpenDesk.app/Contents/Resources/NativeExtensions/

Current user:
~/Library/Application Support/OpenDesk/NativeExtensions/
```

如实现 system-wide root，则使用：

```text
/Library/Application Support/OpenDesk/NativeExtensions/
```

不得凭印象硬编码最终路径。先检查仓库已有 App Support / config directory helper，优先
复用。需要明确并测试搜索顺序、重复 plugin id / namespace 的处理规则，以及 CLI、`.app`
和 portable package 的实际路径。

建议优先级只能在验证后确定，且必须 fail closed：不得让当前工作目录或任意祖先目录
静默覆盖可信插件。测试可通过显式环境变量或内部 test option 注入临时 discovery root，
但产品运行不得依赖源码 cwd。

## 六、Plugin bundle 与 manifest

默认目录中的每个插件是一个独立 bundle，而不是散落的裸 executable：

```text
NativeExtensions/
  com.example.go-basic/
    extension.json
    bin/
      native-ext-go-basic
    types/
      index.d.ts              # optional, editor only
    README.md                 # optional
```

建立最小 manifest schema，例如：

```json
{
  "schemaVersion": 1,
  "id": "com.example.go-basic",
  "version": "0.1.0",
  "protocol": {
    "name": "opendesk-native-extension",
    "version": 1
  },
  "executable": "bin/native-ext-go-basic",
  "javascript": {
    "namespace": "goBasic"
  },
  "methods": {
    "hello": {
      "wireMethod": "hello",
      "timeoutMs": 3000
    },
    "add": {
      "wireMethod": "add",
      "timeoutMs": 3000
    }
  }
}
```

至少固定并校验：

```text
schemaVersion
id
version
protocol.name
protocol.version
executable
javascript.namespace
methods
methods.<name>.wireMethod
methods.<name>.timeoutMs
```

要求：

- `id`、namespace 和 method name 使用明确的安全字符集。
- executable 必须是 bundle 内的相对路径；拒绝 absolute path、`..`、NUL 和逃逸。
- 解析 symlink 后仍必须位于 bundle 内，或明确记录并测试更严格的禁止 symlink 规则。
- executable 必须是可执行普通文件。
- manifest 可记录 executable SHA-256 用于一致性和 Evidence；必须明确未签名 hash
  只能证明内容匹配 manifest，不能建立发布者信任。
- manifest 使用严格 JSON，未知字段策略必须固定；Prototype 推荐 fail closed。
- duplicate plugin id、duplicate JS namespace、duplicate method 不得静默覆盖。
- manifest 只描述公开路由和非敏感默认值；不得包含账号、token 或业务 params。
- 建立正式 JSON Schema，例如
  `schemas/native-extension/extension-manifest-v1.schema.json`。

本轮不需要在线 registry、下载、安装器或依赖解析。

## 七、自动发现 Registry

新增一个可测试的 registry/discovery abstraction，职责至少包括：

```text
enumerate configured roots
→ find direct child plugin bundles
→ read extension.json with size limit
→ validate schema and paths
→ validate executable
→ resolve deterministic registry
→ create immutable plugin descriptors and method bindings
→ expose registered namespace/method metadata
→ emit privacy-minimized discovery diagnostics
```

规则：

- discovery 不运行 Extension process。
- registry 在一次 Runtime execution 中保持冻结；V1 不做 hot reload。
- 一个损坏插件不能导致健康插件被静默替换。
- collision、invalid manifest、path escape、permission denied 等必须有可诊断错误。
- 不扫描 cwd、源码祖先或任意 PATH executable。
- 不根据 method 猜 executable；路由只能来自已验证 manifest。
- 不把完整 manifest、环境变量或用户业务数据写入 Evidence。
- namespace/method 使用安全 identifier allowlist 和长度限制，并拒绝
  `__proto__`、`prototype`、`constructor`、`then`、`list`、`get`、`diagnostics`
  等保留名；同时做 case-fold collision 检查。
- 严格 JSON 必须拒绝重复 key、unknown fields、过大/过深 manifest、过多 methods 和
  超过 Host hard cap 的 timeout。仅使用 `DisallowUnknownFields` 不足以拒绝重复 key。
- 已发现 artifact 在调用前重新校验类型、权限和 digest；被替换时返回
  `artifact_changed`，不能执行新文件。必须诚实记录 TOCTOU 无法被 V1 完全消除。

可以提供只读诊断接口，例如：

```js
NativeExtensions.list();
NativeExtensions.diagnostics();
```

但不得在本轮引入 install/remove/reload/update 等 Manager 能力。

## 八、JavaScript Binding

### Canonical registry API 与 convenience namespace

正常调用优先使用自动注册且无冲突的 namespace：

目标调用必须只保留业务参数：

```js
const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
const ocr = NativeExtensions.macosVision.ocr({
  imagePath: "/absolute/path/input.png",
  recognitionLevel: "accurate",
  languages: ["zh-Hans", "en-US"]
});
```

同时提供一个只读 canonical lookup，供依赖注入、诊断和未来 alias 演进使用；plugin id
只在绑定时出现一次，不进入每次业务调用：

```js
const goBasic = NativeExtensions.get("com.example.go-basic");
goBasic.hello({ name: "OpenDesk" });
goBasic.add({ a: 20, b: 22 });
```

`get()` 接收的是 manifest canonical plugin id，不是 path、executable 或 process 参数。
namespace 冲突必须 quarantine 冲突插件而不是 last-wins；健康且唯一的其他插件仍可用。

### Binding 实现约束

每个 Goja method closure 在创建时必须复制并固定绑定，不能引用会在循环中变化的变量：

```text
plugin id
canonical bundle root
canonical executable
wire method
default timeout + hard cap
protocol identity/version
```

调用时只接收：

```text
params（JSON object；默认 {}）
optional call options（当前最多 timeoutMs）
```

业务参数不能覆盖 registry 中任何路由字段。`NativeExtensions` global、每个 namespace
对象和 method property 必须 non-writable、non-configurable；对象使用 null prototype 或
等价防 prototype-pollution 结构，并在注册完成后冻结。

业务脚本不再传：

```text
extension
executable
method
protocol
version
timeoutMs（正常情况使用 manifest default）
```

如必须允许单次 timeout 覆盖，应使用可选的第二个 call-options 参数，不能再次暴露
executable 路径：

```js
NativeExtensions.macosVision.ocr(params, { timeoutMs: 10000 });
```

成功直接返回 Extension `result`。失败抛真正的 JavaScript Error，并至少保留：

```text
error.code
error.pluginId
error.namespace
error.method
error.extensionCode
error.evidence
```

所有调用最终仍经过现有 Native Process Protocol V0 Host，不能让插件 import OpenDesk
内部 Go package。

### 为什么 V1 不自动加载自定义 JS

`NativeExtensions.goBasic.hello({...})` 已经是正常的 namespaced JavaScript 方法调用。
它与低层 `NativeExtension.call({extension, method, ...})` 的关键区别是：路由已由 Host
闭包固定，业务脚本看不到 transport。

如果后续真实使用证明需要 `hello("OpenDesk")`、`add(20, 22)`、多 RPC 组合或返回值
兼容层，再创建 V1.1 Trusted Adapter Goal。该 Goal 至少必须实现：

```text
bundle-confined loader
facade source size/hash limit
discovery compile-only, first-use lazy execution
plugin-bound invoke that rejects undeclared wire method
dedicated restricted Goja Runtime/Realm
JSON-only cross-realm boundary
no File/System/page/http/raw NativeExtension capability by default
```

在当前主 Runtime realm 中直接 `require()`、`eval()` 或把第三方文件塞进 polyfills 的方案
明确禁止，不能作为本 Goal 的“优化”。

## 九、类型与接口描述

必须同步仓库级公开描述：

```text
docs-user-api/
docs-user-api/runtime-api.ai.json
types/
tests/runtime-api/manifest.js
```

每个第三方插件可以携带可选 `types/index.d.ts`，用于把动态 facade 描述为：

```ts
interface GoBasicNativeExtension {
  hello(params: { name: string }): { message: string };
  add(params: { a: number; b: number }): { value: number };
}

interface OpenDeskNativeExtensionMap {
  goBasic: GoBasicNativeExtension;
}
```

必须明确：`.d.ts` 只服务编辑器，不参与 discovery、信任判定或 process 执行。若 V1
不实现自动类型合并，则文档给出真实可运行的手动 include/package 方式，不得伪造已实现
的类型加载能力。

## 十、安全与启用策略

这是 process-launching 能力，必须继续 fail closed：

- 仅受信任的本机 Runtime execution 可以启用。
- HTTP/MCP 不得因为请求字段而远程打开插件 process execution。
- 默认状态不扫描、不注入 global；只有本机 CLI Experimental registry gate 才执行 discovery
  并注入 `NativeExtensions`。`list/get/diagnostics` 不启动 child。
- registry gate 与任意绝对路径执行能力必须分离。不得因为启用了自动发现，就同时向用户
  脚本暴露可绕过 manifest/root 的 `NativeExtension.call({executable})`。绝对路径保留给
  Direct Host CLI，或单独的显式 unsafe local-development gate；HTTP/MCP 永远不能开启。
- 目录权限、bundle ownership、symlink/path escape、namespace pollution 和 collision 必须
  进入 threat model 与测试。
- 如果继续使用 `-experimental-native-extension` opt-in，文档必须准确说明它启用 registry
  invocation，不等于信任任意目录。
- 不允许插件 manifest 覆盖 `File`、`System`、`page`、`NativeExtension` 等核心 global。
- V1 最简单的安全策略是拒绝 discovery root、bundle、manifest 和 executable 路径链上的
  symlink；同时使用 Lstat、EvalSymlinks 和 `filepath.Rel(realBundle, realTarget)` 做双重
  containment 校验，不能用字符串前缀判断。
- 检查 root/bundle/artifact owner 与 group/world-writable、setuid/setgid 状态。无法跨平台
  统一保证的部分必须 fail closed 或列为明确平台限制。
- Native executable 一旦调用，拥有当前 OS 用户权限。V1 没有 sandbox/permission broker；
  不能因为目录、manifest 或 SHA-256 就声称插件安全或发布者已认证。

## 十一、必须复用 V0

开始修改前重新读取并验证当前真实状态，至少检查：

```text
pkg/nativeextension/
automation/native_extension.go
automation/utils.go
pkg/execution/
cmd/opendesk/
tests/runtime-api/unit/native-extension.test.js
tests/extensions/native-process/
scripts/test_runtime_apis.sh
python3 tests/extensions/native-process/tools/smoke-harness/main.py
docs-user-api/native-extension.md
types/NativeExtension.d.ts
```

如果当前代码仍是 dirty/uncommitted 状态，不得把旧 Evidence 当成当前源码的证明。先用
当前源码重跑 V0 baseline，再增加 discovery；不要复制第二套 Host、Protocol 或 smoke
测试域。

## 十二、测试要求

Runtime API 测试必须先读 `docs-user-api/`，并使用
`tests/runtime-api/` 下的 JavaScript，由 `scripts/test_runtime_apis.sh` 执行。

至少覆盖：

```text
discover bundled plugin
discover current-user plugin from OS-standard directory
default CLI without registry gate: no scan, no global, zero child
opt-in discovery/list/get/diagnostics: zero child
register immutable JS namespace and method closures
hello / add / real Apple Vision OCR through manifest-generated binding
no extension/executable/method routing fields in business script
manifest default timeout and optional safe override
invalid JSON manifest
duplicate JSON key / depth / size / method-count / timeout hard bounds
unknown manifest field / unsupported schema version
duplicate id / duplicate namespace / core-global collision
reserved and prototype-polluting id/namespace/method names
absolute executable / ../ traversal / NUL / backslash / volume path
root/bundle/manifest/executable symlink and symlink escape
missing executable / non-executable / directory / FIFO / unsafe permission
artifact replacement after discovery -> artifact_changed, never execute replacement
unknown plugin / unknown method
malformed params / structured Extension error
stderr diagnostics without stdout pollution
first real JS method invocation starts exactly one one-shot child
each later method invocation starts exactly one fresh one-shot child
root/namespace/method descriptors cannot be overwritten or deleted
plugin method closure cannot route to another plugin or undeclared wire method
HTTP/MCP cannot enable plugin execution remotely
Evidence privacy
Experimental status in docs/catalog/types
```

用 sentinel Extension 明确证明：Runtime discovery 完成后、JS method 尚未调用前，
Extension process 没有启动。

HTTP 两个真实 execution endpoint 都要传入恶意
`enableNativeExtensions/nativeExtensionRoots/executable` 字段并证明无 global、无 registry、
zero child；MCP tool list 和执行路径也不能自动出现插件。

## 十三、源码隔离与发行包验证

建立新的 `/tmp` proof package，不能依赖 repo cwd：

```text
/tmp/opendesk-native-plugin-proof-<runId>/
  opendesk
  polyfills/
  jslibs/
  native-extensions/
    com.example.go-basic/
      extension.json
      bin/native-ext-go-basic
      types/index.d.ts          # optional, editor only
    com.example.macos-vision/
      extension.json
      bin/native-ext-macos-vision
  scripts/plugin-smoke.js
  fixtures/ocr-test.png
```

从另一个空工作目录启动 packaged `opendesk`，真实运行：

```js
NativeExtensions.goBasic.hello(...)
NativeExtensions.goBasic.add(...)
NativeExtensions.macosVision.ocr(...)
```

proof 不得复制：

```text
.git/
automation/
pkg/
cmd/
OpenDesk Go source
Extension Go/Swift source
```

记录 package inventory、SHA-256、实际 resolved plugin/executable、child count、调用结果和
Evidence。还必须从 EventSink 证明 polyfills/jslibs 实际来自 proof package 而不是源码
cwd fallback。只有该证明通过，才能声明“默认目录自动发现且离开源码目录仍可运行”。

## 十四、Evidence

至少增加 discovery 与 invocation 两类 Evidence：

```text
native_extension_discovery:
  root kind（persistent Evidence 默认不记录含用户名的绝对 root）
  plugin id
  namespace
  manifest schema version
  executable relative path + digest
  status / error code
  duration

native_extension_call:
  plugin id
  namespace
  root kind + plugin id + relative executable（完整绝对路径仅本机显式 diagnostics）
  method
  protocol version
  request id
  startup / total duration
  exit code
  status
  error code / extension error code
  stderr captured bytes / truncated / digest
```

不得记录完整 params、result、raw stdout、图片路径或内容、home path、环境变量、账号、token
或完整用户 manifest。Extension stderr/error message 也可能包含秘密；persistent Evidence
默认只记录长度、截断状态和 digest，完整或 bounded 文本只能进入本机显式 opt-in 的临时
diagnostics。

## 十五、文档与使用说明

至少更新：

```text
docs-user-api/native-extension.md
docs-user-api/index.md
docs-user-api/README.md
docs-user-api/runtime.md
docs-user-api/runtime-api.ai.json
types/
examples/native-extensions/README.md
tests/extensions/native-process/README.md
docs/plans/runtime/runtime-extension-roadmap.md
```

真实通过后再创建或更新实现记录：

```text
docs/implementation/runtime/native-extension-plugin-discovery.md
```

关键用户文档必须直接回答：

```text
插件 bundle 放到哪里
bundle 内必须有哪些文件
manifest 怎么写
OpenDesk 何时发现插件
OpenDesk 何时真正启动 executable
JS 如何不传 path/extension/method 直接调用
为什么 V1 使用 manifest-generated immutable binding，而不是自动执行自定义 JS
如何查看已发现插件和失败原因
如何提供可选 .d.ts
CLI package 和 .app 如何在 codesign 前装入插件
```

所有 build、copy、codesign staging 和 run 命令必须真实执行过，不保留伪命令。

## 十六、本轮明确不做

```text
发现文件即无条件启动 executable
在主 Runtime realm 自动执行第三方 facade.js
把第三方 JS 塞进 core polyfills/jslibs
通用第三方 require/ESM module loader
Persistent Extension Process
daemon lifecycle / heartbeat / reconnect
hot reload
Extension Marketplace / Store
在线下载 / 自动更新
复杂依赖解析
插件签名基础设施
完整权限系统 / sandbox broker
Wasm / Lua / Go plugin
dylib / so / dll ABI
Protobuf / MessagePack / Shared Memory
Stable ABI / Stable SDK
```

## 十七、专家质量门槛（必须达到 95/100）

最终提交结论前，必须按以下 rubric 自评并给出每项 Evidence；总分低于 95、任何硬失败
命中或证据缺失都不得宣布完成：

| 维度 | 分值 | 满分要求 |
| --- | ---: | --- |
| 架构复用与边界 | 15 | 复用唯一 V0 Host/Protocol；manifest/registry/binding 职责清楚 |
| JavaScript 使用体验 | 15 | 正常调用只含业务 params；无 executable/extension/wire method 泄漏 |
| 安全与激活语义 | 20 | 默认关闭、zero-child discovery、immutable binding、路径/权限/collision 防护、远程 fail closed |
| 协议、错误与生命周期正确性 | 15 | one-shot、timeout、crash、strict response、artifact change 均结构化诊断 |
| 测试、源码隔离与 Runtime Evidence | 20 | 自动化矩阵、真实 Vision OCR、空 cwd portable proof、隐私扫描全部通过 |
| 文档、types 与部署真实性 | 10 | docs-user-api、AI index、types、安装/codesign 命令与真实行为一致 |
| 范围和可维护性 | 5 | 无 Manager/Store/persistent/module-system 扩张，无第二套实现 |

硬失败（任一项使最高分不超过 80）：

```text
业务脚本仍需传 executable path / extension basename / wire method
discovery 或 list/diagnostics 会执行第三方 JS 或启动 child
把插件 JS 混入 polyfills/jslibs 或直接用通用 require 搜 host filesystem
namespace/plugin collision 采用 last-wins
registry gate 同时暴露任意 absolute-path process execution
HTTP/MCP 可以远程开启插件
源码隔离 proof 仍从仓库 cwd 借用 polyfills/jslibs
使用旧 Evidence 证明当前源码
将 Experimental 标记为 Stable
```

本轮通过后，应在最终建议中给出一个独立的 V1.1 Trusted JS Adapter Goal 草案，只描述
为何、何时值得做，以及 dedicated restricted realm / JSON-only boundary 等前置条件；不在
本轮顺手实现。

## 十八、最终交付

最终输出：

```text
1. 当前分支与 HEAD（不得创建新分支）
2. 修改文件列表
3. 默认 discovery roots 与优先级
4. Plugin bundle layout
5. Manifest V1 contract 与 schema 位置
6. Registry/discovery 代码位置
7. immutable JS binding 代码位置和 property descriptor 证明
8. Type/doc/index 位置
9. 真实安装/copy 命令
10. 不传 path/extension/wire method 的 hello 调用与结果
11. 不传 path/extension/wire method 的 add 调用与结果
12. 不传 path/extension/method 的真实 Apple Vision OCR 与结果
13. discovery/manifest/security 失败路径测试
14. “discovery 不启动 child”的证据
15. 源码隔离发行包证明
16. Runtime Evidence 与隐私检查
17. 性能数据（discovery、首次调用、后续 one-shot 调用、OCR）
18. 当前限制
19. Implemented / Tested / Verified / Experimental / Not Implemented
20. 逐项专家评分（必须 >= 95/100）
21. V1.1 isolated trusted JS adapter 是否值得做及单独 Goal 草案
22. 是否需要单独设计 startup activation 或 Persistent Process V2
```

没有当前源码对应的真实运行 Evidence，不得声明完成。
