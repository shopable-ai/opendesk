package measurement

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/customui"
)

type referenceSelectorStub struct {
	mu        sync.Mutex
	started   chan int
	releases  []chan struct{}
	selection ReferenceSelection
}

func newReferenceSelectorStub() *referenceSelectorStub {
	return &referenceSelectorStub{
		started: make(chan int, 8),
		selection: ReferenceSelection{Reference: Reference{
			Type: ReferenceWindowOuter, Bounds: Rect{X: 10, Y: 20, Width: 200, Height: 120},
			Window: &WindowIdentity{ID: "target", PID: 7, NativeHandle: 11, Title: "Fixture"},
		}},
	}
}

func (s *referenceSelectorStub) SelectReference(ctx context.Context) (ReferenceSelection, error) {
	s.mu.Lock()
	index := len(s.releases)
	release := make(chan struct{})
	s.releases = append(s.releases, release)
	s.mu.Unlock()
	s.started <- index
	select {
	case <-release:
		return s.selection, nil
	case <-ctx.Done():
		return ReferenceSelection{}, ctx.Err()
	}
}

func (s *referenceSelectorStub) release(index int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	close(s.releases[index])
}

type exactReferenceCapture struct {
	*sessionCapture
	mu         sync.Mutex
	references []ReferenceSelection
	failFirst  bool
}

// delayedExactReferenceCapture deliberately returns a valid frame after its
// context has been cancelled. It models a native screenshot/backend that has
// already crossed an OS boundary and therefore cannot be aborted immediately.
// The service must discard that late frame instead of recreating a session.
type delayedExactReferenceCapture struct {
	*sessionCapture
	started       chan struct{}
	canceled      chan struct{}
	release       chan struct{}
	startedOnce   sync.Once
	canceledOnce  sync.Once
	completedOnce sync.Once
	completed     chan struct{}
}

func newDelayedExactReferenceCapture() *delayedExactReferenceCapture {
	return &delayedExactReferenceCapture{
		sessionCapture: &sessionCapture{}, started: make(chan struct{}), canceled: make(chan struct{}),
		release: make(chan struct{}), completed: make(chan struct{}),
	}
}

func (c *delayedExactReferenceCapture) CaptureReference(ctx context.Context, reference ReferenceSelection) (CaptureFrame, error) {
	c.startedOnce.Do(func() { close(c.started) })
	go func() {
		<-ctx.Done()
		c.canceledOnce.Do(func() { close(c.canceled) })
	}()
	<-c.release
	frame, err := c.sessionCapture.Capture(context.Background(), reference.Reference.Window.ID)
	c.completedOnce.Do(func() { close(c.completed) })
	return frame, err
}

func (c *exactReferenceCapture) CaptureReference(ctx context.Context, reference ReferenceSelection) (CaptureFrame, error) {
	c.mu.Lock()
	c.references = append(c.references, reference)
	fail := c.failFirst
	c.failFirst = false
	c.mu.Unlock()
	if fail {
		return CaptureFrame{}, errors.New("synthetic initial capture failure")
	}
	return c.sessionCapture.Capture(ctx, reference.Reference.Window.ID)
}

func (c *exactReferenceCapture) referenceCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.references)
}

func waitMeasurementState(t *testing.T, service *Service, predicate func(ServiceSessionState) bool) ServiceSessionState {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		state := service.State()
		if predicate(state) {
			return state
		}
		time.Sleep(time.Millisecond)
	}
	return service.State()
}

func TestInitialReferenceSelectionIsLiveSingleFlightAndSnapshotFree(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := &exactReferenceCapture{sessionCapture: &sessionCapture{}}
	driver := customui.NewMemoryDriver()
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-selector.started:
	case <-time.After(time.Second):
		t.Fatal("reference selector did not start")
	}
	state := service.State()
	if state.Phase != PhaseReferenceSelecting || state.Token.SnapshotID != "" || capture.Count() != 0 || capture.referenceCount() != 0 {
		t.Fatalf("entry created a frozen snapshot: state=%+v captures=%d references=%d", state, capture.Count(), capture.referenceCount())
	}
	if counts := service.Counts(); counts != (ServiceCounts{Sessions: 1, Listeners: 1}) {
		t.Fatalf("selecting counts=%+v", counts)
	}
	if err := service.Open(ctx, "recorder-toolbar"); err != nil {
		t.Fatal(err)
	}
	select {
	case extra := <-selector.started:
		t.Fatalf("repeat entry created a second selector: %d", extra)
	default:
	}

	selector.release(0)
	state = waitMeasurementState(t, service, func(state ServiceSessionState) bool {
		return state.Phase == PhaseMeasuring && state.Token.SnapshotID != ""
	})
	if state.Phase != PhaseMeasuring || state.Token.Validate() != nil || capture.Count() != 1 || capture.referenceCount() != 1 {
		t.Fatalf("confirmed selection did not create exactly one snapshot: state=%+v captures=%d references=%d", state, capture.Count(), capture.referenceCount())
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestInitialCaptureFailureReturnsToLiveSelectionWithoutFallback(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := &exactReferenceCapture{sessionCapture: &sessionCapture{}, failFirst: true}
	service, err := NewService(ServiceOptions{Driver: customui.NewMemoryDriver(), Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	<-selector.started
	selector.release(0)
	select {
	case next := <-selector.started:
		if next != 1 {
			t.Fatalf("selection retry=%d", next)
		}
	case <-time.After(time.Second):
		t.Fatal("failed capture did not return to live selection")
	}
	state := service.State()
	if state.Phase != PhaseReferenceSelecting || state.Token.SnapshotID != "" || capture.Count() != 0 || capture.referenceCount() != 1 {
		t.Fatalf("failed capture leaked a fallback snapshot: state=%+v captures=%d references=%d", state, capture.Count(), capture.referenceCount())
	}
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestCloseCancelsLiveSelectionWithoutCreatingSurfaceOrSnapshot(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := &exactReferenceCapture{sessionCapture: &sessionCapture{}}
	driver := customui.NewMemoryDriver()
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	<-selector.started
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if state := service.State(); state.Phase != PhaseIdle || state.Token.SnapshotID != "" || capture.Count() != 0 || capture.referenceCount() != 0 {
		t.Fatalf("close left measurement state behind: state=%+v captures=%d references=%d", state, capture.Count(), capture.referenceCount())
	}
	if resources := driver.ResourceCounts(); resources.Sinks != 0 || resources.HostProcesses != 0 {
		t.Fatalf("close leaked selection resources: %+v", resources)
	}
}

func TestCloseDuringFreezingDiscardsLateCaptureWithoutRevivingSession(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := newDelayedExactReferenceCapture()
	driver := customui.NewMemoryDriver()
	baseDir := t.TempDir()
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: baseDir})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	<-selector.started
	selector.release(0)
	state := waitMeasurementState(t, service, func(state ServiceSessionState) bool { return state.Phase == PhaseFreezing })
	if state.Phase != PhaseFreezing || state.Token.SnapshotID != "" {
		t.Fatalf("selection did not enter snapshot-free freezing: %+v", state)
	}
	select {
	case <-capture.started:
	case <-time.After(time.Second):
		t.Fatal("initial capture did not begin")
	}
	closed := make(chan error, 1)
	go func() { closed <- service.Close(context.Background()) }()
	select {
	case <-capture.canceled:
	case <-time.After(time.Second):
		t.Fatal("close did not cancel the freezing request")
	}
	close(capture.release)
	select {
	case <-capture.completed:
	case <-time.After(time.Second):
		t.Fatal("delayed capture did not complete")
	}
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("close did not finish after the delayed capture")
	}
	// Give the formerly-blocked select-and-freeze goroutine an opportunity to
	// mishandle its late result. A finished Service must stay idle and must not
	// recreate a Custom UI surface or persist a frozen snapshot asset.
	time.Sleep(20 * time.Millisecond)
	if state := service.State(); state.Phase != PhaseIdle || state.Token.SnapshotID != "" {
		t.Fatalf("late capture revived measurement: %+v", state)
	}
	if resources := driver.ResourceCounts(); resources.Sinks != 0 || resources.HostProcesses != 0 {
		t.Fatalf("late capture recreated selection/measurement resources: %+v", resources)
	}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("late capture persisted snapshot artifacts: %#v", entries)
	}
}

func TestReselectReturnsToLivePhaseAndReusesTheServiceSession(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := &exactReferenceCapture{sessionCapture: &sessionCapture{}}
	service, err := NewService(ServiceOptions{Driver: customui.NewMemoryDriver(), Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	<-selector.started
	selector.release(0)
	first := waitMeasurementState(t, service, func(state ServiceSessionState) bool {
		return state.Phase == PhaseMeasuring && state.Token.SnapshotID != ""
	})
	if first.Phase != PhaseMeasuring {
		t.Fatalf("first selection state=%+v", first)
	}
	active := service.active
	if err := active.handleClick(context.Background(), "reselectReference"); err != nil {
		t.Fatal(err)
	}
	select {
	case index := <-selector.started:
		if index != 1 {
			t.Fatalf("reselect started selector %d", index)
		}
	case <-time.After(time.Second):
		t.Fatal("reselect did not start a Live selection phase")
	}
	during := service.State()
	if during.Phase != PhaseReferenceSelecting || during.Token.SnapshotID != "" || capture.Count() != 1 || service.active != active {
		t.Fatalf("reselect leaked/replaced a snapshot: state=%+v captures=%d active=%p want=%p", during, capture.Count(), service.active, active)
	}
	selector.release(1)
	second := waitMeasurementState(t, service, func(state ServiceSessionState) bool {
		return state.Phase == PhaseMeasuring && state.Token.SnapshotID != "" && state.Token.SnapshotID != first.Token.SnapshotID
	})
	if second.Phase != PhaseMeasuring || second.Token.SessionID != first.Token.SessionID || second.Token.Generation <= first.Token.Generation || capture.Count() != 2 || service.active != active {
		t.Fatalf("reselect did not create one new frozen source on the same service session: first=%+v second=%+v captures=%d", first, second, capture.Count())
	}
	if active.acceptsSnapshot(first.Token) {
		t.Fatalf("reselect left old snapshot token current: first=%+v second=%+v", first, second)
	}
	_ = service.Close(context.Background())
}

func TestCloseDuringReselectCancelsQueuedLiveSelectionAndKeepsOldTokenInvalid(t *testing.T) {
	selector := newReferenceSelectorStub()
	capture := &exactReferenceCapture{sessionCapture: &sessionCapture{}}
	driver := customui.NewMemoryDriver()
	baseDir := t.TempDir()
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Selector: selector, Clipboard: &sessionClipboard{}, BaseDir: baseDir})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	<-selector.started
	selector.release(0)
	first := waitMeasurementState(t, service, func(state ServiceSessionState) bool {
		return state.Phase == PhaseMeasuring && state.Token.SnapshotID != ""
	})
	if first.Phase != PhaseMeasuring {
		t.Fatalf("first selection state=%+v", first)
	}
	active := service.active
	if err := active.handleClick(context.Background(), "reselectReference"); err != nil {
		t.Fatal(err)
	}
	select {
	case index := <-selector.started:
		if index != 1 {
			t.Fatalf("reselect started selector %d", index)
		}
	case <-time.After(time.Second):
		t.Fatal("reselect did not start Live selection")
	}
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	// The cancelled selector must not make a second capture or restore the old
	// snapshot token after the product surface has entered Live selection.
	time.Sleep(20 * time.Millisecond)
	if state := service.State(); state.Phase != PhaseIdle || state.Token.SnapshotID != "" {
		t.Fatalf("close during reselect left a live/frozen session behind: %+v", state)
	}
	if capture.Count() != 1 || capture.referenceCount() != 1 || active.acceptsSnapshot(first.Token) {
		t.Fatalf("close during reselect captured or revived stale evidence: captures=%d references=%d old=%+v", capture.Count(), capture.referenceCount(), first.Token)
	}
	if resources := driver.ResourceCounts(); resources.Sinks != 0 || resources.HostProcesses != 0 {
		t.Fatalf("close during reselect leaked measurement resources: %+v", resources)
	}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("close during reselect retained frozen artifacts: %#v", entries)
	}
}
