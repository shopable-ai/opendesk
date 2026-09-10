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
	var (
		source *ScriptSource
		err    error
	)
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".js":
		if loader.Plain == nil {
			return nil, newError("unsupported_format", "plain script loader is not configured", nil)
		}
		source, err = loader.Plain.Load(ctx, filePath)
	case ".odpkg":
		if loader.Protected == nil {
			return nil, newError("unsupported_format", "protected package loader is not configured", nil)
		}
		source, err = loader.Protected.Load(ctx, filePath)
	default:
		return nil, newError("unsupported_format", "file-backed execution accepts .js or .odpkg", nil)
	}
	if err != nil {
		return nil, err
	}
	if err := ValidateFileSource(filePath, source); err != nil {
		return nil, err
	}
	return source, nil
}

// ValidateFileSource enforces the fail-closed relationship between a file
// extension and the protection metadata returned by an injected loader. It
// clears content rejected at this boundary so a mislabeled protected source
// cannot drift into plain snapshot or plaintext-hash behavior.
func ValidateFileSource(filePath string, source *ScriptSource) error {
	if source == nil {
		return newError("invalid_package", "script loader returned no source", nil)
	}
	fail := func(code, message string) error {
		zeroBytes(source.Content)
		return newError(code, message, nil)
	}
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".js":
		if source.Protection.Mode != ProtectionPlain {
			return fail("invalid_package", ".js loader must return a plain ScriptSource")
		}
		if !strings.EqualFold(source.Ext, ".js") {
			return fail("invalid_package", ".js loader must return JavaScript content")
		}
	case ".odpkg":
		if source.Protection.Mode != ProtectionProtected {
			return fail("invalid_package", ".odpkg loader must return a protected ScriptSource")
		}
		if strings.TrimSpace(source.Protection.PackageDigest) == "" {
			return fail("invalid_package", "protected ScriptSource is missing package digest")
		}
		if !strings.EqualFold(source.Ext, ".js") {
			return fail("unsupported_payload", "protected ScriptSource must contain JavaScript")
		}
	default:
		return fail("unsupported_format", "file-backed execution accepts .js or .odpkg")
	}
	return nil
}
