package automation

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-vgo/robotgo"
)

const (
	screenshotTargetActiveWindow = "activeWindow"
	screenshotTargetScreen       = "screen"
)

var macPrivacySettingsURLs = map[string]string{
	"accessibility":   "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
	"inputMonitoring": "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
	"screenCapture":   "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
	"automation":      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
}

var macPermissionPromptState = struct {
	mu        sync.Mutex
	requested map[string]bool
}{
	requested: map[string]bool{},
}

const defaultCommandProbeTimeout = 3 * time.Second

type Page struct {
	Mouse        *Mouse // 公开字段
	Keyboard     *Keyboard
	Touchscreen  *Touchscreen
	Pid          int32
	Executable   string
	ownerBrowser *Browser
	ownerContext *BrowserContext
}

func NewPage() *Page {
	return &Page{
		Mouse:       NewMouse(), // 初始化时创建
		Keyboard:    NewKeyboard(),
		Touchscreen: NewTouchscreen(),
		Pid:         int32(os.Getpid()),
	}
}

func (p *Page) Browser() *Browser {
	if p == nil {
		return nil
	}
	return p.ownerBrowser
}

func (p *Page) Context() *BrowserContext {
	if p == nil {
		return nil
	}
	return p.ownerContext
}

// // Mouse returns the Mouse instance
// func (p *Page) GetMouse() *Mouse {
// 	return p.Mouse
// }

// // Keyboard returns the Keyboard instance
// func (p *Page) Keyboard() *Keyboard {
// 	return p.Keyboard
// }

// // Touchscreen returns the Touchscreen instance
// func (p *Page) Touchscreen() *Touchscreen {
// 	return p.Touchscreen
// }

// checkDirPermissions verifies that we have write permissions to the directory
func checkDirPermissions(dir string) error {
	// Try to create a temporary file in the directory
	tempFile := filepath.Join(dir, ".permission_check")
	f, err := os.Create(tempFile)
	if err != nil {
		return fmt.Errorf("no write permission: %v", err)
	}

	// Clean up
	f.Close()
	os.Remove(tempFile)

	return nil
}

func (p *Page) Screenshot(options interface{}) (interface{}, error) {
	opts, err := parseScreenshotOptions(options)
	if err != nil {
		return "", err
	}
	debugEnabled := screenshotDebugEnabled()
	if debugEnabled {
		log.Printf(
			"[screenshot][debug] request options: target=%s fullPage=%t displayIndex=%d path=%q clip=%s",
			opts.Target,
			opts.FullPage,
			opts.DisplayIndex,
			opts.Path,
			formatClipForLog(opts.Clip),
		)
	}

	x, y, width, height, source, err := p.resolveScreenshotCaptureArea(opts)
	if err != nil {
		return "", err
	}
	log.Printf(
		"Screenshot request: target=%s source=%s displayIndex=%d fullPage=%v clip=%+v resolved=(x=%d y=%d width=%d height=%d)",
		opts.Target, source, opts.DisplayIndex, opts.FullPage, opts.Clip, x, y, width, height,
	)
	if debugEnabled {
		log.Printf(
			"[screenshot][debug] resolved capture area: source=%s x=%d y=%d width=%d height=%d",
			source, x, y, width, height,
		)
	}

	var pngBytes []byte
	backend := "robotgo"
	useDarwinNative := runtime.GOOS == "darwin" &&
		(source == "clip" || source == screenshotTargetActiveWindow || (source == screenshotTargetScreen && opts.DisplayIndex > 0))
	if useDarwinNative {
		pngBytes, err = p.captureDarwinScreenshotPNG(x, y, width, height, source, opts.DisplayIndex, debugEnabled)
		if err != nil {
			// displayIndex relies on macOS native screencapture. Robotgo fallback only supports primary display.
			if source == screenshotTargetScreen && opts.DisplayIndex > 0 {
				return "", err
			}
			log.Printf("Darwin native screenshot failed, fallback to robotgo: %v", err)
		} else {
			backend = "darwin-screencapture"
		}
	}
	if len(pngBytes) == 0 {
		pngBytes, err = p.captureRobotgoScreenshotPNG(x, y, width, height, source)
		if err != nil {
			return "", err
		}
		backend = "robotgo"
	}
	imgW, imgH := decodePNGSize(pngBytes)
	log.Printf(
		"Screenshot result: backend=%s source=%s displayIndex=%d output=(width=%d height=%d bytes=%d)",
		backend, source, opts.DisplayIndex, imgW, imgH, len(pngBytes),
	)
	if debugEnabled {
		log.Printf(
			"[screenshot][debug] capture ok: backend=%s source=%s bytes=%d image=%dx%d",
			backend, source, len(pngBytes), imgW, imgH,
		)
	}

	return p.buildScreenshotResponse(opts, pngBytes, imgW, imgH, source, backend, debugEnabled)
}

func (p *Page) captureRobotgoScreenshotPNG(x, y, width, height int, source string) ([]byte, error) {
	bit := robotgo.CaptureScreen(x, y, width, height)
	if bit == nil {
		return nil, p.wrapScreenshotCaptureError(
			fmt.Errorf("failed to capture screen"),
			x, y, width, height, source,
		)
	}
	defer robotgo.FreeBitmap(bit)

	img := robotgo.ToImage(bit)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode image to png: %v", err)
	}
	return buf.Bytes(), nil
}

func (p *Page) captureDarwinScreenshotPNG(x, y, width, height int, source string, displayIndex int, debugEnabled bool) ([]byte, error) {
	args := []string{"-x"}

	if displayIndex > 0 && source != screenshotTargetActiveWindow {
		args = append(args, "-D", fmt.Sprintf("%d", displayIndex))
	}

	// On macOS multi-display setups, screencapture -D with -R still uses global desktop
	// coordinates. To make clip deterministic per display, capture full selected display
	// first, then crop in-memory using display-local clip coordinates.
	if source == "clip" && displayIndex > 0 {
		pngBytes, err := runDarwinScreencaptureAndRead(args, debugEnabled)
		if err != nil {
			return nil, err
		}
		return cropPNGByRect(pngBytes, x, y, width, height)
	}

	if source == screenshotTargetScreen && displayIndex > 0 {
		return runDarwinScreencaptureAndRead(args, debugEnabled)
	}

	usedWindowID := false
	if source == screenshotTargetActiveWindow {
		if win, err := NewWindowManager().GetActiveWindow(); err == nil && win != nil && win.Handle != 0 {
			args = append(args, "-o", "-l", fmt.Sprintf("%d", uint64(win.Handle)))
			usedWindowID = true
		}
	}
	if !usedWindowID {
		args = append(args, "-R", fmt.Sprintf("%d,%d,%d,%d", x, y, width, height))
	}

	return runDarwinScreencaptureAndRead(args, debugEnabled)
}

func runDarwinScreencaptureAndRead(args []string, debugEnabled bool) ([]byte, error) {
	tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("testmonkey_darwin_capture_%d.png", time.Now().UnixNano()))
	args = append(args, tmpPath)
	if debugEnabled {
		log.Printf("[screenshot][debug] exec: screencapture %s", strings.Join(args, " "))
	}
	cmd := exec.Command("screencapture", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("screencapture failed: %v, output=%s", err, simplifyProbeOutput(string(out), ""))
	}

	defer os.Remove(tmpPath)
	pngBytes, err := os.ReadFile(tmpPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read native screenshot file: %v", err)
	}
	if len(pngBytes) == 0 {
		return nil, fmt.Errorf("native screenshot output is empty")
	}
	if debugEnabled {
		imgW, imgH := decodePNGSize(pngBytes)
		log.Printf("[screenshot][debug] native output: tmp=%s bytes=%d image=%dx%d", tmpPath, len(pngBytes), imgW, imgH)
	}
	return pngBytes, nil
}

func cropPNGByRect(pngBytes []byte, x, y, width, height int) ([]byte, error) {
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("invalid crop dimensions: width=%d height=%d", width, height)
	}

	img, _, err := image.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to decode png bytes for crop: %v", err)
	}

	bounds := img.Bounds()
	localX := x
	localY := y
	if localX < 0 {
		localX = bounds.Dx() + localX
	}
	if localY < 0 {
		localY = bounds.Dy() + localY
	}

	if localX < 0 || localY < 0 || localX+width > bounds.Dx() || localY+height > bounds.Dy() {
		return nil, fmt.Errorf(
			"clip out of display bounds: display=%dx%d clip=(x=%d y=%d width=%d height=%d)",
			bounds.Dx(), bounds.Dy(), localX, localY, width, height,
		)
	}

	rect := image.Rect(localX, localY, localX+width, localY+height)
	cropped := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(cropped, cropped.Bounds(), img, rect.Min, draw.Src)

	var buf bytes.Buffer
	if err := png.Encode(&buf, cropped); err != nil {
		return nil, fmt.Errorf("failed to encode cropped image: %v", err)
	}
	return buf.Bytes(), nil
}

func screenshotDebugEnabled() bool {
	v := strings.TrimSpace(os.Getenv("TM_SCREENSHOT_DEBUG"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func formatClipForLog(clip *ClipOptions) string {
	if clip == nil {
		return "<nil>"
	}
	return fmt.Sprintf("{x:%d y:%d width:%d height:%d}", clip.X, clip.Y, clip.Width, clip.Height)
}

func decodePNGSize(pngBytes []byte) (int, int) {
	if len(pngBytes) == 0 {
		return 0, 0
	}
	cfg, err := png.DecodeConfig(bytes.NewReader(pngBytes))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}

func parseScreenshotOptions(raw interface{}) (ScreenshotOptions, error) {
	opts := ScreenshotOptions{
		Type:           DefaultType,
		Quality:        DefaultQuality,
		FullPage:       false,
		OmitBackground: false,
		Encoding:       DefaultEncoding,
		ReturnType:     "",
		Target:         DefaultTarget,
	}

	if raw == nil {
		return opts, nil
	}

	switch v := raw.(type) {
	case ScreenshotOptions:
		opts = *mergeWithDefaultOptions(&v)
	case *ScreenshotOptions:
		if v == nil {
			return opts, nil
		}
		opts = *mergeWithDefaultOptions(v)
	case map[string]interface{}:
		if path, ok := v["path"].(string); ok {
			opts.Path = path
		}
		if typ, ok := v["type"].(string); ok {
			opts.Type = typ
		}
		if quality, ok := parseIntValue(v["quality"]); ok {
			opts.Quality = quality
		}
		if fullPage, ok := v["fullPage"].(bool); ok {
			opts.FullPage = fullPage
		}
		if omitBackground, ok := v["omitBackground"].(bool); ok {
			opts.OmitBackground = omitBackground
		}
		if encoding, ok := v["encoding"].(string); ok {
			opts.Encoding = encoding
		}
		if returnType, ok := firstMapValue(v, "returnType", "ReturnType", "return_type", "returntype"); ok {
			opts.ReturnType = strings.TrimSpace(toString(returnType))
		}
		if target, ok := v["target"].(string); ok {
			opts.Target = target
		}
		if rawDisplayIndex, ok := firstMapValue(v, "displayIndex", "DisplayIndex", "display_index", "displayindex"); ok {
			if displayIndex, ok := parseIntValue(rawDisplayIndex); ok {
				opts.DisplayIndex = displayIndex
			}
		}
		if clipRaw, hasClip := v["clip"]; hasClip {
			clip, err := parseClipOptions(clipRaw)
			if err != nil {
				return opts, err
			}
			opts.Clip = clip
		}
	default:
		return opts, fmt.Errorf("invalid screenshot options type: %T", raw)
	}

	if opts.Type == "" {
		opts.Type = DefaultType
	}
	if opts.Quality == 0 {
		opts.Quality = DefaultQuality
	}
	if opts.Encoding == "" {
		opts.Encoding = DefaultEncoding
	}
	returnType, err := normalizeScreenshotReturnType(opts.ReturnType)
	if err != nil {
		return opts, err
	}
	opts.ReturnType = returnType

	target, err := normalizeScreenshotTarget(opts.Target)
	if err != nil {
		return opts, err
	}
	opts.Target = target

	if opts.Clip != nil && (opts.Clip.Width <= 0 || opts.Clip.Height <= 0) {
		return opts, fmt.Errorf(
			"invalid screenshot clip: width and height must be > 0, got width=%d height=%d",
			opts.Clip.Width, opts.Clip.Height,
		)
	}
	if opts.DisplayIndex < 0 {
		return opts, fmt.Errorf("invalid displayIndex: %d (must be >= 0)", opts.DisplayIndex)
	}

	return opts, nil
}

func normalizeScreenshotReturnType(v string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(v))
	switch value {
	case "", "base64", "bytes", "path", "object", "none":
		return value, nil
	default:
		return "", fmt.Errorf("invalid screenshot returnType: %s", v)
	}
}

func (p *Page) buildScreenshotResponse(
	opts ScreenshotOptions,
	pngBytes []byte,
	imgW, imgH int,
	source, backend string,
	debugEnabled bool,
) (interface{}, error) {
	returnType := opts.ReturnType
	if returnType == "" {
		returnType = "base64"
	}

	savePath := opts.Path
	if (returnType == "path" || returnType == "object") && strings.TrimSpace(savePath) == "" {
		tmpFile, err := os.CreateTemp("", "testmonkey-screenshot-*.png")
		if err != nil {
			return nil, fmt.Errorf("failed to create temp screenshot path: %v", err)
		}
		savePath = tmpFile.Name()
		_ = tmpFile.Close()
	}

	absPath := ""
	if strings.TrimSpace(savePath) != "" {
		var err error
		absPath, err = filepath.Abs(savePath)
		if err != nil {
			return nil, fmt.Errorf("failed to get absolute path: %v", err)
		}

		dir := filepath.Dir(absPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory: %v", err)
		}

		log.Printf("Saving screenshot to: %s", absPath)
		if err := os.WriteFile(absPath, pngBytes, 0644); err != nil {
			return nil, fmt.Errorf("failed to save screenshot: %v", err)
		}
		if debugEnabled {
			log.Printf("[screenshot][debug] file write ok: %s", absPath)
		}
	}

	switch returnType {
	case "none":
		return nil, nil
	case "bytes":
		return pngBytes, nil
	case "path":
		return absPath, nil
	case "object":
		result := map[string]interface{}{
			"path":      absPath,
			"mimeType":  "image/png",
			"width":     imgW,
			"height":    imgH,
			"sizeBytes": len(pngBytes),
			"source":    source,
			"backend":   backend,
		}
		return result, nil
	default:
		base64Str := base64.StdEncoding.EncodeToString(pngBytes)
		return fmt.Sprintf("data:image/png;base64,%s", base64Str), nil
	}
}

func parseClipOptions(raw interface{}) (*ClipOptions, error) {
	switch clipData := raw.(type) {
	case nil:
		return nil, nil
	case ClipOptions:
		return &clipData, nil
	case *ClipOptions:
		if clipData == nil {
			return nil, nil
		}
		return clipData, nil
	case map[string]interface{}:
		clip := &ClipOptions{}
		if x, ok := parseIntValue(clipData["x"]); ok {
			clip.X = x
		}
		if y, ok := parseIntValue(clipData["y"]); ok {
			clip.Y = y
		}
		if width, ok := parseIntValue(clipData["width"]); ok {
			clip.Width = width
		}
		if height, ok := parseIntValue(clipData["height"]); ok {
			clip.Height = height
		}
		return clip, nil
	default:
		return nil, fmt.Errorf("invalid clip option type: %T", raw)
	}
}

func parseIntValue(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float32:
		return int(n), true
	case float64:
		return int(n), true
	case json.Number:
		if i64, err := n.Int64(); err == nil {
			return int(i64), true
		}
		if f64, err := n.Float64(); err == nil {
			return int(f64), true
		}
	case string:
		trimmed := strings.TrimSpace(n)
		if trimmed == "" {
			return 0, false
		}
		if i64, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
			return int(i64), true
		}
		if f64, err := strconv.ParseFloat(trimmed, 64); err == nil {
			return int(f64), true
		}
	}
	return 0, false
}

func firstMapValue(m map[string]interface{}, keys ...string) (interface{}, bool) {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return v, true
		}
	}
	return nil, false
}

func normalizeScreenshotTarget(target string) (string, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return DefaultTarget, nil
	}
	switch target {
	case screenshotTargetActiveWindow, screenshotTargetScreen:
		return target, nil
	default:
		return "", fmt.Errorf(
			"invalid screenshot target: %s (supported: %s, %s)",
			target, screenshotTargetActiveWindow, screenshotTargetScreen,
		)
	}
}

func (p *Page) resolveScreenshotCaptureArea(opts ScreenshotOptions) (int, int, int, int, string, error) {
	var x, y, width, height int
	source := screenshotTargetScreen
	debugEnabled := screenshotDebugEnabled()

	switch {
	case opts.Clip != nil:
		x = opts.Clip.X
		y = opts.Clip.Y
		width = opts.Clip.Width
		height = opts.Clip.Height
		source = "clip"
		if debugEnabled && opts.Target == screenshotTargetActiveWindow {
			log.Printf("[screenshot][debug] clip is set and takes precedence over target=activeWindow (clip uses absolute desktop coords)")
		}
	case opts.FullPage || opts.Target == screenshotTargetScreen:
		if opts.DisplayIndex > 0 {
			if meta := NewScreen().GetDisplay(opts.DisplayIndex); meta != nil {
				if w, ok := parseIntValue(meta["width"]); ok {
					width = w
				}
				if h, ok := parseIntValue(meta["height"]); ok {
					height = h
				}
			}
		}
		if width <= 0 || height <= 0 {
			width, height = robotgo.GetScreenSize()
		}
		source = screenshotTargetScreen
	default:
		clip, err := p.getActiveWindowClip()
		if err != nil {
			log.Printf("Screenshot activeWindow fallback to screen: %v", err)
			width, height = robotgo.GetScreenSize()
			source = screenshotTargetScreen
		} else {
			if debugEnabled {
				log.Printf(
					"[screenshot][debug] active window bounds: x=%d y=%d width=%d height=%d",
					clip.X, clip.Y, clip.Width, clip.Height,
				)
			}
			x = clip.X
			y = clip.Y
			width = clip.Width
			height = clip.Height
			source = screenshotTargetActiveWindow
		}
	}

	if width <= 0 || height <= 0 {
		return 0, 0, 0, 0, source, fmt.Errorf(
			"invalid screenshot dimensions: source=%s x=%d y=%d width=%d height=%d",
			source, x, y, width, height,
		)
	}

	return x, y, width, height, source, nil
}

func (p *Page) getActiveWindowClip() (*ClipOptions, error) {
	win, err := NewWindowManager().GetActiveWindow()
	if err != nil {
		return nil, fmt.Errorf("failed to get active window bounds: %w", err)
	}
	if win == nil {
		return nil, fmt.Errorf("active window is nil")
	}
	if win.Width <= 0 || win.Height <= 0 {
		return nil, fmt.Errorf(
			"invalid active window bounds: x=%d y=%d width=%d height=%d title=%s",
			win.X, win.Y, win.Width, win.Height, win.Title,
		)
	}
	return &ClipOptions{
		X:      int(win.X),
		Y:      int(win.Y),
		Width:  int(win.Width),
		Height: int(win.Height),
	}, nil
}

func (p *Page) wrapScreenshotCaptureError(cause error, x, y, width, height int, source string) error {
	baseMessage := fmt.Sprintf(
		"%v (source=%s x=%d y=%d width=%d height=%d)",
		cause, source, x, y, width, height,
	)

	if runtime.GOOS != "darwin" {
		return fmt.Errorf("%s", baseMessage)
	}

	perm := p.CheckScreenshotPermissions()
	ok, _ := perm["ok"].(bool)
	if ok {
		return fmt.Errorf(
			"%s; permission preflight looks OK, verify clip/window coordinates",
			baseMessage,
		)
	}

	screenCapture, _ := perm["screenCapture"].(bool)
	accessibility, _ := perm["accessibility"].(bool)
	screenErr, _ := perm["screenCaptureError"].(string)
	axErr, _ := perm["accessibilityError"].(string)

	return fmt.Errorf(
		"%s; macOS permission check failed (screenCapture=%t accessibility=%t). "+
			"screenCaptureError=%q accessibilityError=%q. "+
			"Run `go run ./cmd/opendesk -script examples/mac/open-permission-settings.js`, "+
			"then retry from `dist/OpenDesk.app` or `dist/opendesk` with a stable app identity",
		baseMessage, screenCapture, accessibility, screenErr, axErr,
	)
}

func (p *Page) CheckScreenshotPermissions() map[string]interface{} {
	report := map[string]interface{}{
		"os":            runtime.GOOS,
		"screenCapture": true,
		"accessibility": true,
		"automation":    nil,
		"ok":            true,
	}

	if runtime.GOOS != "darwin" {
		return report
	}

	okScreen := darwinScreenCaptureStatus()
	msgScreen := ""
	if !okScreen {
		tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("testmonkey_perm_%d.png", time.Now().UnixNano()))
		okScreen, msgScreen = runCommandProbe("screencapture", "-x", "-R0,0,2,2", tmpPath)
		if okScreen {
			if stat, err := os.Stat(tmpPath); err != nil || stat.Size() == 0 {
				okScreen = false
				msgScreen = "screencapture returned success but file missing or empty"
			}
		}
		_ = os.Remove(tmpPath)
	}

	okAX := darwinAccessibilityStatus()
	report["screenCapture"] = okScreen
	report["accessibility"] = okAX
	report["automation"] = "requires runtime AppleEvents trigger"
	report["ok"] = okScreen && okAX
	report["guideScript"] = "examples/mac/open-permission-settings.js"
	report["stableRunner"] = "dist/OpenDesk.app"
	report["permissionHostHint"] = "For stable macOS TCC identity, launch OpenDesk.app directly. Shell-hosted runs may appear as Terminal, iTerm, or sshd-keygen-wrapper."
	if !okScreen && msgScreen != "" {
		report["screenCaptureError"] = msgScreen
	}
	if !okAX {
		report["accessibilityError"] = "AXIsProcessTrusted returned false; approve the app in System Settings > Privacy & Security > Accessibility."
	}

	return report
}

// OpenMacOSPrivacySettings opens macOS privacy settings pages.
// section supports: accessibility, inputMonitoring, globalShortcut, screenCapture, automation, all.
func (p *Page) OpenMacOSPrivacySettings(section string) (map[string]interface{}, error) {
	report := map[string]interface{}{
		"os":         runtime.GOOS,
		"section":    section,
		"opened":     []string{},
		"failed":     []string{},
		"canAutoAdd": false,
		"message":    "macOS does not allow programmatically adding apps into privacy allow-list; user must toggle manually.",
	}

	if runtime.GOOS != "darwin" {
		report["message"] = "OpenMacOSPrivacySettings is only supported on macOS."
		return report, nil
	}

	sections, err := normalizeMacPrivacySections(section)
	if err != nil {
		return report, err
	}

	opened := make([]string, 0, len(sections))
	failed := make([]string, 0)
	for _, sec := range sections {
		url := macPrivacySettingsURLs[sec]
		if openErr := p.OpenURL(url); openErr != nil {
			failed = append(failed, fmt.Sprintf("%s: %v", sec, openErr))
			continue
		}
		opened = append(opened, sec)
		time.Sleep(250 * time.Millisecond)
	}

	report["section"] = strings.Join(sections, ",")
	report["opened"] = opened
	report["failed"] = failed
	report["ok"] = len(failed) == 0
	return report, nil
}

// RequestMacPermissions triggers permission prompt probes and optionally opens settings pages.
// options example: { openSettings: true, section: "all" }
func (p *Page) RequestMacPermissions(options interface{}) (map[string]interface{}, error) {
	report := map[string]interface{}{
		"os":         runtime.GOOS,
		"canAutoAdd": false,
		"message":    "macOS requires manual confirmation in System Settings; this API only opens pages and triggers permission probes.",
	}

	if runtime.GOOS != "darwin" {
		report["ok"] = true
		return report, nil
	}

	openSettings := true
	section := "screenCapture"
	if optMap, ok := options.(map[string]interface{}); ok {
		if v, has := optMap["openSettings"]; has {
			if b, ok := v.(bool); ok {
				openSettings = b
			}
		}
		if v, has := optMap["section"]; has {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				section = s
			}
		}
	}

	sections, err := normalizeMacPrivacySections(section)
	if err != nil {
		return report, err
	}
	report["section"] = strings.Join(sections, ",")

	before := p.CheckScreenshotPermissions()
	report["before"] = before
	okBefore, _ := before["ok"].(bool)
	report["okBefore"] = okBefore
	requestScreenCapture := containsMacPrivacySection(sections, "screenCapture")
	requestAccessibility := containsMacPrivacySection(sections, "accessibility")
	requestInputMonitoring := containsMacPrivacySection(sections, "inputMonitoring")
	screenCaptureBefore, _ := before["screenCapture"].(bool)
	accessibilityBefore, _ := before["accessibility"].(bool)
	requestedVerifiableReady := (!requestScreenCapture || screenCaptureBefore) && (!requestAccessibility || accessibilityBefore)

	// Avoid repeated prompts only when every requested, checkable capability is
	// already ready. Input Monitoring is intentionally not introspectable, so
	// an explicit request for it must still open its System Settings page.
	// Automation has a dedicated API and should be requested explicitly.
	requestAutomation := containsMacPrivacySection(sections, "automation")
	if requestedVerifiableReady && !requestAutomation && !requestInputMonitoring {
		report["after"] = before
		report["okAfter"] = okBefore
		report["ok"] = true
		report["probes"] = map[string]interface{}{
			"ok":      true,
			"skipped": true,
			"reason":  "screen capture and accessibility already granted",
		}
		return report, nil
	}

	if openSettings {
		settingsReport, err := p.OpenMacOSPrivacySettings(section)
		if err != nil {
			return report, err
		}
		report["settings"] = settingsReport
	}

	probes := p.triggerMacPermissionPrompts(sections)
	report["probes"] = probes

	after := p.CheckScreenshotPermissions()
	report["after"] = after

	okAfter, _ := after["ok"].(bool)
	report["okAfter"] = okAfter
	if requestInputMonitoring {
		report["inputMonitoring"] = map[string]interface{}{
			"state":   "unknown",
			"granted": false,
			"reason":  "macOS does not expose a reliable Input Monitoring status preflight; review the opened System Settings page.",
		}
	}
	// Keep the aggregate result scoped to this request. In particular, an
	// Input Monitoring request is deliberately fail-closed because macOS has no
	// reliable third-party status preflight for that permission.
	finalOK := macPermissionSectionsReady(sections, after, probes)
	report["ok"] = finalOK
	return report, nil
}

// EnsureMacPermissions is a strict guard used by automation scripts.
// options example:
// { openSettingsOnFail: true, section: "all", strict: true }
func (p *Page) EnsureMacPermissions(options interface{}) (map[string]interface{}, error) {
	report := map[string]interface{}{
		"os":                 runtime.GOOS,
		"ok":                 true,
		"skipped":            false,
		"openSettingsOnFail": true,
		"section":            "screenCapture",
		"strict":             true,
	}

	if runtime.GOOS != "darwin" {
		report["skipped"] = true
		return report, nil
	}

	openSettingsOnFail := true
	section := "screenCapture"
	strict := true
	if optMap, ok := options.(map[string]interface{}); ok {
		if v, has := optMap["openSettingsOnFail"]; has {
			if b, ok := v.(bool); ok {
				openSettingsOnFail = b
			}
		}
		if v, has := optMap["section"]; has {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				section = s
			}
		}
		if v, has := optMap["strict"]; has {
			if b, ok := v.(bool); ok {
				strict = b
			}
		}
	}

	report["openSettingsOnFail"] = openSettingsOnFail
	report["section"] = section
	report["strict"] = strict

	before := p.CheckScreenshotPermissions()
	report["before"] = before

	flow, err := p.RequestMacPermissions(map[string]interface{}{
		"openSettings": openSettingsOnFail,
		"section":      section,
	})
	if err != nil {
		report["ok"] = false
		report["error"] = err.Error()
		if strict {
			return report, err
		}
		return report, nil
	}

	report["flow"] = flow
	after, hasAfter := flow["after"]
	if hasAfter {
		report["after"] = after
	}
	// RequestMacPermissions computes a result for the requested section. Do
	// not fall back to its whole-desktop `okAfter`: that baseline does not and
	// cannot authorize Input Monitoring.
	finalOK, _ := flow["ok"].(bool)
	report["ok"] = finalOK
	if !finalOK && strict {
		return report, fmt.Errorf("macOS permissions not ready, report=%s", mustJSON(report))
	}
	return report, nil
}

// RequestMacAutomationPermission explicitly triggers AppleEvents permission request.
// targetApp examples: "System Events", "Finder", "Safari", "WeChat".
func (p *Page) RequestMacAutomationPermission(targetApp string) map[string]interface{} {
	report := map[string]interface{}{
		"os":                 runtime.GOOS,
		"targetApp":          targetApp,
		"canAutoAdd":         false,
		"pendingUserConsent": false,
		"triggered":          false,
		"message":            "Automation has no add button in Settings. Permission is granted from popup after first AppleEvents request.",
	}

	if runtime.GOOS != "darwin" {
		report["ok"] = false
		report["error"] = "supported only on macOS"
		return report
	}

	target := strings.TrimSpace(targetApp)
	if target == "" {
		target = "System Events"
	}

	report["targetApp"] = target
	report["hostHint"] = "Launch OpenDesk.app directly if the popup shows a host identity such as Terminal, iTerm, or sshd-keygen-wrapper."

	launch, err := launchMacAutomationPromptHelper(target)
	if err != nil {
		report["ok"] = false
		report["error"] = err.Error()
		report["next"] = "Reset AppleEvents permission and rerun using fixed app identity."
		return report
	}

	report["triggered"] = true
	if launch.PID > 0 {
		report["pid"] = launch.PID
	}
	if launch.Completed {
		report["ok"] = launch.Success
		if launch.Success {
			report["message"] = "Automation request returned immediately. Permission may already be granted for this app identity."
		} else {
			report["error"] = launch.Error
			report["next"] = "Reset AppleEvents permission and rerun using fixed app identity."
		}
		return report
	}

	report["ok"] = false
	report["pendingUserConsent"] = true
	report["next"] = "Confirm the macOS Automation popup, then rerun the same script to verify the final state."
	return report
}

type macAutomationPromptLaunch struct {
	PID       int
	Completed bool
	Success   bool
	Error     string
}

func mustJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func (p *Page) triggerMacPermissionPrompts(sections []string) map[string]interface{} {
	report := map[string]interface{}{
		"screenCaptureProbe": map[string]interface{}{},
		"accessibilityProbe": map[string]interface{}{},
		"automationProbe":    map[string]interface{}{},
	}

	if runtime.GOOS != "darwin" {
		report["ok"] = true
		return report
	}

	requestScreen := containsMacPrivacySection(sections, "screenCapture")
	// Active-window screenshot flow usually depends on both screen capture and accessibility.
	requestAccessibility := containsMacPrivacySection(sections, "accessibility") || requestScreen
	requestAutomation := containsMacPrivacySection(sections, "automation")

	screenProbe := map[string]interface{}{"ok": true}
	if requestScreen {
		screenProbe["ok"] = false
		screenOK := darwinScreenCaptureStatus()
		screenMsg := ""
		screenPromptSkipped := false
		if !screenOK {
			if markMacPermissionPromptRequested("screenCapture") {
				// Native request API can trigger the system screen-capture prompt.
				screenOK = darwinRequestScreenCapturePrompt()
			} else {
				screenPromptSkipped = true
			}
		}
		if !screenOK && !screenPromptSkipped {
			tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("testmonkey_prompt_%d.png", time.Now().UnixNano()))
			screenOK, screenMsg = runCommandProbe("screencapture", "-x", "-R0,0,2,2", tmpPath)
			if screenOK {
				if stat, err := os.Stat(tmpPath); err != nil || stat.Size() == 0 {
					screenOK = false
					screenMsg = "probe file missing or empty"
				}
			}
			_ = os.Remove(tmpPath)
		}
		if screenOK {
			screenProbe["ok"] = true
		} else if screenPromptSkipped {
			screenProbe["skipped"] = true
			screenProbe["reason"] = "screen capture prompt was already triggered in this process"
		} else if screenMsg != "" {
			screenProbe["error"] = screenMsg
		}
	} else {
		screenProbe["skipped"] = true
		screenProbe["reason"] = "not requested by section"
	}

	accessibilityProbe := map[string]interface{}{"ok": true}
	if requestAccessibility {
		accessibilityProbe["ok"] = false
		axOK := darwinAccessibilityStatus()
		axPromptSkipped := false
		if !axOK {
			if markMacPermissionPromptRequested("accessibility") {
				// Native API with prompt=true can trigger accessibility consent popup.
				axOK = darwinRequestAccessibilityPrompt()
			} else {
				axPromptSkipped = true
			}
		}
		if axOK {
			accessibilityProbe["ok"] = true
		} else if axPromptSkipped {
			accessibilityProbe["skipped"] = true
			accessibilityProbe["reason"] = "accessibility prompt was already triggered in this process"
		} else {
			accessibilityProbe["pendingUserConsent"] = true
			accessibilityProbe["error"] = "Accessibility permission is still denied; approve the app in System Settings > Privacy & Security > Accessibility."
		}
	} else {
		accessibilityProbe["skipped"] = true
		accessibilityProbe["reason"] = "not requested by section"
	}

	automationProbe := map[string]interface{}{
		"ok":      true,
		"target":  "System Events",
		"message": "Automation has no add button in Settings. macOS shows popup only when first AppleEvents request is sent.",
	}
	if requestAutomation {
		automationProbe["ok"] = false
		if markMacPermissionPromptRequested("automation") {
			launch, err := launchMacAutomationPromptHelper("System Events")
			if err != nil {
				automationProbe["error"] = err.Error()
			} else {
				automationProbe["triggered"] = true
				if launch.PID > 0 {
					automationProbe["pid"] = launch.PID
				}
				if launch.Completed {
					automationProbe["ok"] = launch.Success
					if !launch.Success && launch.Error != "" {
						automationProbe["error"] = launch.Error
					}
				} else {
					automationProbe["pendingUserConsent"] = true
				}
			}
		} else {
			automationProbe["skipped"] = true
			automationProbe["reason"] = "automation prompt was already triggered in this process"
		}
	} else {
		automationProbe["skipped"] = true
		automationProbe["reason"] = "not requested by section"
	}

	report["screenCaptureProbe"] = screenProbe
	report["accessibilityProbe"] = accessibilityProbe
	report["automationProbe"] = automationProbe
	screenOKVal, _ := screenProbe["ok"].(bool)
	axOKVal, _ := accessibilityProbe["ok"].(bool)
	automationOKVal, _ := automationProbe["ok"].(bool)
	report["ok"] = screenOKVal && axOKVal && automationOKVal
	return report
}

func markMacPermissionPromptRequested(permission string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	if isTruthyEnv(os.Getenv("TM_MAC_PERMISSION_REPROMPT")) {
		return true
	}

	macPermissionPromptState.mu.Lock()
	defer macPermissionPromptState.mu.Unlock()

	if macPermissionPromptState.requested[permission] {
		return false
	}
	macPermissionPromptState.requested[permission] = true
	return true
}

func isTruthyEnv(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func containsMacPrivacySection(sections []string, target string) bool {
	for _, sec := range sections {
		if sec == target {
			return true
		}
	}
	return false
}

// macPermissionSectionsReady evaluates only the capabilities named by a
// normalized macOS privacy section. Input Monitoring is purposefully never
// reported as ready: macOS does not offer a reliable status preflight to a
// third-party process, so callers must not treat opening Settings as consent.
func macPermissionSectionsReady(sections []string, snapshot, probes map[string]interface{}) bool {
	if containsMacPrivacySection(sections, "screenCapture") {
		granted, _ := snapshot["screenCapture"].(bool)
		if !granted {
			return false
		}
	}
	if containsMacPrivacySection(sections, "accessibility") {
		granted, _ := snapshot["accessibility"].(bool)
		if !granted {
			return false
		}
	}
	if containsMacPrivacySection(sections, "inputMonitoring") {
		return false
	}
	if containsMacPrivacySection(sections, "automation") {
		probe, _ := probes["automationProbe"].(map[string]interface{})
		granted, _ := probe["ok"].(bool)
		if !granted {
			return false
		}
	}
	return true
}

func normalizeMacPrivacySections(section string) ([]string, error) {
	s := strings.ToLower(strings.TrimSpace(section))
	if s == "" || s == "all" {
		return []string{"accessibility", "inputMonitoring", "screenCapture", "automation"}, nil
	}

	switch s {
	case "accessibility":
		return []string{"accessibility"}, nil
	case "inputmonitoring", "input_monitoring", "input-monitoring", "listenevent":
		return []string{"inputMonitoring"}, nil
	case "globalshortcut", "global_shortcut", "global-shortcut":
		return []string{"accessibility", "inputMonitoring"}, nil
	case "screencapture", "screen_capture", "screen-capture", "screen":
		return []string{"screenCapture"}, nil
	case "automation":
		return []string{"automation"}, nil
	default:
		return nil, fmt.Errorf("invalid mac privacy section: %s", section)
	}
}

func runCommandProbe(name string, args ...string) (bool, string) {
	return runCommandProbeWithTimeout(defaultCommandProbeTimeout, name, args...)
}

func runCommandProbeWithTimeout(timeout time.Duration, name string, args ...string) (bool, string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return false, fmt.Sprintf("%s timed out after %s", name, timeout)
	}
	if err != nil {
		return false, simplifyProbeOutput(string(out), err.Error())
	}
	return true, ""
}

func simplifyProbeOutput(stdout string, fallback string) string {
	msg := strings.TrimSpace(stdout)
	if msg == "" {
		msg = strings.TrimSpace(fallback)
	}
	if msg == "" {
		return ""
	}
	msg = strings.ReplaceAll(msg, "\n", " | ")
	if len(msg) > 300 {
		msg = msg[:300] + "..."
	}
	return msg
}

func (p *Page) Goto(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}

	if runtime.GOOS == "darwin" {
		return startDetachedCommand(cmd)
	}
	return cmd.Run()
}

// OpenURL is an alias of Goto for clearer intent in scripts.
func (p *Page) OpenURL(url string) error {
	return p.Goto(url)
}

// OpenApp opens an application by name.
func (p *Page) OpenApp(appName string) error {
	if appName == "" {
		return fmt.Errorf("appName cannot be empty")
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-a", appName)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", appName)
	default:
		cmd = exec.Command(appName)
	}

	if runtime.GOOS == "darwin" {
		return startDetachedCommand(cmd)
	}
	return cmd.Run()
}

// OpenURLInApp opens a URL with a specific application when supported.
func (p *Page) OpenURLInApp(appName, url string) error {
	if url == "" {
		return fmt.Errorf("url cannot be empty")
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		args := []string{}
		if appName != "" {
			args = append(args, "-a", appName)
		}
		args = append(args, url)
		cmd = exec.Command("open", args...)
	case "windows":
		if appName != "" {
			cmd = exec.Command("cmd", "/c", "start", "", appName, url)
		} else {
			cmd = exec.Command("cmd", "/c", "start", url)
		}
	default:
		if appName != "" {
			cmd = exec.Command(appName, url)
		} else {
			cmd = exec.Command("xdg-open", url)
		}
	}

	if runtime.GOOS == "darwin" {
		return startDetachedCommand(cmd)
	}
	return cmd.Run()
}

func startDetachedCommand(cmd *exec.Cmd) error {
	if cmd == nil {
		return fmt.Errorf("command cannot be nil")
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	if cmd.Process != nil {
		return cmd.Process.Release()
	}
	return nil
}

func launchMacAutomationPromptHelper(targetApp string) (macAutomationPromptLaunch, error) {
	result := macAutomationPromptLaunch{}

	exePath, err := os.Executable()
	if err != nil {
		return result, fmt.Errorf("resolve current executable: %w", err)
	}

	cmd := exec.Command(
		exePath,
		"-mac-permission-helper", "automation-prompt",
		"-mac-permission-target", targetApp,
	)
	if err := cmd.Start(); err != nil {
		return result, fmt.Errorf("start automation prompt helper: %w", err)
	}

	if cmd.Process != nil {
		result.PID = cmd.Process.Pid
	}

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	select {
	case err := <-waitCh:
		result.Completed = true
		result.Success = err == nil
		if err != nil {
			result.Error = err.Error()
		}
		return result, nil
	case <-time.After(1200 * time.Millisecond):
		return result, nil
	}
}

func (p *Page) Title() string {
	title := robotgo.GetTitle()
	return title
}

// Page 结构体中添加 WaitFor 方法
func (p *Page) WaitFor(milliseconds int64) error {
	if milliseconds < 0 {
		return fmt.Errorf("WaitFor: milliseconds cannot be negative")
	}

	// 可以设置一个最大等待时间，防止过长等待
	const maxWait = 30000 // 最大等待 30 秒
	if milliseconds > maxWait {
		return fmt.Errorf("WaitFor: wait time cannot exceed %d milliseconds", maxWait)
	}

	time.Sleep(time.Duration(milliseconds) * time.Millisecond)
	return nil
}

func (p *Page) Url() string {
	// Since we store the executable path in Page struct
	return p.Executable
}

// mergeWithDefaultOptions merges provided options with default values
func mergeWithDefaultOptions(options *ScreenshotOptions) *ScreenshotOptions {
	if options == nil {
		return &ScreenshotOptions{
			Type:           DefaultScreenshotOptions.Type,
			Quality:        DefaultScreenshotOptions.Quality,
			FullPage:       DefaultScreenshotOptions.FullPage,
			OmitBackground: DefaultScreenshotOptions.OmitBackground,
			Encoding:       DefaultScreenshotOptions.Encoding,
			ReturnType:     DefaultScreenshotOptions.ReturnType,
			Target:         DefaultScreenshotOptions.Target,
			DisplayIndex:   DefaultScreenshotOptions.DisplayIndex,
		}
	}

	merged := &ScreenshotOptions{
		Type:           options.Type,
		Quality:        options.Quality,
		FullPage:       options.FullPage,
		OmitBackground: options.OmitBackground,
		Encoding:       options.Encoding,
		ReturnType:     options.ReturnType,
		Path:           options.Path,
		Target:         options.Target,
		DisplayIndex:   options.DisplayIndex,
		Clip:           options.Clip,
	}

	// Apply defaults only if fields are empty
	if merged.Type == "" {
		merged.Type = DefaultScreenshotOptions.Type
	}
	if merged.Quality == 0 {
		merged.Quality = DefaultScreenshotOptions.Quality
	}
	// Boolean defaults are handled implicitly since false is the zero value

	if merged.Encoding == "" {
		merged.Encoding = DefaultScreenshotOptions.Encoding
	}
	if merged.ReturnType == "" {
		merged.ReturnType = DefaultScreenshotOptions.ReturnType
	}
	if merged.Target == "" {
		merged.Target = DefaultScreenshotOptions.Target
	}

	return merged
}
