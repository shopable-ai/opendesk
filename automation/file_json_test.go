package automation

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestFileJSONWritePreservesOriginalBeforeCommitAndCleansTemporaryFile(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(target, []byte("{\"state\":\"old\"}\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var temps atomic.Int64
	_, err := fileJSONWriteFile(ctx, target, []byte("{\"state\":\"new\"}\n"), true, &fileJSONCommitState{}, &temps)
	var typed *FileJSONError
	if !errors.As(err, &typed) || typed.Code != FileJSONCanceled || typed.Committed {
		t.Fatalf("expected pre-commit cancellation, got %#v", err)
	}
	data, readErr := os.ReadFile(target)
	if readErr != nil || string(data) != "{\"state\":\"old\"}\n" {
		t.Fatalf("canceled write changed original: %q, %v", data, readErr)
	}
	if temps.Load() != 0 {
		t.Fatalf("temporary resource count = %d", temps.Load())
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".opendesk-json-") {
			t.Fatalf("temporary file was not removed: %s", entry.Name())
		}
	}
}

func TestFileJSONWriteUsesReplacementAndRejectsSymbolicLinkTarget(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(target, []byte("old\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	var temps atomic.Int64
	result, err := fileJSONWriteFile(context.Background(), target, []byte("new\n"), true, &fileJSONCommitState{}, &temps)
	if err != nil || !result.committed {
		t.Fatalf("replacement write = %#v, %v", result, err)
	}
	data, _ := os.ReadFile(target)
	if string(data) != "new\n" {
		t.Fatalf("replacement content = %q", data)
	}
	if temps.Load() != 0 {
		t.Fatalf("temporary resource count = %d", temps.Load())
	}
	link := filepath.Join(dir, "link.json")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}
	_, err = fileJSONWriteFile(context.Background(), link, []byte("changed\n"), true, &fileJSONCommitState{}, &temps)
	var typed *FileJSONError
	if !errors.As(err, &typed) || typed.Code != FileJSONUnsupportedFileType {
		t.Fatalf("expected symbolic-link rejection, got %#v", err)
	}
	data, _ = os.ReadFile(target)
	if string(data) != "new\n" {
		t.Fatalf("symbolic-link write changed target: %q", data)
	}
}

func TestFileJSONReadIsBoundedAndDepthScannerIgnoresStringBrackets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.json")
	if err := os.WriteFile(path, []byte("12345"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := fileJSONReadFile(context.Background(), path, 4)
	var typed *FileJSONError
	if !errors.As(err, &typed) || typed.Code != FileJSONTooLarge {
		t.Fatalf("expected byte-limit error, got %#v", err)
	}
	if err := fileJSONDepth([]byte(`{"literal":"[[[{{{]]]}"}`)); err != nil {
		t.Fatalf("string brackets incorrectly affected depth: %v", err)
	}
	if err := fileJSONDepth([]byte(strings.Repeat("[", 129) + "0" + strings.Repeat("]", 129))); !errors.As(err, &typed) || typed.Code != FileJSONDepthExceeded {
		t.Fatalf("expected depth error, got %#v", err)
	}
}

func TestFileJSONReadPermissionFailureIsNotMissingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "private.json")
	if err := os.WriteFile(path, []byte(`{"private":true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o000); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(path, 0o600)
	result, err := fileJSONReadFile(context.Background(), path, fileJSONDefaultMaxBytes)
	if err == nil {
		t.Skip("current test identity can read a mode-000 file; permission denial is not observable")
	}
	var typed *FileJSONError
	if !errors.As(err, &typed) || typed.Code != FileJSONPermissionDenied || result.missing {
		t.Fatalf("permission failure must not become a missing/default case: result=%#v err=%#v", result, err)
	}
}

func TestFileJSONWriteFailureInjectionPreservesOriginalAndCleansTemporaryFile(t *testing.T) {
	tests := []struct {
		name  string
		hooks fileJSONWriteHooks
	}{
		{
			name:  "short write without progress",
			hooks: fileJSONWriteHooks{write: func(*os.File, []byte) (int, error) { return 0, nil }},
		},
		{
			name:  "disk write failure",
			hooks: fileJSONWriteHooks{write: func(*os.File, []byte) (int, error) { return 0, errors.New("injected disk failure") }},
		},
		{
			name: "close failure",
			hooks: fileJSONWriteHooks{close: func(file *os.File) error {
				_ = file.Close()
				return errors.New("injected close failure")
			}},
		},
		{
			name:  "replace failure",
			hooks: fileJSONWriteHooks{replace: func(string, string) error { return errors.New("injected replace failure") }},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "settings.json")
			if err := os.WriteFile(target, []byte("old\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			var temps atomic.Int64
			_, err := fileJSONWriteFileWithHooks(context.Background(), target, []byte("new\n"), true, &fileJSONCommitState{}, &temps, test.hooks)
			if err == nil {
				t.Fatal("expected injected failure")
			}
			data, readErr := os.ReadFile(target)
			if readErr != nil || string(data) != "old\n" {
				t.Fatalf("failure changed original: %q, %v", data, readErr)
			}
			if temps.Load() != 0 {
				t.Fatalf("temporary resource count = %d", temps.Load())
			}
			entries, err := os.ReadDir(dir)
			if err != nil {
				t.Fatal(err)
			}
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), ".opendesk-json-") {
					t.Fatalf("temporary file was not removed: %s", entry.Name())
				}
			}
		})
	}
}

func TestFileJSONCommitStateCoordinatesCancellationAndCommit(t *testing.T) {
	before := &fileJSONCommitState{}
	before.cancel()
	called := false
	if committed, err := before.replace(context.Background(), func() error { called = true; return nil }); err == nil || committed || called {
		t.Fatalf("cancellation before replace must prevent commit: committed=%v called=%v err=%v", committed, called, err)
	}

	after := &fileJSONCommitState{}
	entered := make(chan struct{})
	release := make(chan struct{})
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		committed, err := after.replace(context.Background(), func() error {
			close(entered)
			<-release
			return nil
		})
		if err != nil || !committed {
			t.Errorf("commit result = %v, %v", committed, err)
		}
	}()
	<-entered
	canceled := make(chan bool, 1)
	go func() { canceled <- after.cancel() }()
	close(release)
	<-finished
	if committed := <-canceled; !committed {
		t.Fatal("cancellation after the serialized commit must report committed=true")
	}
}

func TestFileJSONWithoutEventLoopReturnsRejectedPromise(t *testing.T) {
	runtime := goja.New()
	if err := InitJSWithOptions(runtime, InitJSOptions{WorkDir: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`File.readJSON("missing.json")`)
	if err != nil {
		t.Fatalf("File.readJSON threw instead of returning a Promise: %v", err)
	}
	promise, ok := value.Export().(*goja.Promise)
	if !ok {
		t.Fatalf("File.readJSON returned %T, not Promise", value.Export())
	}
	if promise.State() != goja.PromiseStateRejected {
		t.Fatalf("promise state = %v, want rejected", promise.State())
	}
	errorObject := promise.Result().ToObject(runtime)
	if errorObject.Get("code").String() != string(FileJSONIOFailed) {
		t.Fatalf("rejection code = %s", errorObject.Get("code"))
	}
}

func TestFileJSONBlockedWorkerLeavesEventLoopResponsiveAndTeardownDrains(t *testing.T) {
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	type runtimeReady struct{ lifecycle *RuntimeLifecycle }
	ready := make(chan runtimeReady, 1)
	timerObserved := make(chan bool, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		if err := InitJSWithOptions(runtimeValue, InitJSOptions{
			Context: context.Background(), EventLoop: loop, WorkDir: t.TempDir(),
			OnReady: func(lifecycle *RuntimeLifecycle) {
				lifecycle.FileJSON.writeFile = func(ctx context.Context, _ string, _ []byte, _ bool, _ *fileJSONCommitState, _ *atomic.Int64) (fileJSONWriteResult, error) {
					<-ctx.Done()
					return fileJSONWriteResult{}, fileJSONContextError(ctx, "File.writeJSON", false)
				}
				ready <- runtimeReady{lifecycle: lifecycle}
			},
		}); err != nil {
			t.Errorf("InitJSWithOptions: %v", err)
			return
		}
		if _, err := runtimeValue.RunString(`
			globalThis.fileJSONTimerFired = false;
			setTimeout(() => { globalThis.fileJSONTimerFired = true; }, 1);
			File.writeJSON("blocked.json", { ok: true });
		`); err != nil {
			t.Errorf("start File JSON worker: %v", err)
			return
		}
		loop.SetTimeout(func(rt *goja.Runtime) { timerObserved <- rt.Get("fileJSONTimerFired").ToBoolean() }, 15*time.Millisecond)
	}) {
		t.Fatal("event loop stopped before File JSON setup")
	}
	lifecycle := (<-ready).lifecycle
	select {
	case observed := <-timerObserved:
		if !observed {
			t.Fatal("timer did not run while File JSON worker was blocked")
		}
	case <-time.After(time.Second):
		t.Fatal("timer did not run while File JSON worker was blocked")
	}

	closed := make(chan struct{}, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) {
		lifecycle.CancelAsync()
		closed <- struct{}{}
	}) {
		t.Fatal("event loop stopped before File JSON teardown")
	}
	<-closed
	lifecycle.Wait()
	counts := lifecycle.ResourceCounts()
	if !counts.IsZero() {
		t.Fatalf("File JSON teardown left resources: %s", counts.String())
	}
}
