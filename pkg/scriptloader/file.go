package scriptloader

import (
	"context"
	"path/filepath"
	"strings"
)

// FileLoader is the single file-backed source resolver for JavaScript and
// protected recipe packages. It performs no execution itself.
type FileLoader struct {
	Plain     Loader
	Protected Loader
}

func NewProductionFileLoader() FileLoader {
	protected := NewProductionProtectedPackageLoader()
	return FileLoader{
		Plain:     PlainScriptLoader{},
		Protected: protected,
	}
}

func (loader FileLoader) Load(ctx context.Context, filePath string) (*ScriptSource, error) {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".js":
		if loader.Plain == nil {
			return nil, newError("unsupported_format", "plain script loader is not configured", nil)
		}
		return loader.Plain.Load(ctx, filePath)
	case ".odpkg":
		if loader.Protected == nil {
			return nil, newError("unsupported_format", "protected package loader is not configured", nil)
		}
		return loader.Protected.Load(ctx, filePath)
	default:
		return nil, newError("unsupported_format", "file-backed execution accepts .js or .odpkg", nil)
	}
}
