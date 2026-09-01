---
title: Native Extension Plugin V1.0.1
description: 严格 manifest 自动发现、Host 生成不可变 JavaScript Binding，并按调用启动 one-shot native process。
order: 15
---

# Native Extension Plugin V1.0.1

> 状态：**Experimental**。V1 是自动发现与不可变 Binding Prototype，不是 Stable ABI、Stable SDK、插件商店或安全沙箱。

> **平台含义**：Native Extension V1 的 manifest、discovery 和 Host 是跨平台实现候选；当前源码
> 包含 Darwin、Linux 与 Windows 的 root/path/process 分支。页面中出现的“macOS”有三种更窄的
> 含义：macOS 的安装命令和安全规则、仅 macOS 可用的 `macos-vision` 示例插件，或当前 macOS
> Runtime Evidence。它们都不表示 V1 整体只支持 macOS。相反，`go-basic` 是纯 Go 示例，能够为
> 各目标系统分别构建；每个目标系统仍必须使用自己的 executable，并以目标机 Evidence 确认其
> 实际支持状态。未在目标机验证应写为 **Not Evaluated**，而不是 **Unsupported**。

## NativeExtensions：插件作者的本机开发闭环

V1 的第一条用户路径是插件作者在自己的 macOS 机器上开发并直接运行：编写插件源码 →
编译 executable → 把完整、source-free bundle 放进 OpenDesk 程序相对目录 → 正常运行本机
CLI JavaScript。开发者不注册插件，不传 executable、plugin id、protocol 或 wire method，
也不传 `-experimental-native-extension`。

完整 bundle 至少包含：

```text
com.example.go-basic/
  extension.json
  bin/
    native-ext-go-basic        # Windows target 通常是 .exe
```

目录名必须等于 manifest `id`。默认 discovery 只读下面一个程序相对位置；不会扫描 `$HOME`、
machine-wide root、cwd、`PATH`、源码祖先或脚本所在目录。

| 发行形态 | bundle 位置 |
| --- | --- |
| CLI / portable | `<program-directory>/native-extensions/<plugin-id>/` |
| macOS `.app` | `OpenDesk.app/Contents/Resources/NativeExtensions/<plugin-id>/` |

`main.go`、`go.mod`、构建脚本和第三方 JavaScript 不属于安装目录。`types/index.d.ts` 是可选
编辑器声明；discovery 不读取或执行它。完整 build/wire/schema/digest/bundle inventory 命令见
[`examples/native-extensions/README.md`](../../examples/native-extensions/README.md)，业务脚本源文件是
[`quickstart.js`](../../examples/native-extensions/quickstart.js)。

将下面业务脚本保存为 `<program-directory>/quickstart.js`：

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

文档声明的工作目录是 `<program-directory>`（其中有 `opendesk` 和 `native-extensions/`）。
从该目录原样执行这条公开命令：

```bash
cd /absolute/path/to/program-directory && ./opendesk -script ./quickstart.js -console-mode script
```

示例扩展的预期业务结果是：

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

### macOS Vision OCR：可复现图片输入

`macos-vision` 是 **macOS-only** 示例；它必须与 `go-basic` 一样编译为 source-free
bundle 并放到相同程序相对 root。OCR 图片是调用者业务输入，**不**属于 extension bundle，
也不会被 Native Extension persistent Evidence 保存。本仓库提供了 project-created、无用户数据的
fixture [`opendesk-ocr-123.png`](../../tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png)，
其预期文字是 `OPENDESK OCR 123\n你好 456`。业务脚本是
[`ocr-quickstart.js`](../../examples/native-extensions/ocr-quickstart.js)。

从 OpenDesk 仓库根目录执行下面安装命令；`PROGRAM_DIR` 是已有 `opendesk` 的目录。此命令会将
fixture 与业务脚本保存到程序目录，而不是 plugin bundle：

```bash
ROOT="$(pwd -P)"
PROGRAM_DIR="/absolute/path/to/program-directory"
PLUGIN_SRC="$ROOT/examples/native-extensions/macos-vision"
BUNDLE="$PROGRAM_DIR/native-extensions/com.example.macos-vision"
test -x "$PROGRAM_DIR/opendesk"
test ! -e "$BUNDLE"
ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
install -d -m 700 "$BUNDLE/bin" "$BUNDLE/types"
xcrun swiftc -O -target "${ARCH}-apple-macosx12.0" -sdk "$SDK_PATH" \
  "$PLUGIN_SRC/main.swift" -framework Vision -framework ImageIO \
  -o "$BUNDLE/bin/native-ext-macos-vision"
cp "$PLUGIN_SRC/extension.json" "$BUNDLE/extension.json"
cp "$PLUGIN_SRC/types/index.d.ts" "$BUNDLE/types/index.d.ts"
chmod -R go-w "$BUNDLE"
cp "$ROOT/tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png" "$PROGRAM_DIR/ocr-test.png"
cp "$ROOT/examples/native-extensions/ocr-quickstart.js" "$PROGRAM_DIR/ocr-quickstart.js"
```

声明的 OCR 工作目录仍是 `<program-directory>`。从其中原样执行：

```bash
cd /absolute/path/to/program-directory && ./opendesk -script ./ocr-quickstart.js -console-mode script
```

预期 console 输出为：

```json
{"text":"OPENDESK OCR 123\n你好 456"}
```

若 namespace 不存在，先运行一个只读诊断脚本：

```js
function main() {
  console.log(JSON.stringify({
    plugins: NativeExtensions.list(),
    diagnostics: NativeExtensions.diagnostics()
  }, null, 2));
}

main();
```

`list()` 和 `diagnostics()` 只读取冻结 registry，不启动扩展 process。常见失败包括
`root_unavailable`、`invalid_manifest`、`unsafe_bundle`、`digest_mismatch`、
`duplicate_plugin_id` 和 `duplicate_namespace`。

将上面的诊断脚本保存为 `<program-directory>/diagnostics.js` 后，从相同工作目录执行
`./opendesk -script ./diagnostics.js -console-mode script`。`root_unavailable` 表示程序
相对目录还不存在；`invalid_manifest` 表示 manifest 不符合严格契约；`unsafe_bundle` 表示目录
类型、owner/mode 或 ACL 安全检查失败；`digest_mismatch` 表示 executable 与 manifest 摘要不同；
两个 `duplicate_*` 表示所有冲突 bundle 均已 quarantine，必须移除冲突后启动新的 execution。

## NativeExtensions：日常 JavaScript API

公开调用模型是：

```text
NativeExtensions.<manifest namespace>.<public method>(params)
NativeExtensions.<manifest namespace>.<public method>(params, { timeoutMs })
NativeExtensions.get(pluginId)
NativeExtensions.list()
NativeExtensions.diagnostics()
```

`namespace` 和公开 method 来自已安装 bundle 的已验证 `extension.json`。第一个参数是
业务 JSON object；能否使用 `{}` 由该插件 method 的业务契约决定。成功时直接返回
Extension 的 `result`，失败时抛
`NativeExtensionsError`。单次安全 deadline 只通过可选第二参数的 `timeoutMs` 覆盖；正常
情况使用 manifest 默认值。

若省略第一个参数，Host 会传递空 object `{}`；示例 `hello`/`add` 的插件业务契约会拒绝
缺少必需字段的 `{}`。Registry 在一次 execution 内冻结；安装或升级后必须启动新的
execution，V1.0.1 没有 hot reload。

例如：

```js
const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
const ocr = NativeExtensions.macosVision.ocr({
  imagePath: "/absolute/path/input.png",
  recognitionLevel: "accurate",
  languages: ["zh-Hans", "en-US"]
});
```

Host 在 Runtime 初始化时从严格 manifest 生成 closure，并把 plugin id、canonical
executable、wire method、protocol、version 和默认 timeout 固定在 closure 内。因此普通
脚本只提供业务 params，不需要也无权选择 transport route。

## NativeExtensions：启用和启动语义

本机 CLI JavaScript execution 默认提供 `NativeExtensions`。初始化只执行：

```text
枚举受控 roots
→ 读取并严格校验 extension.json
→ 校验 bundle、权限、路径、executable 和 digest
→ 生成并冻结 NativeExtensions namespace/method closures
```

Discovery、`list()`、`get()` 和 `diagnostics()` 不启动 native process，也不执行 bundle 中的任何第三方 JavaScript。只有第一次调用生成的方法时才启动一个 one-shot process；以后每次调用仍启动一个新的 one-shot process。

HTTP 的 `/SCRIPT_RUN`、`/executions`、MCP tool list/call 和其他远程执行通道均不注入
`NativeExtensions`，也不能用请求字段开启、重定向或调用 Native Extension。低层
`NativeExtension.call` 仍只属于单独的本机 unsafe diagnostic gate，绝不是日常 JavaScript API。

## NativeExtensions：Discovery roots 和优先顺序

默认只有一个 root：portable CLI 的 `<opendesk executable dir>/native-extensions/`，或
macOS app 的 `OpenDesk.app/Contents/Resources/NativeExtensions/`。程序路径必须是绝对路径；
无法安全确定时 discovery fail closed。machine-wide、current-user、cwd、`PATH`、源码祖先、
脚本路径、`polyfills/` 和 `jslibs/` 都不在默认链中，也不会自动迁移、复制、合并或删除。

该 root 中的重复 plugin id 或重复 namespace 会把所有冲突项 quarantine；其他唯一且健康的
plugin 仍可用。

### NativeExtensions：Experimental prototype 目录迁移

当前已维护 release tag `v0.2.2` 早于 Native Extension V1。旧 prototype 目录不扫描，也不
会被自动复制、移动、合并或删除。若曾使用外部分发的 Experimental build，先停止所有
execution，核验 bundle 后把一个完整 bundle 放到当前程序相对 root，再用
`list()`/`diagnostics()` 验证。

## NativeExtensions：Bundle layout

每个 direct child 是一个独立 bundle，目录名必须等于 manifest `id`：

```text
NativeExtensions/
  com.example.go-basic/
    extension.json
    bin/
      native-ext-go-basic
    types/
      index.d.ts              # optional; editor only
    README.md                 # optional; discovery 不读取
```

不要把裸 executable 直接散放在 root。`facade.js` 等第三方 JavaScript 即使存在也不会被 V1 加载。

## NativeExtensions：Manifest V1

正式 JSON Schema：`schemas/native-extension/extension-manifest-v1.schema.json`。

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
      "timeoutMs": 5000
    },
    "add": {
      "wireMethod": "add",
      "timeoutMs": 5000
    }
  }
}
```

可选的顶层 `executableSha256` 是 64 位小写 SHA-256。它能证明发现时内容与 manifest 相符，不能认证发布者，也不能证明插件安全。
Runtime 只绑定 manifest 与其选定 executable，不递归认证 `.dylib/.so/.dll`、脚本模块或
其他辅助资源。发布者的 archive checksum/signature/SBOM 应覆盖整个 bundle；插件应尽量
使用自包含 executable，并避免可写的运行时依赖。

Host 的额外严格规则：

- JSON 最大 64 KiB、最大深度 12、最多 64 个 methods；字段名大小写敏感，拒绝重复 key、大小写伪重复、trailing JSON 和所有未知字段。
- `id`、namespace、公开 method 和 wire method 使用受限字符集与长度；拒绝大小写折叠冲突。
- 拒绝 `__proto__`、`prototype`、`constructor`、`then`、`list`、`get`、`diagnostics` 以及核心 global 等保留名。
- executable 只能是 bundle 内的 slash-relative path；拒绝 absolute path、`..`、反斜线、volume/drive path、NUL 和 normalization 差异。
- root、bundle、manifest、executable 链上拒绝 symlink；同时用 `EvalSymlinks` 和 `filepath.Rel` 做 containment 检查。
- Unix 上 root、bundle、manifest、executable 及 executable 的每级中间目录必须由当前用户或 root 拥有，不能 group/world writable，也不能 setuid/setgid；executable 必须是普通可执行文件。
- method `timeoutMs` 与单次安全覆盖都必须在 `1..60000` ms。
- 调用前重新校验 path type、权限、manifest digest 和 executable digest；变化返回 `artifact_changed`，不执行替换文件。

V1 仍有无法完全消除的校验后到 `exec` 前 TOCTOU 窗口。Unix 会拒绝无 root-owned sticky
保护的 group/world-writable root 祖先，并在调用前复查 root/paths/digest，但这不等价于
fd-based execution。native executable 一旦运行就继承 OpenDesk 的当前 OS 用户身份、环境、
cwd、文件系统和网络能力；V1 没有 sandbox 或 permission broker。

平台限制：Windows V1 会验证文件类型、symlink、bundle containment 和内容 digest，但尚未读取 Windows ACL 来等价检查 owner/group/world write；timeout 会终止直接子进程，但尚未用 Job Object 保证清理插件自行派生的所有后代。Windows 上只应使用由当前用户或管理员控制的标准 roots；ACL 与完整 process-tree containment 属于后续独立安全工作。Unix 的绝对 root 父链同样不得经过 symlink；因此 macOS 临时测试包应使用真实路径 `/private/tmp/...`，不要使用指向它的 `/tmp/...` 别名。

## NativeExtensions：Registry API

```js
const plugins = NativeExtensions.list();
const goBasic = NativeExtensions.get("com.example.go-basic");
const diagnostics = NativeExtensions.diagnostics();

goBasic.hello({ name: "OpenDesk" });
```

- `list()` 返回 id、version、namespace、root kind、公开 method names 和 executable digest；不返回绝对路径或 wire methods。
- `get(pluginId)` 只接受 manifest canonical id，不接受 path/executable。
- `diagnostics()` 返回 privacy-minimized discovery 状态和 error code，不返回用户名、home path 或完整 manifest。

`NativeExtensions` global、每个 namespace 和 method property 都是 non-writable、non-configurable。root、namespace 和 function 对象均 `Object.freeze()`；root/namespace 使用 null prototype。

单次 timeout 覆盖只在第二参数中：

```js
NativeExtensions.macosVision.ocr(params, { timeoutMs: 10000 });
```

未知 options（包括 `executable`、`extension` 或 `method`）会返回 `invalid_params`。

## NativeExtensions：Errors 和 Evidence

失败抛真正的 `NativeExtensionsError`：

```js
try {
  NativeExtensions.goBasic.add({ a: 20 });
} catch (error) {
  console.log(error.code);          // extension_error
  console.log(error.pluginId);      // com.example.go-basic
  console.log(error.namespace);     // goBasic
  console.log(error.method);        // add
  console.log(error.extensionCode); // invalid_params
  console.log(error.evidence);
}
```

每个 discovery 结果产生 `native_extension_discovery` Event，每个真实调用产生 `native_extension_call` Event。持久 Evidence 只记录 root kind、plugin id、namespace、相对 executable、digest、公开 method、protocol version、request id、duration、exit/status/error，以及 stderr captured bytes/truncated/digest。

扩展返回的 `error.message` 不作为公共错误消息透传；JavaScript 只得到固定的 `native extension returned an error`，Evidence 只保存该消息的 byte length 与 SHA-256。扩展 `error.code` 必须匹配 `[a-z][a-z0-9_]{0,31}`；否则整个 response 归类为 `invalid_response`，原 code 不进入 Evidence。Evidence 不记录完整 params、result、raw stdout、stderr 文本、图片路径/内容、home path、环境变量、token 或完整 manifest。用户脚本若主动 `console.log()` 业务结果，那是用户自己的 console 输出，不属于 Native Extension Evidence 的隐私承诺。

## NativeExtensions：谁负责编译

第一条支持路径中的插件作者使用自己语言的工具链编译扩展；不需要重新编译 OpenDesk。已有
source-free bundle 的使用者也可以直接将其放进同一个程序相对目录。

| 角色 | 职责 |
| --- | --- |
| 插件作者/CI | 使用插件语言的标准工具链编译、测试、签名，按 OS/arch 生成 bundle archive |
| 使用者/管理员 | 选择匹配平台的预编译 archive，核验发布者签名/checksum，安装完整 bundle |
| OpenDesk Runtime | 校验 manifest、路径、权限和 digest，生成不可变 Binding，按调用执行成品 executable |

OpenDesk V1 不拉取源码、不安装编译器、不解析构建依赖，也不执行 manifest build hook。
`extension.json` 只描述运行时身份、协议、预编译 executable、namespace、methods、timeout
和可选 digest；不得加入 `buildCommand`、Git/source URL、compiler/SDK path、pre/post-install
script、包管理依赖或下载矩阵。未来若需要自动下载/更新，应使用独立 Distribution/Manager
manifest，不污染当前 Runtime manifest。

### 示例文件、成品 bundle 与业务脚本的精确映射

仓库保存的是可维护 example source；它不是已经发布的 archive。`go-basic` 的每个文件有
唯一归属：

| Repository file | Purpose | Goes in canonical plugin root? |
| --- | --- | --- |
| `examples/native-extensions/go-basic/main.go` | Plugin author's Protocol V0 implementation source | No |
| `examples/native-extensions/go-basic/go.mod` | Plugin author's Go module metadata | No |
| `examples/native-extensions/go-basic/extension.json` | Manifest template, copied to the compiled bundle root | Yes |
| `examples/native-extensions/go-basic/types/index.d.ts` | Optional editor declarations | Optional: `types/index.d.ts` |
| [`examples/native-extensions/quickstart.js`](https://github.com/shopable-ai/opendesk/blob/master/examples/native-extensions/quickstart.js) | Consumer business script calling `NativeExtensions.goBasic.*` | No; keep it in any script directory |

The author build transforms those source inputs into one source-free target
bundle such as `com.example.go-basic/extension.json +
bin/native-ext-go-basic + optional types/index.d.ts`. Install that complete
directory, never only its executable and never the Go source or quickstart.

### Distribution layers

| Layer | Current status | What it means |
| --- | --- | --- |
| Repository source | Maintained | The files above are source/templates, not a precompiled download. |
| Local acceptance archive | Local only | Build/package output under `.runtime/`, with target, SHA-256, inventory and installed-smoke evidence; it is not publishable by implication. |
| Public publisher asset | **Not Published / Not Verified** | No official URL, checksum or signature is available from this repository. Do not represent a local archive as a Release Asset. |

The consumer and author walkthrough, including the canonical example build
output and formal JavaScript smoke, is
[`examples/native-extensions/README.md`](https://github.com/shopable-ai/opendesk/blob/master/examples/native-extensions/README.md).

只有插件作者或没有预编译产物的 source builder 才需要编译器，并且只需要插件自己的
工具链，不需要重新编译 `opendesk`：

- Go：Go Modules + `go build -trimpath -buildvcs=false`；纯 Go 跨平台插件可在 CI 使用
  `GOOS/GOARCH`，有 CGO/系统库时应在目标 OS runner 原生构建。
- Swift/macOS：正式多文件项目优先 SwiftPM/Xcode release build；简单单文件扩展可用
  `xcrun swiftc -O`，明确最低 macOS deployment target 和 framework。
- Rust：Cargo `--release`；C/C++：CMake Release；其他语言只要最终是普通 executable
  并实现同一 stdin/stdout JSON 协议即可。

推荐每个平台发布独立 archive：

```text
com.example.foo_0.1.0_darwin-arm64.tar.gz
com.example.foo_0.1.0_linux-amd64.tar.gz
com.example.foo_0.1.0_windows-amd64.zip
checksums.txt
```

同一版本各 target 保持相同的 id、version、namespace 和 methods，但 executable 相对路径
及 SHA-256 可以不同。Windows archive 通常包含 `bin/native-ext-foo.exe`，该 target 的
manifest 必须写这个精确路径。使用者只安装与当前 OS/arch 匹配的一份 bundle。

作者的标准流程是 `build → wire test → schema/digest → package → installed Host smoke`：

1. 用语言原生 release 工具编译 executable。
2. 直接向 stdin 写入一条 Protocol V0 JSON，验证 stdout 只有一条响应，诊断只写 stderr。
3. 组装 `<id>/extension.json + bin/executable + optional types/README/LICENSE`，并用正式
   Draft 2020-12 schema 校验 manifest。
4. 如填写 `executableSha256`，必须在最终 binary 生成后计算；之后不得再修改 binary。
5. 按 OS/arch 打包 source-free archive，并生成/验证 archive checksum。
6. 安装完整 bundle 后，从无关 cwd 运行正式 JavaScript
   `NativeExtensions.foo.hello({...})`；业务脚本仍不能传 path/executable/wire method。

插件发行 archive 不应包含源码仓库、compiler cache 或自动执行 `facade.js` 的假设。
Publisher signature、notarization、SBOM 和 archive checksum 属于发布者/CI；V1 manifest
中的 executable SHA-256 只能检查内容一致性，不能认证发布者。

仓库中的可复制 build、wire test、Host 诊断、`tar.gz` 打包和首次安装命令位于
`examples/native-extensions/README.md`。正式 proof 还会静态组装 source-free Linux amd64
与 Windows amd64 Go archive，Windows target manifest 精确指向 `.exe` 并记录 archive 与
executable SHA-256；这些是 compile/package evidence，不冒充目标 OS Runtime Evidence。

## NativeExtensions：安装和发行 staging

普通使用者直接安装预编译 bundle，不执行下面的仓库构建。以下 portable build/copy
形态仅供 OpenDesk 仓库维护者验收 examples；正式 proof harness 会实际执行。产物写入
`.runtime` 或独立 package，不把运行结果提交到源码：

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin"
mkdir -p "$PACKAGE/native-extensions/com.example.go-basic/bin"
go build -o "$PACKAGE/opendesk" ./cmd/opendesk
go -C examples/native-extensions/go-basic build \
  -o "$PACKAGE/native-extensions/com.example.go-basic/bin/native-ext-go-basic" .
cp examples/native-extensions/go-basic/extension.json \
  "$PACKAGE/native-extensions/com.example.go-basic/extension.json"
cp -R polyfills jslibs "$PACKAGE/"
cp examples/native-extensions/quickstart.js "$PACKAGE/quickstart.js"

cd "$PACKAGE" && ./opendesk -script ./quickstart.js -console-mode script
```

macOS `.app` 必须在 codesign 之前把完整 bundle 放入 Resources。项目 build 脚本提供明确 staging hook，并在 staging 后签名：

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin"
DIST="$ROOT/.runtime/build/native-plugin-app"
NATIVE_EXTENSIONS_SOURCE="$PACKAGE/native-extensions" \
DIST_DIR="$DIST" CODESIGN_IDENTITY=- \
  ./scripts/build_macos_app.sh
codesign --verify --deep --strict "$DIST/OpenDesk.app"
```

`NATIVE_EXTENSIONS_SOURCE` 必须是绝对、非 symlink 的目录，且 direct children 只能是包含 `extension.json` 的 bundle。签名后的 `.app` 不应再修改 Resources。V1 自身不实现独立插件签名或 notarization 信任判断。

程序相对 bundle 的安装/升级应在 Runtime execution 之间完成；V1 没有 hot reload。先停止
活动 execution，再替换完整 bundle，并启动新的 execution。不要只覆盖 executable，也不要在
codesign 后修改 `.app/Contents/Resources`；App 内 staging 是应用发布者在 codesign 前完成的
工作。

## NativeExtensions：可选 `.d.ts`

`types/index.d.ts` 只服务编辑器，不参与 discovery、digest 信任或 process execution。V1 不自动合并插件类型。插件作者可发布声明，用户在项目中显式 include：

```js
/// <reference path="./types/NativeExtension.d.ts" />
/// <reference path="./native-extensions/com.example.go-basic/types/index.d.ts" />

NativeExtensions.goBasic.hello({ name: "OpenDesk" });
```

必须同时 include core 声明和实际安装插件的声明。core 不预声明示例 namespace；插件声明通过 declaration merging 增加 namespace 与 canonical plugin-id 的精确类型。仓库示例声明位于 `examples/native-extensions/*/types/index.d.ts`；仓库级通用声明位于 `types/NativeExtension.d.ts`。

## NativeExtensions：为什么不自动执行第三方 facade.js

当前 core polyfills/jslibs 会在共享 Goja global realm 中直接编译执行，并且通用 CommonJS `require` 能搜索 host filesystem。把 bundle JS 复用这条路径，会让“发现文件”直接变成拥有 `File`、`System`、`page`、network 和 raw process 能力的代码执行。

因此 V1 明确不 `require()`、`eval()` 或自动加载第三方 facade；custom JS facade 延后到独立 V1.1。V1.1 的前置条件至少包括 dedicated restricted Goja realm、bundle-confined loader、source size/hash limit、compile-only discovery、first-use lazy execution、plugin-bound invoke、JSON-only cross-realm boundary，以及默认无 `File/System/page/http/raw NativeExtension` capability。

## NativeExtension.call：低层 V0 兼容入口

现有 `pkg/nativeextension` Host 与 Protocol V0 仍是唯一 process/protocol 实现。Direct Host CLI `opendesk -native-extension ...` 保留用于调试。

低层 JavaScript `NativeExtension.call({ executable/extension, method, ... })` 也保留，但 registry flag 不会暴露它。只有明确的本机 unsafe 诊断 gate 才注入：

```bash
./opendesk \
  -experimental-unsafe-native-extension-call \
  -script /absolute/path/to/v0-diagnostic.js
```

它不是日常插件 API，HTTP/MCP 永远不能开启。

## NativeExtensions：验收

```bash
./scripts/test_runtime_apis.sh unit
./scripts/test_native_process_extensions.sh
./scripts/test_native_extension_plugins.sh
```

最后一个命令会从当前源码构建 Host/Go/Swift，创建 `/private/tmp/opendesk-native-plugin-proof-<runId>/`，从文档声明的程序目录执行正式 one-line quickstart，验证 portable 和 `.app` roots、zero-child discovery、不可变 descriptors、`hello/add`、`.app` 内 manifest-bound 调用、真实 Apple Vision OCR、one-shot child count、失败产物全量隐私扫描、resource provenance、命令 transcript 和构建输入前后 hash 不变。Linux/Windows 只做 matching-source cross-compile/package，并明确记录为 Not Evaluated target Runtime。

V1 不包含 hot reload、persistent process、startup activation、daemon lifecycle、Marketplace、下载/更新、依赖解析、权限 broker、通用 module loader、Stable ABI 或 Stable SDK。
