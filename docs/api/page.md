---
title: Page API
description: page 是 OpenDesk 脚本最常用的桌面入口，负责截图、打开 URL/App、等待与权限处理。
order: 2
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
| `page.waitForAll(values, options?)` | 有界等待一组值/Promise。 |
| `page.checkPermissions(options?)` | 读取跨平台权限快照。 |
| `page.requestPermissions(options?)` | 请求或引导用户处理跨平台权限。 |
| `page.ensurePermissions(options?)` | 严格确保所需权限已满足。 |
| `page.checkScreenshotPermissions()` | 检查截图相关权限。 |
| `page.openMacOSPrivacySettings(section)` | 打开指定 macOS Privacy 设置页。 |
| `page.requestMacPermissions(options)` | 请求/检查 macOS 权限。 |
| `page.requestMacAutomationPermission(targetApp)` | 触发指定应用的 AppleEvents 权限请求。 |

## 公共约定

### 等待时间与取消

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

## `page.screenshot(options?)`

截取活动窗口、整屏、指定显示器或明确 clip。

**签名**
```ts
page.screenshot(options?: OpenDeskScreenshotOptions): Promise<OpenDeskScreenshotResult>;
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

`clip` 优先于 target；否则 `fullPage` / `target:'screen'` 走屏幕逻辑；其余尝试活动窗口。`clip.width/height` 必须大于 0，`displayIndex` 不能为负，非法 `returnType` 明确拒绝。

**示例**
```js
const path = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/current.png',
  returnType: 'path',
});
```

## `page.captureScreen(options?)`

提供与 `page.screenshot()` 兼容的直接屏幕抓取入口。

**签名**
```ts
page.captureScreen(options?: OpenDeskScreenshotOptions): Promise<OpenDeskScreenshotResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskScreenshotOptions` | 否 | `{}` | 截图选项，见 `page.screenshot()`。 |

**返回值**

与 `page.screenshot()` 相同。

**行为与错误**

使用当前 Runtime 的截图 backend，不建立第二套截图语义。非法截图参数明确拒绝。

**示例**
```js
const image = await page.captureScreen({ target: 'screen', returnType: 'base64' });
```

## `page.goto(url)`

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

## `page.openURL(url)`

`page.goto()` 的语义别名。

**签名**
```ts
page.openURL(url: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 非空 URL。 |

**返回值**

`Promise<void>`。

**行为与错误**

Canonical method：`page.goto()`。行为和错误与 `goto()` 一致。

**示例**
```js
await page.openURL('https://example.com');
```

## `page.openApp(appName)`

按当前平台应用启动规则打开本地应用。

**签名**
```ts
page.openApp(appName: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `appName` | `string` | 是 | 无 | 非空应用名称或当前 backend 支持的 target spelling。 |

**返回值**

`Promise<void>`。

**行为与错误**

启动请求失败时拒绝。需要稳定 identity、等待 readiness 或终止/重启时使用 [`App`](app.md)。

**示例**
```js
await page.openApp('Safari');
```

## `page.openURLInApp(appName, url)`

请求指定应用打开 URL。

**签名**
```ts
page.openURLInApp(appName: string, url: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `appName` | `string` | 是 | 无 | 目标应用。 |
| `url` | `string` | 是 | 无 | 非空 URL。 |

**返回值**

`Promise<void>`。

**行为与错误**

交给平台 launcher，不提供 DOM 导航语义。无效参数或启动失败时拒绝。

**示例**
```js
await page.openURLInApp('Google Chrome', 'https://example.com');
```

## `page.title()`

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

## `page.url()`

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

## `page.waitFor(value, options?)`

根据第一个参数分派固定等待或条件等待。

**签名**
```ts
page.waitFor(value: number | Function, options?: OpenDeskWaitOptions): Promise<unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `number \| Function` | 是 | 无 | number → `waitForTimeout()`；function → `waitForFunction()`。 |
| `options` | `OpenDeskWaitOptions` | 否 | `{}` | timeout/polling/signal，按分支转发。 |

**返回值**

Promise；具体值由分派方法决定。

**行为与错误**

不接受 Puppeteer 风格 selector 字符串。选项不被修改。

**示例**
```js
await page.waitFor(1200);
await page.waitFor(() => page.title().includes('Safari'), { timeout: 10000, polling: 200 });
```

## `page.waitForTimeout(ms, options?)`

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

## `page.waitForFunction(fn, options?, ...args)`

轮询条件函数，保持单一在途调用并使用独立 deadline。

**签名**
```ts
page.waitForFunction(fn: Function, options?: OpenDeskWaitForFunctionOptions, ...args: unknown[]): Promise<unknown>;
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

## `page.waitForAll(values, options?)`

有界等待一组值或 Promise，保持输入顺序。

**签名**
```ts
page.waitForAll(values: unknown[], options?: OpenDeskWaitForAllOptions): Promise<unknown[]>;
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

## `page.checkPermissions(options?)`

读取所需桌面权限的当前快照。

**签名**
```ts
page.checkPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.capabilities` | `string[]` | 否 | 当前默认组合 | 要检查的 capability。 |
| `options.section` | `string` | 否 | 未设置 | 预定义权限组合。 |

**返回值**

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

只检查，不主动打开设置。`inputMonitoring: 'unknown'` 不会被当作 granted。

**示例**
```js
const permissions = await page.checkPermissions({ capabilities: ['screenCapture', 'accessibility'] });
```

## `page.requestPermissions(options?)`

检查权限并按选项引导系统授权流程。

**签名**
```ts
page.requestPermissions(options?: OpenDeskPermissionRequestOptions): Promise<OpenDeskPermissionResult>;
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

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

已全部授权时可直接返回 skipped 结果，不重复打开设置。`forceOpenSettings` 不会改变实际权限判断。

**示例**
```js
await page.requestPermissions({ capabilities: ['screenCapture', 'accessibility'], openSettings: true });
```

## `page.ensurePermissions(options?)`

严格确保所需权限已满足。

**签名**
```ts
page.ensurePermissions(options?: OpenDeskPermissionRequestOptions): Promise<OpenDeskPermissionResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskPermissionRequestOptions` | 否 | `{}` | 与 `requestPermissions()` 相同的 capability/设置选项。 |

**返回值**

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

未满足必要权限时 reject，而不是返回假成功。适合在需要截图、Accessibility 或输入权限的工作流开始前作为 guard。

**示例**
```js
await page.ensurePermissions({ capabilities: ['screenCapture', 'accessibility'] });
```

## `page.checkScreenshotPermissions()`

检查截图相关系统权限。

**签名**
```ts
page.checkScreenshotPermissions(): Promise<OpenDeskPermissionResult>;
```

**参数**

无。

**返回值**

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

只检查，不保证自动弹出权限提示。平台不支持时按当前 permission backend 返回明确状态/错误。

**示例**
```js
console.log(await page.checkScreenshotPermissions());
```

## `page.openMacOSPrivacySettings(section)`

打开指定 macOS Privacy 设置页。

**签名**
```ts
page.openMacOSPrivacySettings(section: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `section` | `string` | 是 | 无 | Runtime 支持的 Privacy section。 |

**返回值**

`Promise<void>`。

**行为与错误**

仅负责导航系统设置，不将“已打开设置页”解释为权限已授予。非 macOS 或未知 section 明确失败。

**示例**
```js
await page.openMacOSPrivacySettings('accessibility');
```

## `page.requestMacPermissions(options)`

请求或检查 macOS 权限组合。

**签名**
```ts
page.requestMacPermissions(options: OpenDeskMacPermissionOptions): Promise<OpenDeskPermissionResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskMacPermissionOptions` | 是 | 无 | macOS 权限请求选项。 |

**返回值**

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

不会把系统设置导航等同于授权成功；实际结果仍以重新检查权限状态为准。非 macOS 明确不支持。

**示例**
```js
const result = await page.requestMacPermissions({ screenCapture: true, accessibility: true });
console.log(result);
```

## `page.requestMacAutomationPermission(targetApp)`

触发对指定目标应用的 macOS AppleEvents Automation 权限请求。

**签名**
```ts
page.requestMacAutomationPermission(targetApp: string): Promise<OpenDeskPermissionResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `targetApp` | `string` | 是 | 无 | 非空目标应用标识。 |

**返回值**

`Promise<OpenDeskPermissionResult>`。

**行为与错误**

仅适用于 macOS Automation/AppleEvents 权限；不用于 Accessibility 或 Screen Recording。平台/target 无效时明确失败。

**示例**
```js
const result = await page.requestMacAutomationPermission('Finder');
console.log(result);
```

## 错误

所有异步方法都应通过明确 rejection 表达参数、平台、权限、截图或 launcher 失败。等待方法使用稳定 `TIMEOUT` / `CANCELED` / `INVALID_ARGUMENT` 语义，不要解析 message 判断类型。

## 平台与能力

`page` 是桌面 Runtime facade；具体截图、launcher 与权限能力依赖当前平台。外部 UI 识别使用 [`UI`](desktop-ui.md)，应用生命周期使用 [`App`](app.md)，原生语义元素使用 [`Accessibility`](accessibility.md)。
