package automation

import (
	"errors"
	"fmt"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

type DisplayControlErrorCode string

const (
	DisplayControlInvalidArgument DisplayControlErrorCode = "INVALID_ARGUMENT"
	DisplayControlNotSupported    DisplayControlErrorCode = "NOT_SUPPORTED"
	DisplayControlNotFound        DisplayControlErrorCode = "NOT_FOUND"
	DisplayControlBackendFailed   DisplayControlErrorCode = "BACKEND_FAILED"
	DisplayControlReadbackFailed  DisplayControlErrorCode = "READBACK_FAILED"
)

// DisplayControlError omits display labels and topology from structured
// metadata. Those values can expose operator-chosen monitor names.
type DisplayControlError struct {
	Code       DisplayControlErrorCode
	Operation  string
	Platform   string
	Capability string
	Message    string
	Cause      error
}

func (e *DisplayControlError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "display control operation failed"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *DisplayControlError) Unwrap() error { return e.Cause }

func (e *DisplayControlError) JSProperties() map[string]interface{} {
	properties := map[string]interface{}{
		"code":      string(e.Code),
		"operation": e.Operation,
		"platform":  e.Platform,
	}
	if e.Capability != "" {
		properties["capability"] = e.Capability
	}
	return properties
}

type DisplayModeInfo struct {
	ID                  string  `json:"id"`
	IOModeID            int32   `json:"ioModeId"`
	Width               int     `json:"width"`
	Height              int     `json:"height"`
	PixelWidth          int     `json:"pixelWidth"`
	PixelHeight         int     `json:"pixelHeight"`
	RefreshRate         float64 `json:"refreshRate"`
	UsableForDesktopGUI bool    `json:"usableForDesktopGUI"`
	IsCurrent           bool    `json:"isCurrent"`
}

type DisplayModeChangeResult struct {
	DisplayID string          `json:"displayId"`
	Previous  DisplayModeInfo `json:"previous"`
	Current   DisplayModeInfo `json:"current"`
	Verified  bool            `json:"verified"`
}

func displayModeToMap(mode DisplayModeInfo) map[string]interface{} {
	return map[string]interface{}{
		"id":                  mode.ID,
		"ioModeId":            mode.IOModeID,
		"width":               mode.Width,
		"height":              mode.Height,
		"pixelWidth":          mode.PixelWidth,
		"pixelHeight":         mode.PixelHeight,
		"refreshRate":         mode.RefreshRate,
		"usableForDesktopGUI": mode.UsableForDesktopGUI,
		"isCurrent":           mode.IsCurrent,
	}
}

func displayModesToMaps(modes []DisplayModeInfo) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(modes))
	for _, mode := range modes {
		result = append(result, displayModeToMap(mode))
	}
	return result
}

func displayModeChangeToMap(result DisplayModeChangeResult) map[string]interface{} {
	return map[string]interface{}{
		"displayId": result.DisplayID,
		"previous":  displayModeToMap(result.Previous),
		"current":   displayModeToMap(result.Current),
		"verified":  result.Verified,
	}
}

type displayControlBackend interface {
	Name() string
	SupportsModes() bool
	CurrentMode(uint32) (DisplayModeInfo, error)
	ListModes(uint32) ([]DisplayModeInfo, error)
	SetMode(uint32, DisplayModeInfo) error
}

func displayModeID(mode DisplayModeInfo) string {
	refresh := strconv.FormatFloat(mode.RefreshRate, 'f', 3, 64)
	return fmt.Sprintf(
		"%d:%dx%d:%dx%d:%s",
		mode.IOModeID,
		mode.Width,
		mode.Height,
		mode.PixelWidth,
		mode.PixelHeight,
		refresh,
	)
}

func sameDisplayMode(left, right DisplayModeInfo) bool {
	return left.IOModeID == right.IOModeID &&
		left.Width == right.Width && left.Height == right.Height &&
		left.PixelWidth == right.PixelWidth && left.PixelHeight == right.PixelHeight
}

func normalizeDisplayModes(modes []DisplayModeInfo, current *DisplayModeInfo) []DisplayModeInfo {
	seen := make(map[string]struct{}, len(modes))
	result := make([]DisplayModeInfo, 0, len(modes))
	for _, mode := range modes {
		mode.ID = displayModeID(mode)
		if current != nil {
			mode.IsCurrent = sameDisplayMode(mode, *current)
		}
		if _, exists := seen[mode.ID]; exists {
			continue
		}
		seen[mode.ID] = struct{}{}
		result = append(result, mode)
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, right := result[i], result[j]
		if left.Width != right.Width {
			return left.Width < right.Width
		}
		if left.Height != right.Height {
			return left.Height < right.Height
		}
		if left.PixelWidth != right.PixelWidth {
			return left.PixelWidth < right.PixelWidth
		}
		if left.PixelHeight != right.PixelHeight {
			return left.PixelHeight < right.PixelHeight
		}
		if left.RefreshRate != right.RefreshRate {
			return left.RefreshRate < right.RefreshRate
		}
		return left.IOModeID < right.IOModeID
	})
	return result
}

func (s *Screen) displayBackend() displayControlBackend {
	if s != nil && s.displayControl != nil {
		return s.displayControl
	}
	return newDefaultDisplayControlBackend()
}

func displayControlError(code DisplayControlErrorCode, operation, capability, message string, cause error) error {
	return &DisplayControlError{
		Code: code, Operation: operation, Platform: runtime.GOOS,
		Capability: capability, Message: message, Cause: cause,
	}
}

func resolveDisplayID(raw string) (uint32, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, displayControlError(DisplayControlInvalidArgument, "resolveDisplay", "identity", "display id is required", nil)
	}
	parsed, err := strconv.ParseUint(value, 10, 32)
	if err != nil || parsed == 0 {
		return 0, displayControlError(DisplayControlInvalidArgument, "resolveDisplay", "identity", "display id must be a current Screen.getDisplays() id", err)
	}
	for _, display := range resolveDisplays() {
		if display.ID == value {
			return uint32(parsed), nil
		}
	}
	return 0, displayControlError(DisplayControlNotFound, "resolveDisplay", "identity", "display id is not active", nil)
}

// GetDisplayCapabilities reports the existing Screen inventory plus the
// explicitly narrower control surface. Brightness remains outside Core because
// macOS has no uniform hardware contract for built-in and external displays.
func (s *Screen) GetDisplayCapabilities() map[string]interface{} {
	backend := s.displayBackend()
	modes := backend.SupportsModes()
	modeStatus := "Unsupported"
	if modes {
		modeStatus = "Experimental"
	}
	return map[string]interface{}{
		"schemaVersion": 1,
		"platform":      runtime.GOOS,
		"backend":       backend.Name(),
		"identity": map[string]interface{}{
			"sessionId":  "Screen.getDisplays().id",
			"hardwareId": "vendor:model:serial:unit; serial may be zero",
			"index":      "1-based current ordering only",
		},
		"inventory": map[string]interface{}{
			"supported": true,
			"status":    "Stable",
			"namespace": "Screen",
		},
		"brightness": map[string]interface{}{
			"read":   false,
			"write":  false,
			"status": "Unsupported",
			"reason": "no uniform public macOS contract covers built-in and external display brightness; use a hardware-specific Native Extension",
		},
		"modes": map[string]interface{}{
			"read":     modes,
			"list":     modes,
			"set":      modes,
			"status":   modeStatus,
			"restore":  "caller must restore the previous mode; macOS also reverts process-scoped changes when the process exits",
			"readback": modes,
		},
	}
}

func (s *Screen) GetDisplayMode(displayID string) (DisplayModeInfo, error) {
	backend := s.displayBackend()
	if !backend.SupportsModes() {
		return DisplayModeInfo{}, displayControlError(DisplayControlNotSupported, "getDisplayMode", "modes.read", "display mode reading is not supported", nil)
	}
	id, err := resolveDisplayID(displayID)
	if err != nil {
		return DisplayModeInfo{}, err
	}
	mode, err := backend.CurrentMode(id)
	if err != nil {
		return DisplayModeInfo{}, displayControlError(DisplayControlBackendFailed, "getDisplayMode", "modes.read", "failed to read current display mode", err)
	}
	mode.ID = displayModeID(mode)
	mode.IsCurrent = true
	return mode, nil
}

func (s *Screen) ListDisplayModes(displayID string) ([]DisplayModeInfo, error) {
	backend := s.displayBackend()
	if !backend.SupportsModes() {
		return nil, displayControlError(DisplayControlNotSupported, "listDisplayModes", "modes.list", "display mode enumeration is not supported", nil)
	}
	id, err := resolveDisplayID(displayID)
	if err != nil {
		return nil, err
	}
	current, err := backend.CurrentMode(id)
	if err != nil {
		return nil, displayControlError(DisplayControlBackendFailed, "listDisplayModes", "modes.read", "failed to read current display mode", err)
	}
	modes, err := backend.ListModes(id)
	if err != nil {
		return nil, displayControlError(DisplayControlBackendFailed, "listDisplayModes", "modes.list", "failed to enumerate display modes", err)
	}
	return normalizeDisplayModes(modes, &current), nil
}

func (s *Screen) SetDisplayMode(displayID, modeID string) (DisplayModeChangeResult, error) {
	backend := s.displayBackend()
	if !backend.SupportsModes() {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlNotSupported, "setDisplayMode", "modes.set", "display mode mutation is not supported", nil)
	}
	id, err := resolveDisplayID(displayID)
	if err != nil {
		return DisplayModeChangeResult{}, err
	}
	requested := strings.TrimSpace(modeID)
	if requested == "" {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlInvalidArgument, "setDisplayMode", "modes.set", "mode id is required", nil)
	}
	previous, err := backend.CurrentMode(id)
	if err != nil {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlBackendFailed, "setDisplayMode", "modes.read", "failed to read previous display mode", err)
	}
	previous.ID = displayModeID(previous)
	previous.IsCurrent = true

	modes, err := backend.ListModes(id)
	if err != nil {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlBackendFailed, "setDisplayMode", "modes.list", "failed to enumerate display modes", err)
	}
	var selected *DisplayModeInfo
	for _, candidate := range normalizeDisplayModes(modes, &previous) {
		if candidate.ID == requested {
			copy := candidate
			selected = &copy
			break
		}
	}
	if selected == nil {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlNotFound, "setDisplayMode", "modes.set", "mode id is not available for this display", nil)
	}
	if err := backend.SetMode(id, *selected); err != nil {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlBackendFailed, "setDisplayMode", "modes.set", "failed to set display mode", err)
	}
	current, err := backend.CurrentMode(id)
	if err != nil {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlReadbackFailed, "setDisplayMode", "modes.set", "display mode changed but readback failed", err)
	}
	current.ID = displayModeID(current)
	current.IsCurrent = true
	if !sameDisplayMode(current, *selected) {
		return DisplayModeChangeResult{}, displayControlError(DisplayControlReadbackFailed, "setDisplayMode", "modes.set", "display mode readback did not match the requested mode", nil)
	}
	return DisplayModeChangeResult{
		DisplayID: displayID,
		Previous:  previous,
		Current:   current,
		Verified:  true,
	}, nil
}

func displayControlErrorCode(err error) DisplayControlErrorCode {
	var structured *DisplayControlError
	if errors.As(err, &structured) {
		return structured.Code
	}
	return ""
}
