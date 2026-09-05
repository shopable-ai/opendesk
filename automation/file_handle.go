package automation

import (
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
)

const fileHandleDefaultReadMaxBytes = 8 * 1024 * 1024

// FileHandle is the deliberately small, script-safe result of File.open().
// It avoids reflecting *os.File into Goja, which would expose host-only APIs
// such as Chdir and Fd without documenting or lifecycle-managing them.
type FileHandle struct {
	fs *FileSystem

	mu     sync.Mutex
	file   *os.File
	closed bool
}

func newFileHandle(fs *FileSystem, file *os.File) *FileHandle {
	return &FileHandle{fs: fs, file: file}
}

func (h *FileHandle) withFile(operation string, callback func(*os.File) error) error {
	if h == nil {
		return errors.New("file handle is nil")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed || h.file == nil {
		return fmt.Errorf("file handle is closed: cannot %s", operation)
	}
	return callback(h.file)
}

func (h *FileHandle) close(unregister bool) error {
	if h == nil {
		return nil
	}
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	h.closed = true
	file := h.file
	h.file = nil
	h.mu.Unlock()
	if unregister && h.fs != nil {
		h.fs.removeHandle(h)
	}
	if file == nil {
		return nil
	}
	return file.Close()
}

// Close releases the operating-system handle. It is safe to call more than
// once, which keeps finally cleanup straightforward for scripts.
func (h *FileHandle) Close() error {
	return h.close(true)
}

// Read reads the remaining bytes as a JavaScript string. The optional limit
// protects a script from accidentally consuming an unbounded file.
func (h *FileHandle) Read(maxBytes ...int) (string, error) {
	data, err := h.ReadBytes(maxBytes...)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ReadBytes reads no more than maxBytes remaining bytes from the current
// handle position. Omitting the limit uses the documented 8 MiB default.
func (h *FileHandle) ReadBytes(maxBytes ...int) ([]byte, error) {
	limit, err := fileHandleReadLimit(maxBytes)
	if err != nil {
		return nil, err
	}
	var data []byte
	err = h.withFile("read", func(file *os.File) error {
		start, seekErr := file.Seek(0, io.SeekCurrent)
		if seekErr != nil {
			return seekErr
		}
		read, readErr := io.ReadAll(io.LimitReader(file, int64(limit)+1))
		if readErr != nil {
			return readErr
		}
		if len(read) > limit {
			if _, seekErr := file.Seek(start, io.SeekStart); seekErr != nil {
				return fmt.Errorf("file handle read exceeds maxBytes (%d) and could not restore position: %w", limit, seekErr)
			}
			return fmt.Errorf("file handle read exceeds maxBytes (%d)", limit)
		}
		data = read
		return nil
	})
	return data, err
}

func fileHandleReadLimit(values []int) (int, error) {
	if len(values) == 0 {
		return fileHandleDefaultReadMaxBytes, nil
	}
	if len(values) != 1 || values[0] < 1 || values[0] > fileHandleDefaultReadMaxBytes {
		return 0, fmt.Errorf("maxBytes must be an integer from 1 through %d", fileHandleDefaultReadMaxBytes)
	}
	return values[0], nil
}

// Write writes text at the current handle position.
func (h *FileHandle) Write(text string) error {
	return h.withFile("write", func(file *os.File) error {
		_, err := io.WriteString(file, text)
		return err
	})
}

// WriteBytes writes bytes at the current handle position.
func (h *FileHandle) WriteBytes(bytes []byte) error {
	return h.withFile("write", func(file *os.File) error {
		_, err := file.Write(bytes)
		return err
	})
}

// Seek changes the current position and returns the resulting byte offset.
// whence is "start" (default), "current", or "end".
func (h *FileHandle) Seek(offset int64, whence ...string) (int64, error) {
	basis := "start"
	if len(whence) == 1 && whence[0] != "" {
		basis = whence[0]
	} else if len(whence) > 1 {
		return 0, errors.New("seek accepts at most one whence value")
	}
	var origin int
	switch basis {
	case "start":
		origin = io.SeekStart
	case "current":
		origin = io.SeekCurrent
	case "end":
		origin = io.SeekEnd
	default:
		return 0, errors.New("seek whence must be start, current, or end")
	}
	var position int64
	err := h.withFile("seek", func(file *os.File) error {
		var err error
		position, err = file.Seek(offset, origin)
		return err
	})
	return position, err
}

// Truncate changes the file length to size bytes.
func (h *FileHandle) Truncate(size int64) error {
	if size < 0 {
		return errors.New("truncate size must not be negative")
	}
	return h.withFile("truncate", func(file *os.File) error { return file.Truncate(size) })
}

// Sync requests that the operating system flush buffered file contents.
func (h *FileHandle) Sync() error {
	return h.withFile("sync", func(file *os.File) error { return file.Sync() })
}
