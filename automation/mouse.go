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

// Click 实现鼠标点击
func (m *Mouse) click(x, y int, options ...MouseOptions) error {
	fmt.Println("click", x, y)
	// 设置默认值
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
		Delay:      0,
	}

	// 使用提供的选项覆盖默认值
	if len(options) > 0 {
		if options[0].Button != "" {
			opts.Button = options[0].Button
		}
		if options[0].ClickCount > 0 {
			opts.ClickCount = options[0].ClickCount
		}
		if options[0].Delay > 0 {
			opts.Delay = options[0].Delay
		}
	}

	// 移动到指定位置
	if err := m.move(x, y, MouseOptions{}); err != nil {
		return err
	}

	// 点击指定次数
	for i := 0; i < opts.ClickCount; i++ {
		if err := m.down(MouseOptions{Button: opts.Button}); err != nil {
			return err
		}

		if opts.Delay > 0 {
			time.Sleep(time.Duration(opts.Delay) * time.Millisecond)
		}

		if err := m.up(MouseOptions{Button: opts.Button}); err != nil {
			return err
		}
	}

	return nil
}

// Down 实现鼠标按下
func (m *Mouse) down(options ...MouseOptions) error {
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
	}

	if len(options) > 0 {
		if options[0].Button != "" {
			opts.Button = options[0].Button
		}
		if options[0].ClickCount > 0 {
			opts.ClickCount = options[0].ClickCount
		}
	}

	robotgo.Toggle(opts.Button, "down")
	return nil
}

// Move 实现鼠标移动
func (m *Mouse) move(x, y int, options ...MouseOptions) error {
	opts := MouseOptions{
		Steps: 1,
	}

	if len(options) > 0 && options[0].Steps > 0 {
		opts.Steps = options[0].Steps
	}

	// 如果 steps > 1，实现平滑移动
	if opts.Steps > 1 {
		currentX, currentY := robotgo.GetMousePos()

		for step := 1; step <= opts.Steps; step++ {
			nextX := currentX + ((x - currentX) * step / opts.Steps)
			nextY := currentY + ((y - currentY) * step / opts.Steps)

			robotgo.MoveMouse(nextX, nextY)
			time.Sleep(time.Millisecond) // 添加小延迟使移动更平滑
		}
	} else {
		robotgo.MoveMouse(x, y)
	}

	return nil
}

// Up 实现鼠标释放
func (m *Mouse) up(options ...MouseOptions) error {
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1,
	}

	if len(options) > 0 {
		if options[0].Button != "" {
			opts.Button = options[0].Button
		}
		if options[0].ClickCount > 0 {
			opts.ClickCount = options[0].ClickCount
		}
	}

	robotgo.Toggle(opts.Button, "up")
	return nil
}
