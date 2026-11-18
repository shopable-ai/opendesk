---
docType: reference
title: Page API
description: page 是 OpenDesk 脚本最常用的桌面入口，负责截图、打开 URL/App、等待与权限处理。
order: 30
---

# page

`page` 是 OpenDesk 桌面脚本的常用入口。它不是浏览器 DOM Page；主要负责截图、打开 URL/App、等待和权限处理。

`page.mouse`、`page.keyboard`、`page.touchscreen` 分别对应同一 Runtime 的 [`mouse`](mouse.md)、[`keyboard`](input.md) 与 [`touchscreen`](input.md) 能力。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `page.screenshot(options?)` | 截取活动窗口、屏幕或明确 clip。 |
| `page.captureScreen(options?)` | 截屏兼容入口，返回形式与 `page.screenshot()` 一致。 |
| `page.goto(url)` | 交给系统默认方式打开 URL。 |
| `page.openURL(url)` | `page.goto()` 的语义别名。 |
| `page.openApp(appName)` | 打开本地应用。 |
| `page.openURLInApp(appName, url)` | 用指定应用打开 URL。 |
| `page.title()` | 读取当前活动窗口标题。 |
| `page.url()` | 返回 Page 内部 executable 字段；不是浏览器 URL。 |
| `page.waitFor(value, options?)` | 分派到固定等待或条件等待。 |
| `page.waitForTimeout(ms, options?)` | 非阻塞固定等待。 |
| `page.waitForFunction(fn, options?, ...args)` | 轮询条件，带独立 deadline。 |
| `page.waitForNavigation(options?)` | 兼容轮询 executable 字段变化，不观察浏览器导航。 |
| `page.waitForAll(values, options?)` | 有界等待一组值/Promise。 |
| `page.checkPermissions(options?)` | 读取跨平台权限快照。 |
| `page.requestPermissions(options?)` | 请求或引导用户处理跨平台权限。 |
| `page.ensurePermissions(options?)` | 严格确保所需权限已满足。 |
| `page.ensureMacPermissions(options?)` | 兼容权限 guard；新脚本使用 `page.ensurePermissions()`。 |
| `page.checkScreenshotPermissions()` | 检查截图相关权限。 |
| `page.openMacOSPrivacySettings(section)` | 打开指定 macOS Privacy 设置页。 |
| `page.requestMacPermissions(options)` | 请求/检查 macOS 权限。 |
| `page.requestMacAutomationPermission(targetApp)` | 触发指定应用的 AppleEvents 权限请求。 |

## 公共约定

### 等待时间与取消

以下计时/取消约定适用于 `waitForTimeout`、`waitForFunction`、`waitForAll` 及 `waitFor` 对它们的分派；`waitForNavigation` 是独立的旧兼容实现，见其专节。

`ms`、`timeout`、`polling` 必须是 `0..86400000` 内有限 `number`；允许小数，Runtime 调度时转换为整数毫秒。等待方法的 `signal` 可省略或为 `AbortSignal | null`。

- timeout：`TimeoutError`，`code: 'TIMEOUT'`。
- signal 取消：`AbortError`，`code: 'CANCELED'`。
- 参数错误：`TypeError`，`code: 'INVALID_ARGUMENT'`。

超时或取消不能抢占阻塞 JavaScript EventLoop 的同步死循环。

### 权限 capability

跨平台权限入口使用 `capabilities` 数组，常见值包括 `screenCapture`、`accessibility`、`inputMonitoring` 与 `automation`。`section: 'globalShortcut'` 会映射为 Accessibility + Input Monitoring 组合。

权限方法不会把 `unknown` 当作 granted。需要系统设置导航时由显式 request/ensure 流程处理。

### Screenshot returnType

| `returnType` | 返回值 |
| --- | --- |
| `base64` 或省略 | `data:image/png;base64,...` |
| `bytes` | PNG bytes / ArrayBuffer |
| `path` | 保存后的绝对路径 |
| `object` | `{path,mimeType,width,height,sizeBytes,source,backend}` |
| `none` | `null` |

## page.screenshot(options?)

截取活动窗口、整屏、指定显示器或明确 clip。

**签名**
```ts
page.screenshot(options?: OpenDeskPageScreenshotOptions): Promise<string | ArrayBuffer | OpenDeskScreenshotResult | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.path` | `string` | 否 | 未设置 | 保存路径。 |
| `options.type` | `string` | 否 | `'png'` | 当前主流程输出 PNG。 |
| `options.quality` | `number` | 否 | `100` | 兼容字段；PNG 不体现 JPEG quality 差异。 |
| `options.fullPage` | `boolean` | 否 | `false` | `true` 时按整屏逻辑。 |
| `options.omitBackground` | `boolean` | 否 | `false` | 兼容字段。 |
| `options.encoding` | `string` | 否 | `'binary'` | 兼容字段。 |
| `options.returnType` | `string` | 否 | `'base64'` | 返回形式，见 [Screenshot returnType](#screenshot-returntype)。 |
| `options.target` | `'activeWindow' \| 'screen'` | 否 | `'activeWindow'` | 截图目标。 |
| `options.displayIndex` | `number` | 否 | `0` | 显示器索引。 |
| `options.clip` | `{x:number,y:number,width:number,height:number}` | 否 | 未设置 | 明确裁剪区域。 |

**返回值**

由 `returnType` 决定，见公共约定。

**行为与错误**

`clip` 优先于 target；否则 `fullPage` / `target:'screen'` 走屏幕逻辑；其余截取活动窗口。找不到活动窗口、窗口尺寸无效或指定显示器不可用时，截图失败。`clip.width/height` 必须大于 0，`displayIndex` 不能为负，非法 `returnType` 明确拒绝。macOS 活动窗口捕获沿用同一次解析得到的窗口 ID。

**示例**
```js
const path = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/current.png',
  returnType: 'path',
});
```

## page.captureScreen(options?)

提供与 `page.screenshot()` 兼容的直接屏幕抓取入口。

**签名**
```ts
page.captureScreen(options?: OpenDeskPageScreenshotOptions): Promise<string | ArrayBuffer | OpenDeskScreenshotResult | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskPageScreenshotOptions` | 否 | `{}` | 截图选项，见 `page.screenshot()`。 |

**返回值**

与 `page.screenshot()` 相同。

**行为与错误**

使用当前 Runtime 的截图 backend，不建立第二套截图语义。非法截图参数明确拒绝。

**示例**
```js
const image = await page.captureScreen({ target: 'screen', returnType: 'base64' });
```

## page.goto(url)

将 URL 交给操作系统默认打开方式。

**签名**
```ts
page.goto(url: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 非空 URL。 |

**返回值**

`Promise<void>`。

**行为与错误**

不是浏览器 tab 导航，不等待网页加载完成。平台启动失败时拒绝。

**示例**
```js
await page.goto('https://example.com');
```

## page.openURL(url)

`page.goto()` 的语义别名。

**签名**
```ts
page.openURL(url: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 非空 URL。 |

**返回值**

`void`。

**行为与错误**

同步返回，native 失败同步抛错。

Canonical method：`page.goto()`。行为和错误与 `goto()` 一致。

**示例**
```js
await page.openURL('https://example.com');
```

## page.openApp(appName)

按当前平台应用启动规则打开本地应用。

**签名**
```ts
page.openApp(appName: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `appName` | `string` | 是 | 无 | 非空应用名称或当前 backend 支持的 target spelling。 |

**返回值**

`void`。

**行为与错误**

同步返回，native 失败同步抛错。

启动请求失败时拒绝。需要稳定 identity、等待 readiness 或终止/重启时使用 [`App`](app.md)。

**示例**
```js
await page.openApp('Safari');
```

## page.openURLInApp(appName, url)

请求指定应用打开 URL。

**签名**
```ts
page.openURLInApp(appName: string, url: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `appName` | `string` | 是 | 无 | 非空且不能全是空白的目标应用名。 |
| `url` | `string` | 是 | 无 | 非空 URL。 |

**返回值**

`void`。

**行为与错误**

同步返回。应用名为空或全是空白时同步拒绝；native 失败同步抛错。

交给平台 launcher，不提供 DOM 导航语义。无效参数或启动失败时拒绝。

**示例**
```js
await page.openURLInApp('Google Chrome', 'https://example.com');
```

## page.title()

读取当前活动窗口标题。

**签名**
```ts
page.title(): string;
```

**参数**

无。

**返回值**

`string`。

**行为与错误**

同步读取当前活动窗口标题，不等待标题变化。

**示例**
```js
console.log(page.title());
```

## page.url()

返回 Page 内部 executable 字段。

**签名**
```ts
page.url(): string;
```

**参数**

无。

**返回值**

`string`。

**行为与错误**

不是浏览器真实 URL API，不应作为网页导航完成的权威状态。

**示例**
```js
console.log(page.url());
```

## page.waitFor(value, options?)

根据第一个参数分派固定等待或条件等待。

**签名**
```ts
page.waitFor(value: number | Function, options?: OpenDeskPageWaitOptions): Promise<unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `number \| Function` | 是 | 无 | number → `waitForTimeout()`；function → `waitForFunction()`。 |
| `options` | `OpenDeskPageWaitOptions` | 否 | `{}` | timeout/polling/signal，按分支转发。 |

**返回值**

Promise；具体值由分派方法决定。

**行为与错误**

不接受 Puppeteer 风格 selector 字符串。选项不被修改。

**示例**
```js
await page.waitFor(1200);
await page.waitFor(() => page.title().includes('Safari'), { timeout: 10000, polling: 200 });
```

## page.waitForTimeout(ms, options?)

使用 Runtime timer 非阻塞等待固定时间。

**签名**
```ts
page.waitForTimeout(ms: number, options?: { signal?: AbortSignal | null }): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `ms` | `number` | 是 | 无 | `0..86400000` 毫秒。 |
| `options.signal` | `AbortSignal \| null` | 否 | `null` | 取消本次等待。 |

**返回值**

`Promise<void>`。

**行为与错误**

`ms:0` 仍异步完成。取消清理本次 timer/listener 并以 `CANCELED` 拒绝。

**示例**
```js
await page.waitForTimeout(1000);
```

## page.waitForFunction(fn, options?, ...args)

轮询条件函数，保持单一在途调用并使用独立 deadline。

**签名**
```ts
page.waitForFunction(fn: Function, options?: OpenDeskPageWaitOptions, ...args: unknown[]): Promise<unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `fn` | `Function` | 是 | 无 | 条件函数；truthy 结果结束等待。 |
| `options.timeout` | `number` | 否 | `30000` ms | 总 deadline。 |
| `options.polling` | `number` | 否 | `100` ms | 轮询间隔。 |
| `options.signal` | `AbortSignal \| null` | 否 | `null` | 取消本次等待。 |
| `args` | `unknown[]` | 否 | `[]` | 原顺序传给 `fn`。 |

**返回值**

Promise，成功值保留条件函数返回值 identity。

**行为与错误**

条件 throw/reject 默认视为当前轮未满足。`timeout:0` 不执行条件函数并立即以 `TIMEOUT` 拒绝。终态会清理自有 timer/listener。

**示例**
```js
const win = await page.waitForFunction(async title => {
  const current = await window.getActiveWindow();
  return current && current.title.includes(title) && current;
}, { timeout: 10000, polling: 200 }, 'Safari');
```

## page.waitForNavigation(options?)

兼容等待 `page.url()` 返回值发生变化；不是浏览器导航完成检测。

**签名**
```ts
page.waitForNavigation(options?: { timeout?: number }): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.timeout` | `number` | 否 | `30000` | 毫秒；旧实现直接比较 elapsed > timeout，不使用公共等待参数校验。 |

**返回值**

`Promise<void>`，检测到返回值不同后 resolve `undefined`。

**行为与错误**

从普通 OpenDesk JavaScript 的全局 `page` 调用，所有平台使用同一 polyfill，无额外权限请求。调用时记录 `page.url()`，立即检查一次，此后每 `100` ms 检查；每轮先检查超时再检查变化。超时时拒绝普通 `Error('Navigation timeout')`，没有稳定 `TIMEOUT` code；`timeout: 0` 也不是同步超时。`options: null` 在解构时同步抛出 `TypeError`，非法 timeout 不保证拒绝（例如 `NaN` 会使超时比较一直为 false）。

当前 native `page.url()` 只返回 `Page.Executable`；打开 URL 不会让它变成浏览器地址。因此正常网页跳转通常只会超时，不能用于网页 readiness 或业务完成判断。请针对实际可观察状态使用 [`page.waitForFunction()`](#pagewaitforfunctionfn-options-args)。

不支持 `signal` 或单次等待取消；外层 `Promise.race` 不会停止轮询，execution 结束时由 Runtime 清理 timer。初始读值及首轮同步异常会拒绝 Promise；后续 timer 回调中的读值异常没有转为该 Promise 的 rejection，不能把它当作可靠的独立 deadline/错误封装。

**示例**

在普通 OpenDesk 脚本中，仅演示兼容入口的超时处理；不打开页面、不证明导航成功：

```js
try {
  await page.waitForNavigation({ timeout: 100 });
} catch (error) {
  if (error.message !== 'Navigation timeout') throw error;
}
```

## page.waitForAll(values, options?)

有界等待一组值或 Promise，保持输入顺序。

**签名**
```ts
page.waitForAll(values: unknown[], options?: { timeout?: number; signal?: AbortSignal | null }): Promise<unknown[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `values` | `Array<Promise<unknown> \| unknown>` | 是 | 无 | 要共同等待的值。 |
| `options.timeout` | `number` | 否 | `30000` ms | 总 deadline。 |
| `options.signal` | `AbortSignal \| null` | 否 | `null` | 取消这一层组合等待。 |

**返回值**

`Promise<unknown[]>`，保持输入顺序。

**行为与错误**

函数仅作为普通值，不自动调用。任一输入拒绝时原始 rejection reason 原样透传。超时/取消不会取消 caller-owned Promise。

**示例**
```js
const [title, active] = await page.waitForAll([
  page.title(),
  window.getActiveWindow(),
], { timeout: 5000 });
```

## page.checkPermissions(options?)

读取所需桌面权限的当前快照。

**签名**
```ts
page.checkPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.capabilities` | `string[]` | 否 | 当前默认组合 | 要检查的 capability。 |
| `options.section` | `string` | 否 | 未设置 | 预定义权限组合。 |

**返回值**

`Promise<OpenDeskPermissionReport>`。

**行为与错误**

只检查，不主动打开设置。`inputMonitoring: 'unknown'` 不会被当作 granted。

**示例**
```js
const permissions = await page.checkPermissions({ capabilities: ['screenCapture', 'accessibility'] });
```

## page.requestPermissions(options?)

检查权限并按选项引导系统授权流程。

**签名**
```ts
page.requestPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.capabilities` | `string[]` | 否 | 当前默认组合 | 目标 capability。 |
| `options.section` | `string` | 否 | 未设置 | 预定义组合。 |
| `options.openSettings` | `boolean` | 否 | `true` | 未授权时是否打开设置。 |
| `options.forceOpenSettings` | `boolean` | 否 | `false` | 是否即使已检查过仍再次导航设置页。 |
| `options.strict` | `boolean` | 否 | `false` | 未满足时是否 reject。 |

**返回值**

`Promise<OpenDeskPermissionReport>`。

**行为与错误**

已全部授权时可直接返回 skipped 结果，不重复打开设置。`forceOpenSettings` 不会改变实际权限判断。

**示例**
```js
await page.requestPermissions({ capabilities: ['screenCapture', 'accessibility'], openSettings: true });
```

## page.ensurePermissions(options?)

严格确保所需权限已满足。

**签名**
```ts
page.ensurePermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskPermissionOptions` | 否 | `{}` | 与 `requestPermissions()` 相同的 capability/设置选项。 |

**返回值**

`Promise<OpenDeskPermissionReport>`。

**行为与错误**

未满足必要权限时 reject，而不是返回假成功。适合在需要截图、Accessibility 或输入权限的工作流开始前作为 guard。

**示例**
```js
await page.ensurePermissions({ capabilities: ['screenCapture', 'accessibility'] });
```

## page.ensureMacPermissions(options?)

旧权限 guard 的兼容入口；canonical 流程是 [`page.ensurePermissions()`](#pageensurepermissionsoptions)，新脚本使用该方法。

**签名**
```ts
page.ensureMacPermissions(options?: OpenDeskEnsureMacPermissionOptions): Promise<OpenDeskPermissionReport>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.capabilities` | `OpenDeskPermissionCapability[]` | 否 | 由 section 映射 | 非空数组优先于 section。 |
| `options.section` | `OpenDeskPermissionOptions['section']` | 否 | `'screenCapture'` | `screenCapture`/`screen` → screenCapture + accessibility；accessibility、inputMonitoring、automation 各取同名项；globalShortcut → accessibility + inputMonitoring；baseline/browserBaseline/browser → screenCapture + accessibility + automation；all 或空值 → 四项全选；未知名称回退 screenCapture + accessibility。 |
| `options.openSettingsOnFail` | `boolean` | 否 | `true` | 转为 canonical `openSettings`；不是“禁止请求权限”开关。 |
| `options.forceOpenSettings` | `boolean` | 否 | `false` | 转发到 canonical 流程，需同时允许打开设置才生效。 |
| `options.strict` | `boolean` | 否 | `true` | 可显式 false，允许返回 `ok:false`。 |

**返回值**

`Promise<OpenDeskPermissionReport>`，结构与 canonical 权限流程一致，包含 `ok`、`os`、`capabilities`、`permissions`，以及按分支提供的 `skipped`、`settingsOpened`、`raw`、`flow` 等信息。

**行为与错误**

普通 OpenDesk JavaScript 通过全局 `page` 调用；异步 facade 委托 canonical guard，不提供单独的 macOS-only 实现。macOS 上可能执行权限探测、系统提示、AppleEvents 探测或导航设置；`openSettingsOnFail:false` 只禁止设置导航，仍可能请求权限，不能当作只读预检。已满足所选权限且未强制导航时跳过请求。不等待用户在设置中完成授权，也不会把 unknown 当作 granted。

非 macOS 返回 `ok:true, skipped:true` 及 unsupported 权限快照，表示此平台不执行该请求，不能据此推断桌面能力可用。macOS 缺失 native 权限 API 或最终权限未就绪时，strict 模式拒绝普通 `Error`；底层错误透传，不承诺稳定错误 code。不支持 `signal`、独立 timeout 或撤销已经发出的系统请求。

**示例**

普通 OpenDesk 脚本中，经用户授权后使用 canonical guard（可能弹出系统授权界面；本轮未执行）：

```js
await page.ensurePermissions({ capabilities: ['accessibility'], openSettings: true });
```

## page.checkScreenshotPermissions()

检查截图相关系统权限。

**签名**
```ts
page.checkScreenshotPermissions(): Record<string, unknown>;
```

**参数**

无。

**返回值**

`Record<string, unknown>`。

**行为与错误**

同步返回原生 report；native error 同步抛出。不是 canonical `OpenDeskPermissionReport`，须检查当前平台及返回字段。

只检查，不保证自动弹出权限提示。平台不支持时按当前 permission backend 返回明确状态/错误。

**示例**
```js
console.log(await page.checkScreenshotPermissions());
```

## page.openMacOSPrivacySettings(section)

打开指定 macOS Privacy 设置页。

**签名**
```ts
page.openMacOSPrivacySettings(section?: string): Record<string, unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `section` | `string` | 否 | `all` | 省略或空字符串选择全部 section；仅需一个权限时显式传入。 |

**返回值**

`Record<string, unknown>`。

**行为与错误**

同步返回原生 report；native error 同步抛出。不是 canonical `OpenDeskPermissionReport`，须检查当前平台及返回字段。

仅负责导航系统设置，不将“已打开设置页”解释为权限已授予。未知 section 抛错；非 macOS 返回带说明且 `opened: []` 的 report，不代表已打开设置或获得权限。

**示例**
```js
await page.openMacOSPrivacySettings('accessibility');
```

## page.requestMacPermissions(options)

请求或检查 macOS 权限组合。

**签名**
```ts
page.requestMacPermissions(options?: { section?: string; openSettings?: boolean; forceOpenSettings?: boolean }): Record<string, unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `{ section?: string; openSettings?: boolean; forceOpenSettings?: boolean }` | 否 | `{}` | 只读取 `section`、`openSettings` 和 `forceOpenSettings`。 |

**返回值**

`Record<string, unknown>`。

**行为与错误**

同步返回原生 report；native error 同步抛出。不是 canonical `OpenDeskPermissionReport`，须检查当前平台及返回字段。

不会把系统设置导航等同于授权成功；实际结果仍以重新检查权限状态为准。默认 `section: 'screenCapture'`、`openSettings: true`、`forceOpenSettings: false`；`screenCapture` / `accessibility` 布尔字段不会选择权限。非 macOS 返回 `ok: true` 的兼容 no-op report，不能据此判定权限可用。

**示例**
```js
const result = await page.requestMacPermissions({ section: 'accessibility', openSettings: true });
console.log(result);
```

## page.requestMacAutomationPermission(targetApp)

触发对指定目标应用的 macOS AppleEvents Automation 权限请求。

**签名**
```ts
page.requestMacAutomationPermission(targetApp?: string): Record<string, unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `targetApp` | `string` | 否 | `System Events` | 空字符串或省略使用默认目标。 |

**返回值**

`Record<string, unknown>`。

**行为与错误**

同步返回原生 report；native error 同步抛出。不是 canonical `OpenDeskPermissionReport`，须检查当前平台及返回字段。

仅适用于 macOS Automation/AppleEvents 权限；不用于 Accessibility 或 Screen Recording。非 macOS 返回 `ok: false` 的 report；`triggered` 或 `pendingUserConsent` 不代表授权已完成。

**示例**
```js
const result = await page.requestMacAutomationPermission('Finder');
console.log(result);
```

## 错误

除 `waitForNavigation` 专节说明的旧 timer 回调限制外，异步方法通过 rejection 表达参数、平台、权限、截图或 launcher 失败。`waitForTimeout`、`waitForFunction`、`waitForAll` 使用稳定 `TIMEOUT` / `CANCELED` / `INVALID_ARGUMENT` 语义，不要解析 message 判断类型；`waitForNavigation` 不提供这些稳定 code。

## 平台与能力

`page` 是桌面 Runtime facade；具体截图、launcher 与权限能力依赖当前平台。外部 UI 识别使用 [`UI`](desktop-ui.md)，应用生命周期使用 [`App`](app.md)，原生语义元素使用 [`Accessibility`](accessibility.md)。
