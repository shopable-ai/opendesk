---
title: TestMonkey 用户接口文档索引
description: 面向脚本作者和接口使用者的 TestMonkey API 文档入口。
order: 10
---

# TestMonkey 用户接口文档索引

更新时间：2026-05-18

说明：
- 这一套文档是新的“用户可读 API 文档”目录。
- 它和现有 `docs-api/` 分开，避免混在一起。
- 如果旧目录更偏源码整理，这个目录更偏用户查阅和实际写脚本使用。

推荐阅读顺序：

## 1. 核心脚本 API

- `testmonkey-user-page-and-input-api.md`
  - `page`
  - `mouse`
  - `keyboard`
  - `touchscreen`
  - 截图、等待、权限

- `testmonkey-user-system-window-file-api.md`
  - `window`
  - `Screen`
  - `System`
  - `File`
  - `clipboard`
  - `console`

- `testmonkey-user-network-and-vision-api.md`
  - `http`
  - `axios`
  - `OCR`
  - `Vision`
  - `notify`

## 2. 服务端接口

- `testmonkey-user-http-server-api.md`
  - `/SCRIPT_RUN`
  - `/executions/*`
  - `/status`
  - `/vision/ocr`
  - `/vision/detect-ui`

## 3. 兼容层和内置库

- `testmonkey-user-polyfills-and-libs.md`
  - `polyfills/`
  - `jslibs/`

## 4. 文档来源

这组文档综合参考：
- 当前源码：`automation/`、`polyfills/`、`jslibs/`、`pkg/http/`、`main.go`
- 历史文档：`/Users/a0000/Documents/workspace-old/doc-test-mokey`

原则：
- 优先保留旧文档里更适合用户阅读的写法
- 但接口定义、参数和行为最终以当前源码为准
