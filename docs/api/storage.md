---
title: AppStorage
description: OpenDesk 脚本内置的轻量持久化键值存储。
order: 360
docType: reference
---

# AppStorage

`AppStorage` 是运行时注入的轻量持久化键值存储，适合保存脚本状态、偏好和小型 checkpoint。

**状态：Secondary / Native**

它不是数据库，也不适合存储大型二进制数据或高并发事务数据。

需要参数化 SQL、行查询或原子 batch 时，可信本地脚本可使用独立的第一方
[SQLite Runtime API](sqlite.md)；它不会把 AppStorage 的 JSON 文件变成 SQLite 数据库。

## AppStorage：方法总表

| 方法 | 用途 |
| --- | --- |
| `AppStorage.getItem(key)` | 读取字符串值 |
| `AppStorage.setItem(key, value)` | 写入值 |
| `AppStorage.removeItem(key)` | 删除键 |
| `AppStorage.clear()` | 清空当前存储 |
| `AppStorage.getLength()` | 键数量 |
| `AppStorage.key(index)` | 按索引取键名 |

## 公共约定

所有方法同步返回，没有 timeout、AbortSignal 或后台等待。它是本进程加载的内存 map 与一个 JSON 文件，多个 execution 可能共享默认路径；不是 execution 隔离存储，也不提供跨进程事务、锁或原子替换。相对路径/workdir 不决定其存储位置。

写入先修改内存，再尝试序列化并覆盖磁盘文件。磁盘错误只写诊断，不作为方法返回/异常报告，因此 `undefined` 不能证明落盘成功。启动读取/解析失败时使用空 map；目录初始化失败则可能阻止 Runtime 初始化。需要可验证提交与结构化错误时使用 File JSON 或 SQLite。

## AppStorage.getItem(key)

**签名**

```ts
AppStorage.getItem(key: string): string
```

**参数**

`key` 为必填字符串，空键允许。

**返回值**

已保存字符串；不存在返回空字符串，无法区分“缺失”与“保存了空字符串”。

**行为与错误**

只读当前内存 snapshot，不重新读取其他进程刚改过的磁盘文件；不创建资源。

**示例**

```js
console.log(AppStorage.getItem('lastTask'));
```

## AppStorage.setItem(key, value)

**签名**

```ts
AppStorage.setItem(key: string, value: unknown): void
```

**参数**

`key` 与 `value` 必填；字符串保持原文，字节转文本，其他值使用 native 格式化，不等于 JSON.stringify。对象结构需调用方先显式 JSON.stringify。

**返回值**

`undefined`；写盘失败也可能返回此值，见公共约定。

**行为与错误**

替换同名键，并尝试保存整份 map。没有提交回执或冲突检测。

**示例**

```js
AppStorage.setItem('retryCount', 3); // 读取为 '3'
```

## AppStorage.removeItem(key)

**签名**

```ts
AppStorage.removeItem(key: string): void
```

**参数**

`key` 必填字符串。

**返回值**

`undefined`。

**行为与错误**

删除当前 map 的键，键不存在也成功；随后尝试保存，磁盘失败规则见公共约定。

**示例**

```js
AppStorage.removeItem('retryCount');
```

## AppStorage.clear()

**签名**

```ts
AppStorage.clear(): void
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

清空当前存储 map 的全部键并尝试保存，影响共用该默认存储的脚本；不是仅清理当前 execution。

**示例**

```js
// 仅在确实获准清空共用存储时执行。
AppStorage.clear();
```

## AppStorage.getLength()

**签名**

```ts
AppStorage.getLength(): number
```

**参数**

无。

**返回值**

当前 map 的非负键数量。

**行为与错误**

只读当前内存；不刷新磁盘。

**示例**

```js
console.log(AppStorage.getLength());
```

## AppStorage.key(index)

**签名**

```ts
AppStorage.key(index: number): string
```

**参数**

`index` 为从 0 开始的整数索引。

**返回值**

当前 map 的一个键；负数或不小于当前长度返回空字符串。

**行为与错误**

native map 每次遍历顺序可能变化；不能用相邻调用保证完整枚举，也不是持久化顺序 API。不改变存储。

**示例**

```js
const first = AppStorage.key(0);
console.log(first);
```

## AppStorage：存储位置与旧数据迁移

当前 OpenDesk 使用：

```text
~/.opendesk/opendesk/storage.json
```

运行时会按顺序对改名前的默认存储和更早的 TestMonkey 默认存储做一次 best-effort 兼容迁移：

```text
~/.clawdesk/clawdesk/storage.json
~/.testmonkey/testMonkey/storage.json
```

迁移规则：

- 新路径已经有文件时，不覆盖。
- 旧文件仍保留，不主动删除。
- 只有旧文件可读取且 JSON 有效时才复制到新位置。
- 迁移失败不会删除历史数据。

## AppStorage：适合保存什么

推荐：

- 上次执行过的任务名
- 用户选择
- 少量脚本配置
- 最后成功 checkpoint
- 小型 JSON 字符串

不推荐：

- 密码、token 等敏感凭据
- 大图片/视频
- 大型日志
- 需要事务一致性的业务数据
- 多进程并发写入依赖

敏感配置应使用更合适的系统密钥/凭据存储。
