---
title: TestMonkey 运行时接口汇总参考
description: 提供适合全文检索的运行时接口汇总参考页。
order: 90
---

# TestMonkey 运行时接口汇总参考

更新时间：2026-05-18

这份文档是汇总参考页，面向“需要一次全文检索”的场景。分主题阅读建议优先使用：

- `testmonkey-runtime-overview.md`
- `testmonkey-runtime-page-input.md`
- `testmonkey-runtime-system-window-file.md`
- `testmonkey-runtime-network-and-vision.md`
- `testmonkey-polyfills.md`
- `testmonkey-js-runtime-libraries.md`
- `testmonkey-http-api.md`

## 汇总地图

### 页面与输入

- `page`
- `mouse`
- `keyboard`
- `touchscreen`

### 窗口与系统

- `window`
- `Screen`
- `System`

### 文件与剪贴板

- `File`
- `clipboard`
- `copyToClipboard()`
- `getClipboard()`

### 网络与视觉

- `http`
- `axios`
- `OCR`
- `Vision`
- `notify()`

### 兼容层与工具

- `Promise`
- timer 系列
- `sleep()`
- `URLSearchParams`
- `console`

### 内置库

- `_`
- `moment`
- `queryString`
- `cheerio`
- `js_beautify`（需运行时确认）

## 常用推荐组合

### 截图 + OCR

```js
await page.ensureMacPermissions({
  section: "all",
  openSettingsOnFail: true,
  strict: true
})

const shot = await page.screenshot({
  path: "temp/shot.png",
  returnType: "path"
})

const text = await OCR.extractText(shot)
console.log(text)
```

### 视觉定位 + 点击

```js
const image = await page.screenshot({ returnType: "base64" })
const ui = await Vision.detectUI({
  image,
  targetText: "登录",
  matchMode: "contains",
  minConfidence: 0.5
})

if (ui.count > 0) {
  const p = ui.elements[0].clickPoint
  await mouse.click(p.x, p.y)
}
```

### HTTP 请求

```js
const resp = await axios.get("https://httpbin.org/get", {
  params: { q: "demo" },
  headers: { "X-Test": "1" }
})
console.log(resp.data)
```

### 文件输出

```js
File.ensureDir("temp")
File.write("temp/result.json", JSON.stringify({ ok: true }, null, 2))
```

## 使用注意事项

1. `axios` 最终以 `polyfills/004-axios.js` 的增强版为准
2. `window` 能力存在平台差异
3. `Vision` 与 `OCR` 不是同一层能力
4. 多屏截图前建议先调用 `Screen.getDisplays()`
5. `System.shutdown()` / `restart()` / `sleep()` 具有强副作用
6. `jslibs` 中部分库是打包产物，必要时先确认全局导出名
