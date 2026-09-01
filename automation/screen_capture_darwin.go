//go:build darwin

package automation

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const captureStartupProbe = 500 * time.Millisecond

var captureRecordingSequence atomic.Uint64

type darwinScreenCaptureBackend struct{}

func newDefaultScreenCaptureBackend() ScreenCaptureBackend { return &darwinScreenCaptureBackend{} }

func (b *darwinScreenCaptureBackend) Name() string { return "darwin-screencapture-video" }

func (b *darwinScreenCaptureBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"selector": map[string]interface{}{
			"supported": true, "backend": "appkit-overlay-helper", "movable": true,
			"resizable": true, "resizeHandles": 8, "multiDisplay": true,
		},
		"recording": map[string]interface{}{
			"supported": true, "backend": "darwin-screencapture-video",
			"targets": map[string]bool{"display": true, "region": true, "window": false},
			"fps":     []int{captureDefaultFPS}, "containers": []string{"video/quicktime"},
			"codecs": []string{"H.264"}, "showCursor": true, "pauseResume": false,
			"executionTeardownFinalizes": true,
		},
	}
}

func (b *darwinScreenCaptureBackend) SelectRegion(ctx context.Context, options RegionSelectorOptions) (SelectedRegion, error) {
	return runMacOSRegionSelector(ctx, options)
}

func (b *darwinScreenCaptureBackend) StartRecording(ctx context.Context, options ScreenRecordingOptions) (ScreenRecordingBackendSession, error) {
	args := []string{"-x", "-v", "-D" + strconv.Itoa(options.Target.DisplayIndex)}
	if options.ShowCursor {
		args = append(args, "-C")
	}
	if options.Target.Type == "region" {
		args = append(args, fmt.Sprintf("-R%d,%d,%d,%d", options.Target.X, options.Target.Y, options.Target.Width, options.Target.Height))
	}
	args = append(args, options.Output)
	cmd := exec.Command("/usr/sbin/screencapture", args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, captureOperationError("", ScreenCaptureBackendFailed, "recording control pipe could not be created", err)
	}
	output := &boundedCaptureBuffer{limit: 4096}
	cmd.Stdout, cmd.Stderr = output, output
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return nil, mapDarwinCaptureError(err, "recording process could not start", "")
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	timer := time.NewTimer(captureStartupProbe)
	defer timer.Stop()
	select {
	case waitErr := <-done:
		_ = stdin.Close()
		return nil, mapDarwinCaptureError(waitErr, "recording process exited during startup", output.snapshot())
	case <-ctx.Done():
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		<-done
		return nil, captureOperationError("", ScreenCaptureCanceled, "recording start was canceled", ctx.Err())
	case <-timer.C:
	}
	id := fmt.Sprintf("recording-%d", captureRecordingSequence.Add(1))
	return &darwinScreenRecordingSession{
		id: id, options: options, startedAt: time.Now(), cmd: cmd, stdin: stdin,
		done: done, stopDone: make(chan struct{}),
	}, nil
}

type darwinScreenRecordingSession struct {
	id         string
	options    ScreenRecordingOptions
	startedAt  time.Time
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	done       chan error
	stopOnce   sync.Once
	stopDone   chan struct{}
	stopResult ScreenRecordingResult
	stopErr    error
}

func (s *darwinScreenRecordingSession) ID() string                      { return s.id }
func (s *darwinScreenRecordingSession) Options() ScreenRecordingOptions { return s.options }
func (s *darwinScreenRecordingSession) StartedAt() time.Time            { return s.startedAt }

func (s *darwinScreenRecordingSession) Stop(ctx context.Context) (ScreenRecordingResult, error) {
	s.stopOnce.Do(func() {
		s.stopResult, s.stopErr = s.stop(ctx)
		close(s.stopDone)
	})
	select {
	case <-s.stopDone:
		return s.stopResult, s.stopErr
	case <-ctx.Done():
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureTimeout, "recording did not finalize before timeout", ctx.Err())
	}
}

func (s *darwinScreenRecordingSession) stop(ctx context.Context) (ScreenRecordingResult, error) {
	if s.stdin != nil {
		_, _ = s.stdin.Write([]byte("q\n"))
		_ = s.stdin.Close()
	}
	var waitErr error
	select {
	case waitErr = <-s.done:
	case <-ctx.Done():
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
		select {
		case <-s.done:
		case <-time.After(time.Second):
		}
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureTimeout, "recording process did not stop before timeout", ctx.Err())
	}
	info, statErr := os.Stat(s.options.Output)
	if statErr != nil || info.Size() == 0 {
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureOutputFailed, "recording output is missing or empty", statErr)
	}
	file, openErr := os.Open(s.options.Output)
	if openErr != nil {
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureOutputFailed, "recording output cannot be read", openErr)
	}
	header := make([]byte, 64)
	n, readErr := file.Read(header)
	_ = file.Close()
	if readErr != nil && readErr != io.EOF {
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureOutputFailed, "recording header cannot be read", readErr)
	}
	if !bytes.Contains(header[:n], []byte("ftyp")) {
		return ScreenRecordingResult{}, captureOperationError("", ScreenCaptureOutputFailed, "recording output is not a QuickTime media container", nil)
	}
	if waitErr != nil && info.Size() < 1024 {
		return ScreenRecordingResult{}, mapDarwinCaptureError(waitErr, "recording process failed before producing a complete output", s.helperOutput())
	}
	return ScreenRecordingResult{
		ID: s.id, Output: s.options.Output, Container: "video/quicktime", Codec: "H.264",
		FPS: s.options.FPS, DurationMS: time.Since(s.startedAt).Milliseconds(), SizeBytes: info.Size(),
		PixelWidth: s.options.Target.PixelWidth, PixelHeight: s.options.Target.PixelHeight,
		Target: s.options.Target, Finalized: true,
	}, nil
}

func (s *darwinScreenRecordingSession) helperOutput() string {
	if s == nil || s.cmd == nil || s.cmd.Stdout == nil {
		return ""
	}
	if output, ok := s.cmd.Stdout.(*boundedCaptureBuffer); ok {
		return output.snapshot()
	}
	return ""
}

func mapDarwinCaptureError(err error, message string, helperOutput string) error {
	if err == nil {
		return captureOperationError("", ScreenCaptureBackendFailed, message, nil)
	}
	text := strings.ToLower(err.Error() + "\n" + helperOutput)
	if strings.Contains(text, "not permitted") || strings.Contains(text, "permission") {
		return captureOperationError("", ScreenCapturePermissionDenied, message, err)
	}
	for _, marker := range []string{"cannot write", "could not write", "no such file", "read-only file", "file exists", "disk full", "no space left"} {
		if strings.Contains(text, marker) {
			return captureOperationError("", ScreenCaptureOutputFailed, message, err)
		}
	}
	return captureOperationError("", ScreenCaptureBackendFailed, message, err)
}

type boundedCaptureBuffer struct {
	mu    sync.Mutex
	limit int
	data  []byte
}

func (b *boundedCaptureBuffer) Write(value []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	remaining := b.limit - len(b.data)
	if remaining > 0 {
		if len(value) < remaining {
			remaining = len(value)
		}
		b.data = append(b.data, value[:remaining]...)
	}
	return len(value), nil
}

func (b *boundedCaptureBuffer) snapshot() string {
	if b == nil {
		return ""
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return string(append([]byte(nil), b.data...))
}
