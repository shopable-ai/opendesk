# macOS (arm64) gocv 构建环境指南

本文记录 `testMonkey-go` 在 macOS 上遇到的 `go build` 卡住/失败问题的处理流程，重点是 `gocv` 依赖链路。

## 适用环境

- 系统: macOS 14.x (Apple Silicon / arm64)
- Go: 1.23+（当前验证为 1.24.0）
- 项目依赖: `gocv.io/x/gocv v0.43.0`

## 问题现象

- `go build ./...` 长时间卡在依赖下载。
- 常见报错为 `proxy.golang.org ... i/o timeout`。
- `pkg-config --modversion opencv4` 不存在，导致 `gocv` 无法完成 cgo 编译。

## 一次性安装与配置

### 1) 配置 Go 模块代理（解决下载超时）

```bash
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOSUMDB=sum.golang.google.cn
go env GOPROXY GOSUMDB
```

### 2) 安装 OpenCV 与 pkg-config（gocv 必需）

如果默认 `brew install opencv` 网络慢，可临时切换 bottle 镜像：

```bash
HOMEBREW_NO_AUTO_UPDATE=1 \
HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles \
brew install pkgconf opencv
```

正常网络下也可直接：

```bash
brew install pkgconf opencv
```

## 安装后验证

### 1) 验证 OpenCV 被 pkg-config 识别

```bash
pkg-config --modversion opencv4
pkg-config --cflags --libs opencv4
```

预期应输出版本号（例如 `4.13.0`）以及一组 `-I/-L/-lopencv_*` 参数。

### 2) 最小 gocv 编译验证

```bash
cat >/tmp/check_gocv.go <<'EOF'
package main
import "gocv.io/x/gocv"
func main(){ _ = gocv.NewMat() }
EOF

go build -o /tmp/check_gocv_bin /tmp/check_gocv.go
file /tmp/check_gocv_bin
/tmp/check_gocv_bin
```

若能成功编译并运行，说明 `gocv + OpenCV` 环境链路已打通。

## 项目构建说明

执行：

```bash
go build ./...
```

若此时仍失败，优先区分是不是**代码跨平台问题**，而非环境问题。

当前仓库在 Darwin 下已发现的非环境错误：

- `automation/mouse.go` 中直接使用 `user32`（Windows API）
- 报错示例：
  - `automation/mouse.go:12:15: undefined: user32`
  - `automation/mouse.go:232:16: undefined: user32`

这类问题需要用 `go:build windows` + 非 windows stub 做平台隔离。

## 快速自检清单

- `go version` 为 arm64 架构
- `go env GOPROXY` 非 `proxy.golang.org` 单一路由
- `brew list --versions opencv pkgconf` 均已安装
- `pkg-config --modversion opencv4` 有版本输出
- 最小 `gocv` 示例可编译运行

## 仓库 OpenCV gate

从仓库根目录运行完整检查：

```bash
bash -o pipefail -c './scripts/check_opencv.sh 2>&1 | tee .runtime/tests/opencv/check-opencv.log'
```

该 gate 不是普通 Runtime API runner：它先验证 Go、`CGO_ENABLED=1`、`pkg-config`、GoCV
`v0.43.0` 和 OpenCV `4.13.x`，再执行 tagged native health check、tagged Go seam 和
OpenDesk JavaScript fixture。JS 运行日志固定写入 `.runtime/tests/opencv/js/`，总日志写入
`.runtime/tests/opencv/check-opencv.log`；`.runtime/` 中的日志不得提交。

失败应按首个明确诊断归类：缺 Go/CGO、缺 `pkg-config`、未发现 `opencv4`、GoCV/OpenCV
版本不匹配、tagged native health check 失败、tagged Go seam 失败，或 JavaScript fixture
失败。不能把工具链缺失记为 Runtime API PASS，也不能用未带 `opencv` tag 的普通 binary
替代该 gate。
