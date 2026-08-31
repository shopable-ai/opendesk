# HTML Mirror Prompt

用途：根据 `detect/regions.json` 生成第一版 HTML/CSS 镜像布局。

## 输入

- screenshot metadata
- regions 数组（id / role / bbox / avgColor / ocrText / confidence）
- 可选 role rules

## 输出要求

1. 必须输出 `index.html` 与 `styles.css`
2. 以绝对布局或 CSS Grid 还原块级结构
3. 第一轮只恢复：
   - 主区域边界
   - 主背景色
   - OCR 文本
4. 第一轮不要求：
   - 图标 1:1
   - 所有细节字体完全一致
5. 每个 region 节点都要带 `data-region-id`
6. 输出必须可被浏览器再次截图进入 compare

## 禁止事项

- 不要擅自发明不存在的 UI 元素
- 不要把多个 region 合并到无依据的大块中
- 不要只输出视觉描述，必须输出可运行 HTML/CSS
