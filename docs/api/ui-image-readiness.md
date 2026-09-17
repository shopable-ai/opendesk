---
title: Custom UI 图片就绪检查
description: 使用 ControlHandle.getState() 判断受限 HTML img 是否已经真实加载和解码。
order: 134
docType: guide
---

# Custom UI 图片就绪检查

本页是小写 `ui` 的图片使用 Guide。公开方法的 canonical Reference 仍是 [Custom UI](ui.md)，其中控件读取入口是 [ControlHandle.getState()](ui.md#controlhandlegetstate)。

不要把：

```js
await window.show();
```

解释成图片已经成功加载。`show()` 只证明 native window 已经进入可见状态；图片加载 / 解码是 `<img>` 自己的独立状态。

## 推荐流程

先取得 `img` control，然后读取真实 host/browser 状态：

```js
const image = window.control('promotionImage');

let state = null;
for (let i = 0; i < 80; i += 1) {
  state = await image.getState();
  if (state.imageComplete === true) break;
  await new Promise(resolve => setTimeout(resolve, 25));
}

if (!state || state.imageComplete !== true) {
  throw new Error('image readiness timeout');
}

if (!(state.imageNaturalWidth > 0) || !(state.imageNaturalHeight > 0)) {
  throw new Error('image load/decode failed');
}
```

对 `img` control，当前公开状态包含：

```text
source
imageComplete
imageNaturalWidth
imageNaturalHeight
```

含义：

- `source`：host 当前读取到的图片 source；
- `imageComplete`：浏览器/native HTML surface 是否已经结束本次图片加载尝试；
- `imageNaturalWidth` / `imageNaturalHeight`：成功解码后的 intrinsic dimensions；
- `imageComplete === true` 且 natural dimensions 为 `0`：加载或解码失败，不能当成已就绪图片。

## 更新图片后重新确认

对同一个 `img` 使用：

```js
await image.update({source: nextSource});
```

以后，重新调用 `getState()` 并确认：

```text
state.source === nextSource
imageComplete === true
imageNaturalWidth > 0
imageNaturalHeight > 0
```

不能因为 `update()` Promise resolve 就假设图片像素已经完成解码。

## 平台

- macOS：状态来自 WKWebView 中实际 `<img>` 元素；
- Windows：状态来自 WebView2 中实际 `<img>` 元素；
- Windows 没有 WebView2 Runtime 时，HTML Custom UI 创建会按既有能力合同失败；调用方应降级自身可选 UI，而不是阻塞核心业务。

## Runtime 验证

源码维护者可以运行：

```bash
./dist/opendesk -ui -script tests/runtime-api/custom-ui-image-readiness.js -console-mode script
```

成功输出包含：

```text
CUSTOM_UI_IMAGE_READINESS_OK=
```

该 JavaScript 测试是公共 Runtime 行为证据；Go 结构体或 host 白盒测试不能替代它。
