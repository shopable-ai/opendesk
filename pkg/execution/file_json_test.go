package execution

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileJSONUsesExecutionWorkDirAndDrainsUnawaitedWrite(t *testing.T) {
	root := t.TempDir()
	workOne := filepath.Join(root, "one")
	workTwo := filepath.Join(root, "two")
	for _, workDir := range []string{workOne, workTwo} {
		if err := os.MkdirAll(workDir, 0o750); err != nil {
			t.Fatal(err)
		}
		artifacts, err := PrepareArtifacts(filepath.Join(root, "artifacts", filepath.Base(workDir)), "file-json-"+filepath.Base(workDir), ".js")
		if err != nil {
			t.Fatal(err)
		}
		script := []byte(`
if (File.cwd() !== Execution.workdir) throw new Error("File cwd and Execution workdir differ");
File.writeJSON("same.json", { workdir: Execution.workdir });
`)
		_, _, err = Run(Request{ExecutionID: "file-json-" + filepath.Base(workDir), SourceLabel: "inline", Ext: ".js", ScriptContent: script, WorkDir: workDir, Artifacts: artifacts})
		if err != nil {
			t.Fatalf("Run(%s): %v", workDir, err)
		}
		data, err := os.ReadFile(filepath.Join(workDir, "same.json"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), workDir) {
			t.Fatalf("relative JSON write did not use %s: %s", workDir, data)
		}
	}
	if data, err := os.ReadFile(filepath.Join(workOne, "same.json")); err != nil || strings.Contains(string(data), workTwo) {
		t.Fatalf("execution workdirs crossed: %q, %v", data, err)
	}
}
