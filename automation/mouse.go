package automation

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-vgo/robotgo"
)

type Mouse struct{}

func NewMouse() *Mouse {
	return &Mouse{}
}

func (m *Mouse) Click(x, y int, options interface{}) error {
	// fmt.Printf("Clicking at coordinates: x=%d, y=%d\n", x, y)

	// Initialize default options
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1, // 默认值为1
		Delay:      0,
	}

	// Parse options if provided
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			// 解析选项
			button, hasButton := optMap["button"]
			clickCount, hasClickCount := optMap["clickCount"]
			delay, hasDelay := optMap["delay"]

			// 如果未找到，尝试首字母大写的键
			if !hasButton {
				button, hasButton = optMap["Button"]
			}
			if !hasClickCount {
				clickCount, hasClickCount = optMap["ClickCount"]
			}
			if !hasDelay {
				delay, hasDelay = optMap["Delay"]
			}

			// 更新选项之前先打印解析到的值
			fmt.Printf("Parsing options: Button=%v, ClickCount=%v, Delay=%v\n",
				button, clickCount, delay)

			if hasButton {
				if buttonStr, ok := button.(string); ok {
					opts.Button = buttonStr
				}
			}
			if hasClickCount {
				switch v := clickCount.(type) {
				case int:
					opts.ClickCount = v
				case int64:
					opts.ClickCount = int(v)
					fmt.Printf("Converted from int64: %d\n", v)
				case float64:
					opts.ClickCount = int(v)
				case json.Number:
					if count, err := v.Int64(); err == nil {
						opts.ClickCount = int(count)
						fmt.Printf("Converted from json.Number: %d\n", count)
					}
				default:
					fmt.Printf("Unexpected clickCount type: %T\n", v)
				}
			}
			if hasDelay {
				switch v := delay.(type) {
				case int:
					opts.Delay = v
				case float64:
					opts.Delay = int(v)
				}
			}
		}
	}

	// Log the final options we'll use
	// fmt.Printf("Using options: Button=%s, ClickCount=%d, Delay=%d\n",
	// opts.Button, opts.ClickCount, opts.Delay)

	// Validate button type
	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	// Move to position
	if err := m.Move(x, y, nil); err != nil {
		return fmt.Errorf("failed to move mouse: %v", err)
	}

	// Handle single click case
	fmt.Printf("Performing click with button: %s\n", opts.Button)

	// Execute click

	// 点击指定次数
	for i := 0; i < opts.ClickCount; i++ {
		if err := m.Down(map[string]interface{}{"button": opts.Button}); err != nil {
			return err
		}

		if opts.Delay > 0 {
			time.Sleep(time.Duration(opts.Delay) * time.Millisecond)
		}

		if err := m.Up(map[string]interface{}{"button": opts.Button}); err != nil {
			return err
		}
	}

	return nil
}

// Move implements smooth mouse movement
func (m *Mouse) Move(x, y int, options interface{}) error {
	opts := MouseOptions{
		Steps: 1,
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if steps, ok := optMap["steps"].(int); ok {
				opts.Steps = steps
			}
		}
	}

	if opts.Steps > 1 {
		currentX, currentY := robotgo.GetMousePos()
		for step := 1; step <= opts.Steps; step++ {
			nextX := currentX + ((x - currentX) * step / opts.Steps)
			nextY := currentY + ((y - currentY) * step / opts.Steps)
			robotgo.MoveMouse(nextX, nextY)
			time.Sleep(time.Millisecond)
		}
	} else {
		robotgo.Move(x, y)
	}

	return nil
}

// Down implements mouse button down
func (m *Mouse) Down(options interface{}) error {
	opts := MouseOptions{
		Button: "left",
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	robotgo.Toggle(opts.Button, "down")
	return nil
}

// Up implements mouse button release
func (m *Mouse) Up(options interface{}) error {
	opts := MouseOptions{
		Button: "left",
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	robotgo.Toggle(opts.Button, "up")
	return nil
}

// GetPos returns the current mouse position with additional screen context
func (m *Mouse) GetPos() map[string]interface{} {
	x, y := robotgo.GetMousePos()

	return map[string]interface{}{
		"x": x,
		"y": y,
	}
}

func isValidButton(button string) bool {
	validButtons := map[string]bool{
		"left":   true,
		"right":  true,
		"middle": true,
	}
	return validButtons[button]
}

// MouseWheelOptions defines options for mouse wheel scrolling
type MouseWheelOptions struct {
	DeltaX int // 水平滚动距离
	DeltaY int // 垂直滚动距离
	Steps  int // 滚动的步数，用于实现平滑滚动
	Delay  int // 每步之间的延迟(毫秒)
}

func (m *Mouse) Wheel(options interface{}) error {
	// 默认选项
	opts := MouseWheelOptions{
		DeltaX: 0,
		DeltaY: 0,
		Steps:  1,
		Delay:  0,
	}

	// 解析选项
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if dy, ok := optMap["deltaY"].(int); ok {
				opts.DeltaY = dy
			} else if dy, ok := optMap["deltaY"].(float64); ok {
				opts.DeltaY = int(dy)
			}
			if dx, ok := optMap["deltaX"].(int); ok {
				opts.DeltaX = dx
			} else if dx, ok := optMap["deltaX"].(float64); ok {
				opts.DeltaX = int(dx)
			}
			if steps, ok := optMap["steps"].(int); ok {
				opts.Steps = steps
			} else if steps, ok := optMap["steps"].(float64); ok {
				opts.Steps = int(steps)
			}
			if delay, ok := optMap["delay"].(int); ok {
				opts.Delay = delay
			} else if delay, ok := optMap["delay"].(float64); ok {
				opts.Delay = int(delay)
			}
		}
	}

	if opts.Steps <= 0 {
		opts.Steps = 1
	}

	stepDeltaX := opts.DeltaX / opts.Steps
	stepDeltaY := opts.DeltaY / opts.Steps
	remainX := opts.DeltaX % opts.Steps
	remainY := opts.DeltaY % opts.Steps

	for i := 0; i < opts.Steps; i++ {
		dx := stepDeltaX
		dy := stepDeltaY
		if i == opts.Steps-1 {
			dx += remainX
			dy += remainY
		}
		if dx != 0 || dy != 0 {
			robotgo.ScrollRelative(dx, dy)
		}
		if opts.Delay > 0 {
			time.Sleep(time.Duration(opts.Delay) * time.Millisecond)
		}
	}

	return nil
}
