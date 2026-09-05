package automation

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// FileSystem handles file system operations
type FileSystem struct {
	workingDir string
	handlesMu  sync.Mutex
	handles    map[*FileHandle]struct{}
}

// NewFileSystem creates a FileSystem rooted at the host process working
// directory. It remains for callers that use the synchronous legacy File API
// outside an execution Runtime.
func NewFileSystem() *FileSystem {
	fs, err := NewFileSystemWithWorkDir("")
	if err != nil {
		return nil
	}
	return fs
}

// NewFileSystemWithWorkDir creates a FileSystem rooted at one explicit,
// normalized absolute directory. Runtime executions use this constructor so
// every File method shares the same base as Execution.workdir without ever
// changing the process working directory.
func NewFileSystemWithWorkDir(workingDir string) (*FileSystem, error) {
	if strings.TrimSpace(workingDir) == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, fmt.Errorf("get working directory: %w", err)
		}
		workingDir = cwd
	}
	abs, err := filepath.Abs(workingDir)
	if err != nil {
		return nil, fmt.Errorf("normalize working directory: %w", err)
	}
	return &FileSystem{
		workingDir: filepath.Clean(abs),
		handles:    make(map[*FileHandle]struct{}),
	}, nil
}

// Path returns the absolute path for a given relative path
func (fs *FileSystem) Path(relativePath string) (string, error) {
	if filepath.IsAbs(relativePath) {
		return relativePath, nil
	}
	return filepath.Join(fs.workingDir, relativePath), nil
}

// Cwd returns the current working directory
func (fs *FileSystem) Cwd() string {
	return fs.workingDir
}

// Create creates a new file
func (fs *FileSystem) Create(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	file, err := os.Create(absPath)
	if err != nil {
		return err
	}
	return file.Close()
}

// CreateIfNotExists creates a file if it doesn't exist
func (fs *FileSystem) CreateIfNotExists(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	if _, err := os.Stat(absPath); err != nil {
		if os.IsNotExist(err) {
			return fs.Create(path)
		}
		return err
	}
	return nil
}

// CreateWithDirs creates a file and all necessary parent directories
func (fs *FileSystem) CreateWithDirs(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return err
	}
	return fs.Create(path)
}

// Exists checks if a file or directory exists
func (fs *FileSystem) Exists(path string) bool {
	absPath, err := fs.Path(path)
	if err != nil {
		return false
	}
	_, err = os.Stat(absPath)
	return err == nil
}

// EnsureDir creates a directory if it doesn't exist
func (fs *FileSystem) EnsureDir(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	return os.MkdirAll(absPath, 0755)
}

// Read reads the entire file content as a string
func (fs *FileSystem) Read(path string, encoding ...string) (string, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return "", err
	}
	bytes, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// ReadBytes reads the entire file content as bytes
func (fs *FileSystem) ReadBytes(path string) ([]byte, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(absPath)
}

// Write writes text to a file
func (fs *FileSystem) Write(path string, text string, encoding ...string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	return os.WriteFile(absPath, []byte(text), 0644)
}

// Append appends text to a file
func (fs *FileSystem) Append(path string, text string, encoding ...string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(absPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.WriteString(text)
	return err
}

// WriteBytes writes bytes to a file
func (fs *FileSystem) WriteBytes(path string, bytes []byte) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	return os.WriteFile(absPath, bytes, 0644)
}

// AppendBytes appends bytes to a file
func (fs *FileSystem) AppendBytes(path string, bytes []byte) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(absPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(bytes)
	return err
}

// Copy copies a file from source to destination
func (fs *FileSystem) Copy(pathFrom, pathTo string) error {
	absPathFrom, err := fs.Path(pathFrom)
	if err != nil {
		return err
	}
	absPathTo, err := fs.Path(pathTo)
	if err != nil {
		return err
	}

	source, err := os.Open(absPathFrom)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(absPathTo)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}

// RenameWithoutExtension renames a file without changing its extension
func (fs *FileSystem) RenameWithoutExtension(path, newName string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	dir := filepath.Dir(absPath)
	ext := filepath.Ext(absPath)
	newPath := filepath.Join(dir, newName+ext)
	return os.Rename(absPath, newPath)
}

// Rename renames a file or directory
func (fs *FileSystem) Rename(path, newName string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	dir := filepath.Dir(absPath)
	newPath := filepath.Join(dir, newName)
	return os.Rename(absPath, newPath)
}

// Move moves a file or directory to a new location
func (fs *FileSystem) Move(path, newPath string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	absNewPath, err := fs.Path(newPath)
	if err != nil {
		return err
	}
	return os.Rename(absPath, absNewPath)
}

// GetExtension returns the file extension
func (fs *FileSystem) GetExtension(fileName string) string {
	return filepath.Ext(fileName)
}

// GetName returns the file name with extension
func (fs *FileSystem) GetName(filePath string) string {
	return filepath.Base(filePath)
}

// GetNameWithoutExtension returns the file name without extension
func (fs *FileSystem) GetNameWithoutExtension(filePath string) string {
	name := filepath.Base(filePath)
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// Remove removes a file
func (fs *FileSystem) Remove(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	return os.Remove(absPath)
}

// RemoveDir removes a directory and all its contents
func (fs *FileSystem) RemoveDir(path string) error {
	absPath, err := fs.Path(path)
	if err != nil {
		return err
	}
	return os.RemoveAll(absPath)
}

// ListDir returns a list of files and directories in the specified directory
func (fs *FileSystem) ListDir(path string) ([]string, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names, nil
}

// IsFile checks if the path is a file
func (fs *FileSystem) IsFile(path string) bool {
	absPath, err := fs.Path(path)
	if err != nil {
		return false
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// IsDir checks if the path is a directory
func (fs *FileSystem) IsDir(path string) bool {
	absPath, err := fs.Path(path)
	if err != nil {
		return false
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// IsEmptyDir checks if a directory is empty
func (fs *FileSystem) IsEmptyDir(path string) (bool, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return false, err
	}
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return false, err
	}
	return len(entries) == 0, nil
}

// GetHumanReadableSize converts bytes to human readable format
func (fs *FileSystem) GetHumanReadableSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// GetSimplifiedPath returns a clean, simplified path
func (fs *FileSystem) GetSimplifiedPath(path string) string {
	return filepath.Clean(path)
}

// Join joins path elements
func (fs *FileSystem) Join(parent string, children ...string) string {
	elements := append([]string{parent}, children...)
	return filepath.Join(elements...)
}

// Open opens a file with the specified mode and returns a constrained Runtime
// handle. It intentionally never returns *os.File to JavaScript: a raw Go
// file would make arbitrary host methods public outside the File API contract.
func (fs *FileSystem) Open(path string, mode string) (*FileHandle, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return nil, err
	}

	var flag int
	switch mode {
	case "r":
		flag = os.O_RDONLY
	case "w":
		flag = os.O_WRONLY | os.O_CREATE | os.O_TRUNC
	case "a":
		flag = os.O_WRONLY | os.O_CREATE | os.O_APPEND
	default:
		return nil, errors.New("invalid file mode")
	}

	file, err := os.OpenFile(absPath, flag, 0644)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, errors.New("File.open supports regular files only")
	}
	handle := newFileHandle(fs, file)
	fs.handlesMu.Lock()
	fs.handles[handle] = struct{}{}
	fs.handlesMu.Unlock()
	return handle, nil
}

func (fs *FileSystem) removeHandle(handle *FileHandle) {
	if fs == nil || handle == nil {
		return
	}
	fs.handlesMu.Lock()
	delete(fs.handles, handle)
	fs.handlesMu.Unlock()
}

// Close closes every FileHandle still owned by this Runtime. Explicit handle
// close remains preferred, while this safety net prevents file-descriptor
// leaks when a script throws, times out, or simply forgets to close one.
func (fs *FileSystem) Close() {
	if fs == nil {
		return
	}
	fs.handlesMu.Lock()
	handles := make([]*FileHandle, 0, len(fs.handles))
	for handle := range fs.handles {
		handles = append(handles, handle)
	}
	fs.handles = make(map[*FileHandle]struct{})
	fs.handlesMu.Unlock()
	for _, handle := range handles {
		_ = handle.close(false)
	}
}

// OpenHandleCount is a teardown diagnostic. It is not a JavaScript API.
func (fs *FileSystem) OpenHandleCount() int {
	if fs == nil {
		return 0
	}
	fs.handlesMu.Lock()
	defer fs.handlesMu.Unlock()
	return len(fs.handles)
}
