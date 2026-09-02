# Native Extension Canonical Install Root & Authoring UX Goal

## 一、唯一任务目标（最高优先级）

在当前 `master` 上交付并真实证明以下完整用户路径：

```text
仓库中已有的 go-basic 示例源码
→ 插件作者用标准 Go 工具编译
→ 组装 source-free 的 com.example.go-basic bundle/archive
→ 普通用户把整个 bundle 安装到当前 OS 的固定默认目录
→ OpenDesk 自动发现 extension.json 并生成不可变 Binding
→ 任意目录中的普通 .js 成功调用
  NativeExtensions.goBasic.hello({ name: "OpenDesk" })
```

完成定义同时包括：

1. 用户文档第一屏给出“拿什么文件、放到哪里、运行哪个 `.js`、预期看到什么”。
2. 现有示例源码、构建产物、安装目录和业务脚本之间有逐文件映射，不能只写抽象
   `<plugin-id>`/`executable` 占位符。
3. `pkg/nativeextension` 中实现的默认路径必须与文档逐字符一致，并由路径契约测试证明。
4. 普通用户安装预编译 bundle，不编译 OpenDesk 或 extension；只有插件作者/CI 编译。
5. current-user 安装、portable package 和 `.app` publisher staging 都有真实命令，但默认
   Quickstart 只推荐 current-user 安装。
6. 当前源码对应的正式 `.js` Runtime、zero-child discovery、hello/add、真实 OCR、隐私和
   source-free package Evidence 全部通过。
7. 本轮保持两个信任面：publisher/deployment root + canonical current-user root；不新增
   独立、可变的 machine-wide discovery root。机器级插件随 OpenDesk deployment package
   安装；独立全机 root 等 Windows ACL/reparse 与 Unix admin-only policy 后另立安全 Goal。
8. macOS、Linux、Windows 的 default root 都属于公开契约，且 Linux/Windows 路径发生
   行为变化，因此三者必须
   分别在对应真实 OS/VM 上完成“安装 source-free bundle → 从无关 cwd 启动正式 `.js` →
   list/diagnostics zero-child → hello/add 成功”的 Runtime smoke。交叉编译和纯路径单测不能
   代替；缺任一目标 OS Evidence 时，本 Goal 保持 Incomplete/Blocked，不得评分为完成态
   `>=95`。

正常业务调用固定为：

```js
const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
```

## 二、关键文件与现有示例（必须在本 Goal 顶部显示）

首先明确：仓库当前保存的是**可维护的示例源码和 manifest**，不是可以直接安装的预编译
插件。编译后的 executable/archive 属于运行或发行产物，生成到 `.runtime/` 或由插件发布者
作为 Release Asset 发布，不能把二进制提交进示例源码目录。

| 文件 | 作用 | 是否放入默认插件目录 |
| --- | --- | --- |
| `examples/native-extensions/go-basic/main.go` | Go 插件作者源码，实现 Protocol V0 | 否 |
| `examples/native-extensions/go-basic/go.mod` | Go 示例构建依赖 | 否 |
| `examples/native-extensions/go-basic/extension.json` | manifest 模板；打包时复制到 bundle 根 | 是 |
| `examples/native-extensions/go-basic/types/index.d.ts` | 可选编辑器类型 | 可选，放 `types/` |
| `examples/native-extensions/quickstart.js` | 普通业务脚本，调用 `NativeExtensions.goBasic.*` | 否；可放任意用户脚本目录 |
| `examples/native-extensions/README.md` | 消费者安装、作者编译/打包和仓库 proof 教程 | 否 |
| `schemas/native-extension/extension-manifest-v1.schema.json` | manifest V1 正式 schema | 否 |
| `docs-user-api/native-extension.md` | 普通用户的权威 API/安装文档 | 否 |
| `pkg/nativeextension/discovery.go` 与 `discovery_roots.go` | 默认目录、发现、冲突和 artifact 校验 | Runtime 源码 |
| `automation/native_extensions.go` | Host 生成不可变 JavaScript Binding | Runtime 源码 |
| `python3 tests/extensions/native-plugin/tools/proof-harness/main.py` | 维护者完整 proof；不是消费者安装器 | 否 |

普通用户文档首屏只展示与消费者直接相关的四项：预编译 bundle 内容、默认安装树、
`quickstart.js`、运行命令/输出；不要把 Runtime 内部源码和 proof script 挤到消费者首屏。
完整内部文件表保留在本 Goal，并放在文档的作者/维护者章节。

文档必须从 `docs-user-api/native-extension.md`、`docs-user-api/index.md`、
`examples/README.md` 明确链接到 `examples/native-extensions/README.md` 和
`examples/native-extensions/quickstart.js`。用户不能靠搜索仓库猜示例在哪里。

## 三、必须展示的真实文件流与默认安装结果

作者从已有示例源码构建：

```text
examples/native-extensions/go-basic/
  main.go
  go.mod
  extension.json
  types/index.d.ts

          build + assemble
                  ↓

.runtime/build/native-extension-author/com.example.go-basic/
  extension.json
  bin/native-ext-go-basic          # Windows target 为 native-ext-go-basic.exe
  types/index.d.ts                 # optional
```

普通用户下载/解压的是右侧的完整 `com.example.go-basic/` bundle；**需要把这个完整编译后
bundle 放进默认目录**。不能只复制 executable，也不能把 `main.go`、`go.mod` 或
`quickstart.js` 放进插件目录。

macOS 首选安装结果必须明确展示为：

```text
$HOME/Library/Application Support/OpenDesk/NativeExtensions/
  com.example.go-basic/
    extension.json
    bin/native-ext-go-basic
    types/index.d.ts               # optional
```

Linux 首选安装结果：

```text
${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions/
  com.example.go-basic/
    extension.json
    bin/native-ext-go-basic
```

Windows 首选安装结果（由 PowerShell
`[Environment]::GetFolderPath('LocalApplicationData')` 或原生
`FOLDERID_LocalAppData` 求值；`%LOCALAPPDATA%` 只能作为常见显示别名，不能作为产品信任
来源）：

```text
<LocalAppData Known Folder>\OpenDesk\NativeExtensions\
  com.example.go-basic\
    extension.json
    bin\native-ext-go-basic.exe
```

Windows 文件系统使用反斜线，但 `extension.json` 的 `executable` 必须始终使用 manifest 的
slash-relative 形式：

```json
{"executable":"bin/native-ext-go-basic.exe"}
```

`examples/native-extensions/quickstart.js` 是消费者调用示例，可复制到任意用户脚本目录；
OpenDesk 根据自身 executable/app 形态和 current-user 标准位置发现插件，不根据脚本路径或
cwd 查找插件。

必须提供一个面向示例作者的单一 canonical build/package 入口或完全自包含的等价命令，
输出路径固定在 `.runtime/`。不能要求普通用户运行完整 proof harness 才能得到可安装示例；
正式 Release 使用者应直接下载与 OS/arch 匹配的预编译 archive。

发行物来源必须诚实分层：

```text
repository source
  examples/native-extensions/...；可维护源码，不是预编译资产

local acceptance archive
  作者/维护者 build/package 后生成在 .runtime/；必须记录绝对路径、target、SHA-256、
  source-free inventory 和安装后 hash；只能称本地发行交接证明

public publisher asset
  若项目已有正式下载页，文档给出真实 URL、target 命名、checksum/signature 验证；
  若没有，明确写 Not Published，不能把 .runtime proof archive 冒充公开下载
```

本 Goal 不授权自动发布 Release。没有公开 asset 时，五分钟消费者 Quickstart 的前提必须
明确为“已经从受信任发布者拿到匹配平台的预编译 bundle”；最终报告把远程分发列为
`Not Published/Not Verified`，同时仍可用本地 source-free archive 验证安装与 Runtime。

## 四、用户与作者必须达到的结果

让第一次接触 Native Extension 的普通使用者在文档第一屏即可完成：

```text
选择与 OS/arch 匹配的预编译 bundle
→ 解压并安装整个 <plugin-id>/ 到唯一推荐目录
→ 创建只含业务参数的 .js
→ 使用本机 CLI Experimental flag 运行
→ 得到明确的成功输出
→ 用 list()/diagnostics() 定位发现失败
```

同时让插件作者无需 OpenDesk Core 源码即可完成：

```text
用语言标准工具链编译 release executable
→ 直接 wire test Protocol V0
→ 编写严格 extension.json
→ 组装 source-free target bundle
→ 生成 checksum/signature/SBOM（由发布者负责）
→ 安装到 canonical root
→ 用正式 JavaScript Binding 做 installed Host smoke
```

文档应先说明“这样做”，再在安全/参考章节说明为什么普通脚本不能选择 executable、plugin、
wire method、protocol 或 version。

## 五、背景（低于任务目标和文件映射）

Native Extension Plugin V1 已有严格 manifest 自动发现、Host 生成的不可变
`NativeExtensions.<namespace>.<method>(params)` Binding、one-shot Native Process Protocol
V0、安全门禁和真实 Runtime proof。

当前剩余问题不是“有没有写规则”，而是用户入口仍然以禁止项和内部机制为中心：文档先说
脚本不能传什么，却没有在首屏完整回答普通使用者应该下载什么、放到哪里、写什么、怎样
运行、应看到什么；插件作者的编译、wire test、打包和安装后验证也与仓库维护者 proof 混在
一起。

默认目录也需要校准。原始 V1 有确定的 current-user root，但 Linux/Windows 沿用
`os.UserConfigDir()`，把可执行插件 bundle 放进配置目录不够符合主流平台数据布局；当前也
没有通过所有平台权限门禁的 machine-wide root。不能把“用户级 OS 标准目录”和“管理员
维护的全机目录”继续统称为系统目录。

本 Goal 建立唯一推荐的 canonical current-user install root，重写正向使用/开发流程，并
明确 machine-wide root 的状态。不得借机实现 Manager、下载器、构建系统或 V1.1 自定义
JavaScript facade。

## 六、必须先做的术语和目录决策

文档和代码必须统一使用以下术语：

```text
publisher root
  Portable CLI 同级 native-extensions/，或 .app Resources/NativeExtensions/
  由 OpenDesk/portable package 发布者组装；.app 必须在 codesign 前完成

canonical current-user root
  普通使用者安装预编译第三方 bundle 的唯一推荐位置
  不需要管理员权限，不随当前工作目录变化

machine-wide root
  可选的管理员维护位置；只有权限/owner/ACL 门禁达到 fail-closed 标准才允许默认发现
```

canonical current-user root 必须采用平台数据/应用支持目录，而不是源码目录、cwd、`PATH`
或通用配置目录：

| 平台 | Canonical current-user root |
| --- | --- |
| macOS | `$HOME/Library/Application Support/OpenDesk/NativeExtensions/` |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions/` |
| Windows | LocalAppData Known Folder（`FOLDERID_LocalAppData`）下 `OpenDesk\NativeExtensions\` |

实现时必须把上表编码为可单元测试的纯路径策略。Linux 行为唯一固定为：unset 或 empty
`XDG_DATA_HOME` 时回退到 absolute `$HOME/.local/share`；非空 relative
`XDG_DATA_HOME` 返回 `user_root_unavailable`，不扫描 current-user root，但仍保留有效
publisher root；`HOME` 缺失或非 absolute 时同样只拒绝 current-user root。Windows 产品
代码必须调用 Known Folder API 获取 `FOLDERID_LocalAppData`，不得直接信任 `%LOCALAPPDATA%`
环境变量；Known Folder 失败或返回非 absolute path 时只拒绝 current-user root。测试注入
可以指定临时 user-data base，但产品 JavaScript/HTTP/MCP 不得指定 discovery root。

machine-wide 候选只能是：

| 平台 | Machine-wide candidate |
| --- | --- |
| macOS | `/Library/Application Support/OpenDesk/NativeExtensions/` |
| Linux | installer/distro 的 `${libexecdir}/opendesk/native-extensions/`；source-install candidate 为 `/usr/local/libexec/opendesk/native-extensions/` |
| Windows | `%ProgramFiles%\OpenDesk\NativeExtensions\`（Known Folder） |

本 Goal **固定不把** machine-wide candidate 加入默认 roots；表格只记录未来独立安全 Goal
可能评估的路径，不以“路径看起来标准”为依据：

- macOS/Linux 至少要求 root/admin ownership、目录链无 symlink、无 group/world write、
  bundle/manifest/executable 同样通过现有权限与 digest 门禁。
- Windows 在没有真实 Known Folder、ACL owner/DACL 和 reparse-point 检查前，不得默认
  发现 `%ProgramFiles%`，也不得退而扫描 `%ProgramData%`。
- 最终必须把 machine-wide 标记为 `Not Implemented`；不得在本 Goal 中实现或验证它。
- 不允许 current-user plugin 覆盖 publisher/system plugin；跨 root 重复 id 或 namespace
  继续全部 quarantine，绝不 last-wins。

## 七、发现顺序和迁移

默认 roots 必须是确定且与 cwd 无关的：

```text
1. 当前发行形态唯一 publisher root
2. canonical current-user root
```

顺序只用于稳定枚举和诊断，不是覆盖优先级。任意两个 root 出现相同 plugin id 或
case-fold namespace，所有冲突 bundle 都 quarantine。

如果历史版本曾使用不同路径，必须先用 Git tag/release notes、已发布文档和可获得的用户
安装事实形成书面调查结论，再选择：

```text
未正式发布且没有兼容承诺
  直接修正并在 Experimental migration note 中说明旧路径不再扫描

已有用户数据
  legacy root 只做有期限、可诊断的兼容发现；必须有独立 root kind、冲突 quarantine、
  deprecation message 和移除版本，不能静默复制、移动或删除用户文件
```

不得自动把 bundle 从旧目录搬到新目录。不得扫描两个语义相同但无法区分的目录并采用
last-wins。

## 八、消费者文档必须先给出的正向 Quickstart

`docs-user-api/native-extension.md` 和 `examples/native-extensions/README.md` 的第一主流程
必须按照以下顺序组织，普通使用者不应先看到插件作者编译或 OpenDesk 仓库 proof：

1. **前提**：已安装 `opendesk`，拿到与当前 OS/arch 匹配的预编译 bundle。
2. **bundle 内容**：展示 `<id>/extension.json + bin/executable`，说明目录名等于 id。
3. **安装位置**：先给当前平台唯一推荐 current-user 绝对公式和一条真实 copy/install
   命令；portable 与 `.app` publisher roots 后移到“其他发行形态”。
4. **JavaScript 文件**：提供完整、可保存为 `.js` 的脚本，包含结果输出，不只给表达式。
5. **运行命令**：提供完整 CLI 命令及 Experimental 状态。
6. **预期输出**：给 hello/add 的真实形状。
7. **诊断**：提供 `list()`/`diagnostics()` 完整脚本，解释常见 error code 和“发现不启动
   child”。

Quickstart 的完整脚本至少为：

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

预期结果必须与真实 extension response 一致，不得写伪输出。普通使用者 Quickstart 不应
出现 `-native-extension`、`-native-method`、manifest wire request 或 OpenDesk Core build。

## 九、日常 JavaScript API 正向契约

公开说明必须先准确描述可用调用：

```text
NativeExtensions.<namespace>.<method>(params)
NativeExtensions.<namespace>.<method>(params, { timeoutMs })
NativeExtensions.get(pluginId)
NativeExtensions.list()
NativeExtensions.diagnostics()
```

需要说明：

- `<namespace>` 与公开 `<method>` 来自安装 bundle 的已验证 manifest，由 Host 生成 Binding。
- 第一个参数是业务 JSON object；缺省是否允许 `{}` 以真实实现/插件方法契约为准。
- 成功直接返回插件 `result`，失败抛 `NativeExtensionsError`。
- 第二参数目前最多包含 bounded `timeoutMs`；它不是 transport route。
- `get(pluginId)` 是一次 canonical lookup；正常业务可直接使用 namespace。
- `list()`/`diagnostics()` 只读且 zero-child，不泄露 home/absolute executable。
- Registry 在一次 execution 中冻结，无 hot reload；安装/升级后启动新的 execution。

之后再明确：Host closure 已经固定 plugin id、canonical executable、wire method、protocol、
version 和 manifest timeout，所以业务脚本无需也无权传这些字段。禁止项必须作为正向模型的
结果，而不是文档的第一句。

## 十、插件作者的主流编译和发布方式

普通使用者不编译。插件作者/CI 使用插件语言的主流 release 工具：

```text
Go        go build -trimpath -buildvcs=false
Swift     SwiftPM/Xcode Release；单文件示例可用 xcrun swiftc -O
Rust      cargo build --release
C/C++     CMake Release
```

最终产物必须是实现 Protocol V0 的普通 executable。OpenDesk Runtime 不拉取源码、不安装
compiler、不解析 build dependencies，也不运行 `buildCommand`、pre/post-install script 或
第三方 JS。

作者教程必须把以下步骤各给一条可复制命令和验收结果：

```text
build executable
wire test: stdin 一条 request，stdout 恰好一条 response，diagnostics 只到 stderr
assemble bundle
calculate executableSha256 after final build
validate extension.json against formal schema
package one archive per OS/arch
install the archive as a complete bundle
run installed JavaScript smoke from unrelated cwd
```

archive 命名、Windows `.exe` manifest 路径、Unix executable bit、签名/notarization、checksum
和 SBOM 责任必须说清。manifest digest 只能证明内容匹配，不能认证发布者。

作者说明、消费者说明、OpenDesk 仓库维护者 proof 必须是三个独立章节，不能互相假装：

- 消费者：安装预编译 bundle。
- 作者：编译并发布自己的 extension，不编译 OpenDesk。
- 仓库维护者：从当前 OpenDesk 源码跑全套 proof。

## 十一、实现要求

至少检查并按需修改：

```text
pkg/nativeextension/discovery.go
pkg/nativeextension/*_test.go
automation/native_extensions.go
cmd/opendesk/
docs-user-api/native-extension.md
docs-user-api/index.md
docs-user-api/README.md
docs-user-api/runtime-api.ai.json
examples/native-extensions/README.md
tests/extensions/native-plugin/
python3 tests/extensions/native-plugin/tools/proof-harness/main.py
docs/implementation/runtime/native-extension-plugin-discovery.md
docs/quality/native-extension-plugin-v1.md
```

目录策略应集中在 `pkg/nativeextension`，不能在文档、proof harness、CLI 和 Runtime 各自
硬编码不同公式。测试所需的临时 root 只能通过 Go 内部 option/fixture 注入；不得新增
普通 JavaScript 参数、HTTP 字段、MCP 参数或隐式环境变量来改变产品 root。

如果增加只读本机 CLI 诊断（例如打印 root kind 与 privacy-safe 目录提示），必须单独
论证；不应为了文档可读性扩大 V1 API。JavaScript `diagnostics()` 继续不返回用户 home path。

## 十二、安全边界

继续严格保持：

- 默认不开启 registry；只有受信任本机 CLI Experimental gate 可启用。
- discovery、`list/get/diagnostics` zero-child，不执行第三方 JS。
- 普通 registry gate 不暴露低层 absolute-path `NativeExtension.call`。
- HTTP/MCP 不能通过请求字段开启 registry、注入 root 或执行 executable。
- root/bundle/manifest/executable 目录链拒绝 symlink、路径逃逸、不安全 owner/mode 和
  artifact replacement。
- 插件 executable 以当前 OS 用户权限运行；目录和 SHA-256 不等于 sandbox/发布者信任。
- 不把 facade.js、install.js 或其他第三方 JS 塞入 polyfills/jslibs 自动执行。

未来独立 Goal 若新增 machine-wide discovery，必须证明普通用户不能写入 root、替换 bundle
或利用 ACL inheritance/目录 junction 绕过；本 Goal 中固定保持未实现。

## 十三、验收测试

Runtime API 测试必须先以 `docs-user-api/` 为准，正式 JavaScript 用例放在
`tests/runtime-api/`，入口仍为 `scripts/test_runtime_apis.sh`。专项插件运行产物写入
`.runtime/tests/extensions/native-plugin/`。

必须新增或更新并真实运行：

```text
path contract unit tests
  macOS current-user formula
  Linux default + absolute XDG_DATA_HOME formula
  Windows LocalAppData Known Folder path contract
  Linux unset/empty XDG -> absolute HOME fallback；relative XDG、invalid HOME -> user root rejected
  Windows FOLDERID_LocalAppData success/failure；产品路径不直接读取 LOCALAPPDATA env
  portable and .app publisher formula
  machine-wide status 固定 Not Implemented，且默认 roots 中不存在第三项

discovery contract tests
  cwd independence
  missing canonical root is harmless and diagnostic
  root kind is correct
  duplicate id/namespace across publisher/user/system is all-quarantined
  no JavaScript/HTTP/MCP root override
  symlink/unsafe permission/path replacement fail closed

documentation acceptance
  first consumer workflow contains install path, complete .js, run command, expected output
  all documented paths equal code path policy
  every copy/build/package command actually executed or clearly marked target-platform only
  author and consumer responsibilities are not mixed

author independence
  只把插件源码、manifest 和可选 types 复制到独立临时 author workspace
  workspace 不含 OpenDesk Core 源码，插件 go.mod/Cargo/SwiftPM/CMake 不得 import/replace/link
  OpenDesk 内部 package；仍能 build、wire test 和 package

evidence provenance
  source-input snapshot 覆盖新增路径策略、用户文档、示例源码、author build/package 入口、
  manifest/schema、正式 .js 和 proof script
  每个平台 installed smoke 有独立 summary，记录 archive/asset 来源、target、archive SHA-256、
  checksum/signature 验证状态、source-free inventory、解压/安装目标、安装文件 hash、
  Runtime command/status、child count 和隐私扫描
  每个平台 summary 必须关联同一当前 HEAD、完整 source-input snapshot digest 和 build/package
  run id；任一不匹配就 fail closed，禁止用旧 archive 搭配新 Runtime smoke 冒充当前源码证据

real Runtime acceptance
  macOS、Linux、Windows 各自真实 OS/VM 的 isolated HOME/profile/Known Folder
  各自安装 source-free precompiled bundle 到 actual canonical current-user root
  各自从 unrelated empty cwd 启动 packaged opendesk 和正式 .js
  每个平台先单独运行 discovery/list/diagnostics 并记录 child count=0，再运行 hello/add；
  不得在同一混合 case 后用总 child count 猜测 zero-child 阶段
  各自 NativeExtensions.goBasic.hello({name:"OpenDesk"}) succeeds
  各自 NativeExtensions.goBasic.add({a:20,b:22}) succeeds
  real Apple Vision OCR still succeeds on macOS
  Native Extension discovery/call Event、summary 和 diagnostics 的隐私扫描不得泄露 isolated
  HOME、Known Folder、absolute executable、params/result；Runtime 通用启动日志中的路径信息
  另行分类，不能混充 Native Extension persistent Evidence 的隐私承诺
```

交叉编译和 archive 组装只算 compile/package evidence，不能冒充 Windows/Linux Runtime。
machine-wide 候选必须在报告中明确为 Not Implemented，不能用
临时测试 root 冒充真实 `/Library`、`/usr/local` 或 `%ProgramData%` 安装。

## 十四、硬失败

任一项发生时最高分不超过 80：

```text
文档首个可执行流程仍要求普通用户编译 OpenDesk 或 extension
文档只说不能传什么，却没有完整安装、调用、运行和预期输出
本 Goal 顶部及文档作者章节没有逐项列出现有示例源码、编译后 bundle、默认安装树和 quickstart.js 的关系
把 main.go/go.mod/quickstart.js 当成必须安装到 NativeExtensions root 的 bundle 内容
把仓库示例源码描述成已经存在的可下载预编译 archive
Linux 继续把新安装建议放在 XDG config 而不是 XDG data
Windows 继续把新安装建议放在 roaming AppData 而不是 LocalAppData
无 Windows ACL 检查却默认扫描 ProgramData
machine-wide 或 current-user bundle 可以覆盖 publisher bundle
修改 Linux/Windows 默认 root 后没有对应真实目标 OS installed Runtime smoke，却宣称 Goal 完成或 >=95
脚本可指定 root/executable/extension/wire method/protocol/version
discovery/list/diagnostics 启动 child 或执行第三方 JS
custom facade.js 混入 V1
用交叉编译冒充目标 OS Runtime Evidence
使用旧 Evidence 证明当前源码
```

## 十五、质量评分（必须 >= 95/100）

| 维度 | 分值 | 满分要求 |
| --- | ---: | --- |
| 消费者首次使用 | 20 | 首屏完成预编译 bundle 安装、完整 JS、运行、预期输出、诊断 |
| 作者开发与发行 | 15 | 主流工具链、wire test、manifest、target archive、installed smoke 职责清楚 |
| 目录标准与迁移 | 20 | 三平台 canonical data root 准确，cwd 无关，迁移/冲突策略明确 |
| 安全与激活语义 | 20 | 默认关闭、zero-child、immutable route、权限/ACL/symlink/remote fail closed |
| 测试与 Runtime Evidence | 20 | 三平台真实 installed JS smoke、路径矩阵、源码隔离、真实 OCR、隐私证据与当前源码一致 |
| 范围纪律 | 5 | 无 Manager/build hook/custom facade/persistent process 扩张 |

## 十六、明确不做

```text
V1.1 custom JavaScript facade / adapter
自动执行第三方 JS、install script 或 build hook
Runtime 下载源码或安装 compiler
Marketplace / Manager / online registry / auto update
hot reload / startup activation / persistent daemon
插件 sandbox、permission broker 或 Stable SDK
未通过 ACL 门禁的平台 machine-wide discovery
```

## 十七、最终交付

最终输出必须包括：

```text
1. 当前 master 与 HEAD；未创建新分支
2. 新旧默认目录差异和迁移结论
3. 精确的三平台 canonical current-user 路径
4. machine-wide root：Not Implemented，并解释 Windows ACL/reparse 与 Unix admin-only 阻断
5. 消费者五分钟 Quickstart
6. 插件作者 build → wire test → package → installed smoke
7. 正常 JavaScript API 和错误模型
8. 修改文件列表
9. 单元/契约/Runtime/交叉编译证据分别列出
10. 当前源码对应的 run id、binary SHA-256、结果、child count、隐私扫描和性能
11. public Release Asset 是否存在；本地 .runtime archive 不得冒充远程分发
12. macOS/Linux/Windows 真实 installed Runtime run id；任一缺失则明确 Goal 未完成且不得给完成态 >=95
13. 多专家正方、反方、安全、DX 评分和最终总分（必须 >=95）
14. Implemented / Tested / Verified / Experimental / Not Implemented
```

没有当前源码对应的真实运行 Evidence，或用户仍无法从文档首屏独立完成安装与首次调用，
不得宣布本 Goal 完成。
