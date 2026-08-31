package automation

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func testOutputDir(t *testing.T, parts ...string) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve automation test directory")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), ".."))
	base := os.Getenv("CLAWDESK_TEST_OUTPUT_DIR")
	if base == "" {
		base = filepath.Join(repoRoot, ".runtime", "tests", "automation")
	} else if !filepath.IsAbs(base) {
		base = filepath.Join(repoRoot, base)
	}

	dir := filepath.Join(append([]string{base}, parts...)...)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create test output directory %s: %v", dir, err)
	}
	return dir
}
