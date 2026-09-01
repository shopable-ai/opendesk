# Native Extension：本机开发者默认加载 Goal

## 目标

把 Native Extension 的第一条用户路径定为**插件开发者在自己的机器上开发并直接运行**：

```text
编写插件源码 → 编译 macOS executable → 放入 OpenDesk 程序相对的指定目录
→ 正常启动 OpenDesk → 自动发现 manifest → JavaScript 调用
```

开发者不需要注册插件、不需要指定 executable、plugin、protocol 或 wire method，也不需要传
`-experimental-native-extension`。本轮最终 Runtime 验收在当前 macOS 进行。

## 用户实际使用方式

开发者把完整 bundle 放入程序相对目录：

```text
<program-directory>/
  opendesk
  native-extensions/
    com.example.go-basic/
      extension.json
      bin/native-ext-go-basic
      types/index.d.ts              # optional
```

macOS `.app` 的等价位置是：

```text
OpenDesk.app/Contents/Resources/NativeExtensions/<plugin-id>/
```

安装目录不包含 `main.go`、`go.mod`、构建脚本或第三方 JavaScript。开发者从文档明确声明的
工作目录，用一条可复制命令运行正式脚本：

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

预期结果：

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

“自动加载”只指启动本机 CLI JavaScript execution 时自动读取指定目录、严格校验 manifest、
生成不可变 `NativeExtensions` Binding。发现、`list()`、`get()` 和 `diagnostics()` 不执行
插件；只有声明的方法调用才启动一次受校验的插件进程。

## 平台表述

- Native Extension V1 的 Darwin、Linux、Windows 源码分支是跨平台实现候选。
- `go-basic` 是纯 Go 示例，应该能按目标平台构建。
- `macos-vision` 是 Apple Vision/Swift 示例，只支持 macOS。
- 本轮 Runtime、安全攻击、OCR 与评分只在当前 macOS 进行；Linux/Windows 没有 live
  Runtime Evidence，必须写为 **Not Evaluated**，不能写为 **Unsupported**。
- 依照项目协作规范，Linux/Windows 只做与当前源码对应的 cross-compile/package 检查；不启动
  容器、虚拟机、Wine、模拟器或目标系统 live 验收。

## 范围与安全边界

- 默认 discovery root 是程序相对指定目录；不要把当前用户主目录、machine-wide root、cwd、
  `PATH`、源码祖先或脚本路径加入默认链。
- 本机 CLI 默认提供 `NativeExtensions`；HTTP、MCP 和其他远程执行通道不能开启、重定向或调用
  Native Extension。低层任意 executable 调用不作为日常 JavaScript API 暴露。
- JavaScript 只能传业务 params；route、root、plugin id、executable、protocol、version 和
  wire method 必须来自已经验证的 manifest Binding。
- manifest discovery 不执行 `facade.js`、`install.js` 或任何第三方 JavaScript。
- symlink、路径逃逸、权限/owner/ACL、摘要不匹配、文件替换、重复 id/namespace 与不安全 bundle
  必须 fail closed；冲突 plugin 全部 quarantine。
- 不做下载器、Manager、插件商店、自动更新、签名体系、热更新、常驻进程、sandbox 或自定义 JS
  facade。
- 保持 `master` 和共享 dirty working tree；不创建/切换分支，不 reset/clean/stage/commit/push。

## 文档与测试依据

- 接口事实只以 `docs/api/` 为准，尤其是 `docs/api/native-extension.md`；不要使用或恢复退役
  API 文档。
- 文档必须明确区分“跨平台实现候选”“macOS-only 示例/证据”和“未评估目标系统”。
- 公开示例必须说明工作目录，并给出从该目录原样可复制的一行命令；实际验收必须运行该命令，
  run-local 临时命令不能替代。
- Runtime API 验收只使用正式 JavaScript：`tests/runtime-api/` 与
  `./scripts/test_runtime_apis.sh`。

## 执行顺序

### A. 只读基线

完整读取本 Goal、`AGENTS.md` 与 `docs/api/` 中 Native Extension 契约。记录 branch、HEAD、
index、working tree、真实程序相对目录和旧 Evidence。旧 run 只有在其 source snapshot 与当前
工作树逐项一致时才可引用；不一致即作废。

### B. 完成开发者闭环

让当前源码的本机 CLI 从程序相对指定目录默认发现完整 bundle。实现/文档必须让开发者能：

```text
构建 go-basic → 复制 source-free bundle → 正常启动 CLI → 运行 quickstart.js
```

同步完成自动发现、不可变 Binding、远程门禁、零子进程 diagnostics、安全攻击与隐私边界。

### C. 冻结并进行真实验收

停止写入后冻结输入；proof 期间输入变化必须失败，不能反复试到绿色。实际执行：

1. Native Extension 的 macOS 路径、安全、ACL、替换、隐私与 HTTP/MCP 门禁测试；
2. `./scripts/test_runtime_apis.sh unit` 的正式 `.js` 测试；
3. 文档指定工作目录中的公开一行命令；
4. 程序相对目录的 source-free bundle、zero-child `list/get/diagnostics`、installed
   `hello/add` 与真实 Apple Vision OCR；
5. 开发者文档中的 build、wire、schema/digest、bundle inventory 和运行命令；
6. Linux/Windows 的 cross-compile/package（仅此，不表述为 live Runtime）。

## Evidence 与完成条件

最终 Evidence 必须记录：当前 branch/HEAD/index/working-tree snapshot、前后零漂移、外层 exit
code、OpenDesk/bundle/installed executable SHA-256、source-free inventory、程序相对安装结果、
zero-child、正式 JS、hello/add、真实 OCR、攻击结果与持久 Event/diagnostics 隐私扫描。

持久 Native Extension Evidence 不得保存业务 params/result、用户目录、绝对 executable 或插件
原始错误。用户 console 可显示业务结果。

由主执行者唯一写入；架构、macOS 安全、用户体验、Evidence 与反方只读复核。总分必须高于
95/100，P0/P1 均为零。最终交付明确：macOS Runtime 已验证；Linux/Windows 只有
compile/package 或 Not Evaluated 状态，绝不冒充目标机运行证明。
