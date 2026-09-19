---
title: JS Libraries
description: Runtime 默认预加载的第三方 JS 库；Agent 按库级能力发现，不复制第三方完整 API。
order: 400
---

# jslibs

`jslibs/` 顶层目录中的 `.js` 文件会在 polyfills 之后按文件名排序自动加载到每次 Runtime。
它们是 OpenDesk 随 Runtime 分发的第三方库，不是通过 `import` / `require` 动态安装的 npm 包。

## Agent 读取规则

能力发现要区分三层：

- JavaScript 标准能力：先看 [JavaScript Runtime](runtime.md#javascript-语言基线)，不为标准语言能力发明 OpenDesk API。
- Runtime bundled libraries：先看本页的**库名、版本/固定身份、全局入口、用途和默认加载状态**；不默认展开第三方完整 API。
- OpenDesk Runtime API：从 [Agent API 阅读入口](agent/README.md) 进入方法目录，再读取选中方法的 canonical contract。

第三方库的常见稳定能力可以基于这里固定的版本和代表性示例使用；如果行为依赖冷门选项、版本差异、
安全边界或精确返回形状，再定向核对对应上游文档或 Runtime 测试。第三方方法不会因为被 bundled 就自动获得
OpenDesk 的取消、权限、业务副作用或生命周期语义。

## 库总表

| 库 | Runtime 入口 | 版本 / 固定身份 | 默认加载 | 主要用途 |
| --- | --- | --- | --- | --- |
| Lodash | `_` | 4.17.21 | 是 | 数组、集合、对象与函数工具 |
| YAML / js-yaml | `YAML` | 5.4.1 | 是 | YAML 解析与序列化 |
| CSV / Papa Parse | `CSV` | 5.7.0 | 是 | CSV 解析与生成 |
| query-string | `queryString` | 仓库固定快照 | 是 | URL query 解析与拼接 |
| Moment | `moment` | 2.18.1 | 是 | 日期时间处理；现有 Recipe 兼容 |
| Cheerio | `cheerio` | 仓库固定快照 | 是 | HTML 解析与节点查询 |
| js-beautify | `window.js_beautify` | 1.14.9 | 是 | JavaScript 文本格式化 |

“仓库固定快照”表示当前 bundled 文件自身没有可可靠读取的 semver；不要从文件名或模型记忆猜版本。
此时该仓库文件本身是构建身份。升级时应先补版本/来源证据，再改本表。

## Lodash

- Runtime 入口：`_`
- 版本：4.17.21
- 来源：`jslibs/lodash.min.js`
- 类型：第三方 bundled library

适合数组/集合整理、对象处理、分组排序、去重和函数控制。无需 `import` / `require`。

```js
const shallow = _.flatten([[1, 2], [3, 4]]);
const deep = _.flattenDeep([1, [2, [3, [4]]]]);
const depth2 = _.flattenDepth([1, [2, [3, [4]]]], 2);
const unique = _.uniq([1, 1, 2, 3]);
```

OpenDesk 不复制 Lodash 数百个方法到 Agent 方法目录；例如 `groupBy`、`sortBy`、`pick`、`omit`、
`isEqual`、`debounce` 等仍按 Lodash 4.17.21 的上游语义使用。

## YAML

- Runtime 入口：`YAML`
- 上游：js-yaml 5.4.1
- 来源：`jslibs/js-yaml-5.4.1.opendesk.js`
- 许可证：`jslibs/licenses/js-yaml-5.4.1-LICENSE.txt`
- 默认加载：是

OpenDesk 只对上游 minified ESM 分发做薄适配：保持解析/序列化主体不变，移除最终 ESM export，
在隔离作用域中暴露 `YAML`，避免第三方内部短变量污染 Runtime global。

稳定入口：

```js
const value = YAML.parse('name: OpenDesk\ncount: 2\n');
const text = YAML.stringify({ name: 'OpenDesk', count: 2 });
```

兼容入口 `YAML.load` / `YAML.dump` 也保留，分别与 `parse` / `stringify` 指向同一上游能力。
可运行示例：[examples/runtime/yaml.js](../../examples/runtime/yaml.js)，会执行 parse → stringify → parse 自校验并输出 `YAML_EXAMPLE_OK`。
复杂 schema、tag、merge 或安全敏感输入不要只根据模型记忆猜选项，应按固定版本核对上游文档并设置业务输入边界。

## CSV

- 推荐 Runtime 入口：`CSV`
- 上游：Papa Parse 5.7.0
- 上游 global：`Papa`
- 来源：`jslibs/papaparse-5.7.0.min.js`
- 许可证：`jslibs/licenses/PapaParse-5.7.0-LICENSE.txt`
- 默认加载：是

OpenDesk 的 `CSV` 只是一个很薄的稳定 facade：`parse` 委托 `Papa.parse`，
`stringify` / `unparse` 委托 `Papa.unparse`。高级 Papa Parse 能力仍属于上游库，不在 OpenDesk 目录展开。

```js
const parsed = CSV.parse('name,count\nA,1\nB,2', {
  header: true,
  dynamicTyping: true
});
console.log(parsed.data);

const text = CSV.stringify([
  { name: 'A', count: 1 },
  { name: 'B', count: 2 }
]);
```

可运行示例：[examples/runtime/csv.js](../../examples/runtime/csv.js)，会执行 parse → stringify → parse 自校验并输出 `CSV_EXAMPLE_OK`。

CSV 作为外部业务交换格式时，还需要由 Recipe 自己决定字段 schema、编码、公式注入防护、空值和失败数据处理；
“解析成功”不等于业务数据已经验证。

## queryString

- Runtime 入口：`queryString`
- 来源：`jslibs/query-string.min.js`
- 版本：仓库固定快照

```js
const parsed = queryString.parse('a=1&b=hello');
const text = queryString.stringify({ q: 'test', page: 2 });
```

## Moment

- Runtime 入口：`moment`
- 版本：2.18.1
- 来源：`jslibs/moment.min.js`

```js
console.log(moment().format('YYYY-MM-DD HH:mm:ss'));
console.log(moment().add(1, 'day').format('YYYY-MM-DD'));
```

Moment 当前作为既有 Recipe 的兼容能力保留。不要为了“现代化”再同时默认加载 Day.js 等功能重叠库；
若以后迁移日期能力，应单独定义兼容与迁移策略。

## Cheerio

- Runtime 入口：`cheerio`
- 来源：`jslibs/cheerio.js`
- 版本：仓库固定快照

```js
const $ = cheerio.load('<div><a href="/x">hello</a></div>');
console.log($('a').text());
console.log($('a').attr('href'));
```

适合配合 `axios` / `http` 获取 HTML 后做结构化解析；网络授权、响应可信度与业务校验仍按网络能力合同处理。

## js-beautify

- Runtime 入口：`window.js_beautify`
- 版本：1.14.9
- 来源：`jslibs/beautify1.14.9.js`

```js
const ugly = 'function x(){console.log(1)}';
console.log(window.js_beautify(ugly));
```

## 默认库准入原则

新的默认 bundled library 同时满足以下条件才进入 `jslibs/`：

- 跨业务高频，能明显减少 Recipe 重复实现；
- 纯 JavaScript、可离线分发，许可证和来源可审计；
- 与现有标准能力 / bundled library 不大面积重复；
- 体积和初始化成本合理，因为它会进入每次 Runtime；
- 固定版本通过安全与 Runtime smoke / contract 测试；
- Agent 只需要库级能力卡，不要求把完整第三方 API 转录进 OpenDesk 文档。

因此当前不默认增加 Ajv、semver、glob/minimatch、Day.js 等库。JSON Schema、版本比较、文件 glob 等在真实跨场景需求
足够稳定后再决定是 optional module、OpenDesk API 还是新的 bundled library。

`retry`、`waitUntil`、`withTimeout`、`mapLimit` 也不应仅靠随意加入第三方库解决：其中重试、取消和并发
会直接影响桌面副作用与 Execution 生命周期，若正式提供，应由 OpenDesk 明确定义语义。

## 注入自检

需要诊断 bundled library 是否成功注入时，可以运行：

```js
console.log(_.VERSION);
console.log(YAML.VERSION);
console.log(CSV.VERSION);
console.log(typeof queryString);
console.log(moment.version);
console.log(typeof cheerio);
console.log(typeof window.js_beautify);
```

这类自检只证明当前 Runtime 暴露了入口，不证明某个业务任务已经授权、执行或验证成功。
