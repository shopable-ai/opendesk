package main

import (
	"fmt"
	"log"
	"time"

	"opendesk/automation"
)

func main() {
	fmt.Println("程序将在5秒后开始运行...")
	time.Sleep(5 * time.Second)

	script := `[
        {
            "action": "click",
            "params": {
                "x": 500,
                "y": 500
            }
        },
        {
            "action": "type",
            "params": {
                "text": "Hello, World!"
            }
        }
    ]`

	runner := automation.NewRunner()
	if err := runner.ExecuteScript(script); err != nil {
		log.Fatal(err)
	}

	fmt.Println("测试完成!")
}
