package automation

import (
	"fmt"
	"time"

	"github.com/go-vgo/robotgo"
)

type Mouse struct{}

func NewMouse() *Mouse {
	return &Mouse{}
}

// Click 实现鼠标点击，接收单个options参数
func (m *Mouse) Click(x, y int, options interface{}) error {
	fmt.Println("click", x, y)
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
		Delay:      0,
	}

	// 如果提供了options，尝试从map中获取值
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
			if clickCount, ok := optMap["clickCount"].(int); ok {
				opts.ClickCount = clickCount
			}
			if delay, ok := optMap["delay"].(int); ok {
				opts.Delay = delay
			}
		}
	}

	// 移动到指定位置
	if err := m.Move(x, y, nil); err != nil {
		return err
	}

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

// Down 实现鼠标按下
func (m *Mouse) Down(options interface{}) error {
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	robotgo.Toggle(opts.Button, "down")
	return nil
}

// Move 实现鼠标移动
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

	// 如果 steps > 1，实现平滑移动
	if opts.Steps > 1 {
		currentX, currentY := robotgo.GetMousePos()

		for step := 1; step <= opts.Steps; step++ {
			nextX := currentX + ((x - currentX) * step / opts.Steps)
			nextY := currentY + ((y - currentY) * step / opts.Steps)

			robotgo.MoveMouse(nextX, nextY)
			time.Sleep(time.Millisecond)
		}
	} else {
		robotgo.MoveMouse(x, y)
	}

	return nil
}

// Up 实现鼠标释放
func (m *Mouse) Up(options interface{}) error {
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	robotgo.Toggle(opts.Button, "up")
	return nil
}
