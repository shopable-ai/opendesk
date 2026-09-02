package desktopvision

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCodexProviderParsesStructuredPerceptionAndResolvesCoordinates(t *testing.T) {
	dir := t.TempDir()
	argsPath := filepath.Join(dir, "args.txt")
	output := `{"app":"Calculator","window":{"title":"Calculator","bounds_screen":[100,80,500,380]},"image":{"size":{"width":800,"height":600},"hash":"sha256:test","captured_at":"2026-08-30T12:00:00Z"},"display":{"id":"main","scale":2,"bounds":[0,0,1440,900]},"elements":[{"id":"digit_7","role":"button","text":"7","bbox_norm":[0.1,0.5,0.2,0.6],"confidence":0.97,"risk":"low","actionable":true}],"uncertainties":[]}`
	executable := writeFakeCodex(t, dir, fakeCodexConfig{
		Output:   output,
		ArgsPath: argsPath,
		Stdout:   "model: gpt-5.6-terra\nprovider: openai\n",
	})

	provider := NewCodexProvider(ProviderOptions{
		Executable:    executable,
		DefaultModel:  "gpt-5.6-luna",
		Provider:      "openai",
		PromptVersion: "ui-parser-v1",
	})
	result, err := provider.Parse(context.Background(), ParseOptions{
		ImagePath:      filepath.Join(dir, "input.png"),
		Model:          "gpt-5.6-terra",
		TargetText:     "7",
		TargetRole:     "button",
		Purpose:        "locate_action_target",
		BasePerception: samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)),
	})
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	if result.Model.Model != "gpt-5.6-terra" {
		t.Fatalf("expected model from stdout, got %#v", result.Model.Model)
	}
	if result.Model.Provider != "openai" {
		t.Fatalf("expected provider from stdout, got %#v", result.Model.Provider)
	}
	if len(result.Perception.Elements) != 1 {
		t.Fatalf("expected one element, got %d", len(result.Perception.Elements))
	}
	element := result.Perception.Elements[0]
	if element.BBoxPx != (PixelBBox{80, 300, 160, 360}) {
		t.Fatalf("expected pixel bbox to be resolved, got %#v", element.BBoxPx)
	}
	if element.CenterScreen != (ScreenPoint{160, 245}) {
		t.Fatalf("expected center screen to be resolved, got %#v", element.CenterScreen)
	}

	argsRaw, err := os.ReadFile(argsPath)
	if err != nil {
		t.Fatalf("read args log: %v", err)
	}
	argsText := string(argsRaw)
	for _, want := range []string{"exec", "--ephemeral", "--ignore-user-config", `model_reasoning_effort="low"`, "--image", "--output-schema", "--output-last-message", "--model", "gpt-5.6-terra"} {
		if !strings.Contains(argsText, want) {
			t.Fatalf("expected args log to contain %q, got:\n%s", want, argsText)
		}
	}
	for _, want := range []string{`"text":"7"`, `"role":"button"`, `"purpose":"locate_action_target"`} {
		if !strings.Contains(argsText, want) {
			t.Fatalf("expected targeted prompt to contain %q, got:\n%s", want, argsText)
		}
	}
}

func TestCodexProviderRejectsScreenshotProvenanceMismatch(t *testing.T) {
	dir := t.TempDir()
	output := `{"app":"Calculator","window":{"title":"Calculator","bounds_screen":[100,80,500,380]},"image":{"size":{"width":800,"height":600},"hash":"sha256:stale","captured_at":"2026-08-30T12:00:00Z"},"display":{"id":"main","scale":2,"bounds":[0,0,1440,900]},"elements":[],"uncertainties":[]}`
	executable := writeFakeCodex(t, dir, fakeCodexConfig{Output: output})
	provider := NewCodexProvider(ProviderOptions{Executable: executable})
	_, err := provider.Parse(context.Background(), ParseOptions{
		ImagePath:      filepath.Join(dir, "input.png"),
		BasePerception: samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)),
	})
	if err == nil || !strings.Contains(err.Error(), "screenshot SHA mismatch") {
		t.Fatalf("expected fail-closed screenshot provenance error, got %v", err)
	}
}

func TestCodexProviderRejectsUnknownFields(t *testing.T) {
	dir := t.TempDir()
	executable := writeFakeCodex(t, dir, fakeCodexConfig{
		Output: `{"app":"Calculator","window":{"title":"Calculator","bounds_screen":[100,80,500,380]},"image":{"size":{"width":800,"height":600},"hash":"sha256:test","captured_at":"2026-08-30T12:00:00Z"},"display":{"id":"main","scale":2},"elements":[],"unexpected":true}`,
	})

	provider := NewCodexProvider(ProviderOptions{Executable: executable})
	_, err := provider.Parse(context.Background(), ParseOptions{
		ImagePath:      filepath.Join(dir, "input.png"),
		BasePerception: samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)),
	})
	if err == nil {
		t.Fatal("expected strict decoding failure")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown field error, got %v", err)
	}
}

func TestCodexProviderTimesOut(t *testing.T) {
	dir := t.TempDir()
	executable := writeFakeCodex(t, dir, fakeCodexConfig{
		Sleep: 2 * time.Second,
	})

	provider := NewCodexProvider(ProviderOptions{
		Executable: executable,
		Timeout:    50 * time.Millisecond,
	})
	started := time.Now()
	_, err := provider.Parse(context.Background(), ParseOptions{
		ImagePath:      filepath.Join(dir, "input.png"),
		BasePerception: samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)),
	})
	if err == nil {
		t.Fatal("expected timeout")
	}
	var execErr *ExecError
	if !errors.As(err, &execErr) {
		t.Fatalf("expected exec error, got %T", err)
	}
	if !strings.Contains(execErr.Error(), "timed out") {
		t.Fatalf("expected timeout message, got %v", execErr)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("timeout took %s; provider subprocess tree was not terminated", elapsed)
	}
}

func TestPerceptionSchemaArrayNodesDoNotDeclareAdditionalProperties(t *testing.T) {
	schema := perceptionSchema()
	properties := schema["properties"].(map[string]any)
	windowProperties := properties["window"].(map[string]any)["properties"].(map[string]any)
	displayProperties := properties["display"].(map[string]any)["properties"].(map[string]any)
	elementProperties := properties["elements"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)

	assertArrayWithoutAdditionalProperties(t, windowProperties["bounds_screen"])
	assertArrayWithoutAdditionalProperties(t, displayProperties["bounds"])
	assertArrayWithoutAdditionalProperties(t, elementProperties["bbox_norm"])
	for _, hostDerived := range []string{"bbox_px", "bbox_window", "center_window", "center_screen"} {
		if _, ok := elementProperties[hostDerived]; ok {
			t.Fatalf("host-derived field %q must not be accepted from the model", hostDerived)
		}
	}
}

func TestPerceptionSchemaRequiresEveryDeclaredProperty(t *testing.T) {
	assertSchemaRequiresEveryProperty(t, perceptionSchema(), "root")
}

func assertSchemaRequiresEveryProperty(t *testing.T, node map[string]any, path string) {
	t.Helper()
	if properties, ok := node["properties"].(map[string]any); ok {
		requiredRaw, ok := node["required"].([]string)
		if !ok {
			t.Fatalf("%s object is missing required array", path)
		}
		required := make(map[string]bool, len(requiredRaw))
		for _, key := range requiredRaw {
			required[key] = true
		}
		for key, child := range properties {
			if !required[key] {
				t.Fatalf("%s property %q is not required", path, key)
			}
			if childMap, ok := child.(map[string]any); ok {
				assertSchemaRequiresEveryProperty(t, childMap, path+"."+key)
			}
		}
	}
	if items, ok := node["items"].(map[string]any); ok {
		assertSchemaRequiresEveryProperty(t, items, path+"[]")
	}
}

func assertArrayWithoutAdditionalProperties(t *testing.T, node any) {
	t.Helper()
	object, ok := node.(map[string]any)
	if !ok {
		t.Fatalf("expected schema node map, got %T", node)
	}
	if object["type"] != "array" {
		t.Fatalf("expected array schema node, got %#v", object["type"])
	}
	if _, exists := object["additionalProperties"]; exists {
		t.Fatalf("array schema must not declare additionalProperties: %#v", object)
	}
}

type fakeCodexConfig struct {
	Output   string
	Stdout   string
	Stderr   string
	Sleep    time.Duration
	ArgsPath string
}

func writeFakeCodex(t *testing.T, dir string, cfg fakeCodexConfig) string {
	t.Helper()
	scriptPath := filepath.Join(dir, "codex")
	script := "#!/bin/sh\n"
	if cfg.ArgsPath != "" {
		script += "printf '%s\\n' \"$@\" > " + shellQuote(cfg.ArgsPath) + "\n"
	}
	if cfg.Sleep > 0 {
		script += "sleep " + strings.TrimSuffix(cfg.Sleep.String(), "0s") + "\n"
	}
	script += "out=\n"
	script += "while [ $# -gt 0 ]; do\n"
	script += "  case \"$1\" in\n"
	script += "    -o|--output-last-message)\n"
	script += "      out=\"$2\"\n"
	script += "      shift 2\n"
	script += "      ;;\n"
	script += "    *)\n"
	script += "      shift\n"
	script += "      ;;\n"
	script += "  esac\n"
	script += "done\n"
	if cfg.Stdout != "" {
		script += "printf '%s' " + shellQuote(cfg.Stdout) + "\n"
	}
	if cfg.Stderr != "" {
		script += "printf '%s' " + shellQuote(cfg.Stderr) + " >&2\n"
	}
	if cfg.Output != "" {
		script += "printf '%s' " + shellQuote(cfg.Output) + " > \"$out\"\n"
	}
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake codex: %v", err)
	}
	return scriptPath
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func samplePerception(capturedAt time.Time) Perception {
	return Perception{
		App:     "Calculator",
		Window:  Window{Title: "Calculator", BoundsScreen: ScreenBBox{100, 80, 500, 380}},
		Image:   Image{Size: ImageSize{Width: 800, Height: 600}, Hash: "sha256:test", CapturedAt: capturedAt},
		Display: Display{ID: "main", Scale: 2, Bounds: ScreenBBox{0, 0, 1440, 900}},
	}
}
