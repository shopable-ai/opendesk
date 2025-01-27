package automation

import (
	"fmt"
	"time"

	"github.com/go-vgo/robotgo"
)

type Page struct {
	currentX int
	currentY int
}

func NewPage() *Page {
	return &Page{}
}

func (p *Page) Click(x, y int) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		if err := p.moveMouseSafely(x, y); err != nil {
			done <- err
			return
		}
		robotgo.MouseClick()
		p.currentX = x
		p.currentY = y
		time.Sleep(100 * time.Millisecond)
	}()
	return done
}

func (p *Page) Type(text string) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		if text == "" {
			done <- fmt.Errorf("输入文本不能为空")
			return
		}
		robotgo.TypeStr(text)
		time.Sleep(100 * time.Millisecond)
	}()
	return done
}

func (p *Page) Press(key string) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		if key == "" {
			done <- fmt.Errorf("按键不能为空")
			return
		}
		robotgo.KeyTap(key)
		time.Sleep(50 * time.Millisecond)
	}()
	return done
}

func (p *Page) Screenshot(filename string, x, y, width, height int) chan error {
	done := make(chan error)
	go func() {
		defer close(done)
		if filename == "" {
			done <- fmt.Errorf("文件名不能为空")
			return
		}

		if x == 0 && y == 0 && width == 0 && height == 0 {
			// 截取全屏
			err := robotgo.SaveCapture(filename)
			if err != nil {
				done <- fmt.Errorf("截图失败: %v", err)
				return
			}
		} else {
			// 截取指定区域
			err := robotgo.SaveCapture(filename, x, y, width, height)
			if err != nil {
				done <- fmt.Errorf("截取指定区域失败: %v", err)
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}()
	return done
}

func (p *Page) moveMouseSafely(x, y int) error {
	screenWidth, screenHeight := robotgo.GetScreenSize()
	if x < 0 || x > screenWidth || y < 0 || y > screenHeight {
		return fmt.Errorf("鼠标坐标 (%d, %d) 超出屏幕范围 (%d, %d)", x, y, screenWidth, screenHeight)
	}
	robotgo.MoveMouse(x, y)
	return nil
}
