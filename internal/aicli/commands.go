package aicli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"

	"opendesk/automation"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeenv"
)

func runtimePlatform() string { return runtime.GOOS }

func capabilitiesCommand(_ *Context) (any, *Error) {
	platform := runtimePlatform()
	page := automation.NewPage()
	permissions := page.CheckScreenshotPermissions()
	screenOK, _ := permissions["screenCapture"].(bool)
	axOK, _ := permissions["accessibility"].(bool)
	windowStatus := capabilityFor(platform == "darwin" || platform == "windows", "unsupported")
	screenshotStatus := capabilityFor(platform != "darwin" || screenOK, "conditional")
	if platform != "darwin" {
		screenshotStatus = capabilityFor(true, "unsupported")
	}
	mouseStatus := capabilityFor(platform != "darwin" || axOK, "conditional")
	if platform != "darwin" {
		mouseStatus = capabilityFor(true, "unsupported")
	}
	vision := automation.NewVision()
	visionCaps, visionErr := vision.GetCapabilities(map[string]interface{}{})
	visionSupported := visionErr == nil && visionProviderReady(visionCaps["providers"])
	visionState := capabilityFor(visionSupported, "conditional")
	if visionErr == nil {
		visionState["providers"] = compactVisionProviders(visionCaps["providers"])
	}

	return map[string]any{
		"platform": platform,
		"capabilities": map[string]any{
			"windows":    windowStatus,
			"screen":     capabilityFor(true, "unsupported"),
			"screenshot": screenshotStatus,
			"mouse":      mouseStatus,
			"keyboard":   mouseStatus,
			"clipboard":  capabilityFor(true, "unsupported"),
			"app":        capabilityFor(true, "unsupported"),
			"vision":     visionState,
			"image":      capabilityFor(true, "unsupported"),
			"system":     capabilityFor(true, "unsupported"),
			"run":        capabilityFor(true, "unsupported"),
		},
		"permissions": permissions,
	}, nil
}

func compactVisionProviders(raw any) []map[string]any {
	items, ok := raw.([]map[string]interface{})
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		provider, _ := item["provider"].(string)
		implemented, _ := item["implemented"].(bool)
		entry := map[string]any{"name": provider, "implemented": implemented}
		if provider == "local" && implemented {
			_, err := exec.LookPath("tesseract")
			entry["available"] = err == nil
		}
		if required, ok := item["endpointRequired"].(bool); ok && required {
			entry["endpointConfigured"], _ = item["endpointConfigured"].(bool)
		}
		result = append(result, entry)
	}
	return result
}

func visionProviderReady(raw any) bool {
	items, ok := raw.([]map[string]interface{})
	if !ok {
		return false
	}
	for _, item := range items {
		implemented, _ := item["implemented"].(bool)
		if !implemented {
			continue
		}
		provider, _ := item["provider"].(string)
		if provider == "local" {
			if _, err := exec.LookPath("tesseract"); err == nil {
				return true
			}
			continue
		}
		required, _ := item["endpointRequired"].(bool)
		configured, _ := item["endpointConfigured"].(bool)
		if !required || configured {
			return true
		}
	}
	return false
}

func capabilityFor(supported bool, unavailableStatus string) map[string]any {
	if supported {
		return map[string]any{"status": "supported", "supported": true}
	}
	return map[string]any{"status": unavailableStatus, "supported": false}
}

func schemaCommand(_ *Context) (any, *Error) {
	commands := make(map[string]any)
	for _, item := range registry() {
		commands[item.Name] = map[string]any{
			"description": item.Description,
			"capability":  item.Capability,
			"arguments":   item.Arguments,
		}
	}
	return map[string]any{
		"version":        1,
		"entrypoint":     "opendesk ai <command>",
		"stdout":         "json-envelope-only",
		"artifactPolicy": "screenshots and command evidence are written below .runtime/ai/ by default",
		"commands":       commands,
	}, nil
}

func windowsCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("windows")
	title := fs.String("title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	items, err := automation.NewWindowManager().List()
	if err != nil {
		return nil, automationError(err, "windows")
	}
	needle := strings.ToLower(strings.TrimSpace(*title))
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		name, _ := item["title"].(string)
		if needle != "" && !strings.Contains(strings.ToLower(name), needle) {
			continue
		}
		result = append(result, compactWindowMap(item))
	}
	return result, nil
}

func windowActiveCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("window active", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	info, err := automation.NewWindowManager().GetActiveWindow()
	if err != nil || info == nil {
		return nil, windowError(err)
	}
	return compactWindow(info), nil
}

func windowFindCommand(ctx *Context) (any, *Error) {
	title, cliErr := parseTitle("window find", ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	info, err := automation.NewWindowManager().GetWindowByTitle(title)
	if err != nil || info == nil {
		return nil, windowError(err)
	}
	return compactWindow(info), nil
}

func windowFocusCommand(ctx *Context) (any, *Error) {
	title, cliErr := parseTitle("window focus", ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	manager := automation.NewWindowManager()
	if err := manager.Focus(title); err != nil {
		return nil, automationError(err, "window focus")
	}
	info, err := manager.GetWindowByTitle(title)
	if err != nil || info == nil {
		return map[string]any{"focused": true, "title": title}, nil
	}
	return compactWindow(info), nil
}

func windowBoundsCommand(ctx *Context) (any, *Error) {
	title, cliErr := parseTitle("window bounds", ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	info, err := automation.NewWindowManager().GetWindowByTitle(title)
	if err != nil || info == nil {
		return nil, windowError(err)
	}
	return compactWindow(info), nil
}

func windowMoveCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("window move")
	title := fs.String("title", "", "")
	x := fs.Int("x", 0, "")
	y := fs.Int("y", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "title", *title); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "x", *x); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "y", *y); cliErr != nil {
		return nil, cliErr
	}
	manager := automation.NewWindowManager()
	info, err := manager.GetWindowByTitle(*title)
	if err != nil || info == nil {
		return nil, windowError(err)
	}
	if err := manager.SetWindowBounds(*title, *x, *y, int(info.Width), int(info.Height)); err != nil {
		return nil, automationError(err, "window move")
	}
	updated, err := manager.GetWindowByTitle(*title)
	if err != nil || updated == nil {
		return map[string]any{"moved": true}, nil
	}
	return compactWindow(updated), nil
}

func windowResizeCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("window resize")
	title := fs.String("title", "", "")
	width := fs.Int("width", 0, "")
	height := fs.Int("height", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "title", *title); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "width", *width); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "height", *height); cliErr != nil {
		return nil, cliErr
	}
	if *width <= 0 || *height <= 0 {
		return nil, invalidArgument("width and height must be positive")
	}
	manager := automation.NewWindowManager()
	info, err := manager.GetWindowByTitle(*title)
	if err != nil || info == nil {
		return nil, windowError(err)
	}
	if err := manager.SetWindowBounds(*title, int(info.X), int(info.Y), *width, *height); err != nil {
		return nil, automationError(err, "window resize")
	}
	updated, err := manager.GetWindowByTitle(*title)
	if err != nil || updated == nil {
		return map[string]any{"resized": true}, nil
	}
	return compactWindow(updated), nil
}

func windowMaximizeCommand(ctx *Context) (any, *Error) {
	return windowSimpleAction(ctx, "window maximize", func(w *automation.WindowManager, title string) error { return w.Maximize(title) })
}
func windowMinimizeCommand(ctx *Context) (any, *Error) {
	return windowSimpleAction(ctx, "window minimize", func(w *automation.WindowManager, title string) error { return w.Minimize(title) })
}
func windowRestoreCommand(ctx *Context) (any, *Error) {
	return windowSimpleAction(ctx, "window restore", func(w *automation.WindowManager, title string) error { return w.Restore(title) })
}
func windowCloseCommand(ctx *Context) (any, *Error) {
	return windowSimpleAction(ctx, "window close", func(w *automation.WindowManager, title string) error { return w.CloseWindow(title) })
}

func windowSimpleAction(ctx *Context, name string, action func(*automation.WindowManager, string) error) (any, *Error) {
	title, cliErr := parseTitle(name, ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	if err := action(automation.NewWindowManager(), title); err != nil {
		return nil, automationError(err, name)
	}
	return map[string]any{"ok": true, "title": title}, nil
}

func windowContentCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("window content")
	title := fs.String("title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	manager := automation.NewWindowManager()
	if strings.TrimSpace(*title) == "" {
		value, err := manager.Content()
		if err != nil {
			return nil, automationError(err, "window content")
		}
		return map[string]any{"text": value}, nil
	}
	value, err := manager.GetContent(*title)
	if err != nil {
		return nil, automationError(err, "window content")
	}
	return map[string]any{"text": value}, nil
}

func screenListCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("screen list", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	displays := automation.NewScreen().GetDisplays()
	for i, display := range displays {
		display["display"] = i
	}
	return displays, nil
}

func screenInfoCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("screen info")
	display := fs.Int("display", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	screen := automation.NewScreen()
	if !visited(fs, "display") {
		return map[string]any{"primary": screen.GetPrimaryDisplay(), "virtualBounds": screen.GetVirtualBounds()}, nil
	}
	if *display < 0 {
		return nil, invalidArgument("display must be zero or greater")
	}
	item := screen.GetDisplay(*display + 1)
	if item == nil {
		return nil, &Error{Code: "invalid_argument", Message: fmt.Sprintf("display %d does not exist", *display)}
	}
	item["display"] = *display
	return item, nil
}

func screenPixelCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("screen pixel")
	x := fs.Int("x", 0, "")
	y := fs.Int("y", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "x", *x); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "y", *y); cliErr != nil {
		return nil, cliErr
	}
	return map[string]any{"x": *x, "y": *y, "color": automation.NewScreen().Pixel(*x, *y)}, nil
}

func screenshotCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("screenshot")
	active := fs.Bool("active-window", false, "")
	title := fs.String("window-title", "", "")
	screenTarget := fs.Bool("screen", false, "")
	display := fs.Int("display", 0, "")
	region := fs.String("region", "", "")
	relative := fs.String("region-relative", "", "")
	output := fs.String("output", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	// Match the Runtime screenshot default: absent --screen, capture the active
	// window rather than spending tokens on a full desktop image.
	windowTarget := *active || strings.TrimSpace(*title) != "" || !*screenTarget
	if *screenTarget && windowTarget {
		return nil, invalidArgument("--screen cannot be combined with a window target")
	}
	if strings.TrimSpace(*region) != "" && strings.TrimSpace(*relative) != "" {
		return nil, invalidArgument("--region and --region-relative are mutually exclusive")
	}
	if *display < 0 {
		return nil, invalidArgument("display must be zero or greater")
	}
	if strings.TrimSpace(*relative) != "" && !windowTarget {
		return nil, invalidArgument("--region-relative requires --active-window or --window-title")
	}

	page := automation.NewPage()
	if runtime.GOOS == "darwin" {
		permissions := page.CheckScreenshotPermissions()
		if allowed, _ := permissions["screenCapture"].(bool); !allowed {
			return nil, &Error{Code: "permission_required", Permission: "screen-recording", Message: "macOS Screen Recording permission is required for screenshots"}
		}
	}

	options := map[string]interface{}{"returnType": "object"}
	if strings.TrimSpace(*output) == "" {
		if ctx.Tracker == nil {
			return nil, &Error{Code: "internal_error", Message: "screenshot evidence tracker is unavailable"}
		}
		*output = filepath.Join(ctx.Tracker.artifacts.RunDir, "screenshot.png")
	}
	options["path"] = *output

	var target *automation.WindowInfo
	if strings.TrimSpace(*title) != "" {
		manager := automation.NewWindowManager()
		if err := manager.Focus(*title); err != nil {
			return nil, automationError(err, "screenshot window focus")
		}
		info, err := manager.GetWindowByTitle(*title)
		if err != nil || info == nil {
			return nil, windowError(err)
		}
		target = info
		options["target"] = "activeWindow"
	} else if windowTarget {
		info, err := automation.NewWindowManager().GetActiveWindow()
		if err != nil || info == nil {
			return nil, windowError(err)
		}
		target = info
		options["target"] = "activeWindow"
	} else {
		options["target"] = "screen"
		if visited(fs, "display") && *display > 0 {
			options["displayIndex"] = *display + 1
		}
	}

	if strings.TrimSpace(*region) != "" {
		rect, cliErr := parseRect(*region)
		if cliErr != nil {
			return nil, cliErr
		}
		if target != nil {
			if cliErr := validateLocalRect(rect, target); cliErr != nil {
				return nil, cliErr
			}
			rect.X += int(target.X)
			rect.Y += int(target.Y)
		}
		options["clip"] = rect.mapValue()
	}
	if strings.TrimSpace(*relative) != "" {
		ratio, cliErr := parseRelativeRect(*relative)
		if cliErr != nil {
			return nil, cliErr
		}
		rect := relativeRect(target, ratio)
		options["clip"] = rect.mapValue()
	}

	shot, err := page.Screenshot(options)
	if err != nil {
		return nil, automationError(err, "screenshot")
	}
	result, ok := shot.(map[string]interface{})
	if !ok {
		return nil, &Error{Code: "internal_error", Message: "screenshot backend returned an unexpected response"}
	}
	if target != nil {
		result["window"] = compactWindow(target)
	}
	if target != nil && (strings.TrimSpace(*region) != "" || strings.TrimSpace(*relative) != "") {
		result["coordinateSpace"] = "window-local"
	} else if strings.TrimSpace(*region) != "" {
		result["coordinateSpace"] = "screen"
	}
	return result, nil
}

func mousePositionCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("mouse position", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	return automation.NewMouse().GetPos(), nil
}

func mouseMoveCommand(ctx *Context) (any, *Error) {
	point, cliErr := parsePoint("mouse move", ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewMouse().Move(point.X, point.Y, map[string]interface{}{"steps": point.Steps}); err != nil {
		return nil, automationError(err, "mouse move")
	}
	return point.result(), nil
}

func mouseClickCommand(ctx *Context) (any, *Error)       { return mouseClick(ctx, 1) }
func mouseDoubleClickCommand(ctx *Context) (any, *Error) { return mouseClick(ctx, 2) }

func mouseClick(ctx *Context, count int) (any, *Error) {
	point, cliErr := parsePoint("mouse click", ctx.Args)
	if cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewMouse().Click(point.X, point.Y, map[string]interface{}{"button": point.Button, "clickCount": count, "delay": point.Delay}); err != nil {
		return nil, automationError(err, "mouse click")
	}
	result := point.result()
	result["clickCount"] = count
	return result, nil
}

func mouseDownCommand(ctx *Context) (any, *Error) { return mouseButton(ctx, "down") }
func mouseUpCommand(ctx *Context) (any, *Error)   { return mouseButton(ctx, "up") }

func mouseButton(ctx *Context, action string) (any, *Error) {
	fs := newFlagSet("mouse " + action)
	button := fs.String("button", "left", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	mouse := automation.NewMouse()
	var err error
	if action == "down" {
		err = mouse.Down(map[string]interface{}{"button": *button})
	} else {
		err = mouse.Up(map[string]interface{}{"button": *button})
	}
	if err != nil {
		return nil, automationError(err, "mouse "+action)
	}
	return map[string]any{"button": *button, "state": action}, nil
}

func mouseDragCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("mouse drag")
	fromX := fs.Int("from-x", 0, "")
	fromY := fs.Int("from-y", 0, "")
	toX := fs.Int("to-x", 0, "")
	toY := fs.Int("to-y", 0, "")
	steps := fs.Int("steps", 1, "")
	button := fs.String("button", "left", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	for _, item := range []struct {
		name  string
		value int
	}{{"from-x", *fromX}, {"from-y", *fromY}, {"to-x", *toX}, {"to-y", *toY}} {
		if cliErr := requireFlagInt(fs, item.name, item.value); cliErr != nil {
			return nil, cliErr
		}
	}
	if *steps <= 0 {
		return nil, invalidArgument("steps must be positive")
	}
	mouse := automation.NewMouse()
	if err := mouse.Move(*fromX, *fromY, nil); err != nil {
		return nil, automationError(err, "mouse drag")
	}
	if err := mouse.Down(map[string]interface{}{"button": *button}); err != nil {
		return nil, automationError(err, "mouse drag")
	}
	if err := mouse.Move(*toX, *toY, map[string]interface{}{"steps": *steps}); err != nil {
		_ = mouse.Up(map[string]interface{}{"button": *button})
		return nil, automationError(err, "mouse drag")
	}
	if err := mouse.Up(map[string]interface{}{"button": *button}); err != nil {
		return nil, automationError(err, "mouse drag")
	}
	return map[string]any{"from": map[string]int{"x": *fromX, "y": *fromY}, "to": map[string]int{"x": *toX, "y": *toY}, "button": *button}, nil
}

func keyboardTypeCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("keyboard type")
	text := fs.String("text", "", "")
	title := fs.String("window-title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "text", *text); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := focusOptional(*title); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewKeyboard().Type(*text); err != nil {
		return nil, automationError(err, "keyboard type")
	}
	return map[string]any{"typed": len([]rune(*text))}, nil
}

func keyboardPressCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("keyboard press")
	key := fs.String("key", "", "")
	title := fs.String("window-title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "key", *key); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := focusOptional(*title); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewKeyboard().Press(normalizeCLIKey(*key)); err != nil {
		return nil, automationError(err, "keyboard press")
	}
	return map[string]any{"key": *key}, nil
}

func keyboardHotkeyCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("keyboard hotkey")
	keysRaw := fs.String("keys", "", "")
	title := fs.String("window-title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "keys", *keysRaw); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := focusOptional(*title); cliErr != nil {
		return nil, cliErr
	}
	parts := strings.Split(*keysRaw, ",")
	keys := make([]string, 0, len(parts))
	for _, part := range parts {
		key := strings.TrimSpace(part)
		if key == "" {
			return nil, invalidArgument("--keys cannot contain an empty key")
		}
		keys = append(keys, normalizeCLIKey(key))
	}
	if err := automation.NewKeyboard().Combination(keys...); err != nil {
		return nil, automationError(err, "keyboard hotkey")
	}
	return map[string]any{"keys": keys}, nil
}

func scrollCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("scroll")
	dx := fs.Int("dx", 0, "")
	dy := fs.Int("dy", 0, "")
	steps := fs.Int("steps", 1, "")
	delay := fs.Int("delay", 0, "")
	title := fs.String("window-title", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if !visited(fs, "dx") && !visited(fs, "dy") {
		return nil, invalidArgument("provide --dx and/or --dy")
	}
	if *steps <= 0 || *delay < 0 {
		return nil, invalidArgument("steps must be positive and delay cannot be negative")
	}
	if cliErr := focusOptional(*title); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewMouse().Wheel(map[string]interface{}{"deltaX": *dx, "deltaY": *dy, "steps": *steps, "delay": *delay}); err != nil {
		return nil, automationError(err, "scroll")
	}
	return map[string]any{"dx": *dx, "dy": *dy, "steps": *steps}, nil
}

func clipboardGetCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("clipboard get", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	text, err := automation.NewClipboard().Paste()
	if err != nil {
		return nil, automationError(err, "clipboard get")
	}
	return map[string]any{"text": text}, nil
}
func clipboardSetCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("clipboard set")
	text := fs.String("text", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "text", *text); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewClipboard().Copy(*text); err != nil {
		return nil, automationError(err, "clipboard set")
	}
	return map[string]any{"written": true}, nil
}
func clipboardClearCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("clipboard clear", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewClipboard().Clear(); err != nil {
		return nil, automationError(err, "clipboard clear")
	}
	return map[string]any{"cleared": true}, nil
}

func appOpenCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("app open")
	name := fs.String("name", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "name", *name); cliErr != nil {
		return nil, cliErr
	}
	if err := automation.NewPage().OpenApp(*name); err != nil {
		return nil, automationError(err, "app open")
	}
	return map[string]any{"opened": *name}, nil
}
func appOpenURLCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("app open-url")
	name := fs.String("name", "", "")
	url := fs.String("url", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "url", *url); cliErr != nil {
		return nil, cliErr
	}
	page := automation.NewPage()
	var err error
	if strings.TrimSpace(*name) == "" {
		err = page.OpenURL(*url)
	} else {
		err = page.OpenURLInApp(*name, *url)
	}
	if err != nil {
		return nil, automationError(err, "app open-url")
	}
	return map[string]any{"url": *url, "name": *name}, nil
}

func visionOCRCommand(ctx *Context) (any, *Error) {
	options, cliErr := parseVisionOptions("vision ocr", ctx.Args, false)
	if cliErr != nil {
		return nil, cliErr
	}
	result, err := automation.NewVision().RunOCR(options)
	if err != nil {
		return nil, automationError(err, "vision ocr")
	}
	return result, nil
}

func visionDetectUICommand(ctx *Context) (any, *Error) {
	options, cliErr := parseVisionOptions("vision detect-ui", ctx.Args, true)
	if cliErr != nil {
		return nil, cliErr
	}
	result, err := automation.NewVision().DetectUI(options)
	if err != nil {
		return nil, automationError(err, "vision detect-ui")
	}
	return result, nil
}

func imageMatchCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("image match")
	imagePath := fs.String("image", "", "")
	templatePath := fs.String("template", "", "")
	threshold := fs.Float64("threshold", 0.8, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "image", *imagePath); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "template", *templatePath); cliErr != nil {
		return nil, cliErr
	}
	if *threshold < 0 || *threshold > 1 {
		return nil, invalidArgument("threshold must be between 0 and 1")
	}
	result, err := automation.NewImageColor().FindPos(*imagePath, *templatePath, float32(*threshold))
	if err != nil {
		return nil, automationError(err, "image match")
	}
	return result, nil
}

func imageColorCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("image color")
	imagePath := fs.String("image", "", "")
	color := fs.String("color", "", "")
	x := fs.Int("x", 0, "")
	y := fs.Int("y", 0, "")
	width := fs.Int("width", 0, "")
	height := fs.Int("height", 0, "")
	threshold := fs.Int("threshold", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "image", *imagePath); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "color", *color); cliErr != nil {
		return nil, cliErr
	}
	base64Image, err := automation.NewImageColor().LoadBase64(*imagePath)
	if err != nil {
		return nil, automationError(err, "image color")
	}
	options := map[string]interface{}{}
	for _, item := range []struct {
		name  string
		value int
	}{{"x", *x}, {"y", *y}, {"width", *width}, {"height", *height}, {"threshold", *threshold}} {
		if visited(fs, item.name) {
			options[item.name] = item.value
		}
	}
	raw, err := automation.NewImageColor().FindColor(base64Image, *color, options)
	if err != nil {
		return nil, automationError(err, "image color")
	}
	var result any
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, &Error{Code: "internal_error", Message: "ImageColor returned invalid JSON"}
	}
	return result, nil
}

func imagePixelCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("image pixel")
	imagePath := fs.String("image", "", "")
	x := fs.Int("x", 0, "")
	y := fs.Int("y", 0, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "image", *imagePath); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "x", *x); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagInt(fs, "y", *y); cliErr != nil {
		return nil, cliErr
	}
	image, err := automation.NewImageColor().LoadBase64(*imagePath)
	if err != nil {
		return nil, automationError(err, "image pixel")
	}
	color, err := automation.NewImageColor().Pixel(image, *x, *y)
	if err != nil {
		return nil, automationError(err, "image pixel")
	}
	return map[string]any{"x": *x, "y": *y, "color": color}, nil
}
func imageSizeCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("image size")
	imagePath := fs.String("image", "", "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "image", *imagePath); cliErr != nil {
		return nil, cliErr
	}
	image, err := automation.NewImageColor().LoadBase64(*imagePath)
	if err != nil {
		return nil, automationError(err, "image size")
	}
	size := automation.NewImageColor().GetSize(image)
	if len(size) != 2 {
		return nil, &Error{Code: "internal_error", Message: "image size is unavailable"}
	}
	return map[string]any{"width": size[0], "height": size[1]}, nil
}

func systemInfoCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("system info", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	system := automation.NewSystem(nil, nil)
	info, err := system.GetSystemInfo()
	if err != nil {
		return nil, automationError(err, "system info")
	}
	info["runtime"] = system.GetPlatformInfo()
	return info, nil
}
func systemProcessesCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("system processes")
	limit := fs.Int("limit", 50, "")
	if cliErr := parseFlags(fs, ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	if *limit < 1 || *limit > 500 {
		return nil, invalidArgument("limit must be between 1 and 500")
	}
	items, err := automation.NewSystem(nil, nil).GetProcessList()
	if err != nil {
		return nil, automationError(err, "system processes")
	}
	sort.Slice(items, func(i, j int) bool { return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"]) })
	if len(items) > *limit {
		items = items[:*limit]
	}
	return map[string]any{"items": items, "limit": *limit}, nil
}
func systemMetricsCommand(ctx *Context) (any, *Error) {
	if cliErr := requireNoArgs("system metrics", ctx.Args); cliErr != nil {
		return nil, cliErr
	}
	result, err := automation.NewSystem(nil, nil).GetSystemMetrics()
	if err != nil {
		return nil, automationError(err, "system metrics")
	}
	return result, nil
}

func runCommand(ctx *Context) (any, *Error) {
	fs := newFlagSet("run")
	inputRaw := fs.String("input", "", "")
	inputFile := fs.String("input-file", "", "")
	inputStdin := fs.Bool("input-stdin", false, "")
	environmentFile := fs.String("env-file", "", "")
	timeout := fs.Duration("timeout", 0, "")
	if len(ctx.Args) == 0 || strings.HasPrefix(ctx.Args[0], "-") {
		return nil, invalidArgument("run requires exactly one recipe.js path")
	}
	recipeArg := ctx.Args[0]
	if cliErr := parseFlags(fs, ctx.Args[1:]); cliErr != nil {
		return nil, cliErr
	}
	if fs.NArg() != 0 {
		return nil, invalidArgument("run requires exactly one recipe.js path")
	}
	sources := 0
	if visited(fs, "input") {
		sources++
	}
	if visited(fs, "input-file") {
		sources++
	}
	if *inputStdin {
		sources++
	}
	if sources > 1 {
		return nil, invalidArgument("--input, --input-file, and --input-stdin are mutually exclusive")
	}
	if *timeout < 0 {
		return nil, invalidArgument("timeout cannot be negative")
	}
	if visited(fs, "env-file") && strings.TrimSpace(*environmentFile) == "" {
		return nil, invalidArgument("env-file requires a path")
	}
	recipe, err := filepath.Abs(recipeArg)
	if err != nil {
		return nil, &Error{Code: "invalid_argument", Message: "invalid recipe path"}
	}
	if filepath.Ext(recipe) != ".js" {
		return nil, invalidArgument("recipe must be a .js file")
	}
	source, err := os.ReadFile(recipe)
	if err != nil {
		return nil, &Error{Code: "invalid_argument", Message: fmt.Sprintf("read recipe: %v", err)}
	}
	source = normalizeRecipeEntrypoint(source)
	input, cliErr := readRunInput(*inputRaw, *inputFile, *inputStdin)
	if cliErr != nil {
		return nil, cliErr
	}
	workingDir, err := os.Getwd()
	if err != nil {
		return nil, &Error{Code: "internal_error", Message: "read working directory: " + err.Error()}
	}
	environment, err := runtimeenv.Resolve(runtimeenv.Options{
		WorkingDirectory: workingDir,
		File:             *environmentFile,
		Inherited:        os.Environ(),
	})
	if err != nil {
		return nil, invalidArgument(err.Error())
	}

	id := pkgExecution.NewExecutionID("ai")
	artifacts, err := pkgExecution.PrepareArtifacts(filepath.Join(".runtime", "ai", id), id, ".js")
	if err != nil {
		return nil, &Error{Code: "internal_error", Message: err.Error()}
	}
	inputEvidence, _ := json.MarshalIndent(map[string]any{"command": "run", "recipe": recipe, "input": input}, "", "  ")
	_ = os.WriteFile(filepath.Join(artifacts.RunDir, "command.json"), append(inputEvidence, '\n'), 0o644)
	request := pkgExecution.Request{ExecutionID: id, SourceLabel: "file:" + recipe, Ext: ".js", ScriptHash: pkgExecution.ComputeScriptHash(source), ScriptContent: source, Input: input, WorkDir: workingDir, Environment: environment.Values, Timeout: *timeout, TimeoutMinutes: 30, EnableCommand: true, Artifacts: artifacts, Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}}}
	result, summary, runErr := pkgExecution.Run(request)
	_ = pkgExecution.WriteLegacySummary(artifacts.SummaryPath, result, summary)
	if runErr != nil {
		code := "execution_failed"
		if strings.Contains(strings.ToLower(runErr.Error()), "timed out") {
			code = "timeout"
		}
		return map[string]any{"executionId": id, "status": result.Status, "artifacts": result.Artifacts}, &Error{Code: code, Message: runErr.Error()}
	}
	return map[string]any{"executionId": id, "status": result.Status, "durationMs": result.DurationMs, "artifacts": result.Artifacts}, nil
}

var terminalMainCall = regexp.MustCompile(`(?m)^[\t ]*(?:await[\t ]+)?main[\t ]*\([\t ]*\)[\t ]*;?[\t ]*(?:\r?\n)?\z`)

// normalizeRecipeEntrypoint makes the conventional recipe form
// `async function main() { ... }; main();` deterministic for `ai run`.
// The generic runtime must keep accepting arbitrary JavaScript, but a coding
// agent recipe has a defined entrypoint and should never complete while that
// final main Promise is still pending. Other recipe forms remain unchanged and
// can use top-level await directly.
func normalizeRecipeEntrypoint(source []byte) []byte {
	if !strings.Contains(string(source), "function main") {
		return source
	}
	match := terminalMainCall.FindIndex(source)
	if match == nil {
		return source
	}
	return append(append([]byte{}, source[:match[0]]...), []byte("return await main();\n")...)
}

func newFlagSet(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	return fs
}
func parseFlags(fs *flag.FlagSet, args []string) *Error {
	if err := fs.Parse(args); err != nil {
		return invalidArgument(err.Error())
	}
	return nil
}
func visited(fs *flag.FlagSet, name string) bool {
	found := false
	fs.Visit(func(item *flag.Flag) {
		if item.Name == name {
			found = true
		}
	})
	return found
}
func requireFlagString(fs *flag.FlagSet, name, value string) *Error {
	if !visited(fs, name) || strings.TrimSpace(value) == "" {
		return invalidArgument("missing required --" + name)
	}
	return nil
}
func requireFlagInt(fs *flag.FlagSet, name string, _ int) *Error {
	if !visited(fs, name) {
		return invalidArgument("missing required --" + name)
	}
	return nil
}
func requireNoArgs(name string, args []string) *Error {
	if len(args) != 0 {
		return invalidArgument(name + " does not accept arguments")
	}
	return nil
}
func invalidArgument(message string) *Error {
	return &Error{Code: "invalid_argument", Message: message}
}

func parseTitle(name string, args []string) (string, *Error) {
	fs := newFlagSet(name)
	title := fs.String("title", "", "")
	if cliErr := parseFlags(fs, args); cliErr != nil {
		return "", cliErr
	}
	if cliErr := requireFlagString(fs, "title", *title); cliErr != nil {
		return "", cliErr
	}
	return *title, nil
}

func focusOptional(title string) *Error {
	if strings.TrimSpace(title) == "" {
		return nil
	}
	if err := automation.NewWindowManager().Focus(title); err != nil {
		return automationError(err, "window focus")
	}
	return nil
}

func compactWindow(info *automation.WindowInfo) map[string]any {
	if info == nil {
		return nil
	}
	return map[string]any{"title": info.Title, "pid": info.ProcessID, "x": info.X, "y": info.Y, "width": info.Width, "height": info.Height}
}
func compactWindowMap(info map[string]interface{}) map[string]any {
	return map[string]any{"title": info["title"], "pid": info["pid"], "x": info["x"], "y": info["y"], "width": info["width"], "height": info["height"]}
}

func windowError(err error) *Error {
	if err == nil {
		return &Error{Code: "window_not_found", Message: "window was not found"}
	}
	return automationError(err, "window")
}
func automationError(err error, operation string) *Error {
	if err == nil {
		return &Error{Code: "internal_error", Message: operation + " failed"}
	}
	message := err.Error()
	lower := strings.ToLower(message)
	if strings.HasPrefix(operation, "vision") {
		return &Error{Code: "vision_failed", Message: message}
	}
	if strings.HasPrefix(operation, "screenshot") {
		if strings.Contains(lower, "permission") || strings.Contains(lower, "screen capture") {
			return &Error{Code: "permission_required", Permission: "screen-recording", Message: message}
		}
		return &Error{Code: "capture_failed", Message: message}
	}
	if strings.Contains(lower, "not found") || strings.Contains(lower, "no active window") || strings.Contains(lower, "no window") {
		return &Error{Code: "window_not_found", Message: message}
	}
	if strings.Contains(lower, "not supported") || strings.Contains(lower, "not implemented") || strings.Contains(lower, "unsupported platform") {
		return &Error{Code: "unsupported_platform", Message: message}
	}
	if strings.Contains(lower, "permission") || strings.Contains(lower, "accessibility") || strings.Contains(lower, "not authorized") || strings.Contains(lower, "screen capture") {
		return &Error{Code: "permission_required", Permission: permissionFor(operation), Message: message}
	}
	return &Error{Code: "internal_error", Message: message}
}
func permissionFor(operation string) string {
	if strings.Contains(operation, "screenshot") {
		return "screen-recording"
	}
	return "accessibility"
}

type rect struct{ X, Y, Width, Height int }

func (r rect) mapValue() map[string]interface{} {
	return map[string]interface{}{"x": r.X, "y": r.Y, "width": r.Width, "height": r.Height}
}
func parseRect(raw string) (rect, *Error) {
	var values [4]int
	parts := strings.Split(raw, ",")
	if len(parts) != 4 {
		return rect{}, invalidArgument("region must be x,y,width,height")
	}
	for i, part := range parts {
		if _, err := fmt.Sscanf(strings.TrimSpace(part), "%d", &values[i]); err != nil {
			return rect{}, invalidArgument("region must contain integers")
		}
	}
	if values[2] <= 0 || values[3] <= 0 {
		return rect{}, invalidArgument("region width and height must be positive")
	}
	return rect{values[0], values[1], values[2], values[3]}, nil
}

type relativeRegion struct{ X, Y, Width, Height float64 }

func parseRelativeRect(raw string) (relativeRegion, *Error) {
	var values [4]float64
	parts := strings.Split(raw, ",")
	if len(parts) != 4 {
		return relativeRegion{}, invalidArgument("region-relative must be xRatio,yRatio,widthRatio,heightRatio")
	}
	for i, part := range parts {
		if _, err := fmt.Sscanf(strings.TrimSpace(part), "%f", &values[i]); err != nil {
			return relativeRegion{}, invalidArgument("region-relative must contain numbers")
		}
	}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1 {
			return relativeRegion{}, invalidArgument("region-relative values must be between 0 and 1")
		}
	}
	if values[2] == 0 || values[3] == 0 || values[0]+values[2] > 1 || values[1]+values[3] > 1 {
		return relativeRegion{}, invalidArgument("region-relative must remain inside the target window")
	}
	return relativeRegion{values[0], values[1], values[2], values[3]}, nil
}
func validateLocalRect(value rect, window *automation.WindowInfo) *Error {
	if value.X < 0 || value.Y < 0 || value.X+value.Width > int(window.Width) || value.Y+value.Height > int(window.Height) {
		return invalidArgument("window-local region is outside the current window bounds")
	}
	return nil
}
func relativeRect(window *automation.WindowInfo, value relativeRegion) rect {
	return rect{X: int(window.X) + int(math.Round(value.X*float64(window.Width))), Y: int(window.Y) + int(math.Round(value.Y*float64(window.Height))), Width: int(math.Round(value.Width * float64(window.Width))), Height: int(math.Round(value.Height * float64(window.Height)))}
}

type point struct {
	X, Y, Steps, Delay int
	Button, Space      string
}

func (p point) result() map[string]any {
	return map[string]any{"x": p.X, "y": p.Y, "space": p.Space, "button": p.Button}
}
func parsePoint(name string, args []string) (point, *Error) {
	fs := newFlagSet(name)
	x := fs.Int("x", 0, "")
	y := fs.Int("y", 0, "")
	title := fs.String("window-title", "", "")
	relativeX := fs.Float64("relative-x", 0, "")
	relativeY := fs.Float64("relative-y", 0, "")
	steps := fs.Int("steps", 1, "")
	delay := fs.Int("delay", 0, "")
	button := fs.String("button", "left", "")
	if cliErr := parseFlags(fs, args); cliErr != nil {
		return point{}, cliErr
	}
	if *steps <= 0 || *delay < 0 {
		return point{}, invalidArgument("steps must be positive and delay cannot be negative")
	}
	hasX, hasY, hasRX, hasRY := visited(fs, "x"), visited(fs, "y"), visited(fs, "relative-x"), visited(fs, "relative-y")
	if hasX != hasY || hasRX != hasRY || (hasX && hasRX) || (!hasX && !hasRX) {
		return point{}, invalidArgument("provide exactly --x/--y or --relative-x/--relative-y")
	}
	result := point{Steps: *steps, Delay: *delay, Button: *button, Space: "screen"}
	if hasRX {
		if strings.TrimSpace(*title) == "" {
			return point{}, invalidArgument("relative coordinates require --window-title")
		}
		if *relativeX < 0 || *relativeX > 1 || *relativeY < 0 || *relativeY > 1 {
			return point{}, invalidArgument("relative coordinates must be between 0 and 1")
		}
	}
	if strings.TrimSpace(*title) == "" {
		result.X, result.Y = *x, *y
		return result, nil
	}
	manager := automation.NewWindowManager()
	if err := manager.Focus(*title); err != nil {
		return point{}, automationError(err, name+" window focus")
	}
	window, err := manager.GetWindowByTitle(*title)
	if err != nil || window == nil {
		return point{}, windowError(err)
	}
	result.Space = "window"
	if hasRX {
		result.X = int(window.X) + int(math.Round(*relativeX*float64(window.Width)))
		result.Y = int(window.Y) + int(math.Round(*relativeY*float64(window.Height)))
		result.Space = "relative"
	} else {
		if *x < 0 || *y < 0 || *x >= int(window.Width) || *y >= int(window.Height) {
			return point{}, invalidArgument("window-local point is outside the current window bounds")
		}
		result.X, result.Y = int(window.X)+*x, int(window.Y)+*y
	}
	return result, nil
}

func normalizeCLIKey(key string) string {
	trimmed := strings.TrimSpace(key)
	switch strings.ToUpper(trimmed) {
	case "CMD", "COMMAND", "META":
		return "Meta"
	case "CTRL", "CONTROL":
		return "Control"
	case "OPTION", "ALT":
		return "Alt"
	case "SHIFT":
		return "Shift"
	case "ENTER", "RETURN":
		return "Enter"
	case "ESC", "ESCAPE":
		return "Escape"
	case "SPACE":
		return "Space"
	case "TAB":
		return "Tab"
	case "LEFT":
		return "ArrowLeft"
	case "RIGHT":
		return "ArrowRight"
	case "UP":
		return "ArrowUp"
	case "DOWN":
		return "ArrowDown"
	}
	return trimmed
}

func parseVisionOptions(name string, args []string, detect bool) (map[string]interface{}, *Error) {
	fs := newFlagSet(name)
	image := fs.String("image", "", "")
	provider := fs.String("provider", "", "")
	lang := fs.String("lang", "", "")
	includeRaw := fs.Bool("include-raw", false, "")
	text := fs.String("text", "", "")
	matchMode := fs.String("match-mode", "contains", "")
	minConfidence := fs.Float64("min-confidence", 0, "")
	if cliErr := parseFlags(fs, args); cliErr != nil {
		return nil, cliErr
	}
	if cliErr := requireFlagString(fs, "image", *image); cliErr != nil {
		return nil, cliErr
	}
	if detect {
		if cliErr := requireFlagString(fs, "text", *text); cliErr != nil {
			return nil, cliErr
		}
	}
	if *minConfidence < 0 || *minConfidence > 1 {
		return nil, invalidArgument("min-confidence must be between 0 and 1")
	}
	options := map[string]interface{}{"imagePath": *image, "includeRaw": *includeRaw}
	if visited(fs, "provider") {
		options["provider"] = *provider
	}
	if visited(fs, "lang") {
		options["lang"] = *lang
	}
	if detect {
		options["targetText"] = *text
		options["matchMode"] = *matchMode
		options["minConfidence"] = *minConfidence
	}
	return options, nil
}

func readRunInput(inline, inputFile string, stdin bool) (any, *Error) {
	raw := "{}"
	var err error
	if inputFile != "" {
		data, readErr := os.ReadFile(inputFile)
		if readErr != nil {
			return nil, &Error{Code: "invalid_argument", Message: fmt.Sprintf("read input file: %v", readErr)}
		}
		raw = string(data)
	} else if stdin {
		data, readErr := io.ReadAll(os.Stdin)
		if readErr != nil {
			return nil, &Error{Code: "invalid_json", Message: fmt.Sprintf("read stdin: %v", readErr)}
		}
		raw = string(data)
	} else if inline != "" {
		raw = inline
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var input any
	if err = decoder.Decode(&input); err != nil {
		return nil, &Error{Code: "invalid_json", Message: err.Error()}
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, &Error{Code: "invalid_json", Message: "input must contain one JSON value"}
		}
		return nil, &Error{Code: "invalid_json", Message: err.Error()}
	}
	return input, nil
}

// Keep a short reference to time in this compilation unit: it documents that
// --timeout is a Go duration rather than a platform-specific unit.
var _ = time.Second
