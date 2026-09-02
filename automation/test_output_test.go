package automation

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testOutputDir(t *testing.T, parts ...string) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve automation test directory")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), ".."))
	runtimeRoot := filepath.Join(repoRoot, ".runtime")
	base := os.Getenv("OPENDESK_TEST_OUTPUT_DIR")
	if base == "" {
		base = filepath.Join(runtimeRoot, "tests", "automation")
	} else if !filepath.IsAbs(base) {
		base = filepath.Join(repoRoot, base)
	}
	base = filepath.Clean(base)
	relative, err := filepath.Rel(runtimeRoot, base)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		t.Fatalf("OPENDESK_TEST_OUTPUT_DIR must stay below %s: %s", runtimeRoot, base)
	}

	dir := filepath.Join(append([]string{base}, parts...)...)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create test output directory %s: %v", dir, err)
	}
	return dir
}
