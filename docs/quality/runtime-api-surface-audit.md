---
title: Runtime API surface and lifecycle audit
description: Runtime 公开对象、函数、返回句柄的逐类审查台账；区分静态结论、实施、验证和历史记录。
order: 22
---

# Runtime API surface and lifecycle audit

本文件是持续接续的公共 API 审查台账，不是 API Reference。当前状态以最近一次带基线的逐对象记录为准；末尾旧表保留为历史记录，其中“闭合”“已修复”不能自动继承为新版本的验证结果。

## 2026-09-09 审查基线与接续规则

| 项目 | 本轮记录 |
| --- | --- |
| 模式 | 检查与方案；只允许持久化本台账，不修改生产代码、类型、正式 API 文档、机器索引和测试 |
| 仓库/分支 | shopable-ai/opendesk，已有默认分支 master；未创建或切换分支 |
| 阅读基线 | 1ff42ff6e28fce8282b1fc96889da0cc0b4665fe；tree eec5ee3b51e998f4791bda77d85dd269299a8aec |
| 基线提交 | feat(window): unify target queries and recorder window resolution |
| 环境边界 | 使用 GitHub 远端文件；当前执行环境未发现仓库工作树，用户本地未提交修改不可见，不能称其 clean |
| 写入前复核 | master 仍指向上述基线，本文件原 blob 为 6468a76069ec2a4fd1379b16c88d4bb8e4d061a2 |
| 本轮深入 | window 的 list/get/wait 方法族；其余 window 方法只有登记或衔接线索，不算完成深入审查 |
| 已执行验证 | 远端读取、源码/类型/规则/登记对照；没有运行 Runtime、构建、测试、生成或格式化，没有启动应用/截图/输入 |
| 旧验证如何使用 | window-target-resolution.md 明确新增查询的测试、索引总入口与 native 验证尚未闭环；旧 window live 记录不替代本次新增行为验证 |
| 状态维度 | 审查：未审/已审（静态）/待复核；处理：不改/待决策/待实施/已实现；验证：未运行/模拟证据/Runtime 已验证/目标系统已验证/受阻；三者分别记录 |
| 下一步选择 | 首先接续 window 的既有读取与快照适配族；window 未全部审完，不自动跳到另一个对象。完成后优先 App 的目标解析/窗口就绪衔接 |

来源用于回答“实际做什么”，正式契约用于回答“应当做什么”。二者冲突必须立项，不能以“源码优先”为由改文档掩盖实现错误。未执行的测试用例仅是验收规格，不是通过记录。

### 规则冲突主记录

| ID | 证据 | 判定与当前处理 | 最小后续规格/验收 |
| --- | --- | --- | --- |
| X-RULE-01 | docs/api/.rules.md 的独立方法 H2/无反引号规则；docs/maintenance/docs-user-api-editme-toc-maintenance.md §1.1 仍允许多接口共用标题，并示例 setTimeout / clearTimeout | 已确认规则冲突；本轮以专属 .rules.md 为准；旧指导尚未修复，仅登记 | 修改维护文档的冲突句及示例，明确专属规则优先；各公开接口独立 H2，标题无反引号。不要只改一个页面而保留错误修改指南。需另获实施授权 |
| X-RULE-02 | docs/api/README.md、docs/api/index.md 的事实来源规则；runtime-api.ai.json authority.rule | 治理边界待明确：事实判定优先源码不应等于契约冲突一律改文档 | 明确实际行为/应然合同两条证据线；失败语义冲突先立项，不能单改文档验收。与 X-RULE-01 一起处理，跨对象只维护本主记录 |

## 公开面入口清单

### 登记口径与未覆盖边界

以 docs/api/README.md、index.md 为入口，与 types 目录、automation/utils.go 的显式 allowlist/register、polyfills 目录、runtime-api.ai.json、tests/runtime-api/manifest.js 交叉登记。不是按 Markdown H2 数量统计。下面登记 34 个常规对象/入口，以及单独的诊断兼容入口、全局函数/构造器、返回句柄和第三方库。

“登记”只证明找到了公开面依据和接续入口，**不证明该对象全部方法已核对行为**。除 window/list/get/wait 外，本轮全部为未审；每行“下一步”即该对象接续工作。类型中普通 options/result 数据不重复当成可调用对象。方法清单不含内部 Go 导出方法。属性另外注明。

本轮尚未穷尽每个 examples 文件及每个第三方库的全部静态/实例导出；动态 NativeExtensions 也取决于宿主安装清单。这些是显式登记缺口 INV-01，不把本清单称为全库所有导出已经穷尽。已读的实际调用者见后文；代码搜索未返回结果不作为“不存在调用者”的证据。

### 常规对象与方法清单

表内文档相对 docs/api/，类型相对 types/；owner 均为仓库路径。每行所有方法未审，window 的例外见逐方法表。部分 owner 是正式 manifest/注入所登记的入口，具体平台实现仍由对应对象轮次展开，不能据此断言所有平台可用。

| 对象 | 主文档 / 类型 | 实现 owner / 组合入口 | 完整登记方法（本轮基线的一方公开面） | 主要调用链 / 下一步 |
| --- | --- | --- | --- | --- |
| page | page.md / page.d.ts | automation/page.go；polyfills/000-page.js | screenshot, captureScreen, goto, openURL, openApp, openURLInApp, title, url, waitFor, waitForTimeout, waitForNavigation, waitForFunction, waitForAll, checkPermissions, requestPermissions, ensurePermissions, ensureMacPermissions, checkScreenshotPermissions, openMacOSPrivacySettings, requestMacPermissions, requestMacAutomationPermission | 权限→截图；打开→等待。下一步按等待/启动/捕获拆族，核对兼容入口，不再造启动器 |
| mouse | mouse.md / mouse.d.ts | automation/mouse.go；polyfills/005-geometry.js | click, clickPoint, clickForPID, move, down, up, getPos, wheel | Geometry 点→输入；下一步坐标/按下释放/部分提交；page.mouse 为组合别名 |
| keyboard | input.md / keyboard.d.ts | automation/keyboard.go | type, press, down, up, combination | 聚焦核验→输入；下一步组合键及清理；page.keyboard 为组合别名 |
| touchscreen | input.md / touchscreen.d.ts | automation/touchscreen.go | tap | 定位→tap；下一步平台/单位；page.touchscreen 为组合别名 |
| Recorder | recorder-runtime.md / recorder.d.ts | automation/recorder*.go；polyfills/008-recorder.js | getCapabilities, start, buildActions, generateScript | start→session.stop→buildActions→generateScript；下一步录制与文件操作分别核对授权，不重写工作流 |
| globalShortcut | global-shortcut.md / globalShortcut.d.ts | automation/global_shortcut.go | register, unregister, isRegistered, unregisterAll | 注册→回调→注销；下一步冲突/Execution teardown；macOS/Windows 能力限定 |
| Events | events.md / Events.d.ts | automation/desktop_events.go | on, once, getCapabilities | on→subscription.unsubscribe；下一步轮询事件与订阅生命周期 |
| App | app.md / App.d.ts | automation/app.go、app_name.go、app_backend*.go | launch, get, list, isRunning, waitForLaunch, waitForExit, terminate, restart, getCapabilities | get→group.pids→window；launch→就绪；下一步 App/Window 联合解析，复用现有别名规则 |
| Accessibility | accessibility.md / Accessibility.d.ts | automation/accessibility.go、accessibility_runtime.go、平台 backend | getCapabilities, snapshot, find, read, perform, release | 明确 scope→ref→read/perform→release；下一步 opaque ref 生命周期；可信本地 Experimental，不能视作所有入口默认授权 |
| Notifications | notifications.md / Notifications.d.ts | automation/notifications.go、平台 backend | list, waitFor, dismiss, getCapabilities | list/waitFor→dismiss；下一步可见范围、部分覆盖和清理 |
| window | window.md；libs.md 补充 js_beautify / window.d.ts | automation/window_manager_core.go；window_manager.go（Windows）、window_manager_darwin.go、stub；polyfills/003-window.js；jslibs/beautify1.14.9.js | getCapabilities, getActiveWindow, getWindowByTitle, getFocusWindow, focus, setWindowBounds, setWidth, setHeight, maximize, minimize, restore, restoreByPID, minimizeByPID, maximizeByPID, closeWindow, closeActiveWindow, kill, title, getTitle, content, getContent, list, get, wait, setAlwaysOnTop, unsetTopMost, bringToTop, js_beautify | 本轮深入查询族 3/28；js_beautify 为已文档化托管库入口，不是原生窗口方法；下一步旧读取/适配族 |
| Screen | screen.md / Screen.d.ts | automation/screen.go、screen_capture.go；utils.go 截图别名绑定 | getWidth, getHeight, getDisplays, getPrimaryDisplay, getDisplay, getDisplayCapabilities, getDisplayMode, listDisplayModes, setDisplayMode, getVirtualBounds, pixel, pixels, screenshot, selectRegion, startRecording, getCaptureCapabilities | display→region→截图/录屏→stop；下一步分别核对库存、改模式、捕获；screenshot 复用 page，不新增 Display 对象 |
| System | system.md / System.d.ts | automation/system.go、system_environment.go；registerSystemSession | delay, getPlatformInfo, getEnv, hasEnv, getSessionCapabilities, getSessionState, lock, logout, startScreenSaver, getSystemInfo, getProcessList, killProcess, getNetworkInterfaces, getNetworkConnections, getPowerInfo, shutdown, restart, sleep, getDirectoryContents, getExecutablePath, getWorkingDirectory, getUserInfo, isAdministrator, getSystemMetrics, getFingerprint, toJSON | 读状态/环境→显式系统操作；下一步分开读、会话动作、旧电源动作，不能混淆 delay 与系统 sleep |
| Execution | execution.md / Execution.d.ts | pkg/execution/runner.go | 无公开方法；属性 id, executionId, input, workdir, env, stack, artifactDir, source, ext, scriptHash, scriptPath, scriptDir, activationSource | 元数据→文件/命令/证据；下一步环境快照、生命周期和权限，不虚构 JS stop 方法 |
| Command | command.md / Command.d.ts | automation/command*.go | getCapabilities, run | 能力→run→结果；下一步总期限/输出/子进程清理；可信本地启用，远端入口关闭 |
| path | path.md / path.d.ts | automation/path.go | join, resolve, normalize, dirname, basename, extname, relative, isAbsolute；属性 sep, delimiter | Execution.workdir→路径→File；下一步纯字符串语义，不引入文件 I/O |
| File | file.md / File.d.ts | automation/file.go、file_json.go、file_json_io.go；utils.go FileHandle 映射 | path, cwd, create, createIfNotExists, createWithDirs, exists, ensureDir, read, readBytes, write, append, writeBytes, appendBytes, copy, renameWithoutExtension, rename, move, getExtension, getName, getNameWithoutExtension, remove, removeDir, listDir, isFile, isDir, isEmptyDir, getHumanReadableSize, getSimplifiedPath, join, open, readJSON, writeJSON | 路径→读写；open→handle.close；下一步分基础 I/O、JSON、句柄。readJSON/writeJSON 已存在，不重复新增 |
| SQLite | sqlite.md / sqlite.d.ts | automation/sqlite.go | open；query/exec/batch/close 属返回句柄，不属全局 | open→句柄→close；下一步事务/取消/授权；可信本地条件注入，远端缺席不是漏注入 |
| AppStorage | storage.md / AppStorage.d.ts | automation/storage.go | getItem, setItem, removeItem, clear, getLength, key | 读配置→写配置；下一步命名空间/持久化/类型 |
| clipboard | clipboard.md / clipboard.d.ts | automation/clipboard.go；polyfills/000-global.js 快捷入口 | copy, paste, clear, read, write, getFormats, getCapabilities | 读格式→读写；下一步竞争/重试/数据范围；全局快捷函数独立登记别名 |
| console | global-apis.md / console.d.ts | automation/console.go；utils.go runtime logger 切换 | log, info, warn, error, debug, table, group, groupEnd, time, timeEnd, clear | 日志→Execution 事件/终端；下一步同步行为、脱敏和输出边界 |
| http | http.md / http.d.ts | automation/http.go、http_download.go | request, get, post, download | 请求→响应；下载→文件提交；下一步取消/预算/资源，download 与一般请求分开授权 |
| axios | http.md / axios.d.ts | polyfills/004-axios.js→http.request | request, get, post, put, delete, patch | 配置→http.request→响应；下一步默认值/params/headers/异常透传，不能把名称相近判为独立 backend |
| NativeExtensions | native-extension.md / NativeExtension.d.ts | automation/native_extensions.go；pkg/nativeextension | list, get, diagnostics；绑定 namespace 的方法由安装 manifest 声明 | list/get→namespace.method→证据；下一步冻结发现清单与插件方法表；条件启用、动态方法不冒充固定全集 |
| Geometry | geometry.md / Geometry.d.ts | polyfills/005-geometry.js、007-geometry-layout.js | rect, center, pointOffset, pointPercent, regionOffset, regionPercent, regionByEdges, inset, anchorPoint, contains, intersect | WindowInfo/DisplayInfo→带单位点/区域；下一步坐标空间、父区域和舍入 |
| UI | desktop-ui.md / UI.d.ts | polyfills/006-ui.js；automation/accessibility_menu.go | getCapabilities, findTexts, findText, hasText, tapText, tapTexts, waitText, waitTextGone, findImages, findImage, tapImage, getMenuItems, findMenuItem, tapMenuItem | within→定位→动作→验证；下一步方法专属 options、freshness/失败前缀，不能把共享 options 都当支持 |
| OCR | vision.md / Vision.d.ts | automation/ocr.go | extractText | 图片→文字；下一步与 Vision 的兼容关系，不默认删除 |
| Vision | vision.md / Vision.d.ts | automation/vision.go | runOCR, detectUI, getCapabilities, analyzeLayout, annotateRegions | 图像→识别→标注；下一步 provider/坐标/来源；detectUI 兼容语义单独核对 |
| ImageColor | image-color.md / ImageColor.d.ts | automation/imageColor.go | findPos, findImage, findImages, diff, loadBase64, resize, clip, pixel, findColor, findColorBlocks, hasColor, isGray, getSize, save, findRedChannel, findGreenChannel, findBlueChannel, toRGB, toRGBA, toHSL, toHSLA, isColorSimilar, analyzeLayout | 图片/像素→候选特征；下一步按模板/颜色/图像处理拆族 |
| Sound | sound.md / Sound.d.ts | automation/sound.go；registerSound | playSuccess, playFail, playWarning, playError, playCaptcha, playSound, play, start, playAsync, stop, stopAll, getActive | start→playback.stop/wait；下一步旧阻塞与新句柄共存；playAsync 是 start 别名，不凭名称认定 Promise |
| Audio | audio.md / Audio.d.ts | automation/audio.go、audio_pattern_runtime.go、平台 backend | getVolume, setVolume, isMuted, mute, unmute, toggleMute, getOutputDevices, getInputDevices, getDefaultOutput, getDefaultInput, watchSound, waitForSound, getCapabilities | 控制/设备；watchSound→watcher.stop/wait；下一步平台可用性、捕获释放，既有记录表明默认 pattern capture fail-closed，不能称真实后端已完成 |
| Dialog | dialog.md / dialog.d.ts | automation/dialog.go + Custom UI owner；polyfills/000-dialog.js | alert, confirm, prompt, getCapabilities | 显示→用户结果/取消→清理；下一步 exactly-once 与未 await；总有对象不代表获得 ui 权限 |
| ui | custom-ui.md / custom-ui.d.ts | automation/custom_ui.go | getCapabilities, createWindow, closeAll, on | createWindow→window/control handle→close；下一步 dormant 授权和资源；与大写 UI 无别名关系 |
| FloatingWindow | custom-ui.md / FloatingWindow.d.ts | automation/floating_window.go、floating_window_controls.go | constructor, addButton, addLabel, addSwitch, addCheckbox, addInput, addSelect, addSlider, addSegmentedControl, addProgress, addSeparator, addSpacer, removeButton, removeLabel, removeControl, updateButton, updateLabel, updateControl, getButtonState, getLabelState, getControlState, getState, show, hide, close, setPosition, setPlacement, onButtonClick, onControlChange, onError, setAlwaysOnTop, setDraggable, on, waitUntilClosed, run | 构造→控件/事件→run/close；下一步分控件、事件、生命周期，条件能力不机械归为未实现 |

### 全局函数、构造器与返回句柄

以下每一行均为独立审查单元，全部未审。对返回句柄优先与创建它的对象同轮接续；无自己的 methods 的 opaque ref/数据快照不能漏记其失效边界。

| 单元 | 文档 / 类型 / owner | 方法或属性清单 | 创建→使用→结束 / 下一步 |
| --- | --- | --- | --- |
| setTimeout | global-apis.md / global.d.ts / automation/timer.go | setTimeout(callback, delay?) | 注册→回调/clearTimeout；核对默认和 teardown |
| clearTimeout | 同上 | clearTimeout(id) | 取消一次性任务；核对未知 ID/跨 execution |
| setInterval | 同上 | setInterval(callback, delay?) | 注册→重复回调；核对重入/错误 |
| clearInterval | 同上 | clearInterval(id) | 停止周期任务；核对清理 |
| requestAnimationFrame | global-apis.md / global.d.ts / polyfills/001-timers.js | requestAnimationFrame(callback) | timer 兼容，不是绘制屏障 |
| cancelAnimationFrame | 同上 | cancelAnimationFrame(id) | 对应取消；核对别名 |
| delay | global-apis.md / global.d.ts / timer/System + polyfills/002-sleep.js | delay(ms?) | Promise 等待；核对默认值 |
| sleep | 同上 | sleep(ms) | Promise 兼容等待；不改为系统睡眠 |
| sleepSeconds | 同上 | sleepSeconds(seconds) | 秒→毫秒适配；核对非法数字 |
| notify | notify.md / global.d.ts / automation/notify*.go + polyfills/000-systemBase.js | notify(string或options) | 提交通知，不能代替业务结果验证 |
| copyToClipboard | global-apis.md / global.d.ts / polyfills/000-global.js | copyToClipboard(text) | 转发 clipboard.copy；核对类型/异常 |
| getClipboard | 同上 | getClipboard() | 转发 clipboard.paste；核对隐私 |
| alert | dialog.md / global.d.ts / polyfills/000-dialog.js | alert(message或options) | Dialog.alert 的 Promise 别名 |
| confirm | 同上 | confirm(message或options) | Dialog.confirm 的 Promise 别名 |
| prompt | 同上 | prompt(message或options) | Dialog.prompt 的 Promise 别名 |
| AbortController | global-apis.md / global.d.ts / Runtime AbortController 注入，具体注册 owner 留待 globals 轮次核实 | constructor, abort；signal | 创建→signal→abort；不等同于全局 Execution.stop |
| AbortSignal | global-apis.md / global.d.ts / 上述 controller 返回值 | addEventListener, removeEventListener；aborted, reason | 订阅→取消→去监听；是否有额外 onabort 导出留待核实，不臆造公共 constructor |
| URL | global-apis.md / global.d.ts / polyfills/url.js | constructor, toString, toJSON；href, origin, protocol, username, password, host, hostname, port, pathname, search, searchParams, hash | 解析→修改→串行化；核对轻量兼容范围 |
| URLSearchParams | global-apis.md / global.d.ts / polyfills/url-search-params.js | constructor, append, delete, get, getAll, has, set, toString, entries, keys, values | 构造/URL.searchParams→查询/修改；核对同步与重复键 |
| FileHandle | file.md / File.d.ts / automation/file.go + utils.go jsValueForResult | close, read, readBytes, write, writeBytes, seek, truncate, sync | File.open→读写→close；核对未关闭/异常/teardown |
| SQLite 返回数据库句柄 | sqlite.md / sqlite.d.ts / automation/sqlite.go | query, exec, batch, close | SQLite.open→操作→close；核对事务与取消 |
| ScreenRecording | screen.md / Screen.d.ts / automation/screen_capture*.go | stop；id, state, output, fps, target, startedAt | startRecording→stop/finalize；核对重复 stop 与失败产物 |
| SoundPlayback | sound.md / Sound.d.ts / automation/sound.go | status, isPlaying, pause, resume, stop, wait；id, path, startedAt | start/playAsync→控制→wait；核对资源释放 |
| AudioSoundWatcher | audio.md / Audio.d.ts / automation/audio_pattern_runtime.go | status, stop, wait；id, backend, startedAt, sourceScope, sourceVerified | watchSound→事件→stop/wait；核对停止确认与 callback Promise |
| DesktopEventSubscription | events.md / Events.d.ts / automation/desktop_events.go | unsubscribe；id, event, backend | Events.on→unsubscribe；核对幂等和 teardown |
| RecorderSession | recorder-runtime.md / recorder.d.ts / automation/recorder*.go + 008-recorder.js | status, pause, resume, excludeControlClick, stop | Recorder.start→会话→stop；核对落盘和排除边界 |
| ClawdeskUIWindowHandle | custom-ui.md / custom-ui.d.ts / automation/custom_ui.go | controls, show, hide, close, getState, setBounds, setPosition, setPlacement, setSize, setAlwaysOnTop, setDraggable, waitUntilClosed, control, on；id | ui.createWindow→控制/事件→close；核对 native owner |
| ClawdeskUIControlHandle | custom-ui.md / custom-ui.d.ts / automation/custom_ui.go | getState, update, on；id | window.control→状态/事件；核对父窗口关闭后失效 |
| ClawdeskUIUnsubscribe | custom-ui.md / custom-ui.d.ts / Custom UI owner | 返回的可调用函数 () => void | on→调用解除订阅；核对幂等 |
| Accessibility element ref | accessibility.md / Accessibility.d.ts / AccessibilityRuntime | 无自行控制资源的方法；交给 Accessibility.read/perform/release | execution-owned opaque ref；不能序列化重建权限；字段全集在该对象轮次补核 |
| NativeExtension namespace | native-extension.md / NativeExtension.d.ts / automation/native_extensions.go | descriptor.methods 指定的绑定调用函数；get 的返回对象与 namespace 属性入口 | Host manifest→冻结绑定→调用；按安装版本补全方法，不建立第二套发现器 |
| NativeExtension（单数） | native-extension.md / NativeExtension.d.ts / automation/native_extension.go | call | 已文档化但仅 unsafe 本地诊断开关条件注入；不是默认公开快捷方式，也不当成纯内部对象遗漏 |
| WindowInfo / DisplayInfo / UI text-image targets / Geometry 点区域 / AppGroup | window、screen、desktop-ui、geometry、app.md / 对应类型 | 数据快照，无自身方法；WindowInfo 有 id 但不是自动更新的资源句柄 | 交给 UI/Geometry/Accessibility；要保存身份、来源与坐标空间；不能添加 .close/.refresh 等虚构方法 |

### 已文档化库、兼容面和非 Runtime 范围

| 分类 | 入口/来源 | 清单与当前结论 | 下一步 |
| --- | --- | --- | --- |
| 文档化第三方库 | queryString / jslibs/query-string.min.js；docs/api/libs.md | parse, stringify 为已文档化示例；其余导出尚未展开，不能据此声称只有两个方法；types 无一方声明 | INV-01：按锁定 vendored 文件补导出全集 |
| 文档化第三方库 | _ / jslibs/lodash.min.js；libs.md | map, groupBy, uniq, debounce, sortBy 是示例/常用项，不是完整方法表 | INV-01：静态及链式实例分别登记，不把全部 JS 标准库纳入 Runtime 自研 API |
| 文档化第三方库 | moment / jslibs/moment.min.js；libs.md | 可调用构造入口；实例 format/add/startOf 为文档调用，全部方法未展开 | INV-01：补锁定版本与实例导出 |
| 文档化第三方库 | cheerio / jslibs/cheerio.js；libs.md | load→可调用选择器→selection.text/attr；其余方法未展开 | INV-01：补静态/选择器/节点集合边界 |
| 托管兼容库 | window.js_beautify / jslibs/beautify1.14.9.js；libs.md、window.d.ts | 一项可调用入口；不误判为“window 未文档化方法”，不为它新造 Window backend | 随 window 完成导出/类型检查 |
| 语言基线 | Promise、Array、Object 等；docs/api/runtime.md、polyfills/001-promise.js | 标准语言及兼容支持单独由语言基线门禁维护，不把每个 ECMAScript 原型当一方 SDK 对象 | 保留语言兼容依赖；本轮不声称完整标准实现 |
| 私有/兼容残留 | ____Inject 对象、browser/context/Page 的旧浏览器形状、require/module/exports | docs/api/runtime.md / runtime-api.ai.json 已明确非维护用户浏览器 API；不纳入公开审查分母，但记录隔离边界 | 不建议扩展或复活；若类型/文档重新公开则重新登记 |
| 非 Runtime transport | HTTP server、AI CLI、MCP、Scheduler | 文档入口存在，但不是 JS Scheduler/MCP 全局；其权限与执行入口是各对象审核的依赖 | 接续到各自服务台账，不在本轮伪造完整路由审查 |
| 尚未实现能力 | Screen frame stream、Audio 默认真实 pattern capture 等 | capability/历史记录明确不支持或 fail-closed，不因方法形状存在就认定 backend 可用 | 在各对象轮次核实是否已有新实现；不直接新增重复 API |

INV-01 的验收：逐一确认上述第三方入口实际挂载位置、vendored 版本/文件 SHA、完整 exports/prototype、文档/类型有无；枚举 examples 和 workflows 中实际使用点。完成前只能称“已登记入口与缺口”，不能称“全部公开方法清单穷尽”。

## window 查询族：本轮方案结论

window 帮助用户找到当前操作的外部窗口并取得身份/几何快照，再交给界面识别或已有窗口操作。它不是应用启动器，也不是业务就绪判定器。

常用链路：一是 list 条件查看候选→缩小条件→get 唯一快照；二是明确授权的 App.launch→window.wait→下游界面定位（本轮没有执行）；三是 Recorder 生成代码用 get 解析本次窗口→必要的业务回退/活动窗口核验→输入。

保留：list 同步；get/wait 为 Promise；唯一性先于几何有效性；精确字段匹配、身份字段互斥、身份与 title 为 AND；App 的别名与多 PID 分组复用；查询无启动/聚焦/恢复；wait 只重试成功空观察；Recorder 标题回退留在 Recorder。

推荐修改：WQ-01、WQ-02 的 Windows 原生枚举回调生命周期和错误传递；WQ-03 的机器/测试登记；WQ-04 的 timeout=0 文案。没有推荐新的公开 API。WQ-05 的 macOS 降级/严格唯一性政策暂缓，不能冒充已确认实现错误或悄悄修改旧 list。WQ-06 仅作为下一族接续线索。

### 完整 window 方法状态表

D=docs/api/window.md；T=types/window.d.ts；J=polyfills/003-window.js；N=automation/window_manager_core.go 与平台 backend；M=tests/runtime-api/manifest.js；I=docs/api/runtime-api.ai.json。表内未审意味着未完成 A—F 全套检查，不以“没发现”替代审查。

| 方法 | 检查结论/推荐处理 | 证据入口 | 审查/验证状态 |
| --- | --- | --- | --- |
| getCapabilities | 仅作为查询平台依赖读取；Partial 明示影响 WQ-05；矩阵本身未全审 | N windowCapabilities | 未审；未运行 |
| getActiveWindow | 仅核对 Recorder 下游和 async 适配；fallback 全语义留待下一族 | J 1—32；N | 未审；未运行 |
| getWindowByTitle | 旧兼容标题查找不可机械替换精确 get；其余留待下一族 | J 1—32；N；darwin findWindowByTitle | 未审；未运行 |
| getFocusWindow | 已见 D Promise 与 T/J 同步可空的冲突线索；不改实现迎合文档 | D；T；J 1—32 | 未审（已登记线索 WQ-06）；未运行 |
| focus | 参数/副作用/结果验证待审，不因存在 get 就宣称支持 WindowTarget | D/T/N | 未审；未运行 |
| setWindowBounds | 几何/单位/旧标题选择/部分提交待审 | D/T/N | 未审；未运行 |
| setWidth | 同上，单边调整与重读策略待审 | D/T/N | 未审；未运行 |
| setHeight | 同上 | D/T/N | 未审；未运行 |
| maximize | 保留原入口，平台差异待审 | D/T/N | 未审；未运行 |
| minimize | 平台与恢复状态待审 | D/T/N | 未审；未运行 |
| restore | 不预判能否恢复历史 bounds | D/T/N | 未审；未运行 |
| restoreByPID | 进程多窗口/部分提交待审 | D/T/N | 未审；未运行 |
| minimizeByPID | 同上 | D/T/N | 未审；未运行 |
| maximizeByPID | 同上 | D/T/N | 未审；未运行 |
| closeWindow | 唯一选择、不可逆操作与失效待审 | D/T/N | 未审；未运行 |
| closeActiveWindow | 活动窗口竞争及不可逆操作待审 | D/T/N | 未审；未运行 |
| kill | 进程级副作用/权限待审，不与 close 合并 | D/T/N | 未审；未运行 |
| title | 同步当前窗口读取与缺失语义待审 | D/T/N | 未审；未运行 |
| getTitle | D/T 返回签名衔接线索留下一族 | D/T/N | 未审；未运行 |
| content | 真实全文/兼容返回平台差异待审 | D/T/N | 未审；未运行 |
| getContent | 同上及 D/T 签名线索 | D/T/N | 未审；未运行 |
| list | 保持同步 0..N 快照和精确筛选；优先修 WQ-01/02，登记 WQ-03/05 | J 34—192；N List；Windows 1160—1268；D list；T；M/I | 已审（静态）；实现已在基线；推荐修复未实施；Runtime/Windows/macOS 均未运行 |
| get | 保持 0/多/身份/几何错误分离；复用 App；不添加回退或操作；承接 list 原生问题 | J 90—135；D get；T；window-target.js | 已审（静态）；实现已在基线；原生正确性待验证 |
| wait | 保持总期限、0 单次观察、失败原因过滤和监听/计时清理；补 WQ-03/04；不是硬取消 native | J 136—192；D wait；T；timer.go；window-target.js | 已审（静态）；实现已在基线；真实 timer/Execution teardown 未验证 |
| setAlwaysOnTop | 平台 capability 和同步契约待审 | D/T/N | 未审；未运行 |
| unsetTopMost | 与上项兼容关系待审，不凭名称删别名 | D/T/N | 未审；未运行 |
| bringToTop | title/pid 优先级与 foreground 语义待审 | D/T/N | 未审；未运行 |
| js_beautify | 位于 libs.md 的第三方函数，单独保留来源，不属于 native 窗口控制 | libs.md；window.d.ts；jslibs/beautify1.14.9.js | 未审；未运行 |

### A—F 检查记录：list/get/wait

| 维度 | 结论 | 处理/证据边界 |
| --- | --- | --- |
| A 易用性/职责 | list→重复 filter→唯一性/几何校验已被 get 承担；App 别名及 PID 分组由 App.get 复用；未发现需要另一套公共解析器的依据 | 保持。Recorder 在成功无标题匹配时回退属于应用策略 |
| B 参数 | list 允许省略 target；get/wait 不允许 undefined/null/空对象/裸字符串；非空文本保留精确值；最多一个 id/pid/app/exePath/exeName，另可有 title；未知字段、Symbol key、非法 PID/数字被拒绝；wait options 仅 timeout/polling/signal | J target/app/选项校验，T union；现有 fixture 覆盖多项但本轮未运行。不据此宣称恶意 getter/全部 JS 对象变体已穷尽 |
| C 返回/下游 | list 同步数组；get/wait Promise<WindowInfo>；0 为 NOT_FOUND、多项 AMBIGUOUS_TARGET，唯一行 unresolved 为 STALE_TARGET，无效 bounds 为 VERIFICATION_FAILED；负 x/y 合法 | 返回的是快照不是句柄；不能当可持久授权、不能自动跟随移动；下游保留 id 和 logical geometry。原生枚举范围见 WQ-05 |
| D 等待/错误/副作用 | wait timeout 默认10000、整数0..300000，polling默认200、整数1..10000；0单次观察；仅无 cause 的查询 NOT_FOUND 可重试，backend/App 错误保留 cause；查询本身不 launch/focus/input | 保持现有策略，不复用会吞 predicate 错误的通用等待。WQ-02 修复产生错误的 native 层；WQ-04 改文案 |
| E 生命周期 | 正常成功/失败/显式取消都清除两类计时器和监听；native Timer 是 runtime-owner 管理，有 Cleanup/Count；同步 native/JXA 不受 JS timer 硬抢占 | WQ-01 发现更低层 Windows callback 保留；真实 Execution 终止、未 await、长 native 调用与多运行隔离仍待验证，不能用 mock timer 通过代替 |
| E 平台/权限/隐私 | window 无独立授权开关；app selector 额外依赖 App backend；macOS Partial、Windows Win32、Linux/other 不保证支持；UI/Accessibility/Recorder 的授权不会因有 WindowInfo 自动继承 | 不从本轮推出 HTTP/MCP/Scheduler 全链授权正确。查询自有错误不回显 title；native cause/logs 仍可能带 backend 信息，未完成全平台脱敏审查，登记后续专项 |
| F 五方一致性 | 文档/类型/新 polyfill 对主要查询签名一致；M/I 未补 get/wait；旧全量测试只加载登记文件；新文件有 fake backend/time/signal 与少量实际 surface 检查；native Windows 存在底层缺口 | WQ-01/02/03；所有“已审”仅静态，不是五方运行验证通过 |

## 重点问题与最小改动规格

### WQ-01｜Windows 枚举每次创建不可释放的 Go callback

- 状态：**已确认的静态生命周期缺陷；目标系统触发次数/崩溃未验证**。高优先级，关联 window.list/get/wait；其他使用 NewCallback 的对象只关联本记录，未逐一宣称同样有问题。
- 用户影响：长时间 wait 或同一宿主中的多次查询会不断注册新回调；JS 侧把 timer 清零不等于释放了这一原生层资源。不能以增加 polling 间隔或重启 Execution 当正式修复。
- 来源：automation/window_manager.go:1160—1185，windowsWindowManager.List 内闭包捕获 allWindows，再 syscall.NewCallback(enumWindows)；polyfills/003-window.js:136—192 反复观察。外部一手依据：Go 官方 syscall.NewCallback 文档（go.dev/src/syscall/syscall_windows.go，NewCallback 注释）明确回调数量有限、分配不释放；官方 runtime/syscall_windows.go 的 winCallbackKey/compileCallback 以函数值登记和保留回调。go.mod:1—5 声明 go1.25.13；本轮没有拿到该精确 toolchain 的运行证据，也不声称精确第1024次会失败。
- 当前最小调用（示例，未执行）：`await window.wait({ exeName: 'Editor.exe' }, { timeout: 300000, polling: 200 });`。问题不要求业务脚本手工创建订阅，发生于内部枚举。
- 推荐调用：**完全相同**，不增加 public API。
- 推荐实施：Windows native owner 中使用进程生命周期内的固定非捕获 callback；每次枚举使用唯一请求 token 经 lParam 查找本次状态；登记、成功/失败清理在同一 owner，defer 删除请求状态。不要把捕获窗口数组的 callback 缓存在每个新 WindowManager 上，宿主反复创建 manager 仍会增长。不要长持 registry 锁调用 EnumWindows，避免 callback 重入取锁；并发调用状态隔离。可提炼一个私有枚举 helper，不创建公共 WindowSession/第二套 Runtime。
- 兼容：JS 签名、同步性、筛选顺序、空结果和错误合同不变；进程级固定 callback 自身不是每个 Execution 要释放的资源，临时请求状态必须归零。
- 验收：私有 adapter seam 统计 callback 注册次数，不随成功/失败/多 manager 重复查询增长；请求状态始终释放；两次并发枚举不得混入对方窗口。正式 JS 定向测试在授权的独立 Windows 测试进程中执行至少4096次查询并完成取消/结束；该数是压力案例，不是已知崩溃阈值。私有 seam 不能代替 Windows Runtime 证据；不得用生产公开 diagnostic 方法为测试暴露内部 callback 表。

### WQ-02｜Windows 忽略 EnumWindows 失败返回

- 状态：**已确认实现缺陷（静态）**，未做故障注入/目标系统复现。
- 用户影响：底层枚举失败没有被上传，空或部分观察可能被解释为没找到/唯一；get/wait 的错误过滤再严格也无法还原已被吞掉的信息。
- 来源：automation/window_manager.go:1160—1268，List 的 `procEnumWindows.Call(cb, 0)` 丢弃返回值，末尾返回 windowsList,nil；automation/window_manager_core.go 的 List/wrapWindowError；J query/unique。Microsoft Learn 的 EnumWindows（winuser.h）Return value：成功非零、失败零，callback主动返回零也会中止；当前该 List callback 始终返回1，因此没有有意中止的分支。
- 当前调用：`const rows = window.list({ exeName: 'Editor.exe' });`，或 `await window.wait({ exeName: 'Editor.exe' }, { timeout: 1000 });`。在故障路径上目前不能可靠区别无结果与枚举失败。
- 推荐调用：不变；同步 list 在 backend 错误时抛结构化错误，get/wait reject，且 wait 不重试该错误。
- 推荐实施：native helper 捕获 EnumWindows 返回值，仅成功时继续组装结果；失败返回 typed WindowError，以 BACKEND_FAILED 为明确通用分类，只有有依据的权限错误才映射 PERMISSION_DENIED。结果为零但系统错误码缺失时也必须显式失败，不能因错误值为空返回成功。部分收集结果不能作为完整成功结果。成功且0个窗口应稳定映射为 JS []，不预判当前 nil slice 的 Goja 行为，补真实 bridge 测试确认。
- owner/兼容：真实平台失败归 Windows native，不在 JS 再 catch 成 []。签名不变；原先把故障当成功的调用将显式失败，是可见的错误行为修复，要在交付记录说明。
- 验收：正常0/1/2候选；EnumWindows在任何回调前失败及收集部分后失败；非零成功时不把陈旧系统错误当失败；list 同步 throw；get/wait operation 分别正确且保留 cause；backend NOT_FOUND 也不重试；Recorder 不执行标题放宽，不发生点击/输入。JS 公共合同与 native 私有返回码 seam 分层记录。

### WQ-03｜新查询未进入正式索引与测试装载链

- 状态：**已确认登记/索引不一致**，不是“没写测试”。
- 来源：tests/runtime-api/manifest.js 的 window.methods/source 与 RuntimeAPITestFiles.unit；docs/api/runtime-api.ai.json 的 window.keyMethods；scripts/test_runtime_apis.js:1—9→gates/catalog-runner.js→gates/suites/core.js:8—20→unit.js:1—8；新 tests/runtime-api/window-target.js:1—末尾独立运行 framework。
- 用户影响：机器发现不含 get/wait，新查询行为测试并未通过该正式 unit 装载链自动登记；单看旧 catalog 完成状态会漏掉本轮能力。manifest 的单一 window_manager.go owner 还是 Windows 文件，不足以标注 core/platform/polyfill 三层。
- 当前调用：`await window.get({ pid: 123 });` 已存在，但 catalog 不完整；当前专项命令为 `./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script`，本轮未运行。
- 推荐调用：业务调用不变；让同一组行为用例进入现有正式注册链，不复制一份第二测试实现。
- 最小实施：把 query 用例的注册体置于新的 tests/runtime-api/unit/window-target.test.js，或合入现有 window.test.js；原专项入口仅装载 framework/manifest/共享注册体并 run。manifest 补 window.get/window.wait 与 unit 文件、正确 owner。**不能直接把当前含末尾 await RuntimeAPITest.run 的独立脚本塞进 RuntimeAPITestFiles.unit**，避免嵌套 runner。机器索引补 get/wait、list同步、精确 target/错误/等待边界，保留 Experimental/平台限制，不把 keyMethods 装饰成已真实验证。
- 兼容：不变更生产契约；保留已文档化专项入口或同步更新交付记录，不新增平行测试体系。
- 附带测试分层：tests/runtime-api/unit/window.test.js:21—29 当前真实调用 window.list；把这一真实观察移到现有 live/window.test.js 的受控范围，unit 留 surface/无副作用参数和 mock 组合。读取桌面虽非输入，仍不能当完全离线 unit。
- 验收：正式 contract/coverage 能识别 get/wait；同一测试定义只注册/执行一次；故意破坏 NOT_FOUND/cause、AND、歧义或清理逻辑时正式定向 gate 失败；unit 不读真实窗口；target live 仍需独立许可。检查模式不执行任何上述命令。

### WQ-04｜timeout=0 的“否则 TIMEOUT”文案过宽

- 状态：**文档表述歧义**，不改实现。
- 来源：docs/api/window.md 的 window.wait 行为段（约720—775）；J:158—192；window-target.js 的终止错误和0超时用例。
- 用户影响：读者可能以为 timeout=0 会把歧义、参数、权限、backend 错误全部转为 TIMEOUT，与同段“这些错误立即拒绝”冲突。
- 当前/推荐调用均为：`await window.wait({ title: 'Document' }, { timeout: 0 });`。
- 推荐文本：0 表示只进行一次立即观察；唯一有效匹配则成功；成功观察但无匹配则 TIMEOUT；参数、预取消、歧义、无效身份/几何及 backend/App 错误维持各自错误，不统一改 TIMEOUT。单次同步 native 耗时不等于0毫秒。
- 归属/兼容：API Reference 和机器摘要；类型已有范围注释可补同义说明，无签名改变。
- 验收：timeout0的0/1/2行、无效身份/几何、backend失败、pre-aborted分别断言；pre-aborted无枚举，无残余监听/计时器。

### WQ-05｜macOS Partial 枚举与严格唯一性：待决策，不强行判错

- 状态：**设计候选/合同边界待决策**，不是已经确认应删除的兼容行为。
- 来源：automation/window_manager_darwin.go:730—880 的 fallbackMacWindowList/fallbackMacWindowListWithResolver，完整列表失败后可返回一个活动窗口；automation/window_manager_core.go:约560—590 的 window.list capability 明确写 may degrade to the active window；docs/api/window.md list 说明 Partial 不证明不可枚举范围无其他窗口。
- 用户影响：get 只证明本次 backend 可枚举结果中的唯一性；降级到活动窗口时，其他窗口的存在不能排除。Recorder/UI 等安全依赖不能把它解释为全桌面唯一或完整应用窗口全集。
- 当前调用：`const win = await window.get({ exeName: 'Editor' });`。在合法 Partial 模式，它仍可能得到活动窗口快照。
- 本轮推荐调用：不新增 API、不改变旧 list；调用者继续明确目标/身份和权限边界。`await window.get({ id: knownSnapshot.id })` 可缩小“所指对象”，但同样不能凭空获得更完整 backend 覆盖，也不是修复枚举完整性的办法。
- 先做的最小方案：在 get/wait 和机器摘要明确“唯一”属于当前可枚举范围，链接 list/capability限制；这只是澄清已有边界，不把 runtime故障修文档为成功。
- 进一步候选（未实施）：若业务需要对 degraded枚举 fail-closed，native owner 通过私有 observation metadata 传递 complete/degraded/reason，让 get/wait 按已决策的严格范围拒绝不充分观察；保留无参 list 的既有 best-effort兼容。禁止在 polyfill 解析日志猜降级、禁止仅因行数为1就认定降级、禁止新建公共 WindowRuntime。是否引入此内部 seam 需先明确严格性合同，不与本轮确认修复捆绑。
- 验收：完整枚举、成功替代CG枚举、JXA失败且CG列表失败但active成功、权限不足、跨Space、同进程两窗口都应有独立样本；每项写清当前合同/提案合同和预期，不能用模拟active成功宣称真实全列表正确。

### WQ-06｜下一族线索：旧读取/动作的同步契约和快照衔接

仅登记，不在本轮扩成第二次全对象审查。types/window.d.ts、polyfills/003-window.js 1—32、automation/utils.go 的同步反射 wrapper 表明 getFocusWindow 是同步可空，而 docs/api/window.md 该项声明 Promise且无窗口reject；getTitle/getContent及多项动作也有文档Promise与同步类型的线索。下一轮优先核对 getCapabilities/getActiveWindow/getWindowByTitle/getFocusWindow/title/getTitle/content/getContent，逐一检查平台空值、标题规范化和兼容返回。不能为对齐错误文档把所有 native方法强制异步。

## 真实调用者与复用决策

| 调用者 | 观察到的链路 | 本轮结论 |
| --- | --- | --- |
| automation/recorder_actions.go:2196—2217、后续click/text生成段 | executable-path/name→get(identity+title)；仅无cause的NOT_FOUND→get(identity)；text另核对当前活动窗口；点击用新bounds投影已录offset | 已复用公共唯一性；保留Recorder策略，不重新封装公共别名表，不把录制时PID/handle作为跨execution身份 |
| tests/runtime-api/window-target.js | 读取真实polyfill和生成器文本；fake App/rows/Date/timers/signal；实际Runtime只做少量typeof检查 | 是组合测试资产，不是原生backends/teardown证明；复用用例注册体，不能丢弃重写 |
| tests/runtime-api/unit/window.test.js | 实际window.list→校验第一行；其他capability/参数合同 | 已登记真实观察混入unit，见WQ-03；本轮未执行 |
| docs/api/window.md 目标示例 | App.launch→window.wait→WindowInfo；get可用App bundleId/名称 | 是文档示例，不是已运行案例；名称兼容复用App，不能保证所有平台都有相同别名 |
| workflows/agent-to-recipe/cases/calculator.md:1—100 | 先确认正确窗口和应用状态→UI按钮→读取真实中间值→再次输入和验证；明确设计记录未运行 | window.get/wait只解决窗口目标，不能把窗口出现当计算模式/显示值就绪；不修改工作流，不将110/660当观察结果 |
| examples全量调用点 | 旧台账记录过bringToTopByPID等历史清理，但本轮尚未逐个核对所有examples | 不把历史记录当最新使用证明；INV-01保留待扫描项，不声称已消除所有重复筛选/轮询 |

## 最小执行清单（均未实施，需明确授权）

| 顺序 | 文件 | 改什么 | 怎样验收 |
| --- | --- | --- | --- |
| 1 | automation/window_manager.go；必要的Windows私有枚举helper | WQ-01 固定callback+请求状态生命周期；WQ-02检查EnumWindows返回并抛typed error | 私有seam覆盖固定注册数、失败/并发/状态释放；授权Windows正式JS压力和故障合同，计数与主机版本分别保存 |
| 2 | tests/runtime-api/unit/window-target.test.js（拟新增共享注册体）；window-target.js；manifest.js | WQ-03同一用例装载正式链、补方法与owner，不嵌套run | 正式定向gate发现并执行相同案例；contract/coverage无遗漏；无真实桌面读取的unit与live分离 |
| 3 | tests/runtime-api/unit/window.test.js；live/window.test.js | 将真实窗口观察归回受控live；保留离线合同/参数检查 | 未授权unit不调用原生list；授权live覆盖0/多/移动/消失等适用样本 |
| 4 | docs/api/runtime-api.ai.json | get/wait发现、sync list、target错误和总期限、能力范围；不要改其他对象 | 与文档/类型/实现/manifest人工定向对照；不以索引存在证明已验证 |
| 5 | docs/api/window.md；types/window.d.ts仅必要注释 | WQ-04澄清timeout0；WQ-05现有Partial唯一范围说明；不修改签名，不提前重写旧动作族 | 参数/失败案例对应一致；每方法独立H2、标题无反引号 |
| 6 | docs/maintenance/docs-user-api-editme-toc-maintenance.md；必要的来源规则说明 | X-RULE-01删除冲突指导；X-RULE-02区分事实/应然 | 不再存在允许合并方法标题的旧指令；契约冲突不被自动改文档吞掉 |
| 7 | 本台账；docs/quality/window-target-resolution.md | 实施后记录实际差异、授权执行的命令/run id/二进制hash/平台及未验证项 | 复核实际分支提交；只有带证据的行为升级为已验证，不能整体刷“闭合” |

不得在本检查轮运行表内命令、压力测试或代码生成。总入口可能包含构建/真实平台操作，后续也必须先核对选定mode实际路由再授权执行，不把“测试”一词当无限授权。

### 必需验收案例集合

WQ-01/02原生案例之外，继续复用现有target专项：精确AND、App多PID、未知/空参数、NOT_FOUND与AMBIGUOUS分离、未resolved身份、无效bounds及负坐标、backend NOT_FOUND带cause不重试、冻结原输入、timeout0、跨多poll总期限、预取消与等待中取消、监听/定时归零、Recorder只对成功空标题查询回退。

补充真实Runtime生命周期案例：真实AbortController与managed timers；未await的wait后Execution正常结束/异常/取消；同一宿主下一次Execution不接到旧回调；同步native调用超过预算后不得返回过期成功；native不能硬抢占的事实单独记录。模拟、Go私有seam、实际Runtime和目标平台四类证据分别保存，不合并成一个“通过”。

## 版本与失效规则

每个读取文件以基线commit加路径锁定版本；以下关键blob便于定向复核，不能把台账提交SHA当实现已变更。

| 文件 | 基线blob SHA |
| --- | --- |
| AGENTS.md | 3598051c9b4ab4f5853885a157b61087b28dbd43 |
| docs/api/.rules.md | 4f394ddd097cd1d43a611ae770e3245c4070ae6d |
| docs/api/README.md | dc514e88d85714e09a86e68b73f62fb0468e56f9 |
| docs/api/index.md | b9d7b0faf53f53f1887d22f8b3e1ce05dd25496b |
| docs/maintenance/docs-user-api-editme-toc-maintenance.md | 3aa54f0ef5292132dfb5d127f38af3ca6956ed17 |
| polyfills/003-window.js | 4e687afd45851df2c5c0f5066a3744b052e85121 |
| automation/window_manager_core.go | 0753c66267661ab27917a09843bec74a9bf0a935 |
| automation/window_manager.go | ab4d8798fe3e7e0a1df2d6aa217bb996e9ad64be |
| automation/window_manager_darwin.go | 4705966161b5373d62649a8eaa5b926a0266e882 |
| automation/utils.go | 43786c62183d23568a38fb2282c20a6a1b76404d |
| automation/timer.go | e252b2d4c599286a18c9196077c57132fc126115 |
| automation/recorder_actions.go | bca8d19ad7e2630d3fa78ba674e9dc7d5a1fd79f |
| types/window.d.ts | 88810ea61cf62b68f7d9244a93b1f95dff2a7b28 |
| types/App.d.ts | 4778bd87a782c3064eafed78e334bd0cfa7ea280 |
| docs/api/window.md | e5da0b43ec6a8b623b63e5aafe59056bef209621 |
| docs/api/runtime-api.ai.json | 71aa9ab8ec3aa0c0490a8dc4d8acab1c65c343ec |
| tests/runtime-api/manifest.js | 2b492982407dc046bda74d6f90ead90ef81e2e54 |
| tests/runtime-api/window-target.js | 14a13673132b92af0b5b133ac56047cb263b3d96 |
| tests/runtime-api/unit/window.test.js | 2afcbf82f59022398f85643d6267568ea9b3cdf1 |
| scripts/test_runtime_apis.js | ea1862edead3f824143c760e36c88a4a6fefaefa |
| tests/runtime-api/gates/catalog-runner.js | 13e43617267dce430b2e1289bc9ae191e75bb7c2 |
| tests/runtime-api/gates/registry.js | 5c7419c9fda0108cb822885fd6fabd2b021e8cc5 |
| tests/runtime-api/gates/suites/core.js | 0ae878b918211f2b21632c7e72d7820779ad7421 |
| tests/runtime-api/unit.js | 6af7f8b890854a161c7ea54be8a3b2fab20acd91 |
| docs/quality/window-target-resolution.md | 54f21ffbb96bed78f9181dcd3ecd6b9eec8bdaee |
| workflows/agent-to-recipe/cases/calculator.md | 0e9b652bd64db0f2e3e107edd95f5d9b2c3d1070 |
| go.mod | 926621e4e0892e3043f041ac3a25f8f6bc453d63 |

后续变化：J或window native变更→查询族及依赖调用者结论待复核；App解析变化→仅app selector结论待复核；Timer/Execution变化→等待清理与取消结论待复核；manifest/index变化→仅登记一致性复核。不要因为无关File/Sound改动重跑所有window审查。

本轮接续点：window/list/get/wait静态已审；WQ-01/02/03/04待实施，WQ-05待决策，WQ-06待深入；其余25项window成员未审；全部对象级Runtime/平台验证未在本轮运行。下一轮window读取/适配族，之后才转App。INV-01的第三方导出和examples穷尽登记仍未完成，不得丢失。

## 历史记录：原有实现与公开面闭合

以下原表及修复记录保留其历史含义。本次没有重新验证这些对象；尤其旧Window“操作均one-shot/闭合”不覆盖新增wait及WQ-01发现的native资源问题。

本表审查的是当前源码链路，不以旧二进制或历史日志作结论。公共 Runtime surface 的机器源是 `tests/runtime-api/manifest.js`，运行时实现源是 `automation/utils.go` 及各显式 `registerXxx`。

| 领域 | native/服务 owner | Go→Goja→JS 暴露 | docs / types | JS 公共测试 | 创建与结束路径 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Sound | `automation/sound.go` | allowlist 提供同步旧方法；`registerSound` 显式提供 `start/playAsync/stop/stopAll/getActive` 和 playback handle | `docs/api/sound.md` / `types/Sound.d.ts` | `unit/sound.test.js` | playback `pause/resume/stop/wait`；execution `Close/Wait/ResourceCounts` | 闭合 |
| Audio | `automation/audio.go`、`audio_pattern_runtime.go` + platform backends | `registerAudio` 显式注册控制方法，并把 `watchSound/waitForSound` 接入 execution-owned matcher owner | `docs/api/audio.md` / `types/Audio.d.ts` | `unit/audio.test.js` + `seams/audio-pattern-positive.js`、`audio-pattern-market.js`、`audio-pattern-cleanup-failure.js`、`audio-pattern-teardown.js` | 控制为同步；pattern watcher 的 capture、matcher、Promise、Close/Wait/ResourceCounts 进入 lifecycle；market seam 验证 3s/12s 两次 order cue、payment/confuser 干扰和 cleanup；默认 capture backend fail closed | 契约与 lifecycle 闭合；真实平台 capture backend 尚未实现 |
| Page | `automation/page.go` | allowlist → `page____Inject` → `polyfills/000-page.js` facade | `docs/api/page.md` / `types/page.d.ts` | `unit/page.test.js` | screenshot/open 为 one-shot；wait/HTTP callback 由 EventLoop/cancel drain | 闭合 |
| Vision / ImageColor | `automation/vision*.go`、`imageColor.go` | allowlist lowerCamelCase | `docs/api/vision.md`、`image-color.md` / 对应 types | `unit/vision*.test.js`、`image-color.test.js` | one-shot provider/图像调用；provider deadline 在调用内结束 | 闭合 |
| Window | `automation/window_manager*.go` | allowlist + `polyfills/003-window.js` 结果规范化 | `docs/api/window.md` / `types/window.d.ts` | `unit/window.test.js` + live composition | 操作均 one-shot；没有“打开 session”需要 stop | 闭合 |
| Mouse / Keyboard | `automation/mouse.go`、`keyboard.go` | allowlist，经 Page 组合为全局和嵌套输入对象 | `docs/api/mouse.md`、`input.md` / 对应 types | `unit/mouse.test.js`、`keyboard.test.js` + live | `down` 与 `up` 对称；click/wheel/type 为 one-shot | 闭合 |
| Dialog | `automation/dialog.go` + Custom UI owner | `registerDialog` Promise bridge；`000-dialog.js` 仅提供全局别名 | `docs/api/dialog.md` / `types/dialog.d.ts` | `unit/dialog.test.js`；原生 AX/截图由 dialog gate | resolve/reject、cancel、窗口 close、worker Wait | 闭合 |
| Notify / Notifications | `automation/notify*.go`、`notifications*.go` | `notify____Inject` 先于 `000-systemBase.js`；Notifications 由 `registerNotifications` | `docs/api/notify.md`、`notifications.md` / `global.d.ts`、`Notifications.d.ts` | `unit/notify.test.js`、`notifications.test.js` | notify 是 one-shot；Notifications 有 dismiss；wait worker 纳入 Close/Wait/ResourceCounts | 已修复 teardown 计数闭环 |
| Screen capture | `automation/screen_capture*.go` | 显式合入 `Screen` | `docs/api/screen.md` / `types/Screen.d.ts` | `unit/screen.test.js` + live | `startRecording` 返回带 `stop()` 的 session；execution close 强制 finalize | 闭合 |
| Scheduler | `pkg/scheduler` + HTTP/CLI owner | 不是 JavaScript Runtime global；通过 scheduler service/HTTP 与 inline Runtime executor | `docs/api/scheduler*.md` | `pkg/scheduler/*_test.go`；inline script 为 fixture | `Service.Start/Close`、`Store.Close` | 闭合；不伪装成 Runtime global |
| Legacy Browser / Context | `automation/browser.go` | raw handles + compatibility polyfill | `docs/api/runtime.md` 仅记录非公开边界；无用户类型 | 无公共 JS contract；Go compatibility regression 保留 | 内存 owner/close 状态 | 已从公共 API catalog 隔离，不宣称 browser capability |
| NativeExtensions | `automation/native_extensions.go` + `pkg/nativeextension` | manifest-bound immutable namespace；unsafe V0 仅显式 diagnostic gate | `docs/api/native-extension.md` / `types/NativeExtension.d.ts` | `unit/native-extension.test.js` + proof harness | one-shot child有 deadline、等待与 reap；无常驻 session | 闭合；跨平台 package 与 live 分级 |

### 历史记录：当时发现并修复的不一致

| 问题 | 修复 | 证据边界 |
| --- | --- | --- |
| `RuntimeLifecycle.ResourceCounts()` 漏记 Notifications，cleanup 可能假零 | 增加 notification worker/pending 到计数、`IsZero`、字符串、execution event 与 shell zero-check | Go lifecycle seam + 当前 Runtime gate |
| CoreAudio 和 NSPasteboard 测试默认访问真实主机 | 分别要求 `OPENDESK_LIVE_AUDIO_TEST=1`、`OPENDESK_LIVE_CLIPBOARD_TEST=1` | 默认 package gate 不再冒充 live |
| OpenCV JS fixture 调用未公开的 `ImageColor.templateMatchBackend()` | JS 只测公开 ImageColor 行为；backend identity 留给 `-tags opencv` 的 Go 私有 seam | JS contract 与 Go backend 证据分离 |
| WeChat 测试调用 `System.writeFile` 与不存在的 ImageColor 可视化方法 | 改用 `File.write` 和文档化的 `Vision.annotateRegions` | 开发者命令可由当前 Runtime 解析 |
| examples 调用 `bringToTopByPID`、`mouse.scroll`、`File.mkdir` | 改用 `window.bringToTop`、`mouse.wheel`、`File.ensureDir` | 公开示例与 docs/types/manifest 对齐 |
| 固定 run id 重跑曾复用旧 Native Extension helper/fixture-ready，并使 provenance 丢失或 async 连接旧端口 | 入口校验 run id 后只清理该 `.runtime` run 目录；helper 每次从当前源码 staging build 并同步 manifest/types/context | 同一 run id 连续执行也不接受旧 binary、ready 文件或日志 |
| `unit/mouse.test.js` 曾移动并读取真实指针，受用户同时移动鼠标影响 | unit 只保留 surface 与无副作用参数校验；`mouse.move/getPos` 行为由既有 `live/mouse.test.js` 验收 | 普通 unit 不再操作真实桌面，live 仍保留 JS-first 行为证据 |

### 历史记录：剩余边界

- `contract/unit` 证明当前构建的 JS surface 与确定性行为，不证明真实窗口可见、权限或设备状态。
- Linux/Windows 的 Native Extension 在当时记录中只可记 compile/package；没有目标系统 live Runtime 时不能升级表述。
- `.archive/`、`dist/` 和旧 `.runtime/` 产物不计入当前评分。最终证据必须引用对应 run id 与 binary hash。
