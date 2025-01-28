package automation

import (
	"time"

	"github.com/go-vgo/robotgo"
)

type Touchscreen struct{}

func NewTouchscreen() *Touchscreen {
	return &Touchscreen{}
}

func (t *Touchscreen) Tap(x, y int) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		// 模拟触摸屏点击
		robotgo.Move(x, y)           // 使用 robotgo.Move 替代 robotgo.MoveMouse
		robotgo.Click("left", false) // 使用 robotgo.Click 替代 robotgo.MouseClick
		time.Sleep(100 * time.Millisecond)
	}()
	return done
}
