---
title: AppStorage
description: OpenDesk 脚本内置的轻量持久化键值存储。
order: 8
---

# AppStorage

`AppStorage` 是运行时注入的轻量持久化键值存储，适合保存脚本状态、偏好和小型 checkpoint。

**状态：Secondary / Native**

它不是数据库，也不适合存储大型二进制数据或高并发事务数据。

## 方法总表

| 方法 | 用途 |
| --- | --- |
| `AppStorage.getItem(key)` | 读取字符串值 |
| `AppStorage.setItem(key, value)` | 写入值 |
| `AppStorage.removeItem(key)` | 删除键 |
| `AppStorage.clear()` | 清空当前存储 |
| `AppStorage.getLength()` | 键数量 |
| `AppStorage.key(index)` | 按索引取键名 |

## 基本使用

```js
AppStorage.setItem('lastTask', 'wechat-send');

const value = AppStorage.getItem('lastTask');
console.log(value);
```

不存在的 key 返回空字符串。

## setItem(key, value)

`value` 最终以字符串形式持久化。

```js
AppStorage.setItem('retryCount', 3);
AppStorage.setItem('enabled', true);
```

读取时仍是字符串语义；需要数字/布尔值时由脚本显式转换。

## removeItem(key)

```js
AppStorage.removeItem('retryCount');
```

## clear()

```js
AppStorage.clear();
```

会清空当前 AppStorage 命名空间。

## getLength() / key(index)

```js
const count = AppStorage.getLength();

for (let i = 0; i < count; i++) {
  const key = AppStorage.key(i);
  console.log(key, AppStorage.getItem(key));
}
```

注意：底层 map 的键顺序不应被视为稳定排序，因此不要把 `key(index)` 当成持久化顺序 API。

## 存储位置与旧数据迁移

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

## 适合保存什么

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
