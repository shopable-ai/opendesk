package automation

import (
	"os"
	"reflect"
	"time"
)

// Register File.stat in the same explicit native allowlist used by
// AutoMapObject. Keeping the method and its public exposure together prevents
// an exported Go helper from becoming JavaScript-visible by reflection alone.
func init() {
	typ := reflect.TypeOf((*FileSystem)(nil))
	methods := jsMethodAllowlist[typ]
	for _, method := range methods {
		if method == "Stat" {
			return
		}
	}
	jsMethodAllowlist[typ] = append(methods, "Stat")
}

// Stat returns the small, stable subset of filesystem metadata exposed by the
// public File API. It intentionally follows the final symbolic link (os.Stat
// semantics) and does not expose platform-specific mode, owner, access time, or
// directory size details as cross-platform contract.
func (fs *FileSystem) Stat(path string) (map[string]interface{}, error) {
	absPath, err := fs.Path(path)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	fileType := "other"
	var size interface{}
	switch {
	case info.IsDir():
		fileType = "directory"
	case info.Mode().IsRegular():
		fileType = "file"
		size = info.Size()
	}

	return map[string]interface{}{
		"type":       fileType,
		"size":       size,
		"modifiedAt": info.ModTime().UTC().Format(time.RFC3339Nano),
	}, nil
}
