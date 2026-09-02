package automation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/dop251/goja"
)

func TestJSMethodAllowlistHasNoImplicitHTTPDiagnostics(t *testing.T) {
	vm := goja.New()
	methods := AutoMapObject(vm, NewHTTPClient(vm))
	for _, method := range []string{"request", "get", "post"} {
		if _, ok := methods[method]; !ok {
			t.Fatalf("documented http.%s missing from allowlist", method)
		}
	}
	for _, method := range []string{"activeWorkers", "pendingCallbacks", "wait", "cancelPending"} {
		if _, ok := methods[method]; ok {
			t.Fatalf("internal HTTP lifecycle method was exposed to JS: %s", method)
		}
	}
}

func TestJSMethodAllowlistReferencesRealExportedMethods(t *testing.T) {
	for typ, methods := range jsMethodAllowlist {
		for _, method := range methods {
			resolved, ok := typ.MethodByName(method)
			if !ok || resolved.PkgPath != "" {
				t.Fatalf("allowlist references non-public %s.%s", typ, method)
			}
		}
	}
	if _, exists := jsMethodAllowlist[reflect.TypeOf((*HTTPClient)(nil))]; !exists {
		t.Fatal("HTTPClient allowlist is missing")
	}
}

func TestStaticJavaScriptBundleCacheReadsOnceAcrossConcurrentRuntimes(t *testing.T) {
	polyfillDir, err := resolveResourceDir("polyfills")
	if err != nil {
		t.Fatal(err)
	}
	jslibDir, err := resolveResourceDir("jslibs")
	if err != nil {
		t.Fatal(err)
	}
	files := append(staticJavaScriptFiles(t, polyfillDir), staticJavaScriptFiles(t, jslibDir)...)
	t.Setenv("SKIP_FYNE_INIT", "1")

	staticJavaScriptBundles.Lock()
	previousBundles := staticJavaScriptBundles.byName
	staticJavaScriptBundles.byName = make(map[string]compiledJavaScriptBundle)
	staticJavaScriptBundles.Unlock()
	previousReadFile := staticJavaScriptReadFile
	var reads atomic.Int64
	staticJavaScriptReadFile = func(path string) ([]byte, error) {
		reads.Add(1)
		return os.ReadFile(path)
	}
	t.Cleanup(func() {
		staticJavaScriptReadFile = previousReadFile
		staticJavaScriptBundles.Lock()
		staticJavaScriptBundles.byName = previousBundles
		staticJavaScriptBundles.Unlock()
	})

	const runtimes = 12
	errs := make(chan error, runtimes)
	var workers sync.WaitGroup
	for i := 0; i < runtimes; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			vm := goja.New()
			if err := InitJS(vm); err != nil {
				errs <- err
				return
			}
			if value := vm.Get("axios"); value == nil || goja.IsUndefined(value) {
				errs <- &cacheTestError{message: "axios was absent after cached bundle execution"}
			}
		}()
	}
	workers.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if got, want := reads.Load(), int64(len(files)); got != want {
		t.Fatalf("static bundle disk reads = %d, want exactly %d (%v)", got, want, files)
	}
}

func TestHTTPResponseBodyLimitIsNormalized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("oversized"))
	}))
	defer server.Close()
	request := httpRequest{
		context: context.Background(),
		method:  http.MethodGet,
		url:     server.URL,
		headers: make(http.Header),
	}
	_, err := performHTTPRequest(server.Client(), 4, request)
	if err == nil || err.Error() != "HTTP response body exceeds configured limit of 4 bytes" {
		t.Fatalf("response body limit error = %v", err)
	}
}

func TestRuntimeResourceCountsIncludeNotificationWorkers(t *testing.T) {
	counts := RuntimeResourceCounts{NotificationWorkers: 1, NotificationPending: 2}
	if counts.IsZero() {
		t.Fatal("notification resources were omitted from RuntimeResourceCounts.IsZero")
	}
	for _, field := range []string{"notificationWorkers=1", "notificationPending=2"} {
		if !strings.Contains(counts.String(), field) {
			t.Fatalf("RuntimeResourceCounts.String() omitted %q: %s", field, counts.String())
		}
	}
}

func staticJavaScriptFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && len(entry.Name()) > 3 && entry.Name()[len(entry.Name())-3:] == ".js" {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	return files
}

type cacheTestError struct{ message string }

func (e *cacheTestError) Error() string { return e.message }
