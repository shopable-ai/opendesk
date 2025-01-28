package automation

import (
	"fmt"
	"time"

	"github.com/go-vgo/robotgo"
)

type Keyboard struct{}

func NewKeyboard() *Keyboard {
	return &Keyboard{}
}

func (k *Keyboard) Type(text string) chan error {
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

func (k *Keyboard) Press(key string) chan error {
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
