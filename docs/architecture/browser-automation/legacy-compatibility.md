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

## Historical names that are not current facts

当前 tree 没有找到可生成下列 facade 的实现：

- `pageUpgraded`
- `browserUpgraded`
- `contextUpgraded`
- `Automation.getLegacy/getUpgraded/getPlaywrightFacade`
- `playwright.chromium.launch()`
- 历史 `page____ChromePage____Object` browser-driver 路径的当前 contract

因此旧文档中围绕这些对象的 click/type/press/locator/evaluate/close 自动化证明已从当前 Claim 中移除。

## Migration rule

遇到历史脚本或文档引用 raw/old facade 时，按以下顺序处理：

1. 先在当前源码中定位真实实现；
2. 能由 `page/browser/context/mouse/keyboard` 当前 surface 表达的，迁移到当前 surface；
3. 只能证明 alias/routing 的，标记为 compatibility shim，不升级为 runtime semantics；
4. 当前实现已不存在的，删除或降级 Claim；
5. 只有存在真实用户场景、现有 abstraction 无法表达且可配套测试时，才新增最小 runtime capability。

## Evidence language

必须区分：

- API shape (`E1`)
- routing/alias (`E2`)
- runtime implementation (`E3`)
- automated test (`E4`)
- current real-environment smoke (`E5`)

完整矩阵见 `docs/architecture/browser-automation/capabilities.md`。
