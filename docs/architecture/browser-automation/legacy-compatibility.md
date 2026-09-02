# Legacy Browser Compatibility Boundaries

本文件只记录当前仍存在的兼容边界。

## Public current surfaces

当前脚本可以依赖的主要对象是：

- `page`
- `mouse`
- `keyboard`
- `touchscreen`
- `browser`
- `context`

具体能力以 `types/page.d.ts`、`types/browser.d.ts` 与当前 Go 实现为准。

## Raw inject handles

初始化阶段还保留：

- `page____Inject`
- `browser____Inject`
- `context____Inject`

它们用于 polyfill/compatibility wrapper，属于 raw/private compatibility surface。新业务脚本不应把它们当成稳定公共 API。

## Current compatibility facade names

`polyfills/010-browser-automation-upgraded.js` 当前生成：

- `pageUpgraded`
- `browserUpgraded`
- `contextUpgraded`
- `Automation.getLegacy/getUpgraded/getPlaywrightFacade`
- `playwright.chromium.launch()`
- `Automation.getLegacy/getUpgraded/getPlaywrightFacade()`

这些名称可以用于现有迁移 recipe，但只能按 compatibility facade 解释：locator 是 selector carrier，
action/evaluate/wait 会路由到 owner 已提供的方法或显式报 unsupported；local Goja evaluate 不是浏览器
页面 realm。历史 `page____ChromePage____Object` browser-driver 路径仍没有当前 contract。

## Migration rule

遇到历史脚本或文档引用 raw/old facade 时，按以下顺序处理：

1. 先在当前源码中定位真实实现；
2. 能由 `page/browser/context/mouse/keyboard` 当前 surface 表达的，迁移到当前 surface；
3. 只能证明 alias/routing 的，标记为 compatibility shim，不升级为 runtime semantics；
4. compatibility facade 能表达的迁移只补契约与测试，不再创建同义 facade；
5. 只有真实 browser/DOM 场景无法由当前桌面原语表达且可配套测试时，才新增最小 runtime adapter。

## Evidence language

必须区分：

- API shape (`E1`)
- routing/alias (`E2`)
- runtime implementation (`E3`)
- automated test (`E4`)
- current real-environment smoke (`E5`)

完整矩阵见 `docs/architecture/browser-automation/capabilities.md`。
