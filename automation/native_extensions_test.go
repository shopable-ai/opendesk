package automation

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"opendesk/pkg/nativeextension"
)

func TestNativeExtensionsHelperProcess(t *testing.T) {
	if os.Getenv("OPENDESK_NATIVE_EXT_HELPER") != "1" {
		return
	}
	if marker := os.Getenv("OPENDESK_NATIVE_EXT_CHILD_MARKER"); marker != "" {
		file, err := os.OpenFile(marker, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			os.Exit(91)
		}
		_, _ = fmt.Fprintln(file, os.Getenv("OPENDESK_NATIVE_EXT_PLUGIN"))
		_ = file.Close()
	}
	var request struct {
		Protocol string         `json:"protocol"`
		Version  int            `json:"version"`
		ID       string         `json:"id"`
		Method   string         `json:"method"`
		Params   map[string]any `json:"params"`
	}
	if err := json.NewDecoder(bufio.NewReader(os.Stdin)).Decode(&request); err != nil {
		os.Exit(92)
	}
	if delay, ok := request.Params["delayMs"].(float64); ok && delay > 0 {
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}
	response := map[string]any{
		"protocol": nativeextension.ProtocolName,
		"version":  nativeextension.ProtocolVersion,
		"id":       request.ID,
		"ok":       true,
		"result": map[string]any{
			"plugin": os.Getenv("OPENDESK_NATIVE_EXT_PLUGIN"),
			"method": request.Method,
			"params": request.Params,
		},
	}
	_ = json.NewEncoder(os.Stdout).Encode(response)
	_, _ = fmt.Fprintln(os.Stderr, "private-helper-diagnostic")
	os.Exit(0)
}

func TestNativeExtensionsBindingIsImmutableInertAndRouteBound(t *testing.T) {
	if testing.Short() || goruntime.GOOS == "windows" {
		t.Skip("process-backed immutable binding test")
	}
	root := nativeExtensionsRealTempPath(t, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	writeNativeExtensionsTestBundle(t, root, "com.example.go-basic", "goBasic", "go")
	writeNativeExtensionsTestBundle(t, root, "com.example.other", "other", "other")
	thirdPartyMarker := filepath.Join(t.TempDir(), "facade-executed")
	if err := os.WriteFile(filepath.Join(root, "com.example.go-basic", "facade.js"), []byte(`File.write("`+thirdPartyMarker+`", "executed")`), 0o600); err != nil {
		t.Fatal(err)
	}
	childMarker := filepath.Join(t.TempDir(), "children")
	t.Setenv("OPENDESK_NATIVE_EXT_HELPER", "1")
	t.Setenv("OPENDESK_NATIVE_EXT_CHILD_MARKER", childMarker)
	sink := &nativeExtensionsCaptureSink{}
	runtime := goja.New()
	if err := registerNativeExtensions(runtime, context.Background(), sink, []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}}); err != nil {
		t.Fatal(err)
	}
	assertFileAbsent(t, childMarker, "discovery started a child")
	assertFileAbsent(t, thirdPartyMarker, "discovery executed third-party facade.js")

	_, err := runtime.RunString(`
		if (Object.getPrototypeOf(NativeExtensions) !== null) throw new Error("root prototype is not null");
		if (Object.getPrototypeOf(NativeExtensions.goBasic) !== null) throw new Error("namespace prototype is not null");
		if (!Object.isFrozen(NativeExtensions) || !Object.isFrozen(NativeExtensions.goBasic) || !Object.isFrozen(NativeExtensions.goBasic.hello)) throw new Error("binding is not frozen");
		for (const [owner, property] of [[globalThis,"NativeExtensions"],[NativeExtensions,"goBasic"],[NativeExtensions.goBasic,"hello"]]) {
			const descriptor = Object.getOwnPropertyDescriptor(owner, property);
			if (!descriptor || descriptor.writable !== false || descriptor.configurable !== false) throw new Error("mutable descriptor " + property);
			const original = owner[property];
			try { owner[property] = function () { return "replaced"; }; } catch (_) {}
			try { delete owner[property]; } catch (_) {}
			if (owner[property] !== original) throw new Error("binding changed " + property);
		}
		const listed = NativeExtensions.list();
		if (listed.length !== 2 || listed.some(item => "wireMethod" in item || "path" in item)) throw new Error("unsafe list metadata");
		if (NativeExtensions.get("com.example.go-basic") !== NativeExtensions.goBasic) throw new Error("canonical get mismatch");
		if (typeof NativeExtensions.goBasic.missing !== "undefined") throw new Error("undeclared method was exposed");
		if (NativeExtensions.diagnostics().filter(item => item.status === "discovered").length !== 2) throw new Error("diagnostics mismatch");
	`)
	if err != nil {
		t.Fatal(err)
	}
	assertFileAbsent(t, childMarker, "list/get/diagnostics started a child")

	value, err := runtime.RunString(`
		JSON.stringify([
			NativeExtensions.goBasic.hello({name:"OpenDesk", executable:"/tmp/evil", extension:"evil", wireMethod:"evil", method:"evil", protocol:"evil", version:999, discoveryRoot:"/tmp/evil"}),
			NativeExtensions.other.hello({name:"Other"}),
			NativeExtensions.goBasic.hello({name:"Again"}, {timeoutMs: 2000})
		])
	`)
	if err != nil {
		t.Fatal(err)
	}
	var results []map[string]any
	if err := json.Unmarshal([]byte(value.String()), &results); err != nil {
		t.Fatal(err)
	}
	if results[0]["plugin"] != "go" || results[0]["method"] != "hello" || results[1]["plugin"] != "other" || results[2]["plugin"] != "go" {
		t.Fatalf("closure routing was not fixed: %#v", results)
	}
	children, err := os.ReadFile(childMarker)
	if err != nil {
		t.Fatal(err)
	}
	if lines := strings.Fields(string(children)); len(lines) != 3 {
		t.Fatalf("one-shot child count = %d, want 3; marker=%q", len(lines), children)
	}
	assertFileAbsent(t, thirdPartyMarker, "method calls executed third-party facade.js")

	encodedEvents, err := json.Marshal(sink.snapshot())
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{root, thirdPartyMarker, "private-helper-diagnostic", "/tmp/evil", "OpenDesk", "Again"} {
		if strings.Contains(string(encodedEvents), forbidden) {
			t.Fatalf("persistent Evidence leaked %q: %s", forbidden, encodedEvents)
		}
	}
	if !strings.Contains(string(encodedEvents), `"stderrCapturedBytes"`) || !strings.Contains(string(encodedEvents), `"stderrSha256"`) {
		t.Fatalf("stderr privacy metadata is missing: %s", encodedEvents)
	}
}

func TestNativeExtensionsRejectsArtifactReplacementBeforeInvocation(t *testing.T) {
	if testing.Short() || goruntime.GOOS == "windows" {
		t.Skip("process-backed artifact replacement test")
	}
	root := nativeExtensionsRealTempPath(t, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	executable := writeNativeExtensionsTestBundle(t, root, "com.example.go-basic", "goBasic", "go")
	childMarker := filepath.Join(t.TempDir(), "children")
	t.Setenv("OPENDESK_NATIVE_EXT_HELPER", "1")
	t.Setenv("OPENDESK_NATIVE_EXT_CHILD_MARKER", childMarker)
	runtime := goja.New()
	if err := registerNativeExtensions(runtime, context.Background(), nil, []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executable, []byte("#!/bin/sh\nexit 99\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`
		(() => {
			try { NativeExtensions.goBasic.hello({name:"OpenDesk"}); }
			catch (error) { return JSON.stringify({name:error.name,code:error.code,pluginId:error.pluginId,namespace:error.namespace,method:error.method}); }
			throw new Error("replacement unexpectedly executed");
		})()
	`)
	if err != nil {
		t.Fatal(err)
	}
	if value.String() != `{"name":"NativeExtensionsError","code":"artifact_changed","pluginId":"com.example.go-basic","namespace":"goBasic","method":"hello"}` {
		t.Fatalf("unexpected structured error: %s", value.String())
	}
	assertFileAbsent(t, childMarker, "replacement process started")
}

func TestNativeExtensionsLookupAndOptionsErrorsAreStructured(t *testing.T) {
	root := nativeExtensionsRealTempPath(t, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	writeNativeExtensionsTestBundle(t, root, "com.example.go-basic", "goBasic", "go")
	runtime := goja.New()
	if err := registerNativeExtensions(runtime, context.Background(), nil, []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}}); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`
		(() => {
			const errors = [];
			const calls = [
				() => NativeExtensions.get("com.example.missing"),
				() => NativeExtensions.goBasic.hello([], {timeoutMs: 1000}),
				() => NativeExtensions.goBasic.hello({}, {timeoutMs: 60001}),
			];
			for (const key of ["executable", "extension", "wireMethod", "method", "protocol", "version", "root", "discoveryRoot", "nativeExtensionRoots"]) {
				calls.push(() => NativeExtensions.goBasic.hello({}, {[key]: key === "version" ? 999 : "/tmp/evil"}));
			}
			for (const call of calls) {
				try { call(); } catch (error) { errors.push({name:error.name,code:error.code,pluginId:error.pluginId,method:error.method}); }
			}
			return JSON.stringify(errors);
		})()
	`)
	if err != nil {
		t.Fatal(err)
	}
	var errorsFound []map[string]any
	if err := json.Unmarshal([]byte(value.String()), &errorsFound); err != nil {
		t.Fatal(err)
	}
	if len(errorsFound) != 12 || errorsFound[0]["code"] != "unknown_plugin" {
		t.Fatalf("unexpected errors: %#v", errorsFound)
	}
	for index := 1; index < len(errorsFound); index++ {
		if errorsFound[index]["code"] != "invalid_params" || errorsFound[index]["pluginId"] != "com.example.go-basic" || errorsFound[index]["method"] != "hello" {
			t.Fatalf("unexpected option error: %#v", errorsFound[index])
		}
	}
}

func TestNativeExtensionsManifestTimeoutAndSafeOverride(t *testing.T) {
	if testing.Short() || goruntime.GOOS == "windows" {
		t.Skip("process-backed timeout test")
	}
	root := nativeExtensionsRealTempPath(t, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	writeNativeExtensionsTestBundle(t, root, "com.example.go-basic", "goBasic", "go")
	manifestPath := filepath.Join(root, "com.example.go-basic", "extension.json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest nativeextension.Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	method := manifest.Methods["hello"]
	method.TimeoutMS = 25
	manifest.Methods["hello"] = method
	raw, err = json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_EXT_HELPER", "1")
	runtime := goja.New()
	if err := registerNativeExtensions(runtime, context.Background(), nil, []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}}); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`
		(() => {
			let timedOut;
			try { NativeExtensions.goBasic.hello({delayMs:250}); }
			catch (error) { timedOut = {code:error.code, method:error.method, status:error.evidence.status}; }
			const succeeded = NativeExtensions.goBasic.hello({delayMs:20}, {timeoutMs:5000});
			return JSON.stringify({timedOut, succeeded});
		})()
	`)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		TimedOut  map[string]any `json:"timedOut"`
		Succeeded map[string]any `json:"succeeded"`
	}
	if err := json.Unmarshal([]byte(value.String()), &result); err != nil {
		t.Fatal(err)
	}
	if result.TimedOut["code"] != "timeout" || result.TimedOut["method"] != "hello" || result.TimedOut["status"] != "timed_out" {
		t.Fatalf("manifest timeout was not enforced: %#v", result.TimedOut)
	}
	if result.Succeeded["plugin"] != "go" || result.Succeeded["method"] != "hello" {
		t.Fatalf("safe timeout override did not allow the same bound route: %#v", result.Succeeded)
	}
}

func TestNativeExtensionsInvalidBundleNameIsNotPersisted(t *testing.T) {
	root := nativeExtensionsRealTempPath(t, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	secretName := "SECRET_ACCOUNT_TOKEN_42"
	if err := os.Mkdir(filepath.Join(root, secretName), 0o700); err != nil {
		t.Fatal(err)
	}
	sink := &nativeExtensionsCaptureSink{}
	if err := registerNativeExtensions(goja.New(), context.Background(), sink, []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}}); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(sink.snapshot())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), secretName) {
		t.Fatalf("unvalidated bundle name leaked into persistent discovery evidence: %s", encoded)
	}
}

type nativeExtensionsCaptureSink struct {
	mu     sync.Mutex
	events []map[string]any
}

func (s *nativeExtensionsCaptureSink) Emit(category, level, source, kind, message string, fields map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copyFields := make(map[string]any, len(fields))
	for key, value := range fields {
		copyFields[key] = value
	}
	s.events = append(s.events, map[string]any{"category": category, "level": level, "source": source, "kind": kind, "message": message, "fields": copyFields})
}

func (s *nativeExtensionsCaptureSink) snapshot() []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]map[string]any(nil), s.events...)
}

func writeNativeExtensionsTestBundle(t *testing.T, root, id, namespace, pluginName string) string {
	t.Helper()
	bundle := filepath.Join(root, id)
	binDir := filepath.Join(bundle, "bin")
	if err := os.MkdirAll(binDir, 0o700); err != nil {
		t.Fatal(err)
	}
	executable := filepath.Join(binDir, "native-ext")
	wrapper := "#!/bin/sh\nOPENDESK_NATIVE_EXT_PLUGIN=" + shellSingleQuote(pluginName) + " exec " + shellSingleQuote(os.Args[0]) + " -test.run=TestNativeExtensionsHelperProcess\n"
	if err := os.WriteFile(executable, []byte(wrapper), 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := map[string]any{
		"schemaVersion": 1, "id": id, "version": "0.1.0",
		"protocol":   map[string]any{"name": nativeextension.ProtocolName, "version": nativeextension.ProtocolVersion},
		"executable": "bin/native-ext", "javascript": map[string]any{"namespace": namespace},
		"methods": map[string]any{"hello": map[string]any{"wireMethod": "hello", "timeoutMs": 10000}},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bundle, "extension.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return executable
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func assertFileAbsent(t *testing.T, path, message string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("%s: stat error=%v", message, err)
	}
}

func nativeExtensionsRealTempPath(t *testing.T, name string) string {
	t.Helper()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(base, name)
}
