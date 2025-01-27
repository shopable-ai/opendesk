// main.go
package main

import (
	"flag"
	"fmt"
	"os"
	"testMonkey-go/automation" // 使用模块名而不是相对路径
	"time"
)

func main() {
	scriptPath := flag.String("script", "", "脚本文件路径")
	delay := flag.Int("delay", 3, "开始前等待时间(秒)")
	flag.Parse()

	if *scriptPath == "" {
		fmt.Println("请指定脚本文件路径: -script path/to/script.txt")
		return
	}

	// 读取脚本文件
	content, err := os.ReadFile(*scriptPath)
	if err != nil {
		fmt.Printf("读取脚本文件失败: %v\n", err)
		return
	}

	fmt.Printf("程序将在 %d 秒后开始运行...\n", *delay)
	time.Sleep(time.Duration(*delay) * time.Second)

	if err := automation.RunScript(string(content)); err != nil {
		fmt.Printf("脚本执行失败: %v\n", err)
		return
	}

	fmt.Println("脚本执行完成!")
}
