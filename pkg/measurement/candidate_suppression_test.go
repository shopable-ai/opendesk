package measurement

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"opendesk/pkg/customui"
)

// Internal service seam, not a synthetic substitute for native keyboard tests.
func TestCandidateSuppressionCancelsInflightAndBlocksNewProviderWork(t *testing.T) {
	for _, action := range []string{"off", "alt"} {
		t.Run(action, func(t *testing.T) {
			service, _, _, _ := newSessionService(t)
			var calls atomic.Int32
			started, cancelled := make(chan struct{}, 1), make(chan struct{}, 1)
			provider := snapshotCandidateProviderFunc{name: "suppression-probe", fn: func(ctx context.Context, _ SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
				calls.Add(1)
				select {
				case started <- struct{}{}:
				default:
				}
				<-ctx.Done()
				select {
				case cancelled <- struct{}{}:
				default:
				}
				return nil, ctx.Err()
			}}
			if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
				t.Fatal(err)
			}
			if err := service.Open(context.Background(), "amendment-test"); err != nil {
				t.Fatal(err)
			}
			defer service.Close(context.Background())
			driver := service.driver.(*snapshotCandidateDriver)
			move := customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}}
			driver.handleHostEvent(move)
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("provider did not start")
			}
			if action == "off" {
				driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "click", TargetID: "magnetToggle"})
			} else {
				driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Alt", "phase": "down"}})
			}
			select {
			case <-cancelled:
			case <-time.After(250 * time.Millisecond):
				t.Fatal("suppression did not cancel inflight work")
			}
			for i := 0; i < 100; i++ {
				driver.handleHostEvent(move)
			}
			driver.state.mu.Lock()
			pending := driver.state.cancel != nil
			candidateCount := len(driver.state.candidates)
			driver.state.mu.Unlock()
			if calls.Load() != 1 || pending || candidateCount != 0 {
				t.Fatalf("suppressed requests ran: calls=%d pending=%t candidates=%d", calls.Load(), pending, candidateCount)
			}
		})
	}
}
