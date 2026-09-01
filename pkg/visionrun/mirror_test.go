package visionrun

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunMirrorWritesHTMLCSSAndMeta(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	sourceImage := filepath.Join(repoRoot, "fixtures", "layout.png")
	mustWriteSyntheticLayoutPNG(t, sourceImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "mirror-contract",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: sourceImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}

	result, err := RunMirror(bundle, MirrorOptions{Title: "Synthetic Mirror"})
	if err != nil {
		t.Fatalf("RunMirror failed: %v", err)
	}

	for _, rel := range []string{result.HTMLPath, result.LayoutHTMLPath, result.SemanticHTMLPath, result.SemanticModelPath, result.InferSemanticPath, result.CSSPath, result.MetaPath, result.DOMReportPath} {
		abs := filepath.Join(repoRoot, filepath.FromSlash(rel))
		if _, err := os.Stat(abs); err != nil {
			t.Fatalf("expected mirror artifact missing: %s (%v)", abs, err)
		}
	}

	htmlPath := filepath.Join(repoRoot, filepath.FromSlash(result.HTMLPath))
	htmlBytes, err := os.ReadFile(htmlPath)
	if err != nil {
		t.Fatalf("read html: %v", err)
	}
	htmlText := string(htmlBytes)
	if !strings.Contains(htmlText, "data-region-id=") {
		t.Fatalf("mirror html missing data-region-id bindings")
	}
	if !strings.Contains(htmlText, "styles.css") {
		t.Fatalf("mirror html missing stylesheet link")
	}

	layoutAliasPath := filepath.Join(repoRoot, filepath.FromSlash(result.LayoutHTMLPath))
	layoutAliasBytes, err := os.ReadFile(layoutAliasPath)
	if err != nil {
		t.Fatalf("read layout alias html: %v", err)
	}
	if string(layoutAliasBytes) != htmlText {
		t.Fatalf("layout.html should mirror the canonical layout content")
	}

	semanticPath := filepath.Join(repoRoot, filepath.FromSlash(result.SemanticHTMLPath))
	semanticBytes, err := os.ReadFile(semanticPath)
	if err != nil {
		t.Fatalf("read semantic html: %v", err)
	}
	if !strings.Contains(string(semanticBytes), "semantic-root") {
		t.Fatalf("semantic html missing semantic-root")
	}

	domReport := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.DOMReportPath)))
	if _, ok := domReport["semanticScore"]; !ok {
		t.Fatalf("dom report missing semanticScore: %+v", domReport)
	}
	if _, ok := domReport["phase1Gate"]; !ok {
		t.Fatalf("dom report missing phase1Gate: %+v", domReport)
	}
}

func TestRunMirrorAuxiliaryDoesNotOverrideDecision(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	sourceImage := filepath.Join(repoRoot, "fixtures", "layout.png")
	mustWriteSyntheticLayoutPNG(t, sourceImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "mirror-aux",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: sourceImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}
	if _, err := RunInfer(bundle, InferOptions{}); err != nil {
		t.Fatalf("RunInfer failed: %v", err)
	}

	if _, err := RunMirror(bundle, MirrorOptions{Auxiliary: true}); err != nil {
		t.Fatalf("RunMirror failed: %v", err)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["nextStep"] != "repair-page-inference" && decision["nextStep"] != "probe-open-chat" {
		t.Fatalf("auxiliary mirror should not redirect decision to compare: %+v", decision)
	}
	mirror := mapValue(decision["mirror"])
	if mirror["auxiliary"] != true {
		t.Fatalf("expected auxiliary mirror marker, got %+v", mirror)
	}
	if mirror["semanticHtmlPath"] == "" {
		t.Fatalf("expected semantic mirror path, got %+v", mirror)
	}
	if mirror["domReportPath"] == "" {
		t.Fatalf("expected dom report path, got %+v", mirror)
	}
}
