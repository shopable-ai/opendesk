//go:build !windows

package nativeextension

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestTimeoutTerminatesExtensionProcessGroup(t *testing.T) {
	pidFile := t.TempDir() + "/child.pid"
	t.Setenv(testHelperPIDFile, pidFile)
	result, err := callHelperContext(t, context.Background(), NewHost(), "spawn-child", CallOptions{
		Method: "hello", Params: map[string]any{}, Timeout: 300 * time.Millisecond,
	})
	callErr := requireCallError(t, err, CodeTimeout)
	assertFailureEvidence(t, result, callErr, CodeTimeout)

	raw, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("helper did not record descendant pid: %v", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		t.Fatalf("invalid descendant pid %q: %v", raw, err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		err = syscall.Kill(pid, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("descendant process %d survived process-group timeout; kill probe=%v", pid, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
