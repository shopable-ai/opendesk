package automation

import (
	"context"
	"runtime"
)

// AccessibilityBackend is called only from AccessibilityRuntime's one native
// worker, which is locked to one OS thread. Implementations own every native
// pointer behind opaque numeric handles; no AX/COM address crosses this seam.
type AccessibilityBackend interface {
	Name() string
	Capabilities() AccessibilityBackendCapabilities
	Initialize(context.Context) error
	Snapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilitySnapshotData, error)
	Find(context.Context, AccessibilityScope, AccessibilitySelector, AccessibilityLimits) (AccessibilityFindData, error)
	Read(context.Context, uint64, []string) (AccessibilityReadData, error)
	Perform(context.Context, uint64, AccessibilityAction) (AccessibilityActionData, error)
	MenuSnapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilityMenuData, error)
	FindMenuChild(context.Context, AccessibilityScope, uint64, AccessibilityMenuSegment, AccessibilityLimits) (AccessibilityMenuMatch, error)
	ExpandMenu(context.Context, uint64) (AccessibilityActionData, error)
	Release(uint64) error
	Close() error
	ResourceCount() int
}

// AccessibilityBackendFactory is an internal dependency seam. It is carried
// by execution.Request for tests but is never projected into JavaScript.
type AccessibilityBackendFactory func() AccessibilityBackend

type unsupportedAccessibilityBackend struct {
	reason string
}

func (b *unsupportedAccessibilityBackend) Name() string { return "unsupported" }

func (b *unsupportedAccessibilityBackend) Capabilities() AccessibilityBackendCapabilities {
	capabilities := defaultAccessibilityBackendCapabilities(b.Name())
	capabilities.Platform = runtime.GOOS
	capabilities.Notes = b.reason
	return capabilities
}

func (b *unsupportedAccessibilityBackend) unsupported(phase string) error {
	message := b.reason
	if message == "" {
		message = "native accessibility is not implemented on this platform"
	}
	return accessibilityError(AccessibilityNotSupported, phase, message, nil)
}

func (b *unsupportedAccessibilityBackend) Initialize(context.Context) error {
	return b.unsupported("initialize")
}
func (b *unsupportedAccessibilityBackend) Snapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilitySnapshotData, error) {
	return AccessibilitySnapshotData{}, b.unsupported("snapshot")
}
func (b *unsupportedAccessibilityBackend) Find(context.Context, AccessibilityScope, AccessibilitySelector, AccessibilityLimits) (AccessibilityFindData, error) {
	return AccessibilityFindData{}, b.unsupported("search")
}
func (b *unsupportedAccessibilityBackend) Read(context.Context, uint64, []string) (AccessibilityReadData, error) {
	return AccessibilityReadData{}, b.unsupported("read")
}
func (b *unsupportedAccessibilityBackend) Perform(context.Context, uint64, AccessibilityAction) (AccessibilityActionData, error) {
	return AccessibilityActionData{}, b.unsupported("action")
}
func (b *unsupportedAccessibilityBackend) MenuSnapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilityMenuData, error) {
	return AccessibilityMenuData{}, b.unsupported("menu_observe")
}
func (b *unsupportedAccessibilityBackend) FindMenuChild(context.Context, AccessibilityScope, uint64, AccessibilityMenuSegment, AccessibilityLimits) (AccessibilityMenuMatch, error) {
	return AccessibilityMenuMatch{}, b.unsupported("menu_search")
}
func (b *unsupportedAccessibilityBackend) ExpandMenu(context.Context, uint64) (AccessibilityActionData, error) {
	return AccessibilityActionData{}, b.unsupported("menu_expand")
}
func (b *unsupportedAccessibilityBackend) Release(uint64) error { return nil }
func (b *unsupportedAccessibilityBackend) Close() error         { return nil }
func (b *unsupportedAccessibilityBackend) ResourceCount() int   { return 0 }
