// Package aicli exposes the small, structured desktop-tool surface used by
// coding agents. It deliberately calls the existing automation services; it
// is not another desktop automation backend.
package aicli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

// IsCommand reports whether argv selects the AI command surface. Keeping this
// small predicate in a separate package lets the legacy flag-based CLI retain
// its parsing contract unchanged.
func IsCommand(argv []string) bool {
	return len(argv) > 0 && argv[0] == "ai"
}

// Error is the stable machine-readable failure shape for AI commands.
type Error struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Permission string `json:"permission,omitempty"`
}

// Envelope is emitted as the only stdout payload for every AI CLI command.
type Envelope struct {
	OK       bool   `json:"ok"`
	Command  string `json:"command"`
	Result   any    `json:"result,omitempty"`
	Error    *Error `json:"error,omitempty"`
	Evidence any    `json:"evidence,omitempty"`
}

type Argument struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required,omitempty"`
	Description string `json:"description"`
}

type command struct {
	Name        string
	Description string
	Capability  string
	Arguments   []Argument
	Evidence    bool
	Handler     func(*Context) (any, *Error)
}

// Context is provided to an AI command handler.
type Context struct {
	Args    []string
	Stdout  io.Writer
	Stderr  io.Writer
	Tracker *tracker
}

func registry() []command {
	return []command{
		{Name: "capabilities", Description: "Report runtime and permission-aware desktop capabilities.", Handler: capabilitiesCommand},
		{Name: "schema", Description: "Return the compact machine-readable AI CLI command schema.", Handler: schemaCommand},
		{Name: "windows", Description: "List desktop windows, optionally filtered by title.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Description: "Case-insensitive title filter."}}, Handler: windowsCommand},
		{Name: "window.active", Description: "Get the active window.", Capability: "windows", Evidence: true, Handler: windowActiveCommand},
		{Name: "window.find", Description: "Find a window by title.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title or title fragment."}}, Handler: windowFindCommand},
		{Name: "window.focus", Description: "Focus a window by title.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title or title fragment."}}, Handler: windowFocusCommand},
		{Name: "window.bounds", Description: "Get compact bounds for a window.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title or title fragment."}}, Handler: windowBoundsCommand},
		{Name: "window.move", Description: "Move a window without changing its size.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}, {Name: "--x", Type: "integer", Required: true, Description: "Desktop x."}, {Name: "--y", Type: "integer", Required: true, Description: "Desktop y."}}, Handler: windowMoveCommand},
		{Name: "window.resize", Description: "Resize a window without changing its position.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}, {Name: "--width", Type: "integer", Required: true, Description: "Width."}, {Name: "--height", Type: "integer", Required: true, Description: "Height."}}, Handler: windowResizeCommand},
		{Name: "window.maximize", Description: "Maximize a window.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}}, Handler: windowMaximizeCommand},
		{Name: "window.minimize", Description: "Minimize a window.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}}, Handler: windowMinimizeCommand},
		{Name: "window.restore", Description: "Restore a minimized window.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}}, Handler: windowRestoreCommand},
		{Name: "window.close", Description: "Close a window. This may discard unsaved work.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Required: true, Description: "Window title."}}, Handler: windowCloseCommand},
		{Name: "window.content", Description: "Read platform-dependent focused-window content.", Capability: "windows", Evidence: true, Arguments: []Argument{{Name: "--title", Type: "string", Description: "Optional window title."}}, Handler: windowContentCommand},
		{Name: "screen.list", Description: "List displays in AI CLI zero-based order.", Capability: "screen", Evidence: true, Handler: screenListCommand},
		{Name: "screen.info", Description: "Read one display or virtual-desktop bounds.", Capability: "screen", Evidence: true, Arguments: []Argument{{Name: "--display", Type: "integer", Description: "Zero-based display index."}}, Handler: screenInfoCommand},
		{Name: "screen.pixel", Description: "Read a screen pixel color.", Capability: "screen", Evidence: true, Arguments: []Argument{{Name: "--x", Type: "integer", Required: true, Description: "Desktop x."}, {Name: "--y", Type: "integer", Required: true, Description: "Desktop y."}}, Handler: screenPixelCommand},
		{Name: "screenshot", Description: "Save an active-window, named-window, screen, or ROI screenshot as a PNG artifact.", Capability: "screenshot", Evidence: true, Arguments: []Argument{{Name: "--active-window", Type: "boolean", Description: "Capture the active window."}, {Name: "--window-title", Type: "string", Description: "Focus and capture this window."}, {Name: "--screen", Type: "boolean", Description: "Capture a display."}, {Name: "--display", Type: "integer", Description: "Zero-based display index."}, {Name: "--region", Type: "x,y,width,height", Description: "Screen ROI, or window-local ROI with a window target."}, {Name: "--region-relative", Type: "xRatio,yRatio,widthRatio,heightRatio", Description: "Window-relative ROI."}, {Name: "--output", Type: "path", Description: "PNG output path; defaults to execution evidence."}}, Handler: screenshotCommand},
		{Name: "mouse.position", Description: "Read pointer position.", Capability: "mouse", Evidence: true, Handler: mousePositionCommand},
		{Name: "mouse.move", Description: "Move the pointer in screen, window-local, or relative coordinates.", Capability: "mouse", Evidence: true, Arguments: pointArguments(), Handler: mouseMoveCommand},
		{Name: "mouse.click", Description: "Click in screen, window-local, or relative coordinates.", Capability: "mouse", Evidence: true, Arguments: pointArguments(), Handler: mouseClickCommand},
		{Name: "mouse.double-click", Description: "Double-click in screen, window-local, or relative coordinates.", Capability: "mouse", Evidence: true, Arguments: pointArguments(), Handler: mouseDoubleClickCommand},
		{Name: "mouse.down", Description: "Press a mouse button at the current pointer position.", Capability: "mouse", Evidence: true, Arguments: []Argument{{Name: "--button", Type: "left|right|middle", Description: "Defaults to left."}}, Handler: mouseDownCommand},
		{Name: "mouse.up", Description: "Release a mouse button at the current pointer position.", Capability: "mouse", Evidence: true, Arguments: []Argument{{Name: "--button", Type: "left|right|middle", Description: "Defaults to left."}}, Handler: mouseUpCommand},
		{Name: "mouse.drag", Description: "Drag between two screen-space points.", Capability: "mouse", Evidence: true, Arguments: []Argument{{Name: "--from-x", Type: "integer", Required: true, Description: "Start x."}, {Name: "--from-y", Type: "integer", Required: true, Description: "Start y."}, {Name: "--to-x", Type: "integer", Required: true, Description: "End x."}, {Name: "--to-y", Type: "integer", Required: true, Description: "End y."}, {Name: "--steps", Type: "integer", Description: "Move steps."}}, Handler: mouseDragCommand},
		{Name: "keyboard.type", Description: "Type text into the focused target.", Capability: "keyboard", Evidence: true, Arguments: []Argument{{Name: "--text", Type: "string", Required: true, Description: "Text to type."}, {Name: "--window-title", Type: "string", Description: "Focus this window immediately before input."}}, Handler: keyboardTypeCommand},
		{Name: "keyboard.press", Description: "Press one key using the portable key naming contract.", Capability: "keyboard", Evidence: true, Arguments: []Argument{{Name: "--key", Type: "string", Required: true, Description: "For example ENTER or ArrowDown."}, {Name: "--window-title", Type: "string", Description: "Focus this window immediately before input."}}, Handler: keyboardPressCommand},
		{Name: "keyboard.hotkey", Description: "Press a comma-separated shortcut, e.g. CMD,L or CTRL,SHIFT,P.", Capability: "keyboard", Evidence: true, Arguments: []Argument{{Name: "--keys", Type: "string", Required: true, Description: "Comma-separated keys."}, {Name: "--window-title", Type: "string", Description: "Focus this window immediately before input."}}, Handler: keyboardHotkeyCommand},
		{Name: "scroll", Description: "Scroll the focused target using desktop delta semantics.", Capability: "mouse", Evidence: true, Arguments: []Argument{{Name: "--dx", Type: "integer", Description: "Positive is right."}, {Name: "--dy", Type: "integer", Description: "Positive is down."}, {Name: "--steps", Type: "integer", Description: "Defaults to 1."}, {Name: "--delay", Type: "milliseconds", Description: "Delay between steps."}, {Name: "--window-title", Type: "string", Description: "Focus this window immediately before scrolling."}}, Handler: scrollCommand},
		{Name: "clipboard.get", Description: "Read text from the system clipboard.", Capability: "clipboard", Evidence: true, Handler: clipboardGetCommand},
		{Name: "clipboard.set", Description: "Write text to the system clipboard.", Capability: "clipboard", Evidence: true, Arguments: []Argument{{Name: "--text", Type: "string", Required: true, Description: "Text to write."}}, Handler: clipboardSetCommand},
		{Name: "clipboard.clear", Description: "Clear the clipboard using the current runtime semantics.", Capability: "clipboard", Evidence: true, Handler: clipboardClearCommand},
		{Name: "app.open", Description: "Open an application by system application name.", Capability: "app", Evidence: true, Arguments: []Argument{{Name: "--name", Type: "string", Required: true, Description: "Application name."}}, Handler: appOpenCommand},
		{Name: "app.open-url", Description: "Open a URL, optionally with a named application.", Capability: "app", Evidence: true, Arguments: []Argument{{Name: "--url", Type: "string", Required: true, Description: "URL."}, {Name: "--name", Type: "string", Description: "Optional application name."}}, Handler: appOpenURLCommand},
		{Name: "vision.ocr", Description: "Run OCR on an image artifact or file.", Capability: "vision", Evidence: true, Arguments: visionArguments(), Handler: visionOCRCommand},
		{Name: "vision.detect-ui", Description: "Find OCR UI candidates by text.", Capability: "vision", Evidence: true, Arguments: append(visionArguments(), Argument{Name: "--text", Type: "string", Required: true, Description: "Target UI text."}), Handler: visionDetectUICommand},
		{Name: "image.match", Description: "Run stable template matching.", Capability: "image", Evidence: true, Arguments: []Argument{{Name: "--image", Type: "path", Required: true, Description: "Source image."}, {Name: "--template", Type: "path", Required: true, Description: "Template image."}, {Name: "--threshold", Type: "number", Description: "0 through 1; defaults to 0.8."}}, Handler: imageMatchCommand},
		{Name: "image.color", Description: "Find a color in an image.", Capability: "image", Evidence: true, Arguments: []Argument{{Name: "--image", Type: "path", Required: true, Description: "Source image."}, {Name: "--color", Type: "#rrggbb", Required: true, Description: "Target color."}, {Name: "--x/--y/--width/--height", Type: "integer", Description: "Optional image-local search ROI."}, {Name: "--threshold", Type: "integer", Description: "RGB channel tolerance."}}, Handler: imageColorCommand},
		{Name: "image.pixel", Description: "Read one image pixel.", Capability: "image", Evidence: true, Arguments: []Argument{{Name: "--image", Type: "path", Required: true, Description: "Source image."}, {Name: "--x", Type: "integer", Required: true, Description: "Image x."}, {Name: "--y", Type: "integer", Required: true, Description: "Image y."}}, Handler: imagePixelCommand},
		{Name: "image.size", Description: "Read image dimensions.", Capability: "image", Evidence: true, Arguments: []Argument{{Name: "--image", Type: "path", Required: true, Description: "Source image."}}, Handler: imageSizeCommand},
		{Name: "system.info", Description: "Read non-destructive system information.", Capability: "system", Evidence: true, Handler: systemInfoCommand},
		{Name: "system.processes", Description: "List processes with a bounded default result.", Capability: "system", Evidence: true, Arguments: []Argument{{Name: "--limit", Type: "integer", Description: "1 through 500; defaults to 50."}}, Handler: systemProcessesCommand},
		{Name: "system.metrics", Description: "Read CPU, memory, and disk metrics.", Capability: "system", Evidence: true, Handler: systemMetricsCommand},
		{Name: "run", Description: "Run a parameterized JavaScript recipe with Execution.input.", Capability: "run", Arguments: []Argument{{Name: "recipe.js", Type: "path", Required: true, Description: "JavaScript recipe."}, {Name: "--input", Type: "json", Description: "Inline JSON input."}, {Name: "--input-file", Type: "path", Description: "JSON input file."}, {Name: "--input-stdin", Type: "boolean", Description: "Read JSON input from stdin."}, {Name: "--timeout", Type: "duration", Description: "Optional Go duration, for example 30s or 2m; defaults to the standard 30m execution timeout."}}, Handler: runCommand},
	}
}

func pointArguments() []Argument {
	return []Argument{
		{Name: "--x", Type: "integer", Description: "Screen x, or window-local x with --window-title."},
		{Name: "--y", Type: "integer", Description: "Screen y, or window-local y with --window-title."},
		{Name: "--window-title", Type: "string", Description: "Focus target and interpret x/y as window-local."},
		{Name: "--relative-x", Type: "number", Description: "Window width ratio from 0 to 1."},
		{Name: "--relative-y", Type: "number", Description: "Window height ratio from 0 to 1."},
	}
}

func visionArguments() []Argument {
	return []Argument{
		{Name: "--image", Type: "path", Required: true, Description: "Image path."},
		{Name: "--provider", Type: "string", Description: "OCR provider."},
		{Name: "--lang", Type: "string", Description: "OCR language."},
		{Name: "--include-raw", Type: "boolean", Description: "Include provider raw response."},
	}
}

// Execute runs an AI CLI invocation. stdout is always one JSON envelope; all
// diagnostics remain on stderr or in the execution evidence directory.
func Execute(argv []string, stdout, stderr io.Writer) (exitCode int) {
	defer func() {
		if recovered := recover(); recovered != nil {
			fmt.Fprintf(stderr, "opendesk ai panic: %v\n%s", recovered, debug.Stack())
			exitCode = writeEnvelope(stdout, Envelope{OK: false, Command: "ai", Error: &Error{Code: "internal_error", Message: "AI command failed unexpectedly"}})
		}
	}()
	if len(argv) == 0 || argv[0] != "ai" {
		return writeEnvelope(stdout, Envelope{OK: false, Command: "ai", Error: &Error{Code: "invalid_command", Message: "AI command must start with 'ai'"}})
	}
	name, rest, err := resolveRoute(argv[1:])
	if err != nil {
		return writeEnvelope(stdout, Envelope{OK: false, Command: "ai", Error: err})
	}
	if name == "help" {
		return writeEnvelope(stdout, Envelope{OK: true, Command: "help", Result: helpResult()})
	}
	cmd, ok := findCommand(name)
	if !ok {
		return writeEnvelope(stdout, Envelope{OK: false, Command: name, Error: &Error{Code: "invalid_command", Message: "unknown AI command; run 'opendesk ai schema'"}})
	}

	ctx := &Context{Args: rest, Stdout: stdout, Stderr: stderr}
	if cmd.Evidence {
		tracker, trackErr := startTracker(cmd.Name, rest)
		if trackErr != nil {
			return writeEnvelope(stdout, Envelope{OK: false, Command: cmd.Name, Error: &Error{Code: "internal_error", Message: trackErr.Error()}})
		}
		ctx.Tracker = tracker
	}

	result, cliErr := cmd.Handler(ctx)
	envelope := Envelope{OK: cliErr == nil, Command: cmd.Name, Result: result, Error: cliErr}
	if ctx.Tracker != nil {
		envelope.Evidence = ctx.Tracker.evidenceRef()
		ctx.Tracker.finish(envelope)
	}
	return writeEnvelope(stdout, envelope)
}

func resolveRoute(args []string) (string, []string, *Error) {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" || args[0] == "help" {
		return "help", nil, nil
	}
	grouped := map[string]bool{"window": true, "screen": true, "mouse": true, "keyboard": true, "clipboard": true, "app": true, "vision": true, "image": true, "system": true}
	if grouped[args[0]] {
		if len(args) < 2 || strings.HasPrefix(args[1], "-") {
			return "", nil, &Error{Code: "invalid_command", Message: "missing AI subcommand; run 'opendesk ai schema'"}
		}
		return args[0] + "." + args[1], args[2:], nil
	}
	return args[0], args[1:], nil
}

func findCommand(name string) (command, bool) {
	for _, cmd := range registry() {
		if cmd.Name == name {
			return cmd, true
		}
	}
	return command{}, false
}

func helpResult() map[string]any {
	return map[string]any{
		"usage":    "opendesk ai <command> [arguments]",
		"hint":     "Use 'opendesk ai schema' for machine-readable arguments and capabilities.",
		"commands": commandNames(),
	}
}

func commandNames() []string {
	items := registry()
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.Name)
	}
	return names
}

func writeEnvelope(writer io.Writer, envelope Envelope) int {
	data, err := json.Marshal(envelope)
	if err != nil {
		_, _ = fmt.Fprint(writer, `{"ok":false,"command":"ai","error":{"code":"internal_error","message":"failed to encode JSON response"}}`+"\n")
		return 1
	}
	_, _ = writer.Write(append(data, '\n'))
	if envelope.OK {
		return 0
	}
	switch envelope.Error.Code {
	case "invalid_command", "invalid_argument", "invalid_json":
		return 2
	case "unsupported_platform", "capability_unavailable":
		return 3
	case "permission_required":
		return 4
	case "window_not_found", "capture_failed", "vision_failed", "execution_failed", "timeout":
		return 5
	default:
		return 1
	}
}

type tracker struct {
	command   string
	artifacts pkgExecution.ExecutionArtifacts
	emitter   *pkgExecution.Emitter
}

func startTracker(command string, args []string) (*tracker, error) {
	id := pkgExecution.NewExecutionID("ai")
	artifacts, err := pkgExecution.PrepareArtifacts(filepath.Join(".runtime", "ai", id), id, ".json")
	if err != nil {
		return nil, err
	}
	input := map[string]any{"command": command, "arguments": args, "timestamp": time.Now().Format(time.RFC3339), "platform": runtimePlatform()}
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode command evidence: %w", err)
	}
	if err := os.WriteFile(filepath.Join(artifacts.RunDir, "command.json"), append(data, '\n'), 0o644); err != nil {
		return nil, fmt.Errorf("write command evidence: %w", err)
	}
	emitter, err := pkgExecution.NewEmitter(id, pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}}, artifacts, time.Now())
	if err != nil {
		return nil, err
	}
	emitter.SetSource("ai:"+command, "")
	emitter.SetMeta("aiCommand", command)
	emitter.Emit(pkgExecution.EventCategoryMeta, pkgExecution.EventLevelInfo, pkgExecution.EventSourceSystem, "ai-command", "AI command started", map[string]any{"command": command})
	return &tracker{command: command, artifacts: artifacts, emitter: emitter}, nil
}

func (t *tracker) evidenceRef() map[string]any {
	if t == nil {
		return nil
	}
	return map[string]any{"executionId": t.artifacts.ExecutionID, "runDir": absolutePath(t.artifacts.RunDir)}
}

func (t *tracker) finish(envelope Envelope) {
	if t == nil || t.emitter == nil {
		return
	}
	payload, _ := json.MarshalIndent(envelope, "", "  ")
	_ = os.WriteFile(filepath.Join(t.artifacts.RunDir, "response.json"), append(payload, '\n'), 0o644)
	status := pkgExecution.ExecutionStatusSucceeded
	var runErr error
	if !envelope.OK {
		status = pkgExecution.ExecutionStatusFailed
		runErr = fmt.Errorf("%s: %s", envelope.Error.Code, envelope.Error.Message)
		t.emitter.Emit(pkgExecution.EventCategoryError, pkgExecution.EventLevelError, pkgExecution.EventSourceRuntime, "ai-command", envelope.Error.Message, map[string]any{"code": envelope.Error.Code})
	} else {
		t.emitter.Emit(pkgExecution.EventCategorySummary, pkgExecution.EventLevelInfo, pkgExecution.EventSourceSystem, "ai-command", "AI command completed", map[string]any{"command": t.command})
	}
	result, summary, err := t.emitter.Finalize(status, runErr)
	if err == nil {
		_ = pkgExecution.WriteLegacySummary(t.artifacts.SummaryPath, result, summary)
	}
	_ = t.emitter.Close()
}

func absolutePath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}
