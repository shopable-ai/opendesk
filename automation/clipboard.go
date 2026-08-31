package automation

import (
	"fmt"
	"log"
	"time"

	"github.com/atotto/clipboard"
)

// Clipboard provides methods to interact with the system clipboard
type Clipboard struct{}

// NewClipboard creates a new Clipboard instance
func NewClipboard() *Clipboard {
	return &Clipboard{}
}

// Copy writes the given text to the system clipboard with retry mechanism
func (c *Clipboard) Copy(text string) error {
	// 检查是否为空字符串
	if text == "" {
		log.Printf("警告: 尝试复制空字符串到剪贴板，将使用单个空格代替")
		text = " " // 使用单个空格代替空字符串
	}

	// Prefer the platform implementation when available. On macOS the generic
	// pbcopy/pbpaste helper can report success while decoding non-ASCII text with
	// replacement characters under a non-UTF-8 process locale.
	if fallbackErr := platformClipboardWriteFallback(text); fallbackErr == nil {
		time.Sleep(80 * time.Millisecond)
		readText, readErr := platformClipboardReadFallback()
		if readErr == nil && readText == text {
			return nil
		}
	}

	var err error
	maxRetries := 5
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("Clipboard copy attempt %d: %d bytes", attempt, len(text))
		err = clipboard.WriteAll(text)
		if err == nil {
			// Verify copy success
			time.Sleep(50 * time.Millisecond) // Give OS time to update clipboard
			readText, readErr := clipboard.ReadAll()
			if readErr == nil && readText == text {
				return nil
			}
		}

		// Wait longer between retries
		if attempt < maxRetries {
			time.Sleep(200 * time.Millisecond * time.Duration(attempt))
		}
	}

	log.Printf("Clipboard copy fallback: native implementation")
	if fallbackErr := platformClipboardWriteFallback(text); fallbackErr == nil {
		time.Sleep(80 * time.Millisecond)
		readText, readErr := platformClipboardReadFallback()
		if readErr == nil && readText == text {
			return nil
		}
		if readErr != nil {
			return fmt.Errorf("clipboard fallback write succeeded but read verification failed: %v", readErr)
		}
		return fmt.Errorf("clipboard fallback verification mismatch: want=%q got=%q", text, readText)
	} else if err == nil {
		err = fallbackErr
	}

	return fmt.Errorf("failed to copy to clipboard after %d attempts: %v", maxRetries, err)
}

// Paste gets the current content from the system clipboard with retry mechanism
func (c *Clipboard) Paste() (string, error) {
	if fallbackText, fallbackErr := platformClipboardReadFallback(); fallbackErr == nil {
		return fallbackText, nil
	}

	var text string
	var err error
	maxRetries := 5

	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("Clipboard paste attempt %d", attempt)
		text, err = clipboard.ReadAll()
		if err == nil {
			return text, nil
		}

		// Wait longer between retries
		if attempt < maxRetries {
			time.Sleep(200 * time.Millisecond * time.Duration(attempt))
		}
	}

	log.Printf("Clipboard paste fallback: native implementation")
	if fallbackText, fallbackErr := platformClipboardReadFallback(); fallbackErr == nil {
		return fallbackText, nil
	} else if err == nil {
		err = fallbackErr
	}

	return "", fmt.Errorf("failed to read clipboard after %d attempts: %v", maxRetries, err)
}

// Clear empties the clipboard with retry mechanism
func (c *Clipboard) Clear() error {
	// 使用一个空格而不是空字符串
	return c.Copy(" ")
}
