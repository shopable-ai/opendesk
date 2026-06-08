---
title: Clawdesk API 文档
description: 面向脚本作者的用户可读 API 文档，依据当前源码与旧文档风格重新整理。
order: 1
---

# Clawdesk API 文档

这是一套全新整理的用户 API 文档。

文档目标：
- 面向脚本作者与自动化使用者
- 以当前源码为准
- 吸收旧文档中“概述 / 方法表 / 参数 / 返回值 / 示例”的用户视角写法
- 不混入已过时、仅在旧文档中出现但当前源码并不存在的接口

阅读建议：
1. 先读 page.md
2. 再读 input.md、window.md、vision.md
3. 再读 runtime.md 了解 stack 与 facade
4. 再读 cookbook.md 直接拿范例改
5. 最后按需查专题页

目录导航
- README.md：CLI 目录入口页
- page.md：核心入口，截图 / 打开 / 权限 / 等待
- input.md：mouse / keyboard / touchscreen
- window.md：窗口信息与窗口控制
- screen.md：显示器、边界、取色
- system.md：系统信息、进程、网络、目录
- file.md：文件读写与路径处理
- clipboard-console.md：剪贴板与日志输出
- http.md：http 与 axios
- vision.md：OCR、DetectUI、provider capabilities
- http-server.md：内置 HTTP 服务 API
- polyfills.md：运行时增强层
- libs.md：自动加载的 JS 库
- runtime.md：legacy / upgraded / playwright 运行时栈说明
- cookbook.md：高频用户脚本范例

API 分层说明：

1. 原生对象（源码真实存在）
- 由 Go 运行时直接注入，例如 page、mouse、keyboard、touchscreen、window、Screen、System、File、Vision、clipboard、console、http

2. Polyfill 增强（用户实际可用）
- 由 polyfills/*.js 在运行时增强，例如：
  - page.waitForTimeout()
  - page.waitForNavigation()
  - page.checkPermissions()
  - page.requestPermissions()
  - page.ensurePermissions()
  - page.ensureMacPermissions()
- 这些方法对用户来说是可用 API，但并不是 Go 原生方法

3. 兼容层 / 历史写法
- 旧文档里曾出现的部分接口，在当前源码中已经不存在，或只在旧平台模型里成立
- 本套文档不会把它们混入正式 API
- 若某接口只存在于兼容层，文档会明确标注“polyfill”或“兼容层”

运行时栈模式
- legacy：保留默认旧式 page 对象
- upgraded：将全局 page 指向升级后的 facade
- playwright：将 page / browser / context 指向升级 facade

重点页面
- page.md：重点完善，尤其是 screenshot / 权限 / 打开 URL / 等待能力
- window.md：重点完善，覆盖窗口信息与控制
- vision.md：重点完善，覆盖 OCR、DetectUI、provider capabilities
- runtime.md：补清三种 stack 的用户语义
- cookbook.md：提供可直接拿来改的高频脚本模板

文档目录
- README.md
- index.md
- page.md
- input.md
- window.md
- screen.md
- system.md
- file.md
- clipboard-console.md
- http.md
- vision.md
- http-server.md
- polyfills.md
- libs.md
- runtime.md
- cookbook.md

不纳入正式 API 的典型旧接口示例
- 旧文档中的 page.$ / page.$$ / page.click(selector) / page.type(selector, text)
- 这些写法在当前项目源码中不是稳定正式 API，不应继续作为用户主文档入口

SDK 风格阅读建议
- 先确定对象职责，再看方法细节
- 优先使用文档中标为“原生”的能力
- 使用 polyfill 能力时，注意它们是“最终可用 API”，但不是底层原生实现
- 遇到与旧文档冲突的地方，一律以当前 docs-user-api/ 和当前源码为准
