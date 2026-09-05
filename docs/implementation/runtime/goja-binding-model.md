---
title: Go to JavaScript Runtime binding model
description: OpenDesk 如何把 Go Runtime primitive 映射为 Goja JavaScript API，以及 native bridge 与 polyfill facade 的边界。
order: 14
---

# Go to JavaScript Runtime binding model

本文面向 OpenDesk Runtime 和 API 维护者，说明一个 Go 接口如何成为脚本中的 JavaScript
对象或方法。用户 API 的参数、返回值和平台限制仍以 `docs/api/` 为准；本文解释实现链路、
可扩展位置和测试边界。

## 总体链路

```text
Go type / exported method
        │
        ▼
jsMethodAllowlist（显式允许公开哪些 Go 方法）
        │
        ▼
AutoMapObject + createJSMethodWrapper
        │  参数 ExportTo / Go method.Call / 返回值 ToValue
        ▼
runtime.Set("nativeName", object)
        │
        ├─ raw bridge：page____Inject / browser____Inject / context____Inject
        │
        ▼
按文件名排序加载 polyfills/*.js
        │
        ▼
JS facade：page / axios / notify / alert 等
        │
        ▼
用户脚本或 Runtime API 测试
```

关键点是：这不是“导出所有 Go 方法”的开放反射。只有 `automation/utils.go` 中
`jsMethodAllowlist` 明确列出的 exported method 才会被 `AutoMapObject` 暴露；内部的 worker、
诊断、关闭和资源计数方法不会因为 Go 方法名首字母大写而自动进入 JavaScript。

## 第一层：Go 方法映射为 Goja function

`AutoMapObject(runtime, goObj)` 的处理步骤是：

1. 读取 `goObj` 的精确 pointer type。
2. 在 `jsMethodAllowlist` 中查找这个 type；未知 type 不导出 reflected methods。
3. 对 allowlist 中的 Go method name 调用 `reflect.Type.MethodByName`。
4. 只接受 exported method，并用 `toLowerFirst` 把 `OpenApp` 变成 `openApp`。
5. 为每个方法创建 `goja.FunctionCall` wrapper，放入返回的 JavaScript object。

以 `Page.OpenApp(appName string) error` 为例：

```text
Page.OpenApp
  → jsMethodAllowlist[*Page] 包含 "OpenApp"
  → AutoMapObject 返回 pageObj["openApp"]
  → page.openApp("Safari")
  → wrapper 用 runtime.ExportTo 转换参数
  → reflect method.Call 调用 Go
  → nil error 返回 undefined；非 nil error 转成 JavaScript Error
```

当前实现位置：

- `automation/utils.go`：`jsMethodAllowlist`、`AutoMapObject`、`createJSMethodWrapper`。
- `automation/page.go`：`Page` 的 native 方法实现。
- `automation/utils.go` 的 `InitJSWithOptions`：将对象放入当前 Goja Runtime。

## 参数、返回值和错误转换

### 参数

固定参数通过 Goja 的 `runtime.ExportTo` 转成 Go 类型；variadic 参数逐个转换。通用 wrapper
没有替业务 API 自动补齐默认值或做复杂语义校验；这些应由 native 方法、显式注册函数或
polyfill facade 负责。

### 返回值

wrapper 只把第一个非 error 返回值映射回 JavaScript：

- 无返回值，或只有 nil error：`undefined`。
- `[]byte`：Goja `ArrayBuffer`。
- `*Page`、`*Browser`、`*BrowserContext`：重新构造对应的 JS 方法对象。
- 已知结构体/切片：通过 Goja 的 `ToValue` 投影为对象/数组。
- 其他值：直接交给 Goja `ToValue`。

Go method 的最后一个返回值如果实现 `error`，非 nil 时会抛出 JavaScript Error。实现
`jsErrorProperties` 的错误还会把稳定的 `code`、`operation` 等字段附加到 Error；因此用户
文档可以依赖稳定错误字段，而不需要解析错误文本。

### 何时不能只用 AutoMapObject

以下情况需要显式注册或额外映射：

- 返回值需要特殊 JS shape，例如 Page 嵌套 `mouse`、`keyboard`、`touchscreen`。
- 方法不是普通同步 Go method，而是需要 Goja EventLoop 的 Promise/callback bridge。
- 一个 namespace 同时包含 native 方法和 JS facade 方法，例如 `page` 的等待与权限组合。
- 资源句柄必须绑定 execution，并在 teardown 中停止或取消。

`Sound.start()` 就是显式注册例子：旧同步方法可由 allowlist 自动映射，但非阻塞播放句柄、
`wait()` Promise 和 execution lifecycle 由 `registerSound` / native owner 组装，不能交给
通用反射 wrapper 假设完成。

### Sound 的实际暴露路径

`automation/sound.go` 中的旧方法是 exported Go method：

```go
func (s *Sound) PlaySound(soundPath string) error
func (s *Sound) Play(soundPath string) error
```

它们出现在 `automation/utils.go` 的：

```go
jsMethodAllowlist[reflect.TypeOf((*Sound)(nil))] = []string{
    "PlaySuccess", "PlayFail", "PlayWarning", "PlayError",
    "PlayCaptcha", "PlaySound", "Play",
}
```

所以 `AutoMapObject(runtime, sound)` 会生成 `playSound`、`play` 等 JS function。

长时播放接口采用另一条路径，因为 `startPlayback`、`stop`、`stopAll`、`activeSnapshot` 和
`waitPlayback` 是 native owner 的内部方法，不能也不应该被通用反射层直接导出。`registerSound`
先取得旧方法映射，再显式加入新的 JS closures（以下为当前实现的关键部分）：

```go
methods := AutoMapObject(runtimeValue, sound)
methods["start"] = start("Sound.start")
methods["playAsync"] = start("Sound.playAsync")
methods["stop"] = func(call goja.FunctionCall) goja.Value {
    id, err := soundIDArgument(call.Argument(0), "Sound.stop")
    if err != nil { panic(soundJSError(runtimeValue, err)) }
    return runtimeValue.ToValue(sound.stop(id))
}
methods["stopAll"] = func(goja.FunctionCall) goja.Value {
    return runtimeValue.ToValue(sound.stopAll())
}
methods["getActive"] = func(goja.FunctionCall) goja.Value {
    return runtimeValue.ToValue(sound.activeSnapshot())
}
runtimeValue.Set("Sound", methods)
```

其中 `start` closure 自己完成 path/options 校验，调用 `sound.startPlayback(...)`，再用
`sound.playbackObject(...)` 创建 JS 句柄。句柄不是 Go struct 直接暴露，而是通过
`runtime.NewObject()` 显式挂载 `id`、`path`、`startedAt`、`status`、`pause`、`resume`、`stop`
和 `wait`；`wait` 再把完成结果通过 `RunOnLoop` 返回到创建该句柄的 Goja EventLoop。

最终的真实调用链是：

```text
InitJSWithOptions
  → registerSound(runtime, opts)
  → newSound(runtime, opts.EventLoop, opts.Context, opts.OnAsyncError)
  → AutoMapObject(sound)                 # 旧同步 Sound.play* / playSound / play
  → registerSound 手动加入 start/playAsync/stop/stopAll/getActive
  → playbackObject 手动构造 SoundPlayback handle
  → runtime.Set("Sound", methods)
  → JavaScript: Sound.start(path).pause()/stop()/wait()
```

因此修改 `sound.go` 后，不能只新增一个 Go method 就假设 JS 可调用。必须判断它属于：

- 可安全使用普通参数/返回值的 exported method：更新 allowlist，让 `AutoMapObject` 映射。
- 需要 Goja runtime、Promise、EventLoop、句柄或 teardown 的能力：在 `registerSound` 中显式
  注册，并手动把结果投影为 JS 对象。
- 纯 JS 默认值或组合：放入 `polyfills/`，但不能复制 `Sound` owner。

### Audio 为什么也是显式注册

`registerAudio(runtime, opts)` 不走 `AutoMapObject`。它先选择平台 backend，再用
`runtime.NewObject()` 创建 JS namespace，通过一个本地 `set(name, fn)` helper 把
`getVolume`、`setVolume`、`mute`、`getOutputDevices` 等同步操作逐个挂到对象上，最后执行：

```go
object := runtime.NewObject()
set("getVolume", ...)
set("setVolume", ...)
set("getCapabilities", ...)
runtime.Set("Audio", object)
```

这层显式注册用于稳定控制错误转成、`null` 返回值和 backend 选择；它不是遗漏。当前
Audio backend 没有播放 worker、Promise handle 或 teardown 资源，因此初始化处有意不把返回的
`*Audio` 保存到 `RuntimeLifecycle`。如果以后加入录音、持续设备订阅或其他异步资源，应像
Sound 一样把 owner 加入 lifecycle，并同时补充 allowlist/catalog、TypeScript、文档和 JS 测试。

## 第二层：Runtime 注册和 raw bridge

`InitJSWithOptions` 先创建 native 对象，再通过 `runtime.Set` 注入 Goja global。Page 的当前
注册顺序是：

```text
NewPage()
  → AutoMapObject(page)
  → AutoMapObject(page.Mouse / Keyboard / Touchscreen)
  → pageObj 组合嵌套输入对象
  → runtime.Set("page____Inject", pageObj)
  → runtime.Set("page", pageObj) 作为 polyfill 加载前的临时 raw public shape
  → loadPolyfillsWithSink(...)
  → 000-page.js 把 page 替换成 facade
```

`page____Inject`、`browser____Inject` 和 `context____Inject` 是内部构造面，不是用户 API，
也不应进入 `types/*.d.ts` 或 `runtime-api.ai.json`。它们的作用是让 polyfill 在加载时获得
稳定的 native owner，同时避免 facade 再创建第二个 Page/Browser/Context owner。

## 第三层：静态 JavaScript asset 和 polyfill facade

`loadStaticJavaScriptAssets` 会：

1. 解析当前 Runtime 选中的 `polyfills/` 目录。
2. 只读取第一层 `.js` 文件。
3. 用 `sort.Strings` 按文件名排序。
4. 每个进程最多读取并 `goja.Compile` 一次 immutable program。
5. 在每个 Goja Runtime 中通过 `RunProgram` 执行该 program。

因此 polyfill 是 Runtime 初始化的一部分，但不是 Go native method 的默认归属地。纯 JS 的
默认值、参数包装、多个 API 组合和兼容 facade 可以放在这里；平台驱动、真实资源和统一
execution lifecycle 必须留在 native owner。

## Command 为什么不是 `require('child_process')` polyfill

Goja EventLoop 会提供 CommonJS loader，但这不代表 Runtime 是 Node.js，也不自动拥有 libuv、Node
Stream、Buffer 或 `child_process`。OpenDesk 的命令行能力因此由 `automation/command.go` 显式
注册为 `Command`：Go `os/exec` 持有 process 和 stdio，`run()` 的 Promise settlement 经 EventLoop
回到 Goja owner，`RuntimeLifecycle` 在 teardown 中终止并等待命令进程。这样不会与 `require()`
resolver 或未来的 Node compatibility adapter 争夺模块名。

## `polyfills/000-page.js` 的具体机制

文件开头的循环：

```js
for (const key in globalThis.page____Inject) {
  if (typeof globalThis.page____Inject[key] === 'function') {
    pageWrapper[key] = function (...args) {
      return globalThis.page____Inject[key](...args);
    };
  } else {
    pageWrapper[key] = globalThis.page____Inject[key];
  }
}
```

它的语义不是再次反射 Go，而是：

- 在 polyfill 执行时枚举 raw bridge 已有的 enumerable keys。
- 对 function 建立一个转发 wrapper；调用时仍通过 `page____Inject[key]` 找到当前 native
  owner，因而保留 raw bridge 的 receiver 调用语义。
- 对非 function 做浅层值复制；不会递归包装，也不会追踪未来新增的 key。
- 循环结束后，文件会用显式实现覆盖 `screenshot`、权限方法、`title`、`goto`、`url`、
  `waitFor*` 等需要 JS 组合或参数策略的方法。
- 最后把 `mouse`、`keyboard`、`touchscreen` 挂到 wrapper，并执行
  `globalThis.page = pageWrapper`。

所以 `page.openApp` 是典型的 generic forward；`page.requestPermissions` 和
`page.waitForFunction` 则是 facade-defined method。新增 Page native method 时必须同时检查：

1. `jsMethodAllowlist[*Page]` 是否允许导出。
2. `docs/api/page.md`、types 和 Runtime API catalog 是否同步。
3. `000-page.js` 是否需要显式包装，而不是依赖 generic forward。
4. `tests/runtime-api/unit/page.test.js` 是否覆盖公开调用；真实窗口行为再放到 live 测试。

## 测试分层

| 需要证明的事情 | 正式位置 | 证明边界 |
| --- | --- | --- |
| allowlist 不隐式暴露 Go 内部方法、引用的方法真实存在 | `automation/runtime_hardening_test.go` | native/private reflection seam；不是用户契约 |
| `000-page.js` generic forwarding、显式 wrapper、权限组合、等待 facade | `tests/runtime-api/unit/page.test.js` | JavaScript 公共 facade 行为 |
| Page 公开对象 | `tests/runtime-api/unit/page.test.js` | 只覆盖 `docs/api/page.md` 中维护的桌面 Runtime surface |
| 真实截图、权限、窗口或浏览器环境 | `tests/runtime-api/live/` | 当前 macOS/真实环境的 live boundary |

正式 unit 入口：

```bash
OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

用户/开发者直接复现入口（从仓库根目录）：

```bash
./dist/opendesk -script tests/runtime-api/unit.js -console-mode script
```

`tests/runtime-api/unit/page.test.js` 不是独立命令；它由 `unit.js` 和正式 runner 加载。测试
通过 `withGlobal('page____Inject', ...)` 替换 raw bridge，验证 facade 转发而不触碰真实桌面。

## 变更 checklist

新增或修改 Go→JS 接口时按以下顺序同步：

1. 先在 `docs/api/` 定义公开方法、参数、返回、错误和平台边界。
2. 决定使用 `AutoMapObject`、显式注册，还是 native + polyfill 两层组合。
3. 更新 `jsMethodAllowlist` 或对应注册函数；不要依赖“导出方法自动出现”。
4. 如果是 facade，更新相应 `polyfills/*.js` 以及本文件中的 owner/覆盖说明。
5. 更新 `types/*.d.ts`、`runtime-api.ai.json`、`tests/runtime-api/manifest.js`。
6. 在 `tests/runtime-api/unit/<namespace>.test.js` 写 JS 公共契约；只把无法从 JS 观察的
   private/backend seam 留在同包 `_test.go`。
7. 运行正式 JS gate，并把输出写入 `.runtime/tests/runtime-api/`。

完整的七处同步闭环、生命周期对称性和证据等级见 [Runtime API development workflow](./runtime-api-development-workflow.md)。

## execution teardown 的可观测闭环

`RuntimeLifecycle.AsyncCounts()` 提供总 worker/callback 数；`ResourceCounts()` 提供分 owner 细目。两者必须同时覆盖 HTTP、Sound、Custom UI、Global Shortcut、Events、Screen Capture、App 和 Notifications。`pkg/execution/runner.go` 把分 owner 数写入 cleanup event，正式 Runtime gate 再逐项断言为零。

因此新增异步 owner 时至少同步 `CancelAsync`、`Wait`、`AsyncCounts`、`ResourceCounts`、`IsZero`、`String`、cleanup event 和 shell gate 的 required fields。漏掉任何一项都会造成“实际残留但证据显示为零”的假阴性。
