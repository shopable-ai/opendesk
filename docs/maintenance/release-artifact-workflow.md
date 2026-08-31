# 发布物与 Git 版本管理流程

## 目标

Git 保存可审查、可复现的源码和小型稳定测试资产；发布后的安装包、二进制和工具链压缩包不进入 Git 历史。Git tag 标记某一次源码提交，不是大型文件的归档目录。

## 归属规则

| 内容 | 位置 | 是否提交 Git |
| --- | --- | --- |
| 源码、构建脚本、配置模板 | 项目源码目录 | 是 |
| 稳定、可复用的测试 fixture | 对应的 `test*/**/fixtures` 或 `tests/**/fixtures` | 是，控制体积 |
| fixture 生成结果、截图、运行日志 | `.runtime/` | 否 |
| 外部源码快照和下载缓存 | `.runtime/cache/external/` | 否 |
| 来源、版本、许可证、SHA-256 | `docs/research/external/` 或发布清单 | 是 |
| macOS/Windows/Linux 发布包 | Release Assets、制品库或对象存储 | 否 |

## 正常发布流程

1. 提交源码、构建脚本和发布清单，确认测试通过。
2. 创建带注释的 tag，例如 `v1.2.0`。tag 指向该次提交的源码快照。
3. 用同一个版本号构建各平台产物，并上传到 Release Assets 或制品库。
4. 在发布清单中记录平台、下载地址、文件大小和 SHA-256；下载包不复制回仓库。
5. 后续修复进入新提交和新 tag；不要在旧 tag 中追加或替换文件。

示意关系：

```text
v1.2.0 ──> Git commit ──> 源码、脚本、稳定 fixture
                     └──> Release Assets: macOS.zip / Windows.exe / toolchain.7z
```

## 本仓库的具体约定

- `temp/*.7z`、根目录 `*.7z`、`testMonkey.exe` 和生成的 `.app` 均视为可重建发布物，不恢复到 Git。
- 本地确实需要的构建包可放在 `.runtime/cache/`；缺失时从来源重新下载，不从 Git 历史恢复。
- `dist/` 可以作为本机短期构建缓存保留，但必须可删除、可重建，不能作为测试 fixture 或正式源码依赖。
- 历史大文件若已进入 Git，单纯删除当前文件或添加 `.gitignore` 不会缩小仓库；必须在所有需要保留的分支和 tag 上做历史清理，并同步远程。

