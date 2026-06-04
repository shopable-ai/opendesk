# 使用说明

## 运行使用
clawdesk.exe -script examples/notify.js
clawdesk.exe -script examples/notify.js -delay 1


## CLI 模式运行脚本文件
go run main.go -script examples/test.js -delay 1

go run main.go -script examples/page.js
go run main.go -script examples/mouse.js
go run main.go -script examples/keyboard.js
go run main.go -script examples/screenshot.js

go run main.go -script examples/http.js -delay 1
go run main.go -script examples/promise.js -delay 1
go run main.go -script examples/timer.js
go run main.go -script examples/sleep.js
go run main.go -script examples/notify.js
go run main.go -script examples/window.js -delay 2
go run main.go -script examples/window-more.js
go run main.go -script examples/clipboard.js
go run main.go -script examples/appStorage.js
go run main.go -script examples/screen.js
go run main.go -script examples/sound.js
go run main.go -script examples/file.js
go run main.go -script examples/os.js


go run main.go -script examples/clipboard.test.js

go run main.go -script examples/globalThis.js

go run main.go -script examples/imageColor.js
go run main.go -script examples/opencv.js


go run main.go -script examples/app/pinduoduo.js
go run main.go -script examples/app/qianniu.js

### libs
go run main.go -script examples/moment.js

go run main.go -script examples/start.js -timeout 0   # 无超时时限，默认 -timeout 30 分钟

go run main.go -http   # 启动 HTTP 服务器模式

go run main.go -script examples/test.txt -delay 1  # 后期未使用，可能无法使用

clawdesk.exe -script examples/app/qianniu.js

### 测试
clawdesk.exe -script examples/clipboard.test.js
go run main.go -script examples/clipboard.test.js
clawdesk.exe -script examples/opencv.js



C:/Users/111/Documents/workspace/clawdesk/clawdesk.exe -script C:/Users/111/Documents/workspace/clawdesk/examples/app/clickQianniuFloat.js


## 调试
直接代码运行。
> 发布环境，exe直接运行。把代码从默认的ts.config.js中提取出来，放到其他文件。 cmd 运行，如 clawdesk.exe -script qianniu.js  就可以看到报错信息。

## 构建

go build -o clawdesk.exe main.go

go build -ldflags="-s -w" -o clawdesk.exe main.go

## HTTP 服务器模式
旧版本,可能无法使用
go run main.go -http -port 8080

curl -X POST http://localhost:8080 -d '[
    {"action": "click", "params": {"x": 100, "y": 200}},
    {"action": "type", "params": {"text": "Hello, World!"}}
]'



## 代码说明
axios.go 被http.go 和axios.js 代替， 可以删除。
