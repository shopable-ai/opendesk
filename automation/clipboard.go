package automation

import (
	"fmt"

	"github.com/atotto/clipboard"
)

// Clipboard provides methods for interacting with the system clipboard
type Clipboard struct{}

// NewClipboard creates a new Clipboard instance
func NewClipboard() *Clipboard {
	return &Clipboard{}
}

// Copy writes the given text to the system clipboard
func (c *Clipboard) Copy(text string) error {
	if text == "" {
		return fmt.Errorf("cannot copy empty text to clipboard")
	}

	err := clipboard.WriteAll(text)
	if err != nil {
		return fmt.Errorf("failed to copy to clipboard: %v", err)
	}
	return nil
}

// Paste retrieves the current content of the system clipboard
func (c *Clipboard) Paste() (string, error) {
	text, err := clipboard.ReadAll()
	if err != nil {
		return "", fmt.Errorf("failed to read clipboard: %v", err)
	}
	return text, nil
}

// Clear empties the clipboard
func (c *Clipboard) Clear() error {
	err := clipboard.WriteAll("")
	if err != nil {
		return fmt.Errorf("failed to clear clipboard: %v", err)
	}
	return nil
}
