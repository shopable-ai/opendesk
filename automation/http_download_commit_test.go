package automation

import (
	"context"
	"errors"
	"testing"
)

// The deterministic seam is the gap between setting cancelRequested and
// canceling the network context; JavaScript cannot schedule inside this lock.
func TestDownloadCommitCancellationBeforeContextPropagation(t *testing.T) {
	state := &downloadCommitState{}
	state.cancel()
	called := false
	committed, err := state.replace(context.Background(), func() (bool, error) {
		called = true
		return true, nil
	})
	var failure *downloadErrorValue
	if committed || called || !errors.As(err, &failure) || failure.Code != DownloadCanceled || failure.Committed {
		t.Fatalf("cancel before context propagation: committed=%v replaceCalled=%v err=%v", committed, called, err)
	}
}
