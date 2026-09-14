//go:build windows

package localization

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const localeNameMaxLength = 85

var getUserDefaultLocaleName = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultLocaleName")

func detectSystemLocale() (string, error) {
	buffer := make([]uint16, localeNameMaxLength)
	result, _, callErr := getUserDefaultLocaleName.Call(
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)
	if result == 0 {
		if callErr == nil || callErr == syscall.Errno(0) {
			callErr = syscall.EINVAL
		}
		return "", fmt.Errorf("GetUserDefaultLocaleName: %w", callErr)
	}
	locale := windows.UTF16ToString(buffer)
	if locale == "" {
		return "", fmt.Errorf("GetUserDefaultLocaleName returned an empty locale")
	}
	return locale, nil
}
