// The production Runner owns all JS evaluation and lifecycle work. This test
// host only injects a gated MemoryDriver and the existing result-sink bridge.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"opendesk/pkg/customui"
	"opendesk/pkg/execution"
)

type gatedDriver struct {
	base                  *customui.MemoryDriver
	root, mode, sessionID string
	release               chan struct{}
	once                  sync.Once
	mu                    sync.Mutex
	calls                 []string
	creates, failClose    int
	closeAttempts         int
	cleanupWaitMillis     int64
}

func (d *gatedDriver) record(call string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls = append(d.calls, call)
	state, exists := d.base.WindowState(d.sessionID, "probe")
	data, _ := json.Marshal(map[string]any{"calls": d.calls, "exists": exists, "state": state,
		"resources": d.base.ResourceCountsForSession(d.sessionID), "cleanupWaitMillis": d.cleanupWaitMillis})
	target := filepath.Join(d.root, "oracle.json")
	if err := os.WriteFile(target+".tmp", data, 0o600); err != nil {
		panic(err)
	}
	if err := os.Rename(target+".tmp", target); err != nil {
		panic(err)
	}
}

func (d *gatedDriver) Capabilities(ctx context.Context) customui.Capabilities {
	return d.base.Capabilities(ctx)
}
func (d *gatedDriver) ResourceCounts() customui.DriverResourceCounts { return d.base.ResourceCounts() }
func (d *gatedDriver) ResourceCountsForSession(id string) customui.DriverResourceCounts {
	return d.base.ResourceCountsForSession(id)
}
func (d *gatedDriver) Create(ctx context.Context, id string, spec customui.WindowSpec, sink func(customui.Event)) (customui.DriverWindow, error) {
	d.mu.Lock()
	d.creates++
	attempt := d.creates
	d.mu.Unlock()
	d.record("create:entered")
	if d.mode == "create-failure-retry" && attempt == 1 {
		d.record("create:failed")
		return nil, errors.New("controlled create failure")
	}
	if d.mode == "create-late" || d.mode == "late-close-retry" || d.mode == "cleanup-create-timeout" {
		// Deliberately ignore cancellation to model a native host which delivers
		// a resource after the cancellation request. The test controls release.
		<-d.release
	} else if d.mode == "create-cancel" {
		select {
		case <-ctx.Done():
			d.record("create:canceled")
			return nil, ctx.Err()
		case <-d.release:
		}
	}
	window, err := d.base.Create(ctx, id, spec, sink)
	if err != nil {
		return nil, err
	}
	d.record("create:delivered")
	return &gatedWindow{DriverWindow: window, owner: d}, nil
}
func (d *gatedDriver) CloseSession(ctx context.Context, id string) error {
	d.record("session:close")
	err := d.base.CloseSession(ctx, id)
	d.record("session:closed")
	return err
}
func (d *gatedDriver) Close() error {
	err := d.base.Close()
	d.record("driver:closed")
	return err
}

type gatedWindow struct {
	customui.DriverWindow
	owner *gatedDriver
}

func (w *gatedWindow) State(ctx context.Context) (customui.WindowState, error) {
	if strings.HasPrefix(w.owner.mode, "cleanup-state-") {
		w.owner.record("state:waiting")
		<-ctx.Done()
		w.owner.record("state:canceled")
		return customui.WindowState{}, ctx.Err()
	}
	return w.DriverWindow.State(ctx)
}

func (w *gatedWindow) Show(ctx context.Context) (customui.WindowState, error) {
	w.owner.record("show:entered")
	if w.owner.mode == "show-late" || w.owner.mode == "cleanup-show-timeout" || w.owner.mode == "cleanup-show-error-timeout" {
		<-w.owner.release
	}
	if w.owner.mode == "cleanup-show-error-timeout" {
		w.owner.record("show:failed")
		return customui.WindowState{}, errors.New("controlled late Show failure")
	}
	state, err := w.DriverWindow.Show(ctx)
	w.owner.record("show:returned")
	return state, err
}
func (w *gatedWindow) Close(ctx context.Context) (customui.WindowState, error) {
	w.owner.record("close:entered")
	w.owner.mu.Lock()
	w.owner.closeAttempts++
	cleanup := strings.HasPrefix(w.owner.mode, "cleanup-") && w.owner.closeAttempts == 1
	fail := w.owner.failClose > 0
	if fail && !cleanup {
		w.owner.failClose--
	}
	w.owner.mu.Unlock()
	if cleanup {
		// A host which never replies to this Close still honors transport context
		// cancellation. An unbounded cleanup context reproduces the native lock
		// blocking both explicit close and production Runner teardown.
		if _, ok := ctx.Deadline(); ok {
			w.owner.record("close:deadline")
		} else {
			w.owner.record("close:unbounded")
		}
		w.owner.record("close:waiting")
		started := time.Now()
		<-ctx.Done()
		w.owner.mu.Lock()
		w.owner.cleanupWaitMillis = time.Since(started).Milliseconds()
		w.owner.mu.Unlock()
		w.owner.record("close:timeout")
		return customui.WindowState{}, ctx.Err()
	}
	if fail {
		w.owner.record("close:failed")
		return customui.WindowState{}, errors.New("controlled close failure")
	}
	state, err := w.DriverWindow.Close(ctx)
	w.owner.record("close:returned")
	return state, err
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) != 4 || !filepath.IsAbs(os.Args[1]) || !filepath.IsAbs(os.Args[2]) {
		return fmt.Errorf("usage: floating-lifecycle absolute-fixture-root absolute-formal-js scenario")
	}
	root, script, scenario := os.Args[1], os.Args[2], os.Args[3]
	source, err := os.ReadFile(script)
	if err != nil {
		return err
	}
	id := execution.NewExecutionID("floating-lifecycle")
	driver := &gatedDriver{base: customui.NewMemoryDriver(), root: root, mode: scenario,
		sessionID: id, release: make(chan struct{})}
	if scenario == "late-close-retry" {
		driver.failClose = 2
	} else if scenario == "cleanup-create-timeout" || scenario == "cleanup-state-retry" || scenario == "cleanup-state-teardown" {
		driver.failClose = 1
	}
	driver.record("host:ready")
	defer driver.once.Do(func() { close(driver.release) })
	artifacts, err := execution.PrepareArtifacts(filepath.Join(root, "artifacts"), id, ".js")
	if err != nil {
		return err
	}
	result, summary, runErr := execution.Run(execution.Request{
		ExecutionID: id, SourceLabel: "FloatingWindow gated MemoryDriver", ScriptPath: script, ScriptContent: source,
		Ext: ".js", WorkDir: root, Artifacts: artifacts, Timeout: 8 * time.Second,
		EnableCustomUI: true, CustomUIDriver: driver,
		Input: map[string]any{"scenario": scenario, "oracle": filepath.Join(root, "oracle.json")},
		InternalResultSink: func(data []byte) error {
			var event struct {
				Phase string `json:"phase"`
			}
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			driver.record("js:" + event.Phase)
			if event.Phase == "release" {
				driver.once.Do(func() { close(driver.release) })
			}
			return nil
		},
		Selection: execution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	driver.record("runner:returned")
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"result": result, "summary": summary}); err != nil {
		return err
	}
	return runErr
}
