//go:build darwin
// +build darwin

package automation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/shirou/gopsutil/v3/process"
)

type macWindow struct {
	Title        string `json:"title"`
	PID          uint32 `json:"pid"`
	X            int32  `json:"x"`
	Y            int32  `json:"y"`
	Width        int32  `json:"width"`
	Height       int32  `json:"height"`
	AppName      string `json:"appName"`
	IsForeground bool   `json:"isForeground"`
	HasFocus     bool   `json:"hasFocus"`
	Handle       int64  `json:"handle"`
	IsPopup      bool   `json:"isPopup"`
	Index        int    `json:"index"`
	ExeName      string `json:"-"`
	ExePath      string `json:"-"`
}

// enrichMacWindow adds best-effort process metadata without making window
// discovery fail when process inspection is unavailable.
func enrichMacWindow(item *macWindow) {
	if item == nil {
		return
	}
	item.ExeName = item.AppName
	if item.PID == 0 {
		return
	}
	proc, err := process.NewProcess(int32(item.PID))
	if err != nil {
		return
	}
	if name, err := proc.Name(); err == nil && name != "" {
		item.ExeName = name
	}
	if exePath, err := proc.Exe(); err == nil && exePath != "" {
		item.ExePath = exePath
	}
}

func (m macWindow) toWindowInfo() *WindowInfo {
	return &WindowInfo{
		Title:        m.Title,
		ProcessID:    m.PID,
		X:            m.X,
		Y:            m.Y,
		Width:        m.Width,
		Height:       m.Height,
		ExeName:      m.ExeName,
		ExePath:      m.ExePath,
		IsForeground: m.IsForeground,
		HasFocus:     m.HasFocus,
		Handle:       uintptr(m.Handle),
		IsPopup:      m.IsPopup,
		Index:        m.Index,
	}
}

// darwinWindowManager handles window-related operations on macOS via System Events.
type darwinWindowManager struct{}

func newPlatformWindowManager() windowManagerPlatform {
	return &darwinWindowManager{}
}

func (w *darwinWindowManager) GetActiveWindow() (*WindowInfo, error) {
	if active, err := getFrontMacWindow(); err == nil && active != nil {
		return active.toWindowInfo(), nil
	}
	windows, err := listMacWindows()
	if err != nil {
		return nil, err
	}
	if len(windows) == 0 {
		return nil, fmt.Errorf("no active window found")
	}
	for _, item := range windows {
		if item.IsForeground {
			return item.toWindowInfo(), nil
		}
	}
	return windows[0].toWindowInfo(), nil
}

func (w *darwinWindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	target, err := findWindowByTitle(title)
	if err != nil {
		return nil, err
	}
	return target.toWindowInfo(), nil
}

func (w *darwinWindowManager) Focus(title string) error {
	action := `
		try { p.frontmost = true; } catch (e) {}
		try { w.actions.byName("AXRaise").perform(); } catch (e) {}
	`
	return runActionByTitle(title, action)
}

func (w *darwinWindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	action := `
		var nx = parseInt(argv[1], 10);
		var ny = parseInt(argv[2], 10);
		var nw = parseInt(argv[3], 10);
		var nh = parseInt(argv[4], 10);
		if (isNaN(nx) || isNaN(ny) || isNaN(nw) || isNaN(nh)) {
			throw new Error("invalid bounds args");
		}
		try { w.position = [nx, ny]; } catch (e) {}
		try { w.size = [nw, nh]; } catch (e) {}
		try { p.frontmost = true; } catch (e) {}
		try { w.actions.byName("AXRaise").perform(); } catch (e) {}
	`
	return runActionByTitle(title, action, strconv.Itoa(x), strconv.Itoa(y), strconv.Itoa(width), strconv.Itoa(height))
}

func (w *darwinWindowManager) SetWidth(title string, width int) error {
	info, err := w.GetWindowByTitle(title)
	if err != nil {
		return err
	}
	return w.SetWindowBounds(title, int(info.X), int(info.Y), width, int(info.Height))
}

func (w *darwinWindowManager) SetHeight(title string, height int) error {
	info, err := w.GetWindowByTitle(title)
	if err != nil {
		return err
	}
	return w.SetWindowBounds(title, int(info.X), int(info.Y), int(info.Width), height)
}

func (w *darwinWindowManager) Maximize(title string) error {
	target := getPrimaryDisplayInfo(resolveDisplays())
	if target == nil || target.Width <= 0 || target.Height <= 0 {
		return fmt.Errorf("unable to resolve display bounds for window: %s", title)
	}

	// Avoid Finder desktop Apple Events here. They can trigger a separate
	// Automation consent flow and leave an otherwise safe maximize call blocked.
	// Finder's former desktop bounds represented the primary display, so use the
	// same display semantics without an extra all-window enumeration.
	return w.SetWindowBounds(title, target.X, target.Y, target.Width, target.Height)
}

func (w *darwinWindowManager) Minimize(title string) error {
	action := `
		try { p.frontmost = true; } catch (e) {}
		try { w.actions.byName("AXRaise").perform(); } catch (e) {}
		try { w.attributes.byName("AXMinimized").value = true; } catch (e) {
			throw new Error("unable to minimize window: " + e);
		}
	`
	return runActionByTitle(title, action)
}

func (w *darwinWindowManager) Restore(title string) error {
	action := `
		try { w.attributes.byName("AXMinimized").value = false; } catch (e) {}
		try { p.frontmost = true; } catch (e) {}
		try { w.actions.byName("AXRaise").perform(); } catch (e) {}
	`
	return runActionByTitle(title, action)
}

func (w *darwinWindowManager) RestoreByPID(pid uint32) error {
	target, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return w.Restore(target.Title)
}

func (w *darwinWindowManager) MinimizeByPID(pid uint32) error {
	target, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return w.Minimize(target.Title)
}

func (w *darwinWindowManager) MaximizeByPID(pid uint32) error {
	target, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return w.Maximize(target.Title)
}

func (w *darwinWindowManager) CloseWindow(title string) error {
	action := `
		var app = Application.currentApplication();
		app.includeStandardAdditions = true;
		try { p.frontmost = true; } catch (e) {}
		try { w.actions.byName("AXRaise").perform(); } catch (e) {}
		delay(0.05);
		try {
			w.actions.byName("AXClose").perform();
		} catch (e1) {
			var se = Application("System Events");
			try {
				se.keystroke("w", { using: ["command down"] });
			} catch (e2) {
				throw new Error("unable to close window: " + e1 + " / " + e2);
			}
		}
	`
	return runActionByTitle(title, action)
}

func (w *darwinWindowManager) CloseActiveWindow() error {
	script := `
function run() {
	var app = Application.currentApplication();
	app.includeStandardAdditions = true;
	var se = Application("System Events");
	var front = se.applicationProcesses.whose({frontmost: true})();
	if (front.length === 0) {
		throw new Error("no active window found");
	}
	var p = front[0];
	var ws = [];
	try { ws = p.windows(); } catch (e) { ws = []; }
	if (ws.length === 0) {
		throw new Error("no active window found");
	}
	try {
		ws[0].actions.byName("AXClose").perform();
	} catch (e1) {
		se.keystroke("w", { using: ["command down"] });
	}
	return "ok";
}`
	_, err := runJXA(script)
	return err
}

func (w *darwinWindowManager) Kill(processId uint32) error {
	if processId == 0 {
		return fmt.Errorf("invalid process id")
	}
	if err := syscall.Kill(int(processId), syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to kill process %d: %w", processId, err)
	}
	return nil
}

func (w *darwinWindowManager) Title() string {
	info, err := w.GetActiveWindow()
	if err != nil || info == nil {
		return ""
	}
	return info.Title
}

func (w *darwinWindowManager) GetTitle(selector string) (string, error) {
	info, err := w.GetWindowByTitle(selector)
	if err != nil {
		return "", err
	}
	return info.Title, nil
}

func (w *darwinWindowManager) Content() string {
	// macOS generic automation cannot reliably scrape full window text for all apps.
	// Returning active window title keeps compatibility without false data.
	return w.Title()
}

func (w *darwinWindowManager) GetContent(selector string) (string, error) {
	return w.GetTitle(selector)
}

func (w *darwinWindowManager) List() ([]map[string]interface{}, error) {
	windows, err := listMacWindows()
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, 0, len(windows))
	for _, item := range windows {
		row := map[string]interface{}{
			"title":        item.Title,
			"pid":          item.PID,
			"processId":    item.PID,
			"x":            item.X,
			"y":            item.Y,
			"width":        item.Width,
			"height":       item.Height,
			"exeName":      item.ExeName,
			"exePath":      item.ExePath,
			"isForeground": item.IsForeground,
			"hasFocus":     item.HasFocus,
			"isPopup":      item.IsPopup,
			"handle":       uintptr(item.Handle),
			"index":        item.Index,
		}
		result = append(result, row)
	}
	return result, nil
}

func (w *darwinWindowManager) GetFocusWindow() (*WindowInfo, error) {
	if active, err := getFrontMacWindow(); err == nil && active != nil {
		return active.toWindowInfo(), nil
	}
	windows, err := listMacWindows()
	if err != nil {
		return nil, err
	}
	if len(windows) == 0 {
		return nil, nil
	}
	for _, item := range windows {
		if item.HasFocus || item.IsForeground {
			return item.toWindowInfo(), nil
		}
	}
	return windows[0].toWindowInfo(), nil
}

func (w *darwinWindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	return fmt.Errorf("setAlwaysOnTop is not supported on macOS for arbitrary third-party windows")
}

func (w *darwinWindowManager) UnsetTopMost(title string) error {
	return w.SetAlwaysOnTop(title, false)
}

func (w *darwinWindowManager) BringToTop(title string, pid interface{}) error {
	if strings.TrimSpace(title) != "" {
		if err := w.Focus(title); err == nil {
			return nil
		}
	}

	targetPID := uint32(jsToInt(pid))
	if targetPID == 0 {
		return fmt.Errorf("window title cannot be empty and pid is invalid")
	}

	target, err := findWindowByPID(targetPID)
	if err != nil {
		return err
	}

	return w.Focus(target.Title)
}

func findWindowByTitle(title string) (*macWindow, error) {
	if strings.TrimSpace(title) == "" {
		return nil, fmt.Errorf("window title cannot be empty")
	}

	windows, err := listMacWindows()
	if err != nil {
		return nil, err
	}

	var fuzzy *macWindow
	for i := range windows {
		if windows[i].Title == title {
			return &windows[i], nil
		}
		if fuzzy == nil && strings.Contains(windows[i].Title, title) {
			fuzzy = &windows[i]
		}
	}

	if fuzzy != nil {
		return fuzzy, nil
	}
	return nil, fmt.Errorf("window not found: %s", title)
}

func findWindowByPID(pid uint32) (*macWindow, error) {
	windows, err := listMacWindows()
	if err != nil {
		return nil, err
	}

	for i := range windows {
		if windows[i].PID == pid {
			return &windows[i], nil
		}
	}
	return nil, fmt.Errorf("window not found for process id %d", pid)
}

func runActionByTitle(title, action string, args ...string) error {
	// The normal live route targets the verified foreground Safari fixture.  Do
	// that lookup first: enumerating every application window through System
	// Events can block indefinitely on an unrelated application.
	frontScript := fmt.Sprintf(`
function run(argv) {
	var target = String(argv[0] || "");
	if (!target) throw new Error("window title cannot be empty");
	var se = Application("System Events");
	var fronts = se.applicationProcesses.whose({frontmost: true})();
	if (fronts.length === 0) throw new Error("no frontmost process");
	var p = fronts[0];
	var ws = [];
	try { ws = p.windows(); } catch (e) { ws = []; }
	for (var i = 0; i < ws.length; i++) {
		var w = ws[i];
		var name = "";
		try { name = String(w.name()); } catch (e) { name = ""; }
		if (name === target) {
			%s
			return "ok";
		}
	}
	throw new Error("frontmost window does not match: " + target);
}`, action)

	jxaArgs := append([]string{title}, args...)
	if _, err := runJXA(frontScript, jxaArgs...); err == nil {
		return nil
	}

	return runActionByTitleFallback(title, action, args...)
}

func runActionByTitleFallback(title, action string, args ...string) error {
	script := fmt.Sprintf(`
function run(argv) {
	var target = String(argv[0] || "");
	if (!target) {
		throw new Error("window title cannot be empty");
	}
	var se = Application("System Events");
	var procs = se.applicationProcesses();
	for (var i = 0; i < procs.length; i++) {
		var p = procs[i];
		var ws = [];
		try { ws = p.windows(); } catch (e) { ws = []; }
		for (var j = 0; j < ws.length; j++) {
			var w = ws[j];
			var name = "";
			try { name = String(w.name()); } catch (e) { name = ""; }
			if (name === target) {
				%s
				return "ok";
			}
		}
	}
	throw new Error("window not found: " + target);
}`, action)

	jxaArgs := append([]string{title}, args...)
	_, err := runJXA(script, jxaArgs...)
	return err
}

// getFrontMacWindow reads only the known foreground process. It deliberately
// avoids the all-process JXA enumeration used by List/GetWindowByTitle, so a
// blocked third-party accessibility tree cannot stall guarded live actions.
func getFrontMacWindow() (*macWindow, error) {
	script := `
function run() {
	var se = Application("System Events");
	var fronts = se.applicationProcesses.whose({frontmost: true})();
	if (fronts.length === 0) return "";
	var p = fronts[0];
	var ws = [];
	try { ws = p.windows(); } catch (e) { ws = []; }
	if (ws.length === 0) return "";
	var w = ws[0];
	var pos = [0, 0], size = [0, 0], title = "", name = "", pid = 0;
	try { pos = w.position(); } catch (e) {}
	try { size = w.size(); } catch (e) {}
	try { title = String(w.name()); } catch (e) {}
	try { name = String(p.name()); } catch (e) {}
	try { pid = Number(p.unixId()); } catch (e) {}
	return JSON.stringify({ title: title, pid: pid, x: Number(pos[0]) || 0, y: Number(pos[1]) || 0,
		width: Number(size[0]) || 0, height: Number(size[1]) || 0, appName: name,
		isForeground: true, hasFocus: true, handle: 0, isPopup: false, index: 0 });
}`
	out, err := runJXA(script)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(out) == "" {
		return nil, fmt.Errorf("no active window found")
	}
	var item macWindow
	if err := json.Unmarshal([]byte(out), &item); err != nil {
		return nil, fmt.Errorf("failed to parse active macOS window: %w", err)
	}
	if item.Title == "" || item.PID == 0 {
		return nil, fmt.Errorf("frontmost process has no identifiable window")
	}
	enrichMacWindow(&item)
	return &item, nil
}

func listMacWindows() ([]macWindow, error) {
	script := `
function run() {
	var se = Application("System Events");
	var out = [];
	var frontPid = -1;
	try {
		var front = se.applicationProcesses.whose({frontmost: true})();
		if (front.length > 0) {
			frontPid = Number(front[0].unixId());
		}
	} catch (e) {}

	var procs = [];
	try { procs = se.applicationProcesses(); } catch (e) { return "[]"; }

	for (var i = 0; i < procs.length; i++) {
		var p = procs[i];
		var pid = 0;
		var appName = "";
		try { pid = Number(p.unixId()); } catch (e) {}
		try { appName = String(p.name()); } catch (e) {}

		var ws = [];
		try { ws = p.windows(); } catch (e) { ws = []; }
		for (var j = 0; j < ws.length; j++) {
			var w = ws[j];
			var title = "";
			try { title = String(w.name()); } catch (e) { title = ""; }
			if (!title) continue;

			var pos = [0, 0];
			var size = [0, 0];
			try { pos = w.position(); } catch (e) {}
			try { size = w.size(); } catch (e) {}

			out.push({
				title: title,
				pid: pid,
				x: Number(pos[0]) || 0,
				y: Number(pos[1]) || 0,
				width: Number(size[0]) || 0,
				height: Number(size[1]) || 0,
				appName: appName,
				isForeground: pid === frontPid,
				hasFocus: pid === frontPid,
				handle: 0,
				isPopup: false,
				index: 0
			});
		}
	}

	for (var k = 0; k < out.length; k++) {
		out[k].index = out.length - k - 1;
	}

	return JSON.stringify(out);
}`

	out, err := runJXA(script)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(out) == "" {
		return []macWindow{}, nil
	}

	var items []macWindow
	if err := json.Unmarshal([]byte(out), &items); err != nil {
		return nil, fmt.Errorf("failed to parse macOS window list: %w", err)
	}

	for i := range items {
		enrichMacWindow(&items[i])
	}

	return items, nil
}

func runJXA(script string, args ...string) (string, error) {
	cmdArgs := []string{"-l", "JavaScript", "-e", script}
	cmdArgs = append(cmdArgs, args...)

	cmd := exec.Command("osascript", cmdArgs...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		if strings.Contains(errMsg, "不允许辅助访问") ||
			strings.Contains(strings.ToLower(errMsg), "not allowed assistive access") ||
			strings.Contains(strings.ToLower(errMsg), "not authorized to send apple events") {
			errMsg += " | 请在 macOS“系统设置 -> 隐私与安全性 -> 辅助功能”中允许当前终端/应用访问。"
		}
		return "", fmt.Errorf("osascript failed: %s", errMsg)
	}

	return strings.TrimSpace(stdout.String()), nil
}
