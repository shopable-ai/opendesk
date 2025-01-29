# 使用说明

## 运行使用
testMonkey.exe -script examples/test_http.js -delay 1


## CLI 模式运行脚本文件
go run main.go -script examples/test.js -delay 1

go run main.go -script examples/test_http.js -delay 1
go run main.go -script examples/promise.js -delay 1
go run main.go -script examples/test_timer.js
go run main.go -script examples/test_sleep.js

go run main.go -script examples/test.txt -delay 1


## 构建

go build -o testMonkey.exe main.go

go build -ldflags="-s -w" -o testMonkey.exe main.go

## HTTP 服务器模式
旧版本,可能无法使用
go run main.go -http -port 8080

curl -X POST http://localhost:8080 -d '[
    {"action": "click", "params": {"x": 100, "y": 200}},
    {"action": "type", "params": {"text": "Hello, World!"}}
]'
