//go:build !darwin

package automation

import "github.com/go-vgo/robotgo"

func typeText(text string) error {
	robotgo.TypeStr(text)
	return nil
}

func typeTextForPID(_ int, text string) error {
	return typeText(text)
}
