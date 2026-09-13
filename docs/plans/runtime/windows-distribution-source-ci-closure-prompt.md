# OpenDesk：Windows Distribution Source / Build / CI Closure

## 目标需求

在当前 `master` 上继续实施并收口 Windows Platform Distribution，使 OpenDesk 的源码、Windows 构建、Installed App Builder、Native UI Host ownership、artifact preflight 与 GitHub Actions 达到：

> **Source / Build / CI readiness = READY；之后才进入真实 Windows interactive release acceptance。**

本轮不是重新讨论 Windows 应该只有一个 EXE，也不是重新设计 Custom UI protocol、App Mode schema 或 capability dependency solver。

最终 Windows 产品模型已经冻结：

```text
一个产品
+ 一个普通用户启动入口
+ 两个 Runtime link variants
+ 一个 Runtime-owned Native UI sidecar
```

具体角色：

```text
opendesk-desktop.exe
→ Windows GUI subsystem
→ 普通用户唯一 Desktop entry
→ 直接进入 OpenDesk Runtime / App Mode 生命周期
→ 不作为仅负责再启动 opendesk.exe 的薄 launcher

opendesk.exe
→ Windows Console subsystem
→ CLI / developer / Agent / automation entry
→ 与 Desktop 共享同一套 Runtime/业务源码，不形成第二套产品实现

ui-host/opendesk-ui-host.exe
→ Runtime-owned internal Native UI helper
→ .NET / WinForms / WebView2 sidecar
→ 用户不手动启动
→ 不拥有普通用户 shortcut
```

架构依据以：

```text
docs/architecture/windows-build-distribution.md
```

为 canonical contract。

最终 Windows 真机验收提示词仍为：

```text
docs/plans/runtime/windows-desktop-release-acceptance-prompt.md
```

但只有本轮 Source / Build / CI readiness 变成 READY 后才进入该阶段。

---

## 一、开始前重新取得真实基线

仓库：

```text
https://github.com/shopable-ai/opendesk
```

目标分支：

```text
master
```

不要创建新分支。

当前可能存在多个并行会话继续修改 `master`。开始时必须重新读取：

```text
当前 HEAD
当前工作树/目标文件
最近 Windows / App Builder / Custom UI / Platform Payload CI
```

不要依赖本提示词写入时的 SHA、旧失败结果或历史目录假设。

此前曾观察到过：

```text
registerWebCrypto 跨平台编译回归
测试架构分类失败
```

这些都只能当作历史线索。若最新 `master` 已经修复，不得重复修改；如果仍失败，沿最新真实失败链路做最小必要修复。

---

## 二、冻结 executable role，不重新追求“单 EXE”

本轮不得为了让安装目录看起来只有一个 `.exe` 而进行下列重构：

```text
新增 launcher EXE
Desktop 只做 launcher 再启动 CLI Runtime
把 CLI 删除
把 .NET UI Host 强行嵌入 Go Runtime
把 helper 解压/下载到 TEMP 后执行
让普通用户手动启动 helper
按 capabilities 删除 Runtime 必要文件
```

本轮质量指标是：

```text
普通用户启动入口数量 = 1
Desktop / CLI 职责正确
内部 helper ownership 正确
发行 artifact 完整且可验证
```

而不是：

```text
安装目录 EXE 数量 = 1
Task Manager 进程数量 = 1
```

只有未来出现可量化收益，例如重复 Runtime 二进制显著增加体积/更新成本，且能证明单 Runtime entry 不破坏 Explorer no-console、stdin/stdout/stderr、pipe、exit code、CLI automation 和兼容范围时，才另开优化项目重新评估。

---

## 三、先把当前相关 CI 收绿

重新查看最新 Windows / App Builder / Custom UI / Platform Payload checks。

重点包括但不限于：

```text
Windows Core Compatibility
Windows Installed Runtime Consumer Build
macOS Installed Runtime Consumer Build
customui Windows
platform payload contract
Windows distribution artifact verification
```

处理规则：

```text
真实失败
→ 定位真实失败链路
→ 最小必要修复
→ 更新对应测试
→ 重新运行/观察 CI
```

禁止通过：

```text
删除失败测试
放宽关键断言
跳过 Builder artifact 检查
把 failure 改成 warning
增加与真实行为不一致的 platform stub
```

制造假 PASS。

跨平台共享 Runtime 改动导致 Windows 编译失败时，应修复共享 contract 或提供真实 platform implementation；不能仅为了 Windows CI 通过增加无行为意义的空实现。

---

## 四、收口 Windows Native UI Host resolution

生产发行默认 helper 必须优先解析：

```text
<runtime-root>/ui-host/opendesk-ui-host.exe
```

审查并测试：

```text
resolve packaged path
→ direct child process start
→ hello/protocol/version handshake
→ Runtime ownership
→ graceful shutdown
→ forced cleanup
```

Production resolution 不得隐式依赖：

```text
PATH
TEMP
任意 current working directory
用户 App Mode package
运行时网络下载目录
shell file association
```

如果仓库已有显式 development/test override，可保留，但必须和默认 production resolution 清楚区分，并不能成为 consumer-release trust proof。

---

## 五、收口 helper 生命周期与 Windows parent-death ownership

重点审查当前：

```text
pkg/customui/process_driver.go
Windows child-process platform implementation
Native UI Host protocol lifecycle
```

目标行为：

```text
正常 Runtime Quit
→ helper 正常退出

重复 Close / concurrent shutdown
→ 幂等，不 panic，不泄漏

helper crash
→ 当前请求得到稳定、明确的失败语义
→ 不无限 respawn
→ 不自动重复可能有副作用的业务操作

Runtime crash / hard kill
→ Windows 不长期留下 orphan ui-host
```

如果当前已有可靠 OS-native parent-death ownership，保留实现并补缺失测试。

如果没有，优先采用 Windows platform-specific ownership，例如：

```text
Job Object
+ JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
```

或当前结构下可以证明等价的 Windows 原生机制。

要求：

- Windows 专用代码放 platform-specific 文件；
- 不污染公共 JS/Custom UI API；
- 不要求管理员权限；
- 不把 helper 改成 Windows Service；
- Job 只拥有 OpenDesk 自己的内部 helper，不得把计算器、浏览器、微信等被自动化目标进程加入同一个 kill-on-close ownership；
- 处理 Job handle 生命周期、重复关闭、句柄继承和进程加入失败；
- 若进程创建与 AssignProcessToJobObject 之间存在可造成失控 child 的窗口，采用当前代码结构允许的可靠创建/assignment 方案；
- 不引入无限自动重启。

增加/完善自动化测试，至少覆盖：

```text
normal shutdown
helper crash
repeated close
concurrent close/start where applicable
parent ownership / owner death
```

Hosted test 无法证明的 hard-kill 行为应明确进入 Windows interactive acceptance，而不能伪造 PASS。

---

## 六、完善 Windows release preflight

增加或完善维护者/发布工程使用的 Windows preflight，对**真实生成 artifact**执行检查。

至少验证：

```text
opendesk-desktop.exe 存在
opendesk.exe 存在
ui-host/opendesk-ui-host.exe 存在

Desktop path != CLI path
不存在 Windows case-insensitive collision

Desktop PE subsystem = GUI (2)
CLI PE subsystem = Console (3)
PE architecture 与 win-x64 contract 一致

Distribution provenance
→ layout.desktopEntry = opendesk-desktop.exe
→ layout.cliEntry = opendesk.exe
→ hash / target / architecture 信息一致

Builder template 完整
Runtime JS payload 完整
UI Host publish closure 完整
用户 App Mode 已正确 stage
官方旧 App Mode 没有错误继承
```

如果适合，在 Windows runner 上额外报告：

```text
Windows version / architecture
artifact SHA-256
WebView2 Runtime availability/version
Authenticode status
Publisher
timestamp
```

状态必须区分：

```text
READY
WARNING
BLOCKED
UNKNOWN
```

不能将：

```text
unsigned
无正式 certificate
hosted runner 有 WebView2
```

错误提升为 consumer release PASS。

运行证据写到 `.runtime/` 或 workflow artifact；不要提交真实执行产物。

---

## 七、收口 Installed App Builder

重新验证：

```text
Installed same-platform Runtime
→ app build
→ Windows user artifact
```

P0 原则继续固定为：

> Installed App Builder 使用完整同平台 Runtime Template；复制完整已验证 Runtime，再替换用户 App Mode package。

Builder artifact 必须保留实际 Runtime 所需内容，包括：

```text
opendesk-desktop.exe
opendesk.exe
ui-host/ publish closure
polyfills/
jslibs/
Runtime-owned resources
app-builder-template / required provenance
当前 Runtime 所需 optional provider / diagnostic payload
```

同时验证：

```text
旧官方 AppMode → 不继承
用户 App Mode → 正确 stage
Builder → 不依赖源码工作区
Builder → 不依赖 Go toolchain
Builder → 不要求重新 dotnet publish
```

`opendesk.app.json.capabilities` 仍不能作为删除 Runtime 文件的 dependency solver。

不要在本轮实现 capability-aware minimal packaging。

---

## 八、UI Host publish closure 与 WebView2

不要把 UI Host 的“单文件发布”当成产品架构要求。

应检查当前真实 `.csproj` 与 publish artifact：

```text
PublishSingleFile
SelfContained
IncludeNativeLibrariesForSelfExtract
RID
实际输出文件
启动行为
```

原则：

```text
Distribution 保留真实 dotnet publish closure
而不是手写猜测 DLL 清单
```

如果当前 single-file/self-extract 经过测试没有实际问题，可保留，不为理论整洁度重构。

如果真实证据显示它引入：

```text
TEMP extraction
启动/权限异常
安全软件误报
servicing/debug 成本
```

则可以改成 self-contained folder publish；这不改变“一产品、一个入口、内部 helper”的架构。

必须继续明确：

```text
.NET self-contained != WebView2 Runtime bundled/available
```

本轮至少让 CI/preflight 能识别 WebView2 状态；Evergreen vs Fixed Version 的正式 consumer deployment policy 可以在 release-hardening 阶段最终冻结。

---

## 九、补齐真实 artifact CI gate

检查 GitHub Actions 是否真实形成：

```text
build
→ canonical Windows distribution
→ distribution payload verification
→ PE/provenance verification
→ Installed App Builder consumer build
→ resulting Builder artifact verification
→ archive/upload artifact
```

CI gate 应尽量消费同一个正式 staging directory，避免 workflow 自己复制一套与 repository build script 不一致的 composition rules。

能够在 `windows-latest` 自动证明的项目，应真正自动证明。

但 hosted runner 成功不得描述成：

```text
SmartScreen PASS
Smart App Control PASS
Defender consumer reputation PASS
真实产品窗口 UX PASS
clean-machine PASS
正式 Publisher signing PASS
```

这些仍属于后续 Windows release acceptance。

---

## 十、同步 canonical 文档

实现发生变化时同步：

```text
docs/architecture/windows-build-distribution.md
docs/architecture/platform-distribution-capability-closure.md
相关 App Builder / Custom UI / distribution 文档
```

不得把未来计划写成已实现。

三个 executable role 的正式名称继续统一为：

```text
opendesk-desktop.exe
opendesk.exe
ui-host/opendesk-ui-host.exe
```

必须继续使用：

```text
一个产品
一个普通用户启动入口
内部 helper 自动管理
```

来描述产品，而不是把三个文件描述成三个普通用户 App。

---

## 十一、完成标准

### Executable / artifact contract

```text
opendesk-desktop.exe 与 opendesk.exe 是不同路径                         PASS
Desktop entry = Windows GUI subsystem                                   PASS
CLI entry = Windows Console subsystem                                   PASS
ui-host/opendesk-ui-host.exe = packaged internal helper                 PASS
不存在依赖 OpenDesk.exe/opendesk.exe 仅大小写区分                        PASS
```

### Native UI Host

```text
packaged helper production resolution 优先                               PASS
Runtime 自动启动 helper                                                  PASS
正常 Runtime shutdown 清理 helper                                       PASS
helper crash 有明确失败语义                                               PASS
不存在无限 respawn                                                       PASS
Windows parent-death ownership 有实现或可验证等价保证                     PASS
```

### App Builder

```text
Windows Installed Runtime Consumer Build                                PASS
Builder artifact 保留 Desktop / CLI / UI Host                            PASS
用户 App Mode 正确替换官方 App Mode                                      PASS
Builder 不依赖源码 workspace / Go toolchain / dotnet SDK                 PASS
```

### Distribution / CI

```text
canonical Windows distribution build                                    PASS
payload verifier                                                         PASS
PE subsystem / architecture gate                                         PASS
provenance contract                                                      PASS
relevant Go / Python / PowerShell / .NET tests                           PASS
GitHub Windows hosted build 产生并验证完整 artifact                       PASS
```

### Release phase boundary

最终只能在上述项目没有已知 P0 源码/构建失败时写：

```text
Source / Build / CI readiness = READY
Windows interactive qualification = PENDING
```

如果还有真实源码/构建/CI P0 问题，必须写：

```text
Source / Build / CI readiness = BLOCKED
```

并列出实际证据，不允许为了进入下一阶段而降低标准。

---

## 十二、完成后的下一步

只有当：

```text
Source / Build / CI readiness = READY
```

才继续执行：

```text
docs/plans/runtime/windows-desktop-release-acceptance-prompt.md
```

该阶段负责真实 Windows 11 用户会话中的：

```text
Explorer / shortcut launch
无 Console
真实 App Shell / Tray / Script Runner / Recorder / Scheduler / Runtime Log / Permissions Center
真实 helper lifecycle
clean-machine WebView2
UAC
Authenticode / Publisher / timestamp
SmartScreen / Smart App Control / Defender
installer / install-location behavior
```

不要在本轮用 GitHub hosted runner 的结果代替这些证据。

---

## 最终输出格式

不要只输出审计报告。直接完成能够完成的源码、测试、CI 和文档修改，然后给出：

```text
已修改
- 文件
- 核心变化

已验证
- 命令 / CI check
- PASS / BLOCKED
- 关键证据

当前 CI
- Windows Core
- Installed Runtime Consumer Build
- Custom UI / Platform Payload
- 其他相关 check

Source / Build / CI readiness
- READY / BLOCKED

仍被 Windows 真机阻塞的项目
- 列表

下一阶段
- 如果 READY：直接执行 docs/plans/runtime/windows-desktop-release-acceptance-prompt.md
- 如果 BLOCKED：先继续修复当前真实阻断，不进入真机 release qualification
```
