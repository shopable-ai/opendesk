// main.go
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"./automation"
	"./server"
)

func main() {
	// 解析命令行参数
	scriptPath := flag.String("script", "", "Path to automation script")
	httpMode := flag.Bool("http", false, "Start HTTP server")
	port := flag.String("port", "8080", "HTTP server port")
	flag.Parse()

	if *httpMode {
		// 启动 HTTP 服务器
		server := server.NewServer()
		log.Printf("Starting HTTP server on port %s...\n", *port)
		log.Fatal(http.ListenAndServe(":"+*port, server))
	} else if *scriptPath != "" {
		// 执行自动化脚本
		script, err := os.ReadFile(*scriptPath)
		if err != nil {
			log.Fatal(err)
		}
		runner := automation.NewRunner()
		if err := runner.ExecuteScript(string(script)); err != nil {
			log.Fatal(err)
		}
	} else {
		fmt.Println("Please specify either -http or -script flag")
		flag.Usage()
		os.Exit(1)
	}
}

// automation/runner.go
