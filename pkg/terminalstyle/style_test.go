package terminalstyle

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

func TestParseMode(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want Mode
	}{
		{"", ModeAuto},
		{" AUTO ", ModeAuto},
		{"always", ModeAlways},
		{"NEVER", ModeNever},
	} {
		got, err := ParseMode(test.raw)
		if err != nil || got != test.want {
			t.Fatalf("ParseMode(%q) = %q, %v; want %q", test.raw, got, err, test.want)
		}
	}
	if _, err := ParseMode("sometimes"); err == nil {
		t.Fatal("ParseMode accepted an unsupported mode")
	}
}

func TestAutoColorPolicy(t *testing.T) {
	tty := func(io.Writer) bool { return true }
	notTTY := func(io.Writer) bool { return false }
	emptyEnv := environment(map[string]string{})

	if !enabled(ModeAuto, &bytes.Buffer{}, emptyEnv, tty) {
		t.Fatal("auto should enable color for a TTY")
	}
	if enabled(ModeAuto, &bytes.Buffer{}, emptyEnv, notTTY) {
		t.Fatal("auto should disable color for a redirected stream")
	}
	if enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"NO_COLOR": "1"}), tty) {
		t.Fatal("NO_COLOR should disable auto color")
	}
	if !enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"NO_COLOR": ""}), tty) {
		t.Fatal("an empty NO_COLOR should leave auto detection unchanged")
	}
	if enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"TERM": "dumb"}), tty) {
		t.Fatal("TERM=dumb should disable auto color")
	}
	if !enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"FORCE_COLOR": "1", "TERM": "dumb"}), notTTY) {
		t.Fatal("FORCE_COLOR should enable auto color for a redirected stream")
	}
	if enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"FORCE_COLOR": "0"}), tty) {
		t.Fatal("FORCE_COLOR=0 should disable auto color")
	}
	if enabled(ModeAuto, &bytes.Buffer{}, environment(map[string]string{"NO_COLOR": "1", "FORCE_COLOR": "1"}), tty) {
		t.Fatal("NO_COLOR should take priority over FORCE_COLOR in auto mode")
	}
	if !enabled(ModeAlways, &bytes.Buffer{}, environment(map[string]string{"NO_COLOR": "1", "TERM": "dumb"}), notTTY) {
		t.Fatal("always should override auto-only environment checks")
	}
	if enabled(ModeNever, &bytes.Buffer{}, emptyEnv, tty) {
		t.Fatal("never should disable color for a TTY")
	}
}

func TestPublicPolicyUsesProcessEnvironmentAndRealPipe(t *testing.T) {
	readEnd, writeEnd, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	defer readEnd.Close()
	defer writeEnd.Close()

	t.Setenv("TERM", "xterm-256color")
	t.Setenv("NO_COLOR", "")
	t.Setenv("FORCE_COLOR", "")
	if Enabled(ModeAuto, writeEnd) {
		t.Fatal("auto enabled color for a real pipe")
	}
	if !Enabled(ModeAlways, writeEnd) {
		t.Fatal("always did not enable color for a real pipe")
	}
	t.Setenv("FORCE_COLOR", "1")
	if !Enabled(ModeAuto, writeEnd) {
		t.Fatal("public policy ignored FORCE_COLOR")
	}
	t.Setenv("NO_COLOR", "1")
	if Enabled(ModeAuto, writeEnd) {
		t.Fatal("public policy ignored NO_COLOR precedence")
	}
}

func TestColorizeTaggedLineColorsOnlyThePrefix(t *testing.T) {
	writer := &bytes.Buffer{}
	message := ` {"mode":"full","path":"/tmp/example"}`
	got := ColorizeTaggedLine("[SCRIPT]"+message, ModeAlways, writer)
	want := "\x1b[1;96m[SCRIPT]\x1b[0m" + message
	if got != want {
		t.Fatalf("styled line = %q, want %q", got, want)
	}
	if !strings.HasSuffix(got, message) {
		t.Fatalf("message was modified: %q", got)
	}
	var payload map[string]string
	if err := json.Unmarshal([]byte(strings.TrimPrefix(strings.SplitN(got, ansiReset, 2)[1], " ")), &payload); err != nil {
		t.Fatalf("styled prefix made the JSON message invalid: %v", err)
	}
	if got := ColorizeTaggedLine("[SCRIPT] hello", ModeNever, writer); got != "[SCRIPT] hello" {
		t.Fatalf("never mode changed line: %q", got)
	}
	if got := ColorizeTaggedLine("plain output", ModeAlways, writer); got != "plain output" {
		t.Fatalf("untagged line changed: %q", got)
	}
}

func TestColorizeTaggedLineStylesNestedSemanticPrefix(t *testing.T) {
	writer := &bytes.Buffer{}
	got := ColorizeTaggedLine("[FRAMEWORK] [DEBUG] bootstrap detail", ModeAlways, writer)
	want := "\x1b[90m[FRAMEWORK]" + ansiReset + " \x1b[2;90m[DEBUG]" + ansiReset + " bootstrap detail"
	if got != want {
		t.Fatalf("nested semantic line = %q, want %q", got, want)
	}
}

func TestClearScreenDoesNotWriteToRedirectedStream(t *testing.T) {
	var output bytes.Buffer
	ClearScreen(&output)
	if output.Len() != 0 {
		t.Fatalf("clear wrote control bytes to a redirected stream: %q", output.String())
	}
}

func TestWriteStringPlainTextUsesOneUnderlyingWrite(t *testing.T) {
	writer := &countingWriter{}
	text := "[SCRIPT] plain payload\n"
	written, err := WriteString(writer, text)
	if err != nil {
		t.Fatalf("WriteString: %v", err)
	}
	if written != len(text) || writer.writes != 1 || writer.buffer.String() != text {
		t.Fatalf("plain write = bytes:%d calls:%d content:%q", written, writer.writes, writer.buffer.String())
	}
}

func TestEventLevelOverridesCategoryColor(t *testing.T) {
	writer := &bytes.Buffer{}
	tests := []struct {
		level       string
		line        string
		levelPrefix string
		levelCode   string
	}{
		{"info", "[SCRIPT] payload", "", ""},
		{"warn", "[SCRIPT] [WARN] payload", "[WARN]", "\x1b[1;33m"},
		{"debug", "[SCRIPT] [DEBUG] payload", "[DEBUG]", "\x1b[2;90m"},
		{"error", "[SCRIPT] [ERROR] payload", "[ERROR]", "\x1b[1;31m"},
	}
	for _, test := range tests {
		got := ColorizeEventLine(test.line, "script", test.level, ModeAlways, writer)
		if !strings.HasPrefix(got, "\x1b[1;96m[SCRIPT]"+ansiReset) {
			t.Errorf("level %q produced %q", test.level, got)
		}
		if test.levelPrefix != "" && !strings.Contains(got, test.levelCode+test.levelPrefix+ansiReset) {
			t.Errorf("level %q did not style its textual marker: %q", test.level, got)
		}
	}
}

func TestCategoryColorsAreDistinct(t *testing.T) {
	writer := &bytes.Buffer{}
	seen := map[string]string{}
	for _, category := range []string{"framework", "script", "meta", "summary", "error"} {
		prefix := "[" + strings.ToUpper(category) + "]"
		line := prefix + " payload"
		got := ColorizeEventLine(line, category, "info", ModeAlways, writer)
		prefixAt := strings.Index(got, prefix)
		if prefixAt < 0 {
			t.Fatalf("category %s lost its textual prefix: %q", category, got)
		}
		style := got[:prefixAt]
		if previous, exists := seen[style]; exists {
			t.Fatalf("categories %s and %s share style %q", previous, category, style)
		}
		seen[style] = category
	}
}

func TestSummaryFailureUsesErrorColor(t *testing.T) {
	writer := &bytes.Buffer{}
	got := ColorizeTaggedLine("[SUMMARY] status=failed duration=1ms", ModeAlways, writer)
	if !strings.HasPrefix(got, "\x1b[1;31m[SUMMARY]"+ansiReset) {
		t.Fatalf("failed summary did not use error styling: %q", got)
	}
}

func TestSummaryStatusDetectionDoesNotInspectPaths(t *testing.T) {
	writer := &bytes.Buffer{}
	got := ColorizeTaggedLine("[SUMMARY] logs=/tmp/status=failed", ModeAlways, writer)
	if !strings.HasPrefix(got, "\x1b[1;32m[SUMMARY]"+ansiReset) {
		t.Fatalf("summary path was mistaken for execution status: %q", got)
	}
}

func environment(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

type countingWriter struct {
	buffer bytes.Buffer
	writes int
}

func (w *countingWriter) Write(payload []byte) (int, error) {
	w.writes++
	return w.buffer.Write(payload)
}
