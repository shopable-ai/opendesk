package automation

import (
	"time"

	"github.com/go-vgo/robotgo"
)

type Touchscreen struct{}

func NewTouchscreen() *Touchscreen {
	return &Touchscreen{}
}

// Tap simulates a touchscreen tap event at the specified coordinates
func (t *Touchscreen) Tap(x, y int) error {
	// 生成 touchstart 事件
	robotgo.Move(x, y)
	robotgo.Toggle("left", "down")

	// 短暂延迟模拟触摸持续时间
	time.Sleep(50 * time.Millisecond)

	// 生成 touchend 事件
	robotgo.Toggle("left", "up")

	return nil
}
