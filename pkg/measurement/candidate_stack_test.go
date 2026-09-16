package measurement

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/customui"
)

type snapshotCandidateProviderFunc struct {
	name string
	fn   func(context.Context, SnapshotCandidateRequest) ([]SnapshotCandidate, error)
}

func (p snapshotCandidateProviderFunc) Name() string { return p.name }
func (p snapshotCandidateProviderFunc) Candidates(ctx context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
	return p.fn(ctx, request)
}

func candidateFixtureToken(session string, generation uint64, snapshot string) SnapshotToken {
	return SnapshotToken{SessionID: session, Generation: generation, SnapshotID: snapshot}
}

func candidateFixtureRequest() SnapshotCandidateRequest {
	mapping, _ := NewCaptureMapping(Point{X: -100, Y: 20}, Size{Width: 100, Height: 50}, PixelSize{Width: 200, Height: 100}, "display", 1)
	return SnapshotCandidateRequest{
		Token:     candidateFixtureToken("session-a", 3, "snapshot-a"),
		Snapshot:  Snapshot{SampledAt: time.Date(2026, 9, 15, 1, 2, 3, 0, time.UTC), Mapping: mapping},
		Reference: Reference{Type: ReferenceWindowOuter, Bounds: Rect{X: -80, Y: 25, Width: 60, Height: 30}, Window: &WindowIdentity{ID: "target", PID: 7, Title: "Fixture"}},
		Pointer:   Point{X: -60, Y: 40}, ImagePath: "/tmp/frozen.png",
	}
}

func semanticCandidate(request SnapshotCandidateRequest, id, source string, bounds Rect) SnapshotCandidate {
	return SnapshotCandidate{
		CandidateDescriptor: CandidateDescriptor{ID: id, Label: id, Source: source, Bounds: bounds, Reliability: CandidateReliabilityReliable, Semantic: true},
		Token:               request.Token, Role: "textField", Name: "Message", Identifier: "message-input", Confidence: .98,
	}
}

func visualCandidate(request SnapshotCandidateRequest, id string, bounds Rect) SnapshotCandidate {
	return SnapshotCandidate{
		CandidateDescriptor: CandidateDescriptor{ID: id, Label: "OCR text", Source: "ocr:apple", Bounds: bounds, Reliability: CandidateReliabilityEstimated, Semantic: false},
		Token:               request.Token, Confidence: .84,
	}
}

func TestSnapshotCandidateProvenanceSeparatesSemanticAndVisualSources(t *testing.T) {
	request := candidateFixtureRequest()
	for _, source := range []string{"ax", "uia"} {
		candidate := semanticCandidate(request, source+"-candidate", source, Rect{X: -70, Y: 30, Width: 25, Height: 15})
		if err := candidate.Validate(); err != nil {
			t.Fatalf("%s semantic candidate rejected: %v", source, err)
		}
		if !candidate.Semantic || candidate.Role != "textField" || candidate.Identifier != "message-input" {
			t.Fatalf("%s semantic provenance lost: %+v", source, candidate)
		}
	}
	visual := visualCandidate(request, "ocr", Rect{X: -68, Y: 34, Width: 20, Height: 10})
	if err := visual.Validate(); err != nil {
		t.Fatalf("visual OCR candidate rejected: %v", err)
	}
	spoof := visual
	spoof.Semantic = true
	spoof.Role = "button"
	if err := spoof.Validate(); err == nil {
		t.Fatal("OCR candidate was allowed to masquerade as semantic Accessibility evidence")
	}
	manual := visual
	manual.Source = "manual-selection"
	manual.Role = "group"
	if err := manual.Validate(); err == nil {
		t.Fatal("manual visual rectangle was allowed to carry semantic role metadata")
	}
}

func TestNormalizeSnapshotCandidatesOrdersDedupesAndRejectsInvalidBounds(t *testing.T) {
	request := candidateFixtureRequest()
	inner := semanticCandidate(request, "inner", "ax", Rect{X: -68, Y: 34, Width: 20, Height: 12})
	outer := semanticCandidate(request, "outer", "ax", Rect{X: -75, Y: 28, Width: 45, Height: 24})
	ocr := visualCandidate(request, "ocr", Rect{X: -66, Y: 36, Width: 16, Height: 8})
	duplicate := inner
	duplicate.ID = "duplicate"
	duplicate.Confidence = .7
	outside := semanticCandidate(request, "outside", "uia", Rect{X: -95, Y: 10, Width: 30, Height: 20})
	invalid := semanticCandidate(request, "invalid", "uia", Rect{X: math.NaN(), Y: 30, Width: 10, Height: 10})

	got := normalizeSnapshotCandidates(request, []SnapshotCandidate{ocr, outer, duplicate, outside, invalid, inner})
	if len(got) != 3 {
		t.Fatalf("normalized candidates=%d want=3: %+v", len(got), got)
	}
	if got[0].ID != "inner" || got[1].ID != "outer" || got[2].ID != "ocr" {
		t.Fatalf("mixed candidate ordering=%v", []string{got[0].ID, got[1].ID, got[2].ID})
	}
}

func TestNormalizeSnapshotCandidatesRejectsOldSessionGenerationAndSnapshot(t *testing.T) {
	request := candidateFixtureRequest()
	base := semanticCandidate(request, "current", "ax", Rect{X: -68, Y: 34, Width: 20, Height: 12})
	variants := []SnapshotCandidate{base, base, base, base}
	variants[1].ID, variants[1].Token.SessionID = "old-session", "session-old"
	variants[2].ID, variants[2].Token.Generation = "old-generation", request.Token.Generation-1
	variants[3].ID, variants[3].Token.SnapshotID = "old-snapshot", "snapshot-old"
	got := normalizeSnapshotCandidates(request, variants)
	if len(got) != 1 || got[0].ID != "current" {
		t.Fatalf("stale token candidates leaked into current snapshot: %+v", got)
	}
}

func TestResolveSnapshotCandidateProvidersKeepsPartialResultsAndReportsTimeout(t *testing.T) {
	request := candidateFixtureRequest()
	partial := snapshotCandidateProviderFunc{name: "ax", fn: func(context.Context, SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{semanticCandidate(request, "partial", "ax", Rect{X: -68, Y: 34, Width: 20, Height: 12})}, errors.New("tree truncated")
	}}
	timed := snapshotCandidateProviderFunc{name: "vision", fn: func(ctx context.Context, _ SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Millisecond)
	defer cancel()
	candidates, failures := resolveSnapshotCandidateProviders(ctx, []SnapshotCandidateProvider{partial, timed}, request)
	if len(candidates) != 1 || candidates[0].ID != "partial" {
		t.Fatalf("partial provider result was discarded: %+v", candidates)
	}
	if len(failures) != 2 {
		t.Fatalf("provider failures=%+v", failures)
	}
	foundTimeout := false
	for _, failure := range failures {
		if failure.Provider == "vision" && failure.Timeout {
			foundTimeout = true
		}
	}
	if !foundTimeout {
		t.Fatalf("provider timeout was not classified: %+v", failures)
	}
}

func TestSnapshotCandidateDriverCyclesCurrentSnapshotWithoutChangingTargetOrCaptureAndClosesCleanly(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	provider := snapshotCandidateProviderFunc{name: "ax", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{
			semanticCandidate(request, "input", "ax", Rect{X: -70, Y: 32, Width: 25, Height: 16}),
			semanticCandidate(request, "chat", "ax", Rect{X: -76, Y: 27, Width: 45, Height: 26}),
		}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	driver := service.driver.(*snapshotCandidateDriver)
	beforeToken, beforeTarget := service.State().Token, a.selectedTarget
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	view := waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) == 3 })
	for _, candidate := range view.Candidates {
		if strings.Contains(candidate.ID, "other") || candidate.Source == "window-enumeration" {
			t.Fatalf("CaptureFrame.Targets leaked into Snapshot Candidate Stack: %+v", candidate)
		}
	}
	if !driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Tab"}}) {
		t.Fatal("Tab was not owned by real Snapshot Candidate Stack")
	}
	view = waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return view.Index == 1 })
	if view.Index != 1 {
		t.Fatalf("Tab index=%d", view.Index)
	}
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Tab", "shift": true}})
	view = waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return view.Index == 0 })
	if view.Index != 0 || service.State().Token != beforeToken || a.selectedTarget != beforeTarget || capture.Count() != 1 {
		t.Fatalf("candidate cycle changed target/snapshot token=%+v target=%q captures=%d", service.State().Token, a.selectedTarget, capture.Count())
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if view := service.SnapshotCandidates(); view.Token != (SnapshotToken{}) || len(view.Candidates) != 0 || !view.Magnet || view.Suspended {
		t.Fatalf("close left stale candidate state: %+v", view)
	}
}

func TestSnapshotCandidateDriverAltSuspendsAndMagnetOffMakesTabSafeNoop(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	provider := snapshotCandidateProviderFunc{name: "uia", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{semanticCandidate(request, "input", "uia", Rect{X: -70, Y: 32, Width: 25, Height: 16})}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	defer service.Close(context.Background())
	driver := service.driver.(*snapshotCandidateDriver)
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) > 0 })
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Alt", "phase": "down"}})
	if view := service.SnapshotCandidates(); !view.Suspended || !view.Magnet {
		t.Fatalf("Alt did not temporarily suspend magnet: %+v", view)
	}
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Alt", "phase": "up"}})
	if view := service.SnapshotCandidates(); view.Suspended || !view.Magnet {
		t.Fatalf("Alt release did not restore magnet: %+v", view)
	}
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "click", TargetID: "magnetToggle"})
	before := service.SnapshotCandidates().Index
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.key", Fields: map[string]any{"key": "Tab"}})
	time.Sleep(10 * time.Millisecond)
	view := service.SnapshotCandidates()
	if view.Magnet || view.Index != before {
		t.Fatalf("magnet-off Tab mutated candidate selection: %+v", view)
	}
}

func TestSnapshotCandidateDriverForwardsRegionSnapButNeverSnapsPoint(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	provider := snapshotCandidateProviderFunc{name: "ax", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{semanticCandidate(request, "input", "ax", Rect{X: -70, Y: 32, Width: 20, Height: 12})}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	defer service.Close(context.Background())
	a := service.active
	setMeasurementTool(a, "point")
	driver := service.driver.(*snapshotCandidateDriver)
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	view := waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) > 0 })
	candidate := view.Candidates[0]

	for _, event := range []customui.Event{
		{WindowID: WindowID, Type: "measurement.pointerdown", Fields: map[string]any{"u": .4, "v": .4}},
		{WindowID: WindowID, Type: "measurement.pointerup", Fields: map[string]any{"u": .4, "v": .4}},
	} {
		forwarded, consumed := driver.prepareHostEvent(event)
		if consumed {
			t.Fatalf("Region input was consumed instead of forwarded: %+v", forwarded)
		}
		eventCandidate, ok := forwarded.Fields[snapshotCandidateEventField].(SnapshotCandidate)
		if !ok || !eventCandidate.Token.Matches(service.State().Token) {
			t.Fatalf("forwarded Region event lost its current-snapshot candidate: %+v", forwarded)
		}
		if err := a.handle(context.Background(), forwarded); err != nil {
			t.Fatal(err)
		}
	}
	if a.result == nil || a.result.Region == nil || a.result.Region.Absolute != candidate.Bounds {
		t.Fatalf("forwarded Region snap did not lock candidate bounds: result=%+v candidate=%+v", a.result, candidate.Bounds)
	}
	if a.lockedCandidate == nil || a.lockedCandidate.ID != candidate.ID {
		t.Fatalf("locked Region lost candidate evidence: %+v", a.lockedCandidate)
	}
	outputs, err := a.outputsWithProductEvidence()
	if err != nil {
		t.Fatal(err)
	}
	var structured StructuredMeasurementData
	if err := json.Unmarshal([]byte(outputs.JSON), &structured); err != nil {
		t.Fatal(err)
	}
	if structured.Product == nil || structured.Product.Candidate == nil || structured.Product.Candidate.ID != candidate.ID || !structured.Product.Runtime.Snapshot.Matches(service.State().Token) {
		t.Fatalf("Region export dropped locked candidate/runtime evidence: %+v", structured.Product)
	}

	if err := a.handleKey(context.Background(), map[string]any{"key": "1"}); err != nil {
		t.Fatal(err)
	}
	pointEvent := customui.Event{WindowID: WindowID, Type: "measurement.pointerup", Fields: map[string]any{"u": .4, "v": .4}}
	forwardedPoint, consumed := driver.prepareHostEvent(pointEvent)
	if consumed || len(forwardedPoint.Fields) != len(pointEvent.Fields) {
		t.Fatalf("Point event must not use candidate selection: forwarded=%+v consumed=%v", forwardedPoint, consumed)
	}
	point, err := a.logicalPoint(forwardedPoint.Fields)
	if err != nil {
		t.Fatal(err)
	}
	if point != (Point{X: -60, Y: 40}) {
		t.Fatalf("Point event was changed by candidate snap: %+v", point)
	}
	// No candidate conversion encodes a system cursor move; only the Session's
	// normalized Region event is adjusted.
	if _, ok := forwardedPoint.Fields["systemMouseMove"]; ok {
		t.Fatal("candidate selection attempted to encode a system mouse movement")
	}
}

func TestSnapshotCandidateFromEventRejectsStaleCandidate(t *testing.T) {
	request := candidateFixtureRequest()
	candidate := semanticCandidate(request, "input", "ax", Rect{X: -70, Y: 32, Width: 20, Height: 12})
	event := customui.Event{Fields: map[string]any{snapshotCandidateEventField: candidate}}
	if got := snapshotCandidateFromEvent(event, request.Token); got == nil || got.ID != candidate.ID {
		t.Fatalf("current candidate was not preserved: %+v", got)
	}
	stale := request.Token
	stale.Generation++
	if got := snapshotCandidateFromEvent(event, stale); got != nil {
		t.Fatalf("stale candidate leaked into a different snapshot generation: %+v", got)
	}
}

func TestSnapshotCandidateDriverUpdateAndAdjustInvalidateOldCandidates(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	provider := snapshotCandidateProviderFunc{name: "ax", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{semanticCandidate(request, "input", "ax", request.Reference.Bounds)}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	defer service.Close(ctx)
	a := service.active
	driver := service.driver.(*snapshotCandidateDriver)
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	old := waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) > 0 })

	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "click", TargetID: "refreshSnapshot"})
	if view := service.SnapshotCandidates(); len(view.Candidates) != 0 || view.Token.SnapshotID != "" {
		t.Fatalf("Update did not immediately invalidate candidate stack: %+v", view)
	}
	if err := a.handleClick(ctx, "refreshSnapshot"); err != nil {
		t.Fatal(err)
	}
	if capture.Count() != 2 || service.State().Token.Matches(old.Token) {
		t.Fatalf("Update did not create a new frozen token captures=%d token=%+v", capture.Count(), service.State().Token)
	}
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	fresh := waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) > 0 })
	if fresh.Token.Matches(old.Token) {
		t.Fatal("refreeze reused old candidate token")
	}

	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "click", TargetID: "adjustInterface"})
	if err := a.handleClick(ctx, "adjustInterface"); err != nil {
		t.Fatal(err)
	}
	if view := service.SnapshotCandidates(); len(view.Candidates) != 0 || view.Token.SnapshotID != "" {
		t.Fatalf("Adjust did not clear candidate stack: %+v", view)
	}
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	if service.active != a || service.State().Token.SnapshotID == "" {
		t.Fatalf("Continue did not refreeze same Measurement Session state=%+v", service.State())
	}
}

func TestOldAsyncCandidateResultIsDiscardedAfterSnapshotInvalidation(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	started := make(chan SnapshotCandidateRequest, 1)
	release := make(chan struct{})
	provider := snapshotCandidateProviderFunc{name: "slow-ax", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		started <- request
		<-release
		return []SnapshotCandidate{semanticCandidate(request, "late", "ax", request.Reference.Bounds)}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	defer service.Close(ctx)
	driver := service.driver.(*snapshotCandidateDriver)
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	var old SnapshotCandidateRequest
	select {
	case old = <-started:
	case <-time.After(time.Second):
		t.Fatal("slow candidate provider did not start")
	}
	driver.invalidate()
	service.active.stateMu.Lock()
	service.active.generation++
	service.active.snapshotID = snapshotIdentity(service.active.sessionID, service.active.generation, service.active.frame.Snapshot)
	service.active.stateMu.Unlock()
	close(release)
	time.Sleep(30 * time.Millisecond)
	view := service.SnapshotCandidates()
	if len(view.Candidates) != 0 || view.Token.Matches(old.Token) {
		t.Fatalf("old asynchronous candidate contaminated new token: %+v", view)
	}
}

func waitCandidateView(t *testing.T, service *Service, predicate func(SnapshotCandidateView) bool) SnapshotCandidateView {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		view := service.SnapshotCandidates()
		if predicate(view) {
			return view
		}
		time.Sleep(time.Millisecond)
	}
	view := service.SnapshotCandidates()
	t.Fatalf("candidate view condition timed out: %+v", view)
	return SnapshotCandidateView{}
}

func TestSnapshotCandidateLocalReferenceChoosesSmallestUsefulSemanticParent(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	provider := snapshotCandidateProviderFunc{name: "ax", fn: func(_ context.Context, request SnapshotCandidateRequest) ([]SnapshotCandidate, error) {
		return []SnapshotCandidate{
			semanticCandidate(request, "input", "ax", Rect{X: -70, Y: 32, Width: 20, Height: 12}),
			semanticCandidate(request, "composer", "ax", Rect{X: -75, Y: 28, Width: 40, Height: 22}),
			semanticCandidate(request, "chat", "ax", Rect{X: -80, Y: 25, Width: 60, Height: 30}),
		}, nil
	}}
	if err := service.EnableSnapshotCandidates([]SnapshotCandidateProvider{provider}, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := service.Open(context.Background(), "product-menu"); err != nil {
		t.Fatal(err)
	}
	defer service.Close(context.Background())
	a := service.active
	driver := service.driver.(*snapshotCandidateDriver)
	driver.handleHostEvent(customui.Event{WindowID: WindowID, Type: "measurement.pointermove", Fields: map[string]any{"u": .4, "v": .4}})
	view := waitCandidateView(t, service, func(view SnapshotCandidateView) bool { return len(view.Candidates) >= 3 })
	target := view.Candidates[0]
	local, ok := driver.localReferenceFor(target, a.snapshotToken())
	if !ok {
		t.Fatal("semantic Target did not derive a useful Local Reference")
	}
	if local.ID != "composer" {
		t.Fatalf("local reference=%q want composer", local.ID)
	}
}
