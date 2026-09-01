package automation

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/process"
)

type appTargetKind string

const (
	appTargetPID      appTargetKind = "pid"
	appTargetName     appTargetKind = "name"
	appTargetBundleID appTargetKind = "bundleId"
	appTargetPath     appTargetKind = "path"
)

type appTarget struct {
	Kind  appTargetKind
	PID   int64
	Value string
}

type AppBackend interface {
	Name() string
	Capabilities() map[string]interface{}
	List(context.Context) ([]desktopApplicationState, error)
	Launch(context.Context, appTarget, bool) error
	Terminate(context.Context, int64, bool) error
}

type AppBackendFactory func() AppBackend

type defaultAppBackend struct{}

func newDefaultAppBackend() AppBackend { return &defaultAppBackend{} }

func (b *defaultAppBackend) Name() string {
	if runtime.GOOS == "darwin" && applicationNativeIdentityAvailable() {
		return "nsworkspace-process-open"
	}
	return "process-fallback"
}

func (b *defaultAppBackend) Capabilities() map[string]interface{} {
	darwin := runtime.GOOS == "darwin"
	nativeIdentity := darwin && applicationNativeIdentityAvailable()
	listScope := "processFallback"
	if nativeIdentity {
		listScope = "desktopApplications"
	}
	return map[string]interface{}{
		"list": map[string]interface{}{
			"supported": true, "partial": !nativeIdentity, "scope": listScope,
			"identity": map[string]bool{
				"pid": true, "name": true, "bundleId": nativeIdentity, "path": true,
			},
		},
		"launch": map[string]interface{}{
			"supported": true, "name": true, "bundleId": darwin, "appBundlePath": darwin,
			"args": false, "env": false, "cwd": false, "activate": darwin,
		},
		"terminate": map[string]interface{}{
			"supported": true, "graceful": true, "force": true,
		},
		"readiness": map[string]interface{}{
			"process": true, "window": runtime.GOOS == "darwin" || runtime.GOOS == "windows",
			"customPredicate": false,
		},
		"verified": nativeIdentity,
	}
}

func (b *defaultAppBackend) List(context.Context) ([]desktopApplicationState, error) {
	native, nativeErr := listDesktopApplicationsPlatform()
	if runtime.GOOS != "darwin" || !applicationNativeIdentityAvailable() {
		return native, nativeErr
	}

	// NSWorkspace snapshots carry the richest app identity but can remain stale
	// on a command-line process without an AppKit runloop. Gate every native row
	// against the existing live process facade, then add newly launched .app
	// processes with bundle identity derived from their executable path.
	processes, processErr := listProcessApplicationsFallback()
	if processErr != nil {
		return native, nativeErr
	}
	byPID := make(map[int64]desktopApplicationState, len(processes))
	for _, item := range processes {
		byPID[item.PID] = item
	}
	result := make([]desktopApplicationState, 0, len(native))
	seen := make(map[int64]bool, len(native))
	for _, item := range native {
		live, ok := byPID[item.PID]
		if !ok || item.Terminated {
			continue
		}
		if item.ExecutablePath == "" {
			item.ExecutablePath = live.ExecutablePath
		}
		result = append(result, item)
		seen[item.PID] = true
	}
	for _, item := range processes {
		if seen[item.PID] {
			continue
		}
		bundlePath := appBundlePathFromExecutable(item.ExecutablePath)
		if bundlePath == "" {
			continue
		}
		item.Path = bundlePath
		item.BundleIdentifier = applicationBundleIdentifierPlatform(bundlePath)
		result = append(result, item)
	}
	return result, nil
}

func appBundlePathFromExecutable(executable string) string {
	const marker = ".app/Contents/"
	index := strings.Index(executable, marker)
	if index < 0 {
		return ""
	}
	return executable[:index+len(".app")]
}

func (b *defaultAppBackend) Launch(ctx context.Context, target appTarget, activate bool) error {
	if target.Kind == appTargetPID {
		return appOperationError("", AppInvalidArgument, "a PID identifies a running process and cannot be launched", nil)
	}
	var command string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		command = "/usr/bin/open"
		if !activate {
			args = append(args, "-g")
		}
		switch target.Kind {
		case appTargetName:
			args = append(args, "-a", target.Value)
		case appTargetBundleID:
			args = append(args, "-b", target.Value)
		case appTargetPath:
			args = append(args, target.Value)
		default:
			return appOperationError("", AppInvalidArgument, "unsupported launch target", nil)
		}
	case "windows":
		if target.Kind != appTargetName && target.Kind != appTargetPath {
			return appOperationError("", AppNotSupported, "Windows launch currently supports name or path targets", nil)
		}
		command, args = "cmd", []string{"/c", "start", "", target.Value}
	default:
		if target.Kind != appTargetName && target.Kind != appTargetPath {
			return appOperationError("", AppNotSupported, "Linux launch currently supports name or path targets", nil)
		}
		command = target.Value
	}
	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Stdout, cmd.Stderr = nil, nil
	if runtime.GOOS == "linux" {
		if err := cmd.Start(); err != nil {
			return appOperationError("", AppLaunchFailed, "application process could not start", err)
		}
		if cmd.Process != nil {
			return cmd.Process.Release()
		}
		return nil
	}
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return appOperationError("", AppLaunchFailed, "platform application launcher failed", err)
	}
	return nil
}

func (b *defaultAppBackend) Terminate(ctx context.Context, pid int64, force bool) error {
	return terminateApplicationPlatform(ctx, pid, force)
}

// launchApplicationByName is the compatibility bridge used by page.openApp
// and AI CLI app.open. The new App primitive and the legacy entrypoints share
// the same launcher instead of maintaining parallel platform commands.
func launchApplicationByName(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return newDefaultAppBackend().Launch(ctx, appTarget{Kind: appTargetName, Value: name}, true)
}

func terminateApplicationProcess(ctx context.Context, pid int64, force bool) error {
	if pid <= 0 || pid > int64(^uint32(0)>>1) {
		return appOperationError("", AppInvalidArgument, "pid must be a positive 32-bit integer", nil)
	}
	item, err := process.NewProcess(int32(pid))
	if err != nil {
		return appOperationError("", AppNotFound, "application process is unavailable", err)
	}
	running, err := item.IsRunning()
	if err != nil || !running {
		return appOperationError("", AppNotFound, "application process is unavailable", err)
	}
	if force {
		err = item.KillWithContext(ctx)
	} else {
		err = item.TerminateWithContext(ctx)
	}
	if err != nil {
		return appOperationError("", AppTerminateFailed, "application termination request failed", err)
	}
	return nil
}

func validateAppBundlePath(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return appOperationError("", AppNotFound, "application path does not exist", err)
	}
	if runtime.GOOS == "darwin" && (!info.IsDir() || len(path) < 4 || path[len(path)-4:] != ".app") {
		return appOperationError("", AppInvalidArgument, "macOS path targets must identify an .app bundle", nil)
	}
	return nil
}
