package scriptloader

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

const moduleEntryGlobal = "__opendeskESMEntry"

// ModuleScriptLoader compiles one file-backed ESM entry and its static import
// graph into a single JavaScript payload that the existing Goja execution
// lifecycle can run. It deliberately does not implement JavaScript parsing or
// package resolution itself; esbuild owns those semantics.
//
// Module loading is currently a trusted local file capability. The resulting
// payload reuses the existing OpenDesk Runtime, globals, cancellation and
// resource lifecycle instead of starting a second JavaScript engine.
type ModuleScriptLoader struct{}

func (ModuleScriptLoader) Load(ctx context.Context, filePath string) (*ScriptSource, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	if strings.ToLower(filepath.Ext(filePath)) != ".mjs" {
		return nil, newError("unsupported_format", "module script loader only accepts .mjs files", nil)
	}

	absolutePath, err := filepath.Abs(filePath)
	if err != nil {
		return nil, newError("module_build_failed", "cannot resolve module entry path", err)
	}
	absolutePath = filepath.Clean(absolutePath)

	content, err := bundleModule(ctx, absolutePath)
	if err != nil {
		return nil, err
	}
	return &ScriptSource{
		Content: content,
		Source:  "file:" + filePath,
		// The module graph has already been linked into a normal JavaScript
		// payload. Keep .js here so the existing Execution uses the established
		// Goja/EventLoop path without a parallel runtime implementation.
		Ext: ".js",
		Protection: ProtectionInfo{
			Mode: ProtectionPlain,
		},
	}, nil
}

func bundleModule(ctx context.Context, entryPath string) ([]byte, error) {
	options := api.BuildOptions{
		EntryPoints:  []string{entryPath},
		AbsWorkingDir: filepath.Dir(entryPath),
		Bundle:       true,
		Write:        false,
		Platform:     api.PlatformBrowser,
		Format:       api.FormatIIFE,
		GlobalName:   moduleEntryGlobal,
		Target:       api.ES2020,
		Outfile:      filepath.Join(filepath.Dir(entryPath), ".opendesk-module-bundle.js"),
		LogLevel:     api.LogLevelSilent,
		Sourcemap:    api.SourceMapInline,
		LegalComments: api.LegalCommentsInline,
	}

	buildContext, contextErr := api.Context(options)
	if contextErr != nil {
		return nil, newError("module_build_failed", formatModuleBuildMessages(contextErr.Errors), contextErr)
	}

	cancelWatchRelease := make(chan struct{})
	cancelWatchDone := make(chan struct{})
	go func() {
		defer close(cancelWatchDone)
		select {
		case <-ctx.Done():
			buildContext.Cancel()
		case <-cancelWatchRelease:
		}
	}()

	result := buildContext.Rebuild()
	close(cancelWatchRelease)
	<-cancelWatchDone
	buildContext.Dispose()

	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if len(result.Errors) > 0 {
		return nil, newError("module_build_failed", formatModuleBuildMessages(result.Errors), nil)
	}

	var javascript []byte
	for _, output := range result.OutputFiles {
		if strings.HasSuffix(strings.ToLower(output.Path), ".js") {
			if javascript != nil {
				return nil, newError("module_build_failed", "module build produced multiple JavaScript outputs", nil)
			}
			javascript = append([]byte(nil), output.Contents...)
		}
	}
	if javascript == nil {
		return nil, newError("module_build_failed", "module build produced no JavaScript output", nil)
	}

	// runner.wrapJavaScript executes this payload inside an async function. The
	// explicit await below therefore participates in the existing completion
	// contract: a rejected exported main() fails the Execution instead of being
	// left as an unobserved Promise.
	bootstrap := fmt.Sprintf(`
const __opendeskESMMain = typeof %s !== "undefined" && %s ? %s.main : undefined;
if (typeof __opendeskESMMain === "function") {
	await __opendeskESMMain();
}
`, moduleEntryGlobal, moduleEntryGlobal, moduleEntryGlobal)
	javascript = append(javascript, []byte(bootstrap)...)
	return javascript, nil
}

func formatModuleBuildMessages(messages []api.Message) string {
	if len(messages) == 0 {
		return "module build failed"
	}
	limit := len(messages)
	if limit > 5 {
		limit = 5
	}
	parts := make([]string, 0, limit)
	for _, message := range messages[:limit] {
		if message.Location == nil {
			parts = append(parts, message.Text)
			continue
		}
		location := message.Location
		parts = append(parts, fmt.Sprintf("%s:%d:%d: %s", location.File, location.Line, location.Column+1, message.Text))
	}
	if len(messages) > limit {
		parts = append(parts, fmt.Sprintf("and %d more module build error(s)", len(messages)-limit))
	}
	return strings.Join(parts, "\n")
}
