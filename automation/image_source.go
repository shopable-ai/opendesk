package automation

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"strings"
)

// loadImageSource decodes the ImageColor image-input contract. Paths are
// always attempted first (after an unambiguous data URL), so a valid long path
// cannot be misclassified based on its string length. A non-data-url string is
// considered raw base64 only after it cannot be opened as a path and it
// decodes to a supported image.
func loadImageSource(input string) (image.Image, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, fmt.Errorf("image input must not be empty")
	}

	if strings.HasPrefix(strings.ToLower(trimmed), "data:") {
		return decodeImageDataURL(trimmed)
	}

	file, err := os.Open(trimmed)
	if err == nil {
		defer file.Close()
		img, decodeErr := decodeImageBytesFromReader(file)
		if decodeErr != nil {
			return nil, fmt.Errorf("failed to decode image file %q: %w", trimmed, decodeErr)
		}
		return img, nil
	}

	img, base64Err := decodeRawBase64Image(trimmed)
	if base64Err == nil {
		return img, nil
	}
	return nil, fmt.Errorf("failed to open image file %q: %w", trimmed, err)
}

func decodeImageDataURL(input string) (image.Image, error) {
	marker := ";base64,"
	index := strings.Index(strings.ToLower(input), marker)
	if index < 0 {
		return nil, fmt.Errorf("image data URL must use ;base64,")
	}
	payload := input[index+len(marker):]
	if payload == "" {
		return nil, fmt.Errorf("image data URL base64 payload must not be empty")
	}
	contents, err := decodeBase64Payload(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to decode image data URL base64: %w", err)
	}
	img, err := decodeImageBytes(contents)
	if err != nil {
		return nil, fmt.Errorf("failed to decode image data URL: %w", err)
	}
	return img, nil
}

func decodeRawBase64Image(input string) (image.Image, error) {
	contents, err := decodeBase64Payload(input)
	if err != nil {
		return nil, err
	}
	img, err := decodeImageBytes(contents)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func decodeBase64Payload(payload string) ([]byte, error) {
	contents, err := base64.StdEncoding.DecodeString(payload)
	if err == nil {
		return contents, nil
	}
	contents, rawErr := base64.RawStdEncoding.DecodeString(payload)
	if rawErr == nil {
		return contents, nil
	}
	return nil, err
}

func decodeImageBytes(contents []byte) (image.Image, error) {
	if len(contents) == 0 {
		return nil, fmt.Errorf("image data is empty")
	}
	return decodeImageBytesFromReader(bytes.NewReader(contents))
}

func decodeImageBytesFromReader(reader io.Reader) (image.Image, error) {
	img, _, err := image.Decode(reader)
	if err != nil {
		return nil, fmt.Errorf("unsupported or corrupt PNG/JPEG image: %w", err)
	}
	return img, nil
}
