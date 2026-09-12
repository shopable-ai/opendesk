---
title: Custom UI Icons
description: FloatingWindow 内置语义图标、跨平台映射与自定义图片图标的使用边界。
order: 131
---

# Custom UI Icons

OpenDesk Runtime 自带跨平台语义图标目录。`FloatingWindow` 的普通按钮应优先直接使用内置图标 ID，而不是在脚本或 App package 中复制 PNG/SVG。

当前 catalog 的 canonical source 是：

```text
pkg/customui/assets/toolbar-icons-v1.json
```

当前 v1 catalog 包含 160 个语义图标，并由 Runtime 映射到 macOS SF Symbols 与 Windows Segoe Fluent glyph。可通过仓库中的 Icon Browser 查看实际效果：

```text
examples/custom-ui/icon-browser/
```

## 使用内置图标

```js
const toolbar = new FloatingWindow({ title: "Example" });

toolbar.addButton("run", "运行", "play.fill", () => {});
toolbar.addButton("folder", "打开目录", "folder.fill", () => {});
toolbar.addButton("timer", "计时", "timer", () => {});
```

内置 ID 是 Runtime resource，不需要、也不应该在 App 中准备同名 PNG/SVG。新增按钮前先查 catalog；存在语义等价图标时直接复用。

## 什么时候使用图片文件

只有下列资源适合继续使用图片文件：

- 品牌 Logo、产品身份图；
- 用户或业务域提供的图片；
- catalog 无法表达且必须保持特定视觉外观的图形。

图片图标继续使用当前 `FloatingWindow` 支持的 image descriptor；它与内置语义 ID 是两条不同的资源路径。不要为了“统一”把品牌 Logo 塞进 SF Symbol / Segoe glyph catalog。

## 与 App Tray 图标的区别

`opendesk.app.json` 中的 `tray.icons.windows` / `tray.icons.macos` 当前仍是 App package 内的文件路径，由 App Shell 校验 ICO / template PNG。它们属于产品/应用身份资源，不是 `FloatingWindow` semantic icon ID。

因此当前契约是：

```text
FloatingWindow 普通 UI 图标 -> Runtime built-in semantic icon ID
App Tray / 品牌图片          -> file-backed product/app asset
真正的功能内部二进制资源     -> compiled internal feature asset
```

资源 ownership 的架构约束见 [Icon & Product Asset Ownership](../architecture/icon-resource-ownership.md)。
