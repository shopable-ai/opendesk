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

func (k *Keyboard) Type(text string) error {
	if text == "" {
		return fmt.Errorf("input text cannot be empty")
	}
	robotgo.TypeStr(text)
	time.Sleep(100 * time.Millisecond)
	return nil
}

func (k *Keyboard) Press(key string) error {
	if key == "" {
		return fmt.Errorf("key cannot be empty")
	}
	robotgo.KeyTap(key)
	time.Sleep(50 * time.Millisecond)
	return nil
}
