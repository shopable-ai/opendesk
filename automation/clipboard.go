package automation

import (
	"fmt"
	"log"
	"time"

	"github.com/atotto/clipboard"
)

// Clipboard provides methods to interact with the system clipboard
type Clipboard struct {
	backend ClipboardBackend
}

// NewClipboard creates a new Clipboard instance
func NewClipboard() *Clipboard {
	return newClipboardWithBackend(newDefaultClipboardBackend())
}

// Copy writes the given text to the system clipboard with retry mechanism
func (c *Clipboard) Copy(text string) error {
	if c != nil && c.backend != nil && c.backend.Supported() {
		if _, err := c.Write(ClipboardPayload{Text: &text}); err != nil {
			return err
		}
		readback, err := c.backend.ReadData(ClipboardFormatText)
		if err != nil || string(readback) != text {
			return clipboardOperationError("clipboard.copy", ClipboardVerificationFailed, "text clipboard readback did not match the requested byte length", err)
		}
		return nil
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
		return fmt.Errorf("clipboard fallback verification mismatch: requestedBytes=%d readBytes=%d", len(text), len(readText))
	} else if err == nil {
		err = fallbackErr
	}

	return fmt.Errorf("failed to copy to clipboard after %d attempts: %v", maxRetries, err)
}

// Paste gets the current content from the system clipboard with retry mechanism
func (c *Clipboard) Paste() (string, error) {
	if c != nil && c.backend != nil && c.backend.Supported() {
		formats, err := c.GetFormats()
		if err != nil {
			return "", err
		}
		if !containsString(formats, ClipboardFormatText) {
			return "", nil
		}
		data, err := c.backend.ReadData(ClipboardFormatText)
		if err != nil {
			return "", err
		}
		return string(data), nil
	}
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
	if c != nil && c.backend != nil && c.backend.Supported() {
		if _, err := c.backend.Clear(); err != nil {
			return err
		}
		formats, err := c.GetFormats()
		if err != nil {
			return err
		}
		if len(formats) != 0 {
			return clipboardOperationError("clipboard.clear", ClipboardVerificationFailed, "clipboard still advertises supported formats after clear", nil)
		}
		return nil
	}
	if err := clipboard.WriteAll(""); err != nil {
		return fmt.Errorf("failed to clear clipboard: %v", err)
	}
	return nil
}
