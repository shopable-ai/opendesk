package automation

import (
	"encoding/json"
	"fmt"

	"github.com/go-vgo/robotgo"
)

type Command struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

type Runner struct {
	// 可以添加配置或状态
}

func NewRunner() *Runner {
	return &Runner{}
}

func (r *Runner) ExecuteScript(script string) error {
	var commands []Command
	if err := json.Unmarshal([]byte(script), &commands); err != nil {
		return fmt.Errorf("failed to parse script: %v", err)
	}

	for _, cmd := range commands {
		if err := r.executeCommand(cmd); err != nil {
			return err
		}
	}
	return nil
}

func (r *Runner) executeCommand(cmd Command) error {
	switch cmd.Action {
	case "click":
		x := int(cmd.Params["x"].(float64))
		y := int(cmd.Params["y"].(float64))
		robotgo.MoveMouse(x, y)
		robotgo.MouseClick()

	case "type":
		text := cmd.Params["text"].(string)
		robotgo.TypeStr(text)

	default:
		return fmt.Errorf("unknown action: %s", cmd.Action)
	}
	return nil
}
