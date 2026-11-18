//go:build darwin && cgo

package automation

/*
#include "accessibility_backend_darwin.h"
*/
import "C"

import (
	"context"
	"fmt"
	"strings"
)

// A private read-only snapshot using the existing native backend's ownership,
// deadline and permission machinery. Unlike general Snapshot, every descendant
// must prove its AXWindow before any name/value is read. No handles are stored.
func readDarwinWindowContent(ctx context.Context, w *darwinWindowManager, expected WindowInfo) (text string, err error) {
	b := newDefaultAccessibilityBackend().(*darwinAccessibilityBackend)
	defer func() {
		closeErr := b.Close()
		if closeErr != nil || b.ResourceCount() != 0 {
			text = ""
			err = windowOperationError("", WindowBackendFailed, "window content native cleanup failed", closeErr)
		}
	}()
	if err = b.Initialize(ctx); err != nil {
		return "", err
	}
	if err = verifyWindowContentIdentity(ctx, w, expected); err != nil {
		return "", err
	}
	identity := AccessibilityWindowIdentity{ID: expected.ID, PID: int64(expected.ProcessID), Handle: expected.Handle,
		Title: expected.Title, X: int64(expected.X), Y: int64(expected.Y), Width: int64(expected.Width), Height: int64(expected.Height),
		IsForeground: expected.IsForeground}
	root, err := b.resolveScopeRoot(ctx, AccessibilityScope{Kind: AccessibilityScopeWindow, PID: identity.PID, Window: &identity})
	if err != nil {
		return "", err
	}
	defer b.releaseRoot(root)
	calibration, err := b.calibrateSnapshotWindow(ctx, root, identity)
	if err != nil {
		return "", err
	}
	var out strings.Builder
	nodes := 0
	incomplete := func() error {
		return windowOperationError("", WindowBackendFailed, "window content snapshot is incomplete or exceeds its limits", nil)
	}
	appendText := func(s string) error {
		if s == "" {
			return nil
		}
		extra := 0
		if out.Len() > 0 {
			extra = 1
		}
		if len(s) > windowContentMaxBytes-out.Len()-extra {
			return incomplete()
		}
		if extra != 0 {
			out.WriteByte('\n')
		}
		out.WriteString(s)
		return nil
	}
	verify := func(element C.uintptr_t, isRoot bool) error {
		if err := b.verifyPID(ctx, element, identity.PID); err != nil {
			return err
		}
		owner := element
		if !isRoot {
			var err error
			owner, err = b.copyElementAttribute(ctx, element, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOW)
			if err != nil {
				return err
			}
			defer b.releaseNative(owner)
		}
		id, err := macScopedAXWindowID(uintptr(owner))
		if err != nil || id != identity.Handle {
			return darwinAXMappingStale()
		}
		return nil
	}
	var visit func(C.uintptr_t, int) error
	visit = func(element C.uintptr_t, depth int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if nodes >= windowContentMaxNodes {
			return incomplete()
		}
		nodes++
		if err := b.verifyPID(ctx, element, identity.PID); err != nil {
			return err
		}
		// Inspect subrole alone first. Never request a protected field's name/value.
		mask := uint32(C.OPENDESK_AX_SNAPSHOT_SUBROLE)
		metadata, err := b.inspectProperties(ctx, element, false, &mask)
		if err != nil {
			return err
		}
		if metadata.Secure {
			// Protected subtrees are outside the content contract. Do not read
			// their names, values or children, even when a provider exposes them.
			return b.verifyPID(ctx, element, identity.PID)
		}
		// These standard AppKit window controls are chrome, not body content.
		// Some background windows omit their AXWindow. Exclude the entire
		// control subtree without requesting any name/value or child attribute;
		// every body node below still requires its exact AXWindow identity.
		if depth > 0 && darwinAXString(metadata.NativeRole) == "AXButton" {
			switch darwinAXString(metadata.Subrole) {
			case "AXCloseButton", "AXMinimizeButton", "AXZoomButton", "AXFullScreenButton":
				return b.verifyPID(ctx, element, identity.PID)
			}
		}
		if err := verify(element, depth == 0); err != nil {
			return fmt.Errorf("window content node %d ownership: %w", nodes, err)
		}
		// Do not query menus: even AXChildren can materialize a lazy submenu.
		if metadata.deferCollapsedMenuChildren() {
			return incomplete()
		}
		mask |= uint32(C.OPENDESK_AX_SNAPSHOT_NAME)
		content, err := b.inspectProperties(ctx, element, true, &mask)
		if err != nil {
			return err
		}
		if err := verify(element, depth == 0); err != nil {
			return err
		}
		if depth > 0 {
			name := darwinAXString(content.Name)
			if err := appendText(name); err != nil {
				return err
			}
			value := ""
			switch v := content.Value.(type) {
			case string:
				value = v
			case float64, bool:
				value = fmt.Sprint(v)
			}
			if value != name {
				if err := appendText(value); err != nil {
					return err
				}
			}
		}
		children, materialized, err := b.copyElementArray(ctx, element, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN)
		if err != nil {
			return err
		}
		defer b.releaseAll(children)
		if !materialized && metadata.mayHaveUnmaterializedChildren() {
			return incomplete()
		}
		if len(children) > 0 && depth >= windowContentMaxDepth {
			return incomplete()
		}
		if len(children) > windowContentMaxNodes-nodes {
			return incomplete()
		}
		for _, child := range children {
			if err := visit(child, depth+1); err != nil {
				return err
			}
		}
		return verify(element, depth == 0)
	}
	if err := visit(root.element, 0); err != nil {
		return "", err
	}
	after, err := b.calibrateSnapshotWindow(ctx, root, identity)
	if err != nil {
		return "", err
	}
	if after.cg != calibration.cg || (after.native == nil) != (calibration.native == nil) ||
		(after.native != nil && *after.native != *calibration.native) {
		return "", darwinAXMappingStale()
	}
	if err := verifyWindowContentIdentity(ctx, w, expected); err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return out.String(), nil
}
