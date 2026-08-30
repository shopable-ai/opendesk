package automation

import (
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestRunCommandProbeWithTimeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses /bin/sh")
	}

	ok, msg := runCommandProbeWithTimeout(100*time.Millisecond, "/bin/sh", "-c", "sleep 1")
	if ok {
		t.Fatalf("expected timeout failure")
	}
	if !strings.Contains(msg, "timed out") {
		t.Fatalf("expected timeout message, got %q", msg)
	}
}
