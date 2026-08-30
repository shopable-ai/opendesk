package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var privacyURLs = map[string]string{
	"accessibility":   "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
	"inputMonitoring": "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
	"screenCapture":   "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
	"automation":      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
}

type launchResult struct {
	Name string
	PID  int
	Err  error
}

func main() {
	mode := flag.String("mode", "all", "Permission flow to trigger: screen, automation, accessibility, or all")
	targetApp := flag.String("target-app", "System Events", "Automation target app name")
	openSettings := flag.Bool("open-settings", true, "Open System Settings privacy pages before triggering prompts")
	keepAlive := flag.Duration("keepalive", 90*time.Second, "Keep the helper app alive after triggering prompts")
	logPath := flag.String("log-file", filepath.Join(os.TempDir(), "clawdesk-permission-bootstrap.log"), "File to append helper logs")
	flag.Parse()

	logger, closeLogger, err := newLogger(*logPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open log file %s: %v\n", *logPath, err)
		os.Exit(1)
	}
	defer closeLogger()

	logger.Printf("starting macOS permission bootstrap helper")
	logger.Printf("pid=%d mode=%s targetApp=%s keepAlive=%s logFile=%s", os.Getpid(), *mode, *targetApp, keepAlive.String(), *logPath)

	sections, doScreen, doAutomation, err := resolveMode(*mode)
	if err != nil {
		logger.Printf("invalid mode: %v", err)
		os.Exit(2)
	}

	if *openSettings {
		for _, section := range sections {
			if err := openPrivacySettings(section, logger); err != nil {
				logger.Printf("open privacy settings for %s failed: %v", section, err)
			}
			time.Sleep(400 * time.Millisecond)
		}
	}

	var launches []launchResult
	if doScreen {
		launches = append(launches, launchScreenCaptureProbe(logger))
	}
	if doAutomation {
		launches = append(launches, launchAutomationProbe(*targetApp, logger))
	}

	for _, launch := range launches {
		if launch.Err != nil {
			logger.Printf("%s launch failed: %v", launch.Name, launch.Err)
			continue
		}
		logger.Printf("%s launched with pid=%d", launch.Name, launch.PID)
	}

	if *keepAlive > 0 {
		logger.Printf("keeping helper alive for %s", keepAlive.String())
		time.Sleep(*keepAlive)
	}

	logger.Printf("helper exit")
}

func resolveMode(raw string) (sections []string, doScreen bool, doAutomation bool, err error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "all":
		return []string{"screenCapture", "automation", "accessibility"}, true, true, nil
	case "screen", "screencapture":
		return []string{"screenCapture"}, true, false, nil
	case "automation", "appleevents":
		return []string{"automation"}, false, true, nil
	case "accessibility":
		return []string{"accessibility"}, false, false, nil
	default:
		return nil, false, false, fmt.Errorf("unsupported mode %q", raw)
	}
}

func openPrivacySettings(section string, logger *logWriter) error {
	url, ok := privacyURLs[section]
	if !ok {
		return fmt.Errorf("unsupported section %q", section)
	}
	logger.Printf("opening System Settings for %s", section)
	cmd := exec.Command("open", url)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start open %s: %w", section, err)
	}
	pid := cmd.Process.Pid
	go func() {
		if err := cmd.Wait(); err != nil {
			logger.Printf("open settings process pid=%d section=%s exited with error: %v", pid, section, err)
			return
		}
		logger.Printf("open settings process pid=%d section=%s completed", pid, section)
	}()
	logger.Printf("open settings process pid=%d section=%s launched", pid, section)
	return nil
}

func launchScreenCaptureProbe(logger *logWriter) launchResult {
	output := filepath.Join(os.TempDir(), fmt.Sprintf("clawdesk-permission-probe-%d.png", time.Now().UnixNano()))
	cmd := exec.Command("/usr/sbin/screencapture", "-x", output)
	return startAndWatch("screenCapture", cmd, logger, func() {
		_ = os.Remove(output)
	})
}

func launchAutomationProbe(targetApp string, logger *logWriter) launchResult {
	escaped := strings.ReplaceAll(targetApp, "\"", "\\\"")
	script := fmt.Sprintf(`tell application "%s" to activate`, escaped)
	cmd := exec.Command("/usr/bin/osascript", "-e", script)
	return startAndWatch("automation", cmd, logger, nil)
}

func startAndWatch(name string, cmd *exec.Cmd, logger *logWriter, onExit func()) launchResult {
	if err := cmd.Start(); err != nil {
		return launchResult{Name: name, Err: err}
	}
	pid := cmd.Process.Pid
	go func() {
		err := cmd.Wait()
		if onExit != nil {
			onExit()
		}
		if err != nil {
			logger.Printf("%s process pid=%d exited with error: %v", name, pid, err)
			return
		}
		logger.Printf("%s process pid=%d completed", name, pid)
	}()
	return launchResult{Name: name, PID: pid}
}

type logWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func newLogger(path string) (*logWriter, func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, nil, err
	}
	writer := &logWriter{w: io.MultiWriter(os.Stdout, file)}
	closeFn := func() {
		_ = file.Close()
	}
	return writer, closeFn, nil
}

func (l *logWriter) Printf(format string, args ...interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()
	line := fmt.Sprintf(format, args...)
	fmt.Fprintf(l.w, "%s %s\n", time.Now().Format(time.RFC3339), line)
}
