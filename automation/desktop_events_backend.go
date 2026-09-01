package automation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const defaultDesktopEventPollInterval = 200 * time.Millisecond

type pollingDesktopEventListener struct {
	id        uint64
	eventType DesktopEventType
	emit      func(DesktopEvent)
	fail      func(error)
}

type pollingDesktopEventBackend struct {
	interval time.Duration

	mu            sync.Mutex
	nextID        uint64
	listeners     map[uint64]*pollingDesktopEventListener
	closed        bool
	started       bool
	cancel        context.CancelFunc
	wake          chan struct{}
	waitGroup     sync.WaitGroup
	unsubscribeMu sync.Mutex

	state desktopPollingState
}

type pollingDesktopEventHandle struct {
	backend *pollingDesktopEventBackend
	id      uint64
	once    sync.Once
}

func newPollingDesktopEventBackend(interval time.Duration) DesktopEventBackend {
	if interval <= 0 {
		interval = defaultDesktopEventPollInterval
	}
	return &pollingDesktopEventBackend{
		interval:  interval,
		listeners: map[uint64]*pollingDesktopEventListener{},
		wake:      make(chan struct{}, 1),
		state:     desktopPollingState{failures: map[string]bool{}},
	}
}

func (b *pollingDesktopEventBackend) Capabilities() map[DesktopEventType]DesktopEventCapability {
	windowSupported := runtime.GOOS == "darwin" || runtime.GOOS == "windows"
	result := make(map[DesktopEventType]DesktopEventCapability, len(supportedDesktopEventTypes))
	for _, eventType := range supportedDesktopEventTypes {
		supported := true
		notes := "explicit polling fallback; events are coalesced and never presented as native notifications"
		switch desktopEventDomain(eventType) {
		case "window":
			supported = windowSupported
			notes += "; uses the existing normalized window facade"
		case "app":
			notes += "; macOS uses NSWorkspace running-application snapshots"
		case "clipboard":
			notes += "; payload contains revision metadata, never clipboard contents"
		case "display":
			notes += "; uses Screen.getDisplays-compatible metadata"
		}
		result[eventType] = DesktopEventCapability{
			Supported: supported, Backend: "polling", Platform: runtime.GOOS,
			IntervalMs: b.interval.Milliseconds(), Verified: false, Notes: notes,
		}
	}
	return result
}

func (b *pollingDesktopEventBackend) Subscribe(ctx context.Context, eventType DesktopEventType, emit func(DesktopEvent), fail func(error)) (DesktopEventBackendHandle, error) {
	if _, ok := supportedDesktopEventSet[eventType]; !ok {
		return nil, fmt.Errorf("unsupported desktop event type %q", eventType)
	}
	if !b.Capabilities()[eventType].Supported {
		return nil, fmt.Errorf("desktop event %q is unsupported on %s", eventType, runtime.GOOS)
	}
	if emit == nil {
		return nil, fmt.Errorf("desktop event emit callback is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, fmt.Errorf("desktop event backend is closed")
	}
	b.nextID++
	id := b.nextID
	b.listeners[id] = &pollingDesktopEventListener{id: id, eventType: eventType, emit: emit, fail: fail}
	if !b.started {
		loopContext, cancel := context.WithCancel(ctx)
		b.cancel = cancel
		b.started = true
		b.waitGroup.Add(1)
		go b.run(loopContext)
	}
	b.mu.Unlock()
	b.signalWake()
	return &pollingDesktopEventHandle{backend: b, id: id}, nil
}

func (b *pollingDesktopEventBackend) signalWake() {
	select {
	case b.wake <- struct{}{}:
	default:
	}
}

func (b *pollingDesktopEventBackend) run(ctx context.Context) {
	defer b.waitGroup.Done()
	ticker := time.NewTicker(b.interval)
	defer ticker.Stop()
	for {
		b.poll()
		select {
		case <-ctx.Done():
			return
		case <-b.wake:
		case <-ticker.C:
		}
	}
}

func (b *pollingDesktopEventBackend) poll() {
	listeners := b.listenerSnapshot()
	if len(listeners) == 0 {
		return
	}
	active := make(map[DesktopEventType]bool, len(listeners))
	for _, listener := range listeners {
		active[listener.eventType] = true
	}
	activeDomains := map[string]bool{}
	for eventType := range active {
		activeDomains[desktopEventDomain(eventType)] = true
	}

	if activeDomains["window"] {
		snapshot, err := pollDesktopWindows()
		if err != nil {
			b.reportDomainFailure("window", err, listeners)
		} else {
			b.clearDomainFailure("window")
			for _, event := range b.state.updateWindows(snapshot, active) {
				b.emit(event, listeners)
			}
		}
	}
	if activeDomains["app"] {
		snapshot, err := listDesktopApplicationsPlatform()
		if err != nil {
			b.reportDomainFailure("app", err, listeners)
		} else {
			b.clearDomainFailure("app")
			for _, event := range b.state.updateApplications(snapshot, active) {
				b.emit(event, listeners)
			}
		}
	}
	if activeDomains["clipboard"] {
		snapshot, err := desktopClipboardRevisionPlatform()
		if err != nil {
			b.reportDomainFailure("clipboard", err, listeners)
		} else {
			b.clearDomainFailure("clipboard")
			for _, event := range b.state.updateClipboard(snapshot, active) {
				b.emit(event, listeners)
			}
		}
	}
	if activeDomains["display"] {
		snapshot := pollDesktopDisplays()
		b.clearDomainFailure("display")
		for _, event := range b.state.updateDisplays(snapshot, active) {
			b.emit(event, listeners)
		}
	}
}

func (b *pollingDesktopEventBackend) listenerSnapshot() []*pollingDesktopEventListener {
	b.mu.Lock()
	defer b.mu.Unlock()
	result := make([]*pollingDesktopEventListener, 0, len(b.listeners))
	for _, listener := range b.listeners {
		result = append(result, listener)
	}
	return result
}

func (b *pollingDesktopEventBackend) emit(event DesktopEvent, listeners []*pollingDesktopEventListener) {
	event.SchemaVersion = 1
	event.Backend = "polling"
	event.Timestamp = time.Now().UTC()
	for _, listener := range listeners {
		if listener.eventType == event.Type && listener.emit != nil {
			listener.emit(event)
		}
	}
}

func (b *pollingDesktopEventBackend) reportDomainFailure(domain string, err error, listeners []*pollingDesktopEventListener) {
	if err == nil || b.state.failures[domain] {
		return
	}
	b.state.failures[domain] = true
	for _, listener := range listeners {
		if desktopEventDomain(listener.eventType) == domain && listener.fail != nil {
			listener.fail(err)
		}
	}
}

func (b *pollingDesktopEventBackend) clearDomainFailure(domain string) {
	delete(b.state.failures, domain)
}

func (b *pollingDesktopEventBackend) Close() error {
	if b == nil {
		return nil
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil
	}
	b.closed = true
	b.listeners = map[uint64]*pollingDesktopEventListener{}
	cancel := b.cancel
	b.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	b.signalWake()
	return nil
}

func (b *pollingDesktopEventBackend) Wait() {
	if b != nil {
		b.waitGroup.Wait()
	}
}

func (h *pollingDesktopEventHandle) Unsubscribe() error {
	if h == nil || h.backend == nil {
		return nil
	}
	h.once.Do(func() {
		h.backend.unsubscribeMu.Lock()
		h.backend.mu.Lock()
		delete(h.backend.listeners, h.id)
		h.backend.mu.Unlock()
		h.backend.unsubscribeMu.Unlock()
		h.backend.signalWake()
	})
	return nil
}

func desktopEventDomain(eventType DesktopEventType) string {
	switch eventType {
	case DesktopEventWindowFocused, DesktopEventWindowCreated, DesktopEventWindowClosed, DesktopEventWindowMoved, DesktopEventWindowResized:
		return "window"
	case DesktopEventAppLaunched, DesktopEventAppTerminated:
		return "app"
	case DesktopEventClipboardChanged:
		return "clipboard"
	case DesktopEventDisplayChanged:
		return "display"
	default:
		return "unknown"
	}
}

type desktopWindowState struct {
	Key          string
	Title        string
	PID          int64
	Handle       int64
	Index        int64
	X            int64
	Y            int64
	Width        int64
	Height       int64
	ExeName      string
	IsForeground bool
	HasFocus     bool
}

type desktopWindowSnapshot struct {
	Windows map[string]desktopWindowState
	Focused string
}

type desktopApplicationState struct {
	PID              int64  `json:"pid"`
	Name             string `json:"name"`
	BundleIdentifier string `json:"bundleIdentifier,omitempty"`
	Path             string `json:"path,omitempty"`
	ExecutablePath   string `json:"executablePath,omitempty"`
	ActivationPolicy int64  `json:"activationPolicy,omitempty"`
	Active           bool   `json:"active,omitempty"`
	Hidden           bool   `json:"hidden,omitempty"`
	Terminated       bool   `json:"terminated,omitempty"`
	LaunchTimeMS     int64  `json:"launchTimeMs,omitempty"`
}

type desktopClipboardRevision struct {
	Revision    string
	ChangeCount int64
}

type desktopDisplaySnapshot struct {
	Signature string
	Displays  []map[string]interface{}
}

type desktopPollingState struct {
	windowsInitialized      bool
	applicationsInitialized bool
	clipboardInitialized    bool
	displaysInitialized     bool
	windows                 desktopWindowSnapshot
	applications            map[int64]desktopApplicationState
	clipboard               desktopClipboardRevision
	displays                desktopDisplaySnapshot
	failures                map[string]bool
}

func pollDesktopWindows() (desktopWindowSnapshot, error) {
	rows, err := NewWindowManager().List()
	if err != nil {
		return desktopWindowSnapshot{}, err
	}
	result := desktopWindowSnapshot{Windows: map[string]desktopWindowState{}}
	for _, row := range rows {
		state := desktopWindowState{
			Title: stringValue(row["title"]), PID: integerValue(row["pid"]),
			Handle: integerValue(row["handle"]), Index: integerValue(row["index"]),
			X: integerValue(row["x"]), Y: integerValue(row["y"]),
			Width: integerValue(row["width"]), Height: integerValue(row["height"]),
			ExeName: stringValue(row["exeName"]), IsForeground: booleanValue(row["isForeground"]),
			HasFocus: booleanValue(row["hasFocus"]),
		}
		if state.PID <= 0 {
			continue
		}
		if state.Handle != 0 {
			state.Key = "handle:" + strconv.FormatInt(state.Handle, 10)
		} else {
			state.Key = fmt.Sprintf("pid:%d:title:%s:index:%d", state.PID, state.Title, state.Index)
		}
		result.Windows[state.Key] = state
		if state.HasFocus || state.IsForeground {
			result.Focused = state.Key
		}
	}
	return result, nil
}

func pollDesktopDisplays() desktopDisplaySnapshot {
	displays := NewScreen().GetDisplays()
	sort.Slice(displays, func(i, j int) bool { return integerValue(displays[i]["index"]) < integerValue(displays[j]["index"]) })
	encoded, _ := json.Marshal(displays)
	sum := sha256.Sum256(encoded)
	return desktopDisplaySnapshot{Signature: hex.EncodeToString(sum[:]), Displays: displays}
}

func (s *desktopPollingState) updateWindows(next desktopWindowSnapshot, active map[DesktopEventType]bool) []DesktopEvent {
	if !s.windowsInitialized {
		s.windowsInitialized = true
		s.windows = next
		return nil
	}
	var events []DesktopEvent
	if active[DesktopEventWindowFocused] && next.Focused != "" && next.Focused != s.windows.Focused {
		if current, ok := next.Windows[next.Focused]; ok {
			events = append(events, DesktopEvent{Type: DesktopEventWindowFocused, Data: map[string]interface{}{"window": desktopWindowData(current)}})
		}
	}
	keys := sortedWindowKeys(next.Windows)
	for _, key := range keys {
		current := next.Windows[key]
		previous, exists := s.windows.Windows[key]
		if !exists {
			if active[DesktopEventWindowCreated] {
				events = append(events, DesktopEvent{Type: DesktopEventWindowCreated, Data: map[string]interface{}{"window": desktopWindowData(current)}})
			}
			continue
		}
		if active[DesktopEventWindowMoved] && (current.X != previous.X || current.Y != previous.Y) {
			events = append(events, DesktopEvent{Type: DesktopEventWindowMoved, Data: map[string]interface{}{
				"window": desktopWindowData(current), "previousBounds": desktopWindowBounds(previous),
			}})
		}
		if active[DesktopEventWindowResized] && (current.Width != previous.Width || current.Height != previous.Height) {
			events = append(events, DesktopEvent{Type: DesktopEventWindowResized, Data: map[string]interface{}{
				"window": desktopWindowData(current), "previousBounds": desktopWindowBounds(previous),
			}})
		}
	}
	if active[DesktopEventWindowClosed] {
		for _, key := range sortedWindowKeys(s.windows.Windows) {
			if _, exists := next.Windows[key]; !exists {
				events = append(events, DesktopEvent{Type: DesktopEventWindowClosed, Data: map[string]interface{}{"window": desktopWindowData(s.windows.Windows[key])}})
			}
		}
	}
	s.windows = next
	return events
}

func sortedWindowKeys(windows map[string]desktopWindowState) []string {
	keys := make([]string, 0, len(windows))
	for key := range windows {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func desktopWindowBounds(window desktopWindowState) map[string]interface{} {
	return map[string]interface{}{"x": window.X, "y": window.Y, "width": window.Width, "height": window.Height}
}

func desktopWindowData(window desktopWindowState) map[string]interface{} {
	return map[string]interface{}{
		"key": window.Key, "title": window.Title, "pid": window.PID, "handle": window.Handle,
		"index": window.Index, "bounds": desktopWindowBounds(window), "exeName": window.ExeName,
		"isForeground": window.IsForeground, "hasFocus": window.HasFocus,
	}
}

func (s *desktopPollingState) updateApplications(next []desktopApplicationState, active map[DesktopEventType]bool) []DesktopEvent {
	nextByPID := make(map[int64]desktopApplicationState, len(next))
	for _, app := range next {
		if app.PID > 0 {
			nextByPID[app.PID] = app
		}
	}
	if !s.applicationsInitialized {
		s.applicationsInitialized = true
		s.applications = nextByPID
		return nil
	}
	var events []DesktopEvent
	if active[DesktopEventAppLaunched] {
		for _, pid := range sortedApplicationPIDs(nextByPID) {
			if _, exists := s.applications[pid]; !exists {
				events = append(events, DesktopEvent{Type: DesktopEventAppLaunched, Data: map[string]interface{}{"app": desktopApplicationData(nextByPID[pid])}})
			}
		}
	}
	if active[DesktopEventAppTerminated] {
		for _, pid := range sortedApplicationPIDs(s.applications) {
			if _, exists := nextByPID[pid]; !exists {
				events = append(events, DesktopEvent{Type: DesktopEventAppTerminated, Data: map[string]interface{}{"app": desktopApplicationData(s.applications[pid])}})
			}
		}
	}
	s.applications = nextByPID
	return events
}

func sortedApplicationPIDs(apps map[int64]desktopApplicationState) []int64 {
	pids := make([]int64, 0, len(apps))
	for pid := range apps {
		pids = append(pids, pid)
	}
	sort.Slice(pids, func(i, j int) bool { return pids[i] < pids[j] })
	return pids
}

func desktopApplicationData(app desktopApplicationState) map[string]interface{} {
	return map[string]interface{}{
		"pid": app.PID, "name": app.Name, "bundleIdentifier": app.BundleIdentifier,
		"path": app.Path, "executablePath": app.ExecutablePath,
		"activationPolicy": app.ActivationPolicy, "active": app.Active,
		"hidden": app.Hidden, "terminated": app.Terminated,
	}
}

func (s *desktopPollingState) updateClipboard(next desktopClipboardRevision, active map[DesktopEventType]bool) []DesktopEvent {
	if !s.clipboardInitialized {
		s.clipboardInitialized = true
		s.clipboard = next
		return nil
	}
	if next.Revision == s.clipboard.Revision {
		return nil
	}
	s.clipboard = next
	if !active[DesktopEventClipboardChanged] {
		return nil
	}
	data := map[string]interface{}{"contentIncluded": false}
	if next.ChangeCount >= 0 {
		data["changeCount"] = next.ChangeCount
	} else {
		data["revisionChanged"] = true
	}
	return []DesktopEvent{{Type: DesktopEventClipboardChanged, Data: data}}
}

func (s *desktopPollingState) updateDisplays(next desktopDisplaySnapshot, active map[DesktopEventType]bool) []DesktopEvent {
	if !s.displaysInitialized {
		s.displaysInitialized = true
		s.displays = next
		return nil
	}
	if next.Signature == s.displays.Signature {
		return nil
	}
	s.displays = next
	if !active[DesktopEventDisplayChanged] {
		return nil
	}
	return []DesktopEvent{{Type: DesktopEventDisplayChanged, Data: map[string]interface{}{"displays": next.Displays}}}
}

func integerValue(value interface{}) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int8:
		return int64(typed)
	case int16:
		return int64(typed)
	case int32:
		return int64(typed)
	case int64:
		return typed
	case uint:
		return int64(typed)
	case uint8:
		return int64(typed)
	case uint16:
		return int64(typed)
	case uint32:
		return int64(typed)
	case uint64:
		return int64(typed)
	case uintptr:
		return int64(typed)
	case float32:
		return int64(typed)
	case float64:
		return int64(typed)
	case json.Number:
		result, _ := typed.Int64()
		return result
	default:
		return 0
	}
}

func stringValue(value interface{}) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func booleanValue(value interface{}) bool {
	result, _ := value.(bool)
	return result
}
