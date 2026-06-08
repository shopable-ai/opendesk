---
title: TestMonkey API 文档索引
description: 面向脚本作者的 TestMonkey API 文档入口，按 page、系统、文件、网络、视觉和 HTTP 服务分组。
order: 10
---

# TestMonkey API 文档索引

更新时间：2026-05-18

这组文档按“用户真正写脚本时的使用路径”组织，不再只是源码笔记。

建议阅读顺序：

## 1. 核心脚本 API

### `testmonkey-runtime-page-input.md`
最重要的一页，覆盖：
- `page`
- `mouse`
- `keyboard`
- `touchscreen`
- 截图参数
- 等待 API
- macOS 权限 API

如果你要写自动化脚本，先读这页。

### `testmonkey-runtime-system-window-file.md`
覆盖：
- `window`
- `Screen`
- `System`
- `File`
- `clipboard`
- `console`

适合窗口控制、文件读写、系统信息读取、屏幕信息获取。

### `testmonkey-runtime-network-and-vision.md`
覆盖：
- `http`
- `axios`
- `OCR`
- `Vision`
- `notify`
- 其他运行时辅助对象

适合 HTTP 调用、截图识别、文字定位点击等场景。

## 2. 运行时补充说明

### `testmonkey-polyfills.md`
解释运行时兼容层：
- `page.waitFor()`
- `sleep()`
- `axios` 增强版
- `URLSearchParams`
- `copyToClipboard()` 等

### `testmonkey-js-runtime-libraries.md`
解释默认内置 JS 库：
- lodash
- moment
- query-string
- cheerio
- beautify

## 3. 服务端调用

### `testmonkey-http-api.md`
覆盖 HTTP 接口：
- `/SCRIPT_RUN`
- `/executions`
- `/executions/{id}`
- `/executions/{id}/summary`
- `/executions/{id}/events`
- `/status`
- `/vision/ocr`
- `/vision/detect-ui`

## 4. 总览 / 汇总页

### `testmonkey-runtime-overview.md`
运行时对象总览与初始化顺序。

### `testmonkey-runtime-api-reference.md`
汇总检索页，适合全文搜索，不适合作为第一阅读入口。

## 文档定位说明

这组文档参考了旧文档目录：
- `/Users/a0000/Documents/workspace-old/doc-test-mokey`

但已经按当前仓库源码重新校准，重点以以下目录为准：
- `automation/`
- `polyfills/`
- `jslibs/`
- `pkg/http/`
- `main.go`

因此：
- 旧文档里有帮助的“用户视角写法”被保留
- 旧文档里和当前实现不一致的部分，以当前源码为准
