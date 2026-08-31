package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFinishDrainsStdoutBeforeWait(t *testing.T) {
	const lineCount = 256
	dir := t.TempDir()
	helper := filepath.Join(dir, "write-many-lines.sh")
	script := `#!/bin/sh
i=0
while [ "$i" -lt 256 ]; do
  printf '{"jsonrpc":"2.0","id":%s,"result":{}}\n' "$i"
  i=$((i + 1))
done
`
	if err := os.WriteFile(helper, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	child, err := startChild(helper)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan exitResult, 1)
	go func() { done <- child.finish(10 * time.Second) }()

	select {
	case result := <-done:
		if result.timedOut || result.err != nil || result.exitCode != 0 {
			t.Fatalf("unexpected exit: timedOut=%t exitCode=%d err=%v", result.timedOut, result.exitCode, result.err)
		}
		if got := len(result.trailing); got != lineCount {
			t.Fatalf("trailing stdout lines: got %d, want %d", got, lineCount)
		}
		for index, item := range result.trailing {
			if item.err != nil {
				t.Fatalf("line %d returned a read error: %v", index, item.err)
			}
			if !strings.HasPrefix(item.text, `{"jsonrpc":"2.0"`) {
				t.Fatalf("line %d was not preserved: %q", index, item.text)
			}
		}
	case <-time.After(15 * time.Second):
		go func() {
			for range child.lines {
			}
		}()
		if child.cmd.Process != nil {
			_ = child.cmd.Process.Kill()
		}
		t.Fatal("finish deadlocked instead of draining stdout before Wait")
	}
}

func TestTrailingNonJSONRemainsProtocolViolation(t *testing.T) {
	result := runResult{Checks: map[string]bool{}}
	items := []lineResult{{text: "diagnostic stdout pollution"}}
	protocolErr := validateTrailingOutput(items, nil, &result, 1, nil)

	if protocolErr == nil {
		t.Fatal("non-JSON stdout unexpectedly passed")
	}
	if result.NonJSONLines != 1 || result.ProtocolViolations != 1 || result.UnexpectedLines != 1 {
		t.Fatalf("unexpected counters: nonJSON=%d protocol=%d unexpected=%d",
			result.NonJSONLines, result.ProtocolViolations, result.UnexpectedLines)
	}
}
