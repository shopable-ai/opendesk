package measurement

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"opendesk/pkg/customui"
)

const defaultSnapshotCandidateTimeout = 2500 * time.Millisecond

// SnapshotCandidate binds one real semantic or visual candidate to the exact
// frozen Measurement snapshot that produced it. CandidateDescriptor remains the
// canonical reusable evidence shape; this envelope prevents asynchronous AX,
// UIA, OCR or vision results from leaking across snapshots.
type SnapshotCandidate struct {
	CandidateDescriptor
	Token      SnapshotToken `json:"snapshot"`
	Role       string        `json:"role,omitempty"`
	Name       string        `json:"name,omitempty"`
	Identifier string        `json:"identifier,omitempty"`
	Confidence float64       `json:"confidence,omitempty"`
}

func (candidate SnapshotCandidate) Validate() error {
	if err := candidate.Token.Validate(); err != nil {
		return err
	}
	if err := candidate.CandidateDescriptor.Validate(); err != nil {
		return err
	}
	if math.IsNaN(candidate.Confidence) || math.IsInf(candidate.Confidence, 0) || candidate.Confidence < 0 || candidate.Confidence > 1 {
		return errors.New("measurement candidate confidence must be within 0..1")
	}
	if !candidate.Semantic && (strings.TrimSpace(candidate.Role) != "" || strings.TrimSpace(candidate.Name) != "" || strings.TrimSpace(candidate.Identifier) != "") {
		return errors.New("visual measurement candidate cannot carry semantic role/name/identifier")
	}
	lowerSource := strings.ToLower(strings.TrimSpace(candidate.Source))
	if candidate.Semantic && (strings.Contains(lowerSource, "ocr") || strings.Contains(lowerSource, "vision") || strings.Contains(lowerSource, "image")) {
		return errors.New("visual perception source cannot be promoted to semantic measurement evidence")
	}
	return nil
}

type SnapshotCandidateRequest struct {
	Token     SnapshotToken `json:"snapshot"`
	Snapshot  Snapshot      `json:"-"`
	Reference Reference     `json:"-"`
	Pointer   Point         `json:"pointer"`
	ImagePath string        `json:"-"`
}

// SnapshotCandidateProvider is a narrow adapter over OpenDesk's existing
// perception owners. It does not own capture, input, locator execution, or
// Measurement lifecycle.
type SnapshotCandidateProvider interface {
	Name() string
	Candidates(context.Context, SnapshotCandidateRequest) ([]SnapshotCandidate, error)
}

type CandidateProviderFailure struct {
	Provider string `json:"provider"`
	Message  string `json:"message"`
	Timeout  bool   `json:"timeout,omitempty"`
}

type SnapshotCandidateView struct {
	Token      SnapshotToken              `json:"snapshot"`
	Candidates []SnapshotCandidate        `json:"candidates"`
	Index      int                        `json:"index"`
	Failures   []CandidateProviderFailure `json:"failures,omitempty"`
	Magnet     bool                       `json:"magnet"`
	Suspended  bool                       `json:"suspended"`
}

type snapshotCandidateRuntime struct {
	mu sync.Mutex

	token      SnapshotToken
	candidates []SnapshotCandidate
	index      int
	failures   []CandidateProviderFailure

	epoch   uint64
	request uint64
	cancel  context.CancelFunc

	magnet    bool
	suspended bool
	preview   string
}

type snapshotCandidateDriver struct {
	base      customui.Driver
	service   *Service
	providers []SnapshotCandidateProvider
	timeout   time.Duration
	state     snapshotCandidateRuntime
}

// EnableSnapshotCandidates attaches candidate resolution to this existing
// Measurement Service. It must be called before the first session is opened.
// Only the Measurement service's private driver reference is wrapped; the
// underlying shared CustomUI driver and all other product surfaces are reused.
func (s *Service) EnableSnapshotCandidates(providers []SnapshotCandidateProvider, timeout time.Duration) error {
	if s == nil {
		return errors.New("measurement service is unavailable")
	}
	clean := make([]SnapshotCandidateProvider, 0, len(providers))
	for _, provider := range providers {
		if provider != nil && strings.TrimSpace(provider.Name()) != "" {
			clean = append(clean, provider)
		}
	}
	if len(clean) == 0 {
		return errors.New("measurement snapshot candidates require at least one provider")
	}
	if timeout <= 0 {
		timeout = defaultSnapshotCandidateTimeout
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != nil || s.opening != nil {
		return errors.New("measurement snapshot candidate providers must be configured before opening a session")
	}
	if _, already := s.driver.(*snapshotCandidateDriver); already {
		return errors.New("measurement snapshot candidate providers are already configured")
	}
	s.driver = &snapshotCandidateDriver{base: s.driver, service: s, providers: clean, timeout: timeout, state: snapshotCandidateRuntime{magnet: true}}
	return nil
}

func (s *Service) SnapshotCandidates() SnapshotCandidateView {
	if s == nil {
		return SnapshotCandidateView{}
	}
	s.mu.Lock()
	driver, _ := s.driver.(*snapshotCandidateDriver)
	s.mu.Unlock()
	if driver == nil {
		return SnapshotCandidateView{}
	}
	return driver.snapshotView()
}

func (d *snapshotCandidateDriver) Capabilities(ctx context.Context) customui.Capabilities {
	return d.base.Capabilities(ctx)
}

const snapshotCandidateEventField = "_opendesk_snapshot_candidate"

func (d *snapshotCandidateDriver) Create(ctx context.Context, sessionID string, spec customui.WindowSpec, sink func(customui.Event)) (customui.DriverWindow, error) {
	wrapped := sink
	if spec.Kind == "measurement" {
		wrapped = func(event customui.Event) {
			event, consumed := d.prepareHostEvent(event)
			if consumed {
				return
			}
			sink(event)
		}
	}
	return d.base.Create(ctx, sessionID, spec, wrapped)
}

func (d *snapshotCandidateDriver) CloseSession(ctx context.Context, sessionID string) error {
	d.clear(true)
	return d.base.CloseSession(ctx, sessionID)
}

func (d *snapshotCandidateDriver) Close() error { return d.base.Close() }

func (d *snapshotCandidateDriver) active() *activeSession {
	if d == nil || d.service == nil {
		return nil
	}
	d.service.mu.Lock()
	defer d.service.mu.Unlock()
	return d.service.active
}

// handleHostEvent remains the test-facing side-effect helper. Production must
// use prepareHostEvent so a candidate-adjusted event reaches the Session sink.
func (d *snapshotCandidateDriver) handleHostEvent(event customui.Event) bool {
	_, consumed := d.prepareHostEvent(event)
	return consumed
}

func (d *snapshotCandidateDriver) prepareHostEvent(event customui.Event) (customui.Event, bool) {
	a := d.active()
	if a == nil || event.WindowID != WindowID {
		return event, false
	}

	if event.Type == "click" {
		switch event.TargetID {
		case "refreshSnapshot", "adjustInterface", "previousTarget", "nextTarget":
			d.invalidate()
		case "magnetToggle":
			d.state.mu.Lock()
			d.state.magnet = !d.state.magnet
			d.state.suspended = false
			disabled := !d.state.magnet
			d.state.mu.Unlock()
			if disabled {
				d.invalidate()
			}
		}
	}
	if (event.Type == "change" || event.Type == "input") && event.TargetID == "targetWindow" {
		d.invalidate()
	}

	if event.Type == "measurement.key" {
		key, _ := event.Fields["key"].(string)
		phase, _ := event.Fields["phase"].(string)
		if key == "Alt" || key == "Option" {
			d.state.mu.Lock()
			if d.state.magnet {
				d.state.suspended = phase != "up"
			} else {
				d.state.suspended = false
			}
			suspended := d.state.suspended
			d.state.mu.Unlock()
			if suspended {
				d.invalidate()
			}
			return event, false
		}
		if key == "Tab" {
			shift, _ := event.Fields["shift"].(bool)
			direction := 1
			if shift {
				direction = -1
			}
			go d.cycle(a, direction)
			return event, true
		}
	}

	if event.Type == "measurement.pointermove" || event.Type == "measurement.pointerdown" || event.Type == "measurement.pointerup" {
		point, err := a.logicalPoint(event.Fields)
		if err == nil {
			if event.Type == "measurement.pointermove" {
				d.resolveAsync(a, point)
			}
			event = d.snapPointerEvent(a, event, point)
		}
	}
	return event, false
}

func (d *snapshotCandidateDriver) invalidate() {
	d.state.mu.Lock()
	d.state.epoch++
	d.state.request++
	if d.state.cancel != nil {
		d.state.cancel()
		d.state.cancel = nil
	}
	d.state.token = SnapshotToken{}
	d.state.candidates = nil
	d.state.failures = nil
	d.state.index = 0
	d.state.mu.Unlock()
}

func (d *snapshotCandidateDriver) clear(removePreview bool) {
	d.state.mu.Lock()
	d.state.epoch++
	d.state.request++
	if d.state.cancel != nil {
		d.state.cancel()
		d.state.cancel = nil
	}
	preview := d.state.preview
	// Do not replace state wholesale here.  snapshotCandidateRuntime owns the
	// mutex currently protecting these fields; replacing it while locked leaves
	// us trying to unlock a new, unlocked mutex during Session close.
	d.state.token = SnapshotToken{}
	d.state.candidates = nil
	d.state.index = 0
	d.state.failures = nil
	d.state.suspended = false
	d.state.magnet = true
	d.state.preview = ""
	d.state.mu.Unlock()
	if removePreview && preview != "" {
		_ = os.Remove(preview)
	}
}

func (d *snapshotCandidateDriver) snapshotView() SnapshotCandidateView {
	d.state.mu.Lock()
	defer d.state.mu.Unlock()
	return SnapshotCandidateView{
		Token:      d.state.token,
		Candidates: append([]SnapshotCandidate(nil), d.state.candidates...),
		Index:      d.state.index,
		Failures:   append([]CandidateProviderFailure(nil), d.state.failures...),
		Magnet:     d.state.magnet,
		Suspended:  d.state.suspended,
	}
}

func (d *snapshotCandidateDriver) resolveAsync(a *activeSession, pointer Point) {
	if a == nil {
		return
	}
	// Refresh/Adjust replace the capture frame while candidate providers run in
	// the background.  Copy the complete request under the Session operation
	// lock so pixels, geometry, reference and asset path always name one
	// immutable Frozen Snapshot generation.
	a.operationMu.Lock()
	token := a.snapshotToken()
	frame := a.frame
	assetPath := a.assetPath
	a.operationMu.Unlock()
	if token.Validate() != nil || !pointInsideRect(pointer, frame.Reference.Bounds) {
		return
	}
	d.state.mu.Lock()
	// DM-AMEND-2026-09-17-01: suppression gates work, not only painting.
	// Keep this check under the same lock as request creation/invalidation.
	if !d.state.magnet || d.state.suspended {
		d.state.mu.Unlock()
		return
	}
	if !d.state.token.Matches(token) {
		d.state.epoch++
		if d.state.cancel != nil {
			d.state.cancel()
		}
		d.state.token = token
		d.state.candidates = nil
		d.state.failures = nil
		d.state.index = 0
	}
	d.state.request++
	requestID, epoch := d.state.request, d.state.epoch
	if d.state.cancel != nil {
		d.state.cancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), d.timeout)
	d.state.cancel = cancel
	d.state.mu.Unlock()

	request := SnapshotCandidateRequest{Token: token, Snapshot: frame.Snapshot, Reference: frame.Reference, Pointer: pointer, ImagePath: assetPath}
	go func() {
		defer cancel()
		candidates, failures := resolveSnapshotCandidateProviders(ctx, d.providers, request)
		candidates = normalizeSnapshotCandidates(request, candidates)
		if len(candidates) > 0 {
			window := snapshotWindowCandidate(request)
			if window.Validate() == nil {
				candidates = normalizeSnapshotCandidates(request, append(candidates, window))
			}
		}
		if !a.acceptsSnapshot(token) {
			return
		}
		d.state.mu.Lock()
		if d.state.epoch != epoch || d.state.request != requestID || !d.state.token.Matches(token) || !d.state.magnet || d.state.suspended {
			d.state.mu.Unlock()
			return
		}
		d.state.candidates = candidates
		d.state.failures = failures
		d.state.index = 0
		d.state.cancel = nil
		d.state.mu.Unlock()
		d.patchPreview(a)
	}()
}

func resolveSnapshotCandidateProviders(ctx context.Context, providers []SnapshotCandidateProvider, request SnapshotCandidateRequest) ([]SnapshotCandidate, []CandidateProviderFailure) {
	type result struct {
		provider string
		items    []SnapshotCandidate
		err      error
	}
	results := make(chan result, len(providers))
	var wg sync.WaitGroup
	for _, provider := range providers {
		provider := provider
		wg.Add(1)
		go func() {
			defer wg.Done()
			items, err := provider.Candidates(ctx, request)
			results <- result{provider: provider.Name(), items: items, err: err}
		}()
	}
	go func() { wg.Wait(); close(results) }()

	var candidates []SnapshotCandidate
	var failures []CandidateProviderFailure
	for item := range results {
		if len(item.items) > 0 {
			candidates = append(candidates, item.items...)
		}
		if item.err != nil {
			failures = append(failures, CandidateProviderFailure{Provider: item.provider, Message: item.err.Error(), Timeout: errors.Is(item.err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded)})
		}
	}
	sort.SliceStable(failures, func(i, j int) bool { return failures[i].Provider < failures[j].Provider })
	return candidates, failures
}

func normalizeSnapshotCandidates(request SnapshotCandidateRequest, input []SnapshotCandidate) []SnapshotCandidate {
	if request.Token.Validate() != nil || request.Reference.Validate() != nil {
		return nil
	}
	unique := map[string]SnapshotCandidate{}
	for _, candidate := range input {
		if candidate.Validate() != nil || !candidate.Token.Matches(request.Token) || !rectWithin(candidate.Bounds, request.Reference.Bounds, 1) || !pointInsideRect(request.Pointer, candidate.Bounds) {
			continue
		}
		key := fmt.Sprintf("%.2f:%.2f:%.2f:%.2f:%t:%s:%s:%s", candidate.Bounds.X, candidate.Bounds.Y, candidate.Bounds.Width, candidate.Bounds.Height, candidate.Semantic, candidate.Role, candidate.Name, candidate.Identifier)
		current, exists := unique[key]
		if !exists || snapshotCandidateBetter(candidate, current) {
			unique[key] = candidate
		}
	}
	result := make([]SnapshotCandidate, 0, len(unique))
	for _, candidate := range unique {
		result = append(result, candidate)
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, right := result[i], result[j]
		lr, rr := candidateReliabilityRank(left.Reliability), candidateReliabilityRank(right.Reliability)
		if lr != rr {
			return lr > rr
		}
		if left.Semantic != right.Semantic {
			return left.Semantic
		}
		la, ra := left.Bounds.Width*left.Bounds.Height, right.Bounds.Width*right.Bounds.Height
		if math.Abs(la-ra) > 0.01 {
			return la < ra
		}
		if left.Confidence != right.Confidence {
			return left.Confidence > right.Confidence
		}
		return left.ID < right.ID
	})
	return result
}

func snapshotCandidateBetter(left, right SnapshotCandidate) bool {
	lr, rr := candidateReliabilityRank(left.Reliability), candidateReliabilityRank(right.Reliability)
	if lr != rr {
		return lr > rr
	}
	if left.Semantic != right.Semantic {
		return left.Semantic
	}
	return left.Confidence > right.Confidence
}

func candidateReliabilityRank(value CandidateReliability) int {
	switch value {
	case CandidateReliabilityConfirmed:
		return 4
	case CandidateReliabilityReliable:
		return 3
	case CandidateReliabilityEstimated:
		return 2
	case CandidateReliabilityUnknown:
		return 1
	default:
		return 0
	}
}

func rectWithin(inner, outer Rect, tolerance float64) bool {
	return inner.X >= outer.X-tolerance && inner.Y >= outer.Y-tolerance && inner.Right() <= outer.Right()+tolerance && inner.Bottom() <= outer.Bottom()+tolerance
}

func snapshotWindowCandidate(request SnapshotCandidateRequest) SnapshotCandidate {
	window := request.Reference.Window
	label, id := "目标窗口", "window-reference"
	if window != nil {
		if strings.TrimSpace(window.Title) != "" {
			label = window.Title
		}
		if strings.TrimSpace(window.ID) != "" {
			id += ":" + window.ID
		}
	}
	return SnapshotCandidate{
		CandidateDescriptor: CandidateDescriptor{ID: id, Label: label, Source: "window-reference", Bounds: request.Reference.Bounds, Reliability: CandidateReliabilityReliable, Semantic: true},
		Token:               request.Token, Role: "window", Name: label, Confidence: 1,
	}
}

func (d *snapshotCandidateDriver) cycle(a *activeSession, direction int) {
	if a == nil || !a.acceptsSnapshot(a.snapshotToken()) {
		return
	}
	d.state.mu.Lock()
	if !d.state.magnet || d.state.suspended {
		d.state.mu.Unlock()
		d.patchInfo(a, "磁吸定位已关闭或暂时暂停；Tab 不执行候选切换。", "")
		return
	}
	if len(d.state.candidates) == 0 || !d.state.token.Matches(a.snapshotToken()) {
		d.state.mu.Unlock()
		d.patchInfo(a, "当前冻结 Snapshot 没有可循环的真实 UI / Visual Candidate；Tab 安全 no-op。", "")
		return
	}
	d.state.index = (d.state.index + direction) % len(d.state.candidates)
	if d.state.index < 0 {
		d.state.index += len(d.state.candidates)
	}
	d.state.mu.Unlock()
	d.patchPreview(a)
}

func (d *snapshotCandidateDriver) selected(a *activeSession) (SnapshotCandidate, bool) {
	if a == nil {
		return SnapshotCandidate{}, false
	}
	token := a.snapshotToken()
	d.state.mu.Lock()
	defer d.state.mu.Unlock()
	if !d.state.magnet || d.state.suspended || len(d.state.candidates) == 0 || !d.state.token.Matches(token) {
		return SnapshotCandidate{}, false
	}
	index := d.state.index
	if index < 0 || index >= len(d.state.candidates) {
		index = 0
	}
	candidate := d.state.candidates[index]
	return candidate, candidate.Token.Matches(token)
}

func (d *snapshotCandidateDriver) snapPointerEvent(a *activeSession, event customui.Event, raw Point) customui.Event {
	if a == nil {
		return event
	}
	a.operationMu.Lock()
	defer a.operationMu.Unlock()
	// Candidate selection is a Region-only operation. Point, Two Point and
	// Region-to-Region keep their own explicitly measured input semantics.
	if a.tool != "region" {
		return event
	}
	candidate, ok := d.selected(a)
	if !ok || !pointInsideRect(raw, candidate.Bounds) || a.manualPending || a.editAnchor != nil {
		return event
	}
	var point Point
	switch event.Type {
	case "measurement.pointerdown":
		point = Point{X: candidate.Bounds.X, Y: candidate.Bounds.Y}
	case "measurement.pointerup":
		point = Point{X: candidate.Bounds.Right(), Y: candidate.Bounds.Bottom()}
	default:
		return event
	}
	fields := make(map[string]any, len(event.Fields)+2)
	for key, value := range event.Fields {
		fields[key] = value
	}
	imagePoint := a.frame.Snapshot.Mapping.LogicalToImage(point)
	width, height := float64(a.frame.Snapshot.Mapping.ImageSize.Width), float64(a.frame.Snapshot.Mapping.ImageSize.Height)
	if width <= 0 || height <= 0 {
		return event
	}
	fields["u"] = clamp(imagePoint.X/width, 0, 1)
	fields["v"] = clamp(imagePoint.Y/height, 0, 1)
	if event.Type == "measurement.pointerup" && a.tool == "region" && candidate.Semantic {
		fields["snapCandidateSemantic"] = true
		fields["snapCandidateId"] = candidate.ID
		fields["snapCandidateLabel"] = candidate.Label
		if local, ok := d.localReferenceFor(candidate, a.snapshotToken()); ok {
			fields["snapLocalLabel"] = local.Label
			fields["snapLocalSource"] = local.Source
			fields["snapLocalReliability"] = string(local.Reliability)
			fields["snapLocalX"], fields["snapLocalY"] = local.Bounds.X, local.Bounds.Y
			fields["snapLocalWidth"], fields["snapLocalHeight"] = local.Bounds.Width, local.Bounds.Height
		}
	}
	// Keep the full envelope until the Session consumes the event so the
	// receiving side can reject a candidate from a stale snapshot generation.
	fields[snapshotCandidateEventField] = candidate
	event.Fields = fields
	return event
}

func (d *snapshotCandidateDriver) localReferenceFor(target SnapshotCandidate, token SnapshotToken) (SnapshotCandidate, bool) {
	if !target.Semantic {
		return SnapshotCandidate{}, false
	}
	d.state.mu.Lock()
	defer d.state.mu.Unlock()
	bestArea := 0.0
	var best SnapshotCandidate
	found := false
	for _, candidate := range d.state.candidates {
		if !candidate.Semantic || !candidate.Token.Matches(token) || candidate.Role == "window" || candidate.ID == target.ID {
			continue
		}
		if !rectWithin(target.Bounds, candidate.Bounds, 1) {
			continue
		}
		area := candidate.Bounds.Width * candidate.Bounds.Height
		targetArea := target.Bounds.Width * target.Bounds.Height
		if area <= targetArea+0.01 {
			continue
		}
		if !found || area < bestArea {
			best, bestArea, found = candidate, area, true
		}
	}
	return best, found
}

func (d *snapshotCandidateDriver) patchPreview(a *activeSession) {
	candidate, ok := d.selected(a)
	view := d.snapshotView()
	if !ok {
		if view.Token.Validate() == nil && !a.acceptsSnapshot(view.Token) {
			return
		}
		message := candidateStackSummary(view)
		d.patchInfo(a, message, "")
		return
	}
	// Do not read or patch a Surface after an Update, Adjust or Exit has made
	// this candidate's capture generation stale.  The same lock protects frame
	// replacement and teardown from an asynchronous preview write.
	a.operationMu.Lock()
	defer a.operationMu.Unlock()
	if !a.acceptsSnapshot(candidate.Token) {
		return
	}
	message := fmt.Sprintf("磁吸定位：%d/%d · %s · %s · %s", view.Index+1, len(view.Candidates), semanticKind(candidate), candidate.Reliability, candidate.Source)
	inspector := snapshotCandidateInspector(candidate, view)
	if a.result != nil {
		d.patchInfo(a, message, inspector)
		return
	}
	path, err := d.writePreviewOverlay(a, candidate)
	if err != nil {
		d.patchInfo(a, message+" · Preview 失败："+err.Error(), inspector)
		return
	}
	w := a.currentWindow()
	if w == nil {
		_ = os.Remove(path)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := w.UpdateControl(ctx, overlayID, customui.ControlPatch{Source: stringPtr(filepath.Base(path))}); err != nil {
		_ = os.Remove(path)
		d.patchInfo(a, message+" · Preview patch 失败："+err.Error(), inspector)
		return
	}
	d.state.mu.Lock()
	old := d.state.preview
	d.state.preview = path
	d.state.mu.Unlock()
	if old != "" && old != path {
		_ = os.Remove(old)
	}
	d.patchInfo(a, message, inspector)
}

func (d *snapshotCandidateDriver) patchInfo(a *activeSession, snapInfo, inspector string) {
	if a == nil {
		return
	}
	w := a.currentWindow()
	if w == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = w.UpdateControl(ctx, "snapInfo", customui.ControlPatch{Text: &snapInfo})
	if a.inspectorOpen {
		complete := a.inspectorEvidence()
		_, _ = w.UpdateControl(ctx, "measurementInspectorResult", customui.ControlPatch{Text: &complete})
	}
}

func candidateStackSummary(view SnapshotCandidateView) string {
	if !view.Magnet {
		return "磁吸定位：关"
	}
	if view.Suspended {
		return "磁吸定位：暂停（松开 Alt/Option 恢复）"
	}
	if len(view.Candidates) == 0 {
		if len(view.Failures) > 0 {
			return "磁吸定位：当前 Snapshot 暂无候选 · provider=" + view.Failures[0].Provider + " error=" + view.Failures[0].Message
		}
		return "磁吸定位：开 · 当前 Snapshot 暂无真实 UI / Visual Candidate"
	}
	return fmt.Sprintf("磁吸定位：开 · Candidate %d/%d", view.Index+1, len(view.Candidates))
}

func semanticKind(candidate SnapshotCandidate) string {
	if candidate.Semantic {
		return "semantic"
	}
	return "visual"
}

func snapshotCandidateInspector(candidate SnapshotCandidate, view SnapshotCandidateView) string {
	parts := []string{
		fmt.Sprintf("Snapshot Candidate %d/%d", view.Index+1, len(view.Candidates)),
		"source=" + candidate.Source,
		"kind=" + semanticKind(candidate),
		"reliability=" + string(candidate.Reliability),
		fmt.Sprintf("bounds=(%.1f, %.1f, %.1f, %.1f)", candidate.Bounds.X, candidate.Bounds.Y, candidate.Bounds.Width, candidate.Bounds.Height),
		fmt.Sprintf("sessionId=%s generation=%d snapshotId=%s", candidate.Token.SessionID, candidate.Token.Generation, candidate.Token.SnapshotID),
	}
	if candidate.Semantic {
		if candidate.Role != "" {
			parts = append(parts, "role="+candidate.Role)
		}
		if candidate.Name != "" {
			parts = append(parts, "name="+candidate.Name)
		}
		if candidate.Identifier != "" {
			parts = append(parts, "identifier="+candidate.Identifier)
		}
	} else if candidate.Label != "" {
		parts = append(parts, "visualLabel="+candidate.Label)
	}
	if len(view.Failures) > 0 {
		parts = append(parts, fmt.Sprintf("providerFailures=%d", len(view.Failures)))
	}
	return strings.Join(parts, "\n")
}

func (d *snapshotCandidateDriver) writePreviewOverlay(a *activeSession, candidate SnapshotCandidate) (string, error) {
	mapping := a.frame.Snapshot.Mapping
	if mapping.ImageSize.Width <= 0 || mapping.ImageSize.Height <= 0 {
		return "", errors.New("candidate preview requires positive image dimensions")
	}
	img := image.NewRGBA(image.Rect(0, 0, mapping.ImageSize.Width, mapping.ImageSize.Height))
	fillOutsideRect(img, mapping, a.frame.Reference.Bounds, overlayMaskColor)
	drawRect(img, mapping, a.frame.Reference.Bounds, overlayTargetColor, false)
	drawRect(img, mapping, candidate.Bounds, overlayResultColor, false)
	name := "candidate-" + d.service.now().UTC().Format("20060102T150405.000000000Z") + fmt.Sprintf("-%d.png", d.service.assetID.Add(1))
	path := filepath.Join(d.service.baseDir, name)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return "", fmt.Errorf("create candidate preview: %w", err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		return "", fmt.Errorf("encode candidate preview: %w", err)
	}
	return path, nil
}
