package customui

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestNativeUIProtocolVersionSourcesStayInSync(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve protocol contract test source path")
	}
	base := filepath.Dir(currentFile)
	checks := []struct {
		path   string
		needle string
	}{
		{filepath.Join(base, "machost", "native_darwin.m"), `CDProtocolVersion = @"` + ProtocolVersion + `"`},
		{filepath.Join(base, "winhost", "Program.cs"), `Protocol = "` + ProtocolVersion + `"`},
		{filepath.Join(base, "..", "..", "tests", "custom-ui", "tools", "native-host-smoke.cjs"), `const protocolVersion = '` + ProtocolVersion + `'`},
		{filepath.Join(base, "..", "..", "scripts", "build_windows_ui.ps1"), `$protocolVersion = '` + ProtocolVersion + `'`},
	}
	for _, check := range checks {
		data, err := os.ReadFile(check.path)
		if err != nil {
			t.Fatalf("read %s: %v", check.path, err)
		}
		if !strings.Contains(string(data), check.needle) {
			t.Fatalf("%s does not declare native UI protocol %s", check.path, ProtocolVersion)
		}
	}
}
