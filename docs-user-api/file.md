---
title: File API
description: File 对象提供面向脚本的文件系统读写、移动、复制、删除与路径处理能力。
order: 7
---

# File

File 是运行时注入的文件系统对象。

适用场景
- 读写脚本产物
- 保存截图、OCR 结果、调试日志
- 路径拼接与工作目录处理

工作目录规则
- File 维护一个 `workingDir`
- 相对路径会解析到当前工作目录
- 绝对路径会直接使用

## File：方法总表

| 方法 | 用途 |
| --- | --- |
| File.path(relativePath) | 获取绝对路径 |
| File.cwd() | 当前工作目录 |
| File.create(path) | 创建空文件 |
| File.createIfNotExists(path) | 不存在时创建 |
| File.createWithDirs(path) | 自动创建父目录后建文件 |
| File.exists(path) | 是否存在 |
| File.ensureDir(path) | 确保目录存在 |
| File.read(path) | 读取文本 |
| File.readBytes(path) | 读取字节 |
| File.write(path, text) | 写文本 |
| File.append(path, text) | 追加文本 |
| File.writeBytes(path, bytes) | 写字节 |
| File.appendBytes(path, bytes) | 追加字节 |
| File.copy(pathFrom, pathTo) | 复制文件 |
| File.renameWithoutExtension(path, newName) | 重命名但保留扩展名 |
| File.rename(path, newName) | 重命名 |
| File.move(path, newPath) | 移动 |
| File.getExtension(fileName) | 取扩展名 |
| File.getName(filePath) | 取文件名 |
| File.getNameWithoutExtension(filePath) | 取不带扩展名文件名 |
| File.remove(path) | 删除文件 |
| File.removeDir(path) | 删除目录 |
| File.listDir(path) | 列目录 |
| File.isFile(path) | 是否文件 |
| File.isDir(path) | 是否目录 |
| File.isEmptyDir(path) | 是否空目录 |
| File.getHumanReadableSize(bytes) | 人类可读大小 |
| File.getSimplifiedPath(path) | 路径规范化 |
| File.join(parent, ...children) | 拼路径 |
| File.open(path, mode) | 按模式打开文件 |

## File：常用方法

## File.cwd()

```js
console.log(File.cwd());
```

## File.path(relativePath)

```js
const abs = File.path('./.runtime/examples/out.txt');
console.log(abs);
```

## File.read(path)

```js
const text = File.read('./README.md');
console.log(text.slice(0, 200));
```

## File.write(path, text)

```js
File.write('./.runtime/examples/result.txt', 'hello world');
```

**注意**
- 当前实现不会自动创建父目录
- 若目录可能不存在，先用 `File.ensureDir()` 或 `File.createWithDirs()`

## File.append(path, text)

```js
File.append('./.runtime/examples/log.txt', 'line 1\n');
File.append('./.runtime/examples/log.txt', 'line 2\n');
```

## File.readBytes(path)

```js
const bytes = File.readBytes('./.runtime/examples/image.png');
console.log(bytes.length);
```

## File.writeBytes(path, bytes)

```js
const shot = await page.screenshot({ returnType: 'bytes' });
File.writeBytes('./.runtime/examples/shot.png', shot);
```

## File.ensureDir(path)

```js
File.ensureDir('./.runtime/examples/reports');
```

## File.exists(path)

```js
if (!File.exists('./.runtime/examples/result.json')) {
  console.log('missing');
}
```

## File.copy(pathFrom, pathTo)

```js
File.copy('./.runtime/examples/a.txt', './.runtime/examples/b.txt');
```

## File.move(path, newPath)

```js
File.move('./.runtime/examples/tmp.txt', './.runtime/examples/archive/tmp.txt');
```

## File.listDir(path)

```js
console.log(File.listDir('./artifacts'));
```

## File.isFile(path) / File.isDir(path)

```js
console.log(File.isFile('./README.md'));
console.log(File.isDir('./artifacts'));
```

## File.isEmptyDir(path)

```js
console.log(File.isEmptyDir('./.runtime/examples/empty-dir'));
```

## File.join(parent, ...children)

```js
const path = File.join('./artifacts', 'vision', 'result.json');
console.log(path);
```

## File.open(path, mode)

**签名**

```js
const file = File.open(path, mode)
```

**支持模式**
- r
- w
- a

**错误条件**
- 非法模式会报：`invalid file mode`

## File：实战示例

**示例 1：保存 OCR 结果**

```js
const result = Vision.runOCR({
  imagePath: './.runtime/examples/screen.png',
  provider: 'local'
});

File.ensureDir('./.runtime/examples/ocr');
File.write('./.runtime/examples/ocr/result.json', JSON.stringify(result, null, 2));
```

**示例 2：保存截图字节**

```js
File.ensureDir('./artifacts');
const bytes = await page.screenshot({ returnType: 'bytes' });
File.writeBytes('./.runtime/examples/capture.png', bytes);
```

**示例 3：安全生成输出目录**

```js
const dir = File.join('./artifacts', 'run-001');
File.ensureDir(dir);
File.write(File.join(dir, 'summary.txt'), 'done');
```

## File：注意事项

- `File.write()` 不会自动建父目录
- `File.move()` 底层直接使用 rename，跨设备移动时可能失败
- `File.open()` 返回的是底层文件句柄，脚本层通常更推荐直接用 read/write/append 系列方法
