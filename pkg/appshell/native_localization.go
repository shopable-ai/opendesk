package appshell

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	"opendesk/pkg/localization"
)

// localizedNativeHost keeps locale switching inside App Shell. Native menu
// callbacks for the stable locale action IDs are consumed here and never reach
// the business JavaScript action sink.
type localizedNativeHost struct {
	inner    NativeHost
	manifest Manifest
	manager  *localization.Manager

	opMu sync.Mutex
	mu   sync.Mutex
	wg   sync.WaitGroup

	closed            bool
	runtimeLabelOwned map[string]bool
	debugDetailed     bool
}

func newLocalizedNativeHost(manifest Manifest, inner NativeHost, manager *localization.Manager) NativeHost {
	if inner == nil || manager == nil || !IsOpenDeskProduct(manifest) {
		return inner
	}
	return &localizedNativeHost{
		inner:             inner,
		manifest:          manifest,
		manager:           manager,
		runtimeLabelOwned: make(map[string]bool),
	}
}

func (h *localizedNativeHost) Start(ctx context.Context, handler func(string, string)) error {
	if handler == nil {
		return fmt.Errorf("App Shell tray action handler is required")
	}
	return h.inner.Start(ctx, func(itemID, source string) {
		preference, ok := localePreferenceForAction(itemID)
		if !ok {
			h.mu.Lock()
			closed := h.closed
			h.mu.Unlock()
			if !closed {
				handler(itemID, source)
			}
			return
		}

		// Windows invokes this callback on its tray message-loop thread. Calling
		// UpdateMenuItem synchronously from that thread would wait on the same
		// message loop. Run the locale operation outside the native callback and
		// serialize it with all other menu presentation updates.
		h.mu.Lock()
		if h.closed {
			h.mu.Unlock()
			return
		}
		h.wg.Add(1)
		h.mu.Unlock()
		go func() {
			defer h.wg.Done()
			if err := h.switchLocale(context.Background(), preference); err != nil && !errors.Is(err, ErrTornDown) {
				log.Printf("localization code=I18N_MENU_REFRESH_FAILED preference=%q error=%q", preference, err.Error())
			}
		}()
	})
}

func (h *localizedNativeHost) Activate(ctx context.Context) error {
	return h.inner.Activate(ctx)
}

func (h *localizedNativeHost) UpdateMenuItem(ctx context.Context, id string, patch MenuItemPatch) error {
	h.opMu.Lock()
	defer h.opMu.Unlock()

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return ErrTornDown
	}
	if patch.Label != nil {
		if id == ActionProductDebugNormal || id == ActionProductDebugDetailed {
			checked := labelIsChecked(*patch.Label)
			if checked {
				h.debugDetailed = id == ActionProductDebugDetailed
			}
			label := localizedDebugLabel(id, checked)
			patch.Label = &label
		} else {
			h.runtimeLabelOwned[id] = true
		}
	}
	h.mu.Unlock()
	return h.inner.UpdateMenuItem(ctx, id, patch)
}

func (h *localizedNativeHost) Teardown(ctx context.Context) error {
	h.mu.Lock()
	h.closed = true
	h.mu.Unlock()
	h.wg.Wait()

	h.opMu.Lock()
	defer h.opMu.Unlock()
	return h.inner.Teardown(ctx)
}

func (h *localizedNativeHost) Wait() { h.inner.Wait() }

func (h *localizedNativeHost) SetOpenDocumentHandler(handler func(string)) {
	if host, ok := h.inner.(OpenDocumentHost); ok {
		host.SetOpenDocumentHandler(handler)
	}
}

func (h *localizedNativeHost) OpenFlowFiles(ctx context.Context) ([]string, error) {
	if host, ok := h.inner.(FlowInstallHost); ok {
		return host.OpenFlowFiles(ctx)
	}
	return nil, fmt.Errorf("native Flow file picker is unavailable")
}

func (h *localizedNativeHost) ConfirmFlowTrust(ctx context.Context, prompt FlowTrustPrompt) (FlowTrustDecision, error) {
	if host, ok := h.inner.(FlowInstallHost); ok {
		return host.ConfirmFlowTrust(ctx, prompt)
	}
	return FlowTrustCancel, fmt.Errorf("native Flow trust prompt is unavailable")
}

func (h *localizedNativeHost) RunMain(ctx context.Context) error {
	if host, ok := h.inner.(MainThreadHost); ok {
		return host.RunMain(ctx)
	}
	return nil
}

func (h *localizedNativeHost) switchLocale(ctx context.Context, preference string) error {
	h.opMu.Lock()
	defer h.opMu.Unlock()

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return ErrTornDown
	}
	h.mu.Unlock()

	if err := h.manager.SetLocalePreference(preference); err != nil {
		return err
	}

	var refreshErrors []error
	visitNativeMenu(nativeMenuForManifest(h.manifest), func(item nativeMenuItem) {
		if item.Type == "separator" || item.ID == "" {
			return
		}

		h.mu.Lock()
		runtimeOwned := h.runtimeLabelOwned[item.ID]
		debugDetailed := h.debugDetailed
		h.mu.Unlock()
		if runtimeOwned {
			return
		}

		label := item.Label
		switch item.ID {
		case ActionProductDebugNormal:
			label = localizedDebugLabel(item.ID, !debugDetailed)
		case ActionProductDebugDetailed:
			label = localizedDebugLabel(item.ID, debugDetailed)
		}
		if err := h.inner.UpdateMenuItem(ctx, item.ID, MenuItemPatch{Label: &label}); err != nil {
			refreshErrors = append(refreshErrors, fmt.Errorf("refresh menu item %s: %w", item.ID, err))
		}
	})
	return errors.Join(refreshErrors...)
}

func localePreferenceForAction(action string) (string, bool) {
	switch strings.TrimSpace(action) {
	case ActionLocaleAuto:
		return localization.PreferenceAuto, true
	case ActionLocaleZhCN:
		return localization.LocaleZhCN, true
	case ActionLocaleEnUS:
		return localization.LocaleEnUS, true
	default:
		return "", false
	}
}

func labelIsChecked(label string) bool {
	return strings.HasPrefix(strings.TrimSpace(label), "✓")
}

func localizedDebugLabel(id string, checked bool) string {
	key, fallback := "menu.debugNormal", "普通"
	if id == ActionProductDebugDetailed {
		key, fallback = "menu.debugDetailed", "详细"
	}
	label := strings.TrimSpace(translatedProductLabel(key, fallback))
	label = strings.TrimSpace(strings.TrimPrefix(label, "✓"))
	if checked {
		return "✓ " + label
	}
	return label
}
