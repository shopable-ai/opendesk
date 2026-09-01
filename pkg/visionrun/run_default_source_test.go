package visionrun

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunParseModeUsesDefaultGoldenSourceImage(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	defaultGolden := filepath.Join(repoRoot, "artifacts", "dev-html-samples", "wechatweb", "capture", "source.png")
	mustWriteSyntheticLayoutPNG(t, defaultGolden)

	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd failed: %v", err)
	}
	defer func() { _ = os.Chdir(oldWd) }()
	if err := os.Chdir(repoRoot); err != nil {
		t.Fatalf("Chdir failed: %v", err)
	}

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "run-default-golden",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	_, err = Run(bundle, RunOptions{
		Mode:                     RunModeParse,
		UseRuntimePreflight:      true,
		AllowOfflineSourceImage:  true,
		MaxRealValidationRetries: 1,
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	report := mustReadJSON(t, bundle.RunReport)
	input := mapValue(report["input"])
	if input["usedDefaultGoldenSource"] != true {
		t.Fatalf("expected usedDefaultGoldenSource=true, got %+v", input)
	}
	if stringValue(input["sourceImagePath"]) == "" {
		t.Fatalf("expected sourceImagePath to be populated, got %+v", input)
	}
}
