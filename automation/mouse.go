package automation

import (
	"time"

	"github.com/go-vgo/robotgo"
)

type Mouse struct{}

func NewMouse() *Mouse {
	return &Mouse{}
}

func (m *Mouse) Move(x, y int, options ...map[string]interface{}) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		steps := 1
		if len(options) > 0 {
			if s, ok := options[0]["steps"].(int); ok {
				steps = s
			}
		}
		for i := 0; i < steps; i++ {
			robotgo.Move(x, y) // 使用 robotgo.Move 替代 robotgo.MoveMouse
		}
	}()
	return done
}

func (m *Mouse) Click(x, y int, options ...map[string]interface{}) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		button := "left"
		clickCount := 1
		delay := 0
		if len(options) > 0 {
			if b, ok := options[0]["button"].(string); ok {
				button = b
			}
			if c, ok := options[0]["clickCount"].(int); ok {
				clickCount = c
			}
			if d, ok := options[0]["delay"].(int); ok {
				delay = d
			}
		}
		m.Move(x, y).Wait()
		for i := 0; i < clickCount; i++ {
			robotgo.Click(button, false) // 使用 robotgo.Click 替代 robotgo.MouseClick
			time.Sleep(time.Duration(delay) * time.Millisecond)
		}
	}()
	return done
}

func (m *Mouse) Down(options ...map[string]interface{}) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		button := "left"
		if len(options) > 0 {
			if b, ok := options[0]["button"].(string); ok {
				button = b
			}
		}
		robotgo.Toggle(button, "down") // 使用 robotgo.Toggle 替代 robotgo.MouseToggle
	}()
	return done
}

func (m *Mouse) Up(options ...map[string]interface{}) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		button := "left"
		if len(options) > 0 {
			if b, ok := options[0]["button"].(string); ok {
				button = b
			}
		}
		robotgo.Toggle(button, "up") // 使用 robotgo.Toggle 替代 robotgo.MouseToggle
	}()
	return done
}
