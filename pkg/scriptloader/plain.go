package scriptloader

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

type PlainScriptLoader struct{}

func (PlainScriptLoader) Load(ctx context.Context, filePath string) (*ScriptSource, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	if strings.ToLower(filepath.Ext(filePath)) != ".js" {
		return nil, newError("unsupported_format", "plain script loader only accepts .js files", nil)
	}
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, newError("invalid_package", "cannot read JavaScript source", err)
	}
	return &ScriptSource{
		Content: content,
		Source:  "file:" + filePath,
		Ext:     ".js",
		Protection: ProtectionInfo{
			Mode: ProtectionPlain,
		},
	}, nil
}
