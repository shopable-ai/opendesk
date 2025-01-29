

# CLI 模式运行脚本文件
go run main.go -script examples/test.js -delay 1

go run main.go -script examples/test.txt -delay 1


# HTTP 服务器模式
go run main.go -http -port 8080

curl -X POST http://localhost:8080 -d '[
    {"action": "click", "params": {"x": 100, "y": 200}},
    {"action": "type", "params": {"text": "Hello, World!"}}
]'
