# Legacy Browser Compatibility Boundaries

本文件记录源码中仍保留、但不再作为用户 API 发布的 browser-shaped 兼容层。

## 维护中的公开对象

新脚本使用 `page`、`mouse`、`keyboard`、`touchscreen` 以及 `docs/api/index.md` 列出的其他桌面
对象。公开签名以 `types/page.d.ts` 和对应 `docs/api/` 页面为准。

## 仅供旧脚本兼容的对象

Runtime 当前仍可能创建 `browser`、`context`、`pageUpgraded`、`browserUpgraded`、
`contextUpgraded`、`Automation`、`playwright` 以及 `*____Inject` raw handles。它们的实现位于
`automation/browser.go`、`automation/runtime_stack.go` 和
`polyfills/010-browser-automation-upgraded.js`。

这些对象不在用户 API catalog、公开 TypeScript 声明或 examples 中。它们只提供同一 Goja
Runtime 内的 alias、owner routing 和内存 map，不启动浏览器进程，也没有 DOM、selector、tab、
page realm、cookie jar、profile 或 browser storage 语义。

## 维护规则

1. 不为兼容对象新增用户功能、别名、文档方法表或公开示例。
2. 旧脚本必须先迁移到现有桌面 API；不能迁移的真实 browser/DOM 需求应使用独立 browser driver。
3. Go 测试只固定兼容代码不会意外破坏已有调用，不得把通过结果描述为公共 browser capability。
4. 删除兼容实现前另做使用方审计和破坏性变更决策；从公开 catalog 撤下不等于立即删除 runtime code。

完整事实矩阵见 `docs/architecture/browser-automation/capabilities.md`，用户边界见
`docs/api/runtime.md`。
