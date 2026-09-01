package nativeextension

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestParseManifestStrictContract(t *testing.T) {
	valid := testManifest("com.example.go-basic", "goBasic", "bin/native-ext", map[string]ManifestMethod{
		"hello": {WireMethod: "hello", TimeoutMS: 3000},
	})
	raw, err := json.Marshal(valid)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseManifest(raw)
	if err != nil {
		t.Fatalf("ParseManifest(valid) returned error: %v", err)
	}
	if parsed.ID != valid.ID || parsed.JavaScript.Namespace != valid.JavaScript.Namespace {
		t.Fatalf("unexpected parsed manifest: %#v", parsed)
	}

	tests := []struct {
		name string
		raw  string
	}{
		{name: "duplicate key", raw: `{"schemaVersion":1,"schemaVersion":1}`},
		{name: "unknown field", raw: strings.TrimSuffix(string(raw), "}") + `,"facade":"third-party.js"}`},
		{name: "unsupported schema", raw: strings.Replace(string(raw), `"schemaVersion":1`, `"schemaVersion":2`, 1)},
		{name: "reserved namespace", raw: strings.Replace(string(raw), `"namespace":"goBasic"`, `"namespace":"constructor"`, 1)},
		{name: "case folded methods", raw: manifestJSONWithMethods(t, valid, map[string]ManifestMethod{
			"hello": {WireMethod: "hello", TimeoutMS: 3000},
			"Hello": {WireMethod: "helloTwo", TimeoutMS: 3000},
		})},
		{name: "timeout over hard cap", raw: strings.Replace(string(raw), `"timeoutMs":3000`, `"timeoutMs":60001`, 1)},
		{name: "trailing value", raw: string(raw) + `{}`},
		{name: "incorrect top-level casing", raw: strings.Replace(string(raw), `"schemaVersion":1`, `"SchemaVersion":1`, 1)},
		{name: "semantic duplicate casing", raw: strings.Replace(string(raw), `"schemaVersion":1`, `"schemaVersion":2,"SchemaVersion":1`, 1)},
		{name: "incorrect nested casing", raw: strings.Replace(string(raw), `"wireMethod":"hello"`, `"WireMethod":"hello"`, 1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := ParseManifest([]byte(test.raw)); err == nil {
				t.Fatalf("ParseManifest unexpectedly accepted %s", test.raw)
			}
		})
	}
	invalidUTF8 := bytes.Replace(raw, []byte("goBasic"), []byte{'g', 'o', 0xff}, 1)
	if _, err := ParseManifest(invalidUTF8); err == nil {
		t.Fatal("manifest containing invalid UTF-8 was accepted")
	}
}

func TestParseManifestUsesStrictSemverAndSchemaBounds(t *testing.T) {
	manifest := testManifest("com.example.go-basic", "goBasic", "bin/native-ext", map[string]ManifestMethod{
		"hello": {WireMethod: "hello", TimeoutMS: 3000},
	})
	for _, version := range []string{"0.0.0", "1.2.3-alpha.1+build.7", "10.20.30-rc.1"} {
		manifest.Version = version
		raw, _ := json.Marshal(manifest)
		if _, err := ParseManifest(raw); err != nil {
			t.Fatalf("valid semver %q was rejected: %v", version, err)
		}
	}
	for _, version := range []string{"01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3-alpha..1", "1.2.3+"} {
		manifest.Version = version
		raw, _ := json.Marshal(manifest)
		if _, err := ParseManifest(raw); err == nil {
			t.Fatalf("invalid semver %q was accepted", version)
		}
	}
	manifest.Version = "1.2.3"
	manifest.Executable = strings.Repeat("a", ManifestMaxExecutable+1)
	raw, _ := json.Marshal(manifest)
	if _, err := ParseManifest(raw); err == nil {
		t.Fatal("executable length above schema maximum was accepted")
	}
}

func TestParseManifestRejectsCoreGlobalsAndReservedNames(t *testing.T) {
	for _, namespace := range []string{"File", "System", "page", "NativeExtension", "window", "mouse", "keyboard", "clipboard", "AppStorage", "Sound", "ImageColor", "OCR", "Vision", "Screen", "ui"} {
		manifest := testManifest("com.example.test", namespace, "bin/ext", map[string]ManifestMethod{"hello": {WireMethod: "hello", TimeoutMS: 1000}})
		raw, _ := json.Marshal(manifest)
		if _, err := ParseManifest(raw); err == nil {
			t.Fatalf("core-global namespace %q was accepted", namespace)
		}
	}
	manifest := testManifest("constructor", "safePlugin", "bin/ext", map[string]ManifestMethod{"hello": {WireMethod: "hello", TimeoutMS: 1000}})
	raw, _ := json.Marshal(manifest)
	if _, err := ParseManifest(raw); err == nil {
		t.Fatal("reserved plugin id was accepted")
	}
	manifest = testManifest("com.example.test", "safePlugin", "bin/ext", map[string]ManifestMethod{"constructor": {WireMethod: "hello", TimeoutMS: 1000}})
	raw, _ = json.Marshal(manifest)
	if _, err := ParseManifest(raw); err == nil {
		t.Fatal("reserved public method was accepted")
	}
	manifest = testManifest("com.example.vision", "safeVision", "bin/ext", map[string]ManifestMethod{"ocr": {WireMethod: "ocr", TimeoutMS: 1000}})
	raw, _ = json.Marshal(manifest)
	if _, err := ParseManifest(raw); err != nil {
		t.Fatalf("ordinary method name matching a core global was rejected: %v", err)
	}
}

func TestParseManifestRejectsBoundsAndExecutableEscapes(t *testing.T) {
	valid := testManifest("com.example.go-basic", "goBasic", "bin/native-ext", map[string]ManifestMethod{
		"hello": {WireMethod: "hello", TimeoutMS: 3000},
	})
	for _, executable := range []string{
		"/tmp/native-ext", "../native-ext", "bin/../native-ext", "bin\\native-ext",
		"C:/native-ext", "bin//native-ext", "bin/native-ext\x00suffix",
	} {
		t.Run(fmt.Sprintf("path_%q", executable), func(t *testing.T) {
			manifest := valid
			manifest.Executable = executable
			raw, _ := json.Marshal(manifest)
			if _, err := ParseManifest(raw); err == nil {
				t.Fatalf("unsafe executable %q was accepted", executable)
			}
		})
	}

	tooMany := make(map[string]ManifestMethod)
	for index := 0; index <= ManifestMaxMethods; index++ {
		name := fmt.Sprintf("method%d", index)
		tooMany[name] = ManifestMethod{WireMethod: name, TimeoutMS: 1000}
	}
	raw := manifestJSONWithMethods(t, valid, tooMany)
	if _, err := ParseManifest([]byte(raw)); err == nil {
		t.Fatal("method-count bound was not enforced")
	}

	deep := strings.Repeat(`{"a":`, ManifestMaxDepth+1) + `0` + strings.Repeat(`}`, ManifestMaxDepth+1)
	if _, err := ParseManifest([]byte(deep)); err == nil {
		t.Fatal("manifest depth bound was not enforced")
	}
	if _, err := ParseManifest(make([]byte, ManifestMaxBytes+1)); err == nil {
		t.Fatal("manifest size bound was not enforced")
	}
}

func TestDiscoverIsInertAndRegistersValidatedBundle(t *testing.T) {
	root := secureTestRoot(t)
	marker := filepath.Join(t.TempDir(), "child-started")
	plugin := writeTestBundle(t, root, "com.example.go-basic", "goBasic", "bin/native-ext", "#!/bin/sh\nprintf started > \""+marker+"\"\n")

	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("discovery started the executable; marker stat error=%v", err)
	}
	discovered, ok := registry.Lookup(plugin.ID)
	if !ok {
		t.Fatalf("validated plugin was not registered: %#v", registry.Diagnostics())
	}
	if discovered.ExecutablePath != plugin.ExecutablePath || discovered.ExecutableSHA256 == "" {
		t.Fatalf("unexpected descriptor: %#v", discovered)
	}
	if len(registry.Diagnostics()) != 1 || registry.Diagnostics()[0].Status != "discovered" {
		t.Fatalf("unexpected discovery diagnostics: %#v", registry.Diagnostics())
	}
}

func TestDiscoverQuarantinesIDAndNamespaceCollisions(t *testing.T) {
	rootA := secureTestRoot(t)
	rootB := secureTestRoot(t)
	writeTestBundle(t, rootA, "com.example.same", "sameA", "bin/ext", "#!/bin/sh\nexit 0\n")
	writeTestBundle(t, rootB, "com.example.same", "sameB", "bin/ext", "#!/bin/sh\nexit 0\n")
	writeTestBundle(t, rootA, "com.example.namespace-a", "sharedName", "bin/ext", "#!/bin/sh\nexit 0\n")
	writeTestBundle(t, rootB, "com.example.namespace-b", "SharedName", "bin/ext", "#!/bin/sh\nexit 0\n")
	writeTestBundle(t, rootA, "com.example.healthy", "healthy", "bin/ext", "#!/bin/sh\nexit 0\n")

	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootPortable, Path: rootA}, {Kind: RootCurrentUser, Path: rootB}}})
	if err != nil {
		t.Fatal(err)
	}
	plugins := registry.Plugins()
	if len(plugins) != 1 || plugins[0].ID != "com.example.healthy" {
		t.Fatalf("collisions were not quarantined while preserving healthy plugins: %#v", plugins)
	}
	counts := map[string]int{}
	for _, diagnostic := range registry.Diagnostics() {
		if diagnostic.Status == "quarantined" {
			counts[diagnostic.ErrorCode]++
		}
	}
	if counts["duplicate_plugin_id"] != 2 || counts["duplicate_namespace"] != 2 {
		t.Fatalf("unexpected collision diagnostics: %#v; all=%#v", counts, registry.Diagnostics())
	}
}

func TestDiscoverRejectsSymlinksAndUnsafePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission and symlink contract")
	}
	tests := []struct {
		name   string
		mutate func(t *testing.T, root string, plugin Plugin)
		code   string
	}{
		{name: "bundle symlink", code: "unsafe_bundle", mutate: func(t *testing.T, root string, plugin Plugin) {
			realBundle := plugin.BundlePath + "-real"
			if err := os.Rename(plugin.BundlePath, realBundle); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(realBundle, plugin.BundlePath); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "manifest symlink", code: "symlink_rejected", mutate: func(t *testing.T, root string, plugin Plugin) {
			realManifest := plugin.ManifestPath + ".real"
			if err := os.Rename(plugin.ManifestPath, realManifest); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(realManifest, plugin.ManifestPath); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "executable symlink", code: "symlink_rejected", mutate: func(t *testing.T, root string, plugin Plugin) {
			realExecutable := plugin.ExecutablePath + ".real"
			if err := os.Rename(plugin.ExecutablePath, realExecutable); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(realExecutable, plugin.ExecutablePath); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "world writable executable", code: "unsafe_executable", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(plugin.ExecutablePath, 0o777); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "non executable", code: "unsafe_executable", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(plugin.ExecutablePath, 0o600); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "missing executable", code: "executable_unavailable", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Remove(plugin.ExecutablePath); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "executable is directory", code: "unsafe_executable", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Remove(plugin.ExecutablePath); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(plugin.ExecutablePath, 0o700); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "executable is FIFO", code: "unsafe_executable", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Remove(plugin.ExecutablePath); err != nil {
				t.Fatal(err)
			}
			if err := makeTestFIFO(plugin.ExecutablePath, 0o700); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "world writable manifest", code: "unsafe_manifest", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(plugin.ManifestPath, 0o666); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "world writable bundle", code: "unsafe_bundle", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(plugin.BundlePath, 0o777); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "world writable executable parent", code: "unsafe_executable_path", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(filepath.Dir(plugin.ExecutablePath), 0o777); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "setgid executable parent", code: "unsafe_executable_path", mutate: func(t *testing.T, root string, plugin Plugin) {
			if err := os.Chmod(filepath.Dir(plugin.ExecutablePath), 0o700|os.ModeSetgid); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "declared digest mismatch", code: "digest_mismatch", mutate: func(t *testing.T, root string, plugin Plugin) {
			raw, err := os.ReadFile(plugin.ManifestPath)
			if err != nil {
				t.Fatal(err)
			}
			var manifest map[string]any
			if err := json.Unmarshal(raw, &manifest); err != nil {
				t.Fatal(err)
			}
			manifest["executableSha256"] = strings.Repeat("0", 64)
			raw, err = json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(plugin.ManifestPath, raw, 0o600); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := secureTestRoot(t)
			plugin := writeTestBundle(t, root, "com.example.test", "safePlugin", "bin/ext", "#!/bin/sh\nexit 0\n")
			test.mutate(t, root, plugin)
			registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
			if err != nil {
				t.Fatal(err)
			}
			if len(registry.Plugins()) != 0 {
				t.Fatalf("unsafe plugin was registered: %#v", registry.Plugins())
			}
			if got := registry.Diagnostics()[0].ErrorCode; got != test.code {
				t.Fatalf("error code = %q, want %q; diagnostics=%#v", got, test.code, registry.Diagnostics())
			}
		})
	}
}

func TestDiscoverRejectsUnsafeRootPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission contract")
	}
	root := secureTestRoot(t)
	writeTestBundle(t, root, "com.example.test", "safePlugin", "bin/ext", "#!/bin/sh\nexit 0\n")
	if err := os.Chmod(root, 0o777); err != nil {
		t.Fatal(err)
	}
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Plugins()) != 0 || len(registry.Diagnostics()) != 1 || registry.Diagnostics()[0].ErrorCode != "unsafe_root" {
		t.Fatalf("unsafe root was not rejected: plugins=%#v diagnostics=%#v", registry.Plugins(), registry.Diagnostics())
	}
}

func TestDiscoverRejectsWritableNonStickyRootAncestor(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix ancestor trust contract")
	}
	base := secureTestBase(t)
	shared := filepath.Join(base, "shared")
	root := filepath.Join(shared, "NativeExtensions")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(shared, 0o777); err != nil {
		t.Fatal(err)
	}
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootPortable, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 1 || diagnostics[0].Status != "rejected" || diagnostics[0].ErrorCode != "unsafe_root_ancestor" {
		t.Fatalf("writable ancestor did not fail closed: %#v", diagnostics)
	}
}

func TestDiscoverRejectsRootReachedThroughSymlinkedParent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix symlink contract")
	}
	parent, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realParent := filepath.Join(parent, "real")
	if err := os.Mkdir(realParent, 0o700); err != nil {
		t.Fatal(err)
	}
	realRoot := filepath.Join(realParent, "NativeExtensions")
	if err := os.Mkdir(realRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	writeTestBundle(t, realRoot, "com.example.test", "safePlugin", "bin/ext", "#!/bin/sh\nexit 0\n")
	alias := filepath.Join(parent, "alias")
	if err := os.Symlink(realParent, alias); err != nil {
		t.Fatal(err)
	}
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: filepath.Join(alias, "NativeExtensions")}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Plugins()) != 0 || len(registry.Diagnostics()) != 1 || registry.Diagnostics()[0].ErrorCode != "symlink_rejected" {
		t.Fatalf("symlinked parent was not rejected: plugins=%#v diagnostics=%#v", registry.Plugins(), registry.Diagnostics())
	}
}

func TestDiscoverRejectsEmptyAndRelativeExplicitRoots(t *testing.T) {
	for _, root := range []string{"", ".", "relative/NativeExtensions"} {
		registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
		if err != nil {
			t.Fatal(err)
		}
		if len(registry.Plugins()) != 0 || len(registry.Diagnostics()) != 1 || registry.Diagnostics()[0].ErrorCode != "invalid_root" {
			t.Fatalf("root %q was not rejected without scanning cwd: %#v", root, registry.Diagnostics())
		}
	}
}

func TestValidateArtifactRejectsReplacement(t *testing.T) {
	root := secureTestRoot(t)
	plugin := writeTestBundle(t, root, "com.example.go-basic", "goBasic", "bin/ext", "#!/bin/sh\nexit 0\n")
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(plugin.ExecutablePath, []byte("#!/bin/sh\nprintf replacement\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.ValidateArtifact(plugin.ID); err == nil || !strings.Contains(err.Error(), "artifact_changed") {
		t.Fatalf("replacement was not rejected: %v", err)
	}
}

func TestValidateArtifactRejectsExecutableParentPermissionChange(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission contract")
	}
	root := secureTestRoot(t)
	plugin := writeTestBundle(t, root, "com.example.go-basic", "goBasic", "bin/ext", "#!/bin/sh\nexit 0\n")
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Dir(plugin.ExecutablePath), 0o777); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.ValidateArtifact(plugin.ID); err == nil || !strings.Contains(err.Error(), "artifact_changed") {
		t.Fatalf("unsafe executable parent was not rejected: %v", err)
	}
}

func TestDuplicateConfiguredRootQuarantinesEveryDiagnostic(t *testing.T) {
	root := secureTestRoot(t)
	writeTestBundle(t, root, "com.example.test", "safePlugin", "bin/ext", "#!/bin/sh\nexit 0\n")
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootPortable, Path: root}, {Kind: RootPortable, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Plugins()) != 0 || len(registry.Diagnostics()) != 2 {
		t.Fatalf("duplicate root candidates were not quarantined: plugins=%#v diagnostics=%#v", registry.Plugins(), registry.Diagnostics())
	}
	for _, diagnostic := range registry.Diagnostics() {
		if diagnostic.Status != "quarantined" || diagnostic.ErrorCode != "duplicate_plugin_id" {
			t.Fatalf("stale discovered diagnostic remained: %#v", registry.Diagnostics())
		}
	}
}

func TestDefaultDiscoveryRootsAreIndependentOfCWD(t *testing.T) {
	executable := filepath.Join(t.TempDir(), "package", "opendesk")
	userData := filepath.Join(t.TempDir(), "data")
	roots, err := DefaultDiscoveryRoots(DiscoveryOptions{ExecutablePath: executable, UserDataDir: userData})
	if err != nil {
		t.Fatal(err)
	}
	if len(roots) != 2 {
		t.Fatalf("root count = %d, want 2", len(roots))
	}
	if roots[0].Kind != RootPortable || roots[0].Path != filepath.Join(filepath.Dir(executable), "native-extensions") {
		t.Fatalf("unexpected portable root: %#v", roots[0])
	}
	if roots[1].Kind != RootCurrentUser || roots[1].Path != filepath.Join(userData, "OpenDesk", "NativeExtensions") {
		t.Fatalf("unexpected current-user root: %#v", roots[1])
	}
}

func TestDefaultDiscoveryRootsRejectRelativeExecutablePath(t *testing.T) {
	_, err := DefaultDiscoveryRoots(DiscoveryOptions{
		ExecutablePath: filepath.Join("relative", "opendesk"),
		UserDataDir:    filepath.Join(t.TempDir(), "data"),
	})
	if err == nil || !strings.Contains(err.Error(), "must be absolute") {
		t.Fatalf("relative executable path did not fail closed: %v", err)
	}
}

func TestPublisherRootPathContracts(t *testing.T) {
	tests := []struct {
		name       string
		goos       string
		executable string
		want       DiscoveryRoot
	}{
		{
			name: "portable publisher root", goos: "linux",
			executable: "/opt/opendesk/bin/opendesk",
			want:       DiscoveryRoot{Kind: RootPortable, Path: "/opt/opendesk/bin/native-extensions"},
		},
		{
			name: "macOS app publisher root", goos: "darwin",
			executable: "/Applications/OpenDesk.app/Contents/MacOS/opendesk",
			want:       DiscoveryRoot{Kind: RootAppBundled, Path: "/Applications/OpenDesk.app/Contents/Resources/NativeExtensions"},
		},
		{
			name: "Windows portable publisher root", goos: "windows",
			executable: `C:\Program Files\OpenDesk\opendesk.exe`,
			want:       DiscoveryRoot{Kind: RootPortable, Path: `C:\Program Files\OpenDesk\native-extensions`},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := publisherRootForExecutable(test.goos, test.executable)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("publisher root = %#v, want %#v", got, test.want)
			}
		})
	}
	if _, err := publisherRootForExecutable("darwin", "relative/OpenDesk.app/Contents/MacOS/opendesk"); err == nil {
		t.Fatal("relative publisher executable path was accepted")
	}
}

func TestDefaultDiscoveryRootsUseAppResourcesOnMacOS(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS app bundle path contract")
	}
	app := filepath.Join(t.TempDir(), "OpenDesk.app")
	executable := filepath.Join(app, "Contents", "MacOS", "opendesk")
	roots, err := DefaultDiscoveryRoots(DiscoveryOptions{ExecutablePath: executable, UserDataDir: filepath.Join(t.TempDir(), "data")})
	if err != nil {
		t.Fatal(err)
	}
	if roots[0].Kind != RootAppBundled || roots[0].Path != filepath.Join(app, "Contents", "Resources", "NativeExtensions") {
		t.Fatalf("unexpected app-bundled root: %#v", roots[0])
	}
}

func TestCurrentUserRootPlatformContracts(t *testing.T) {
	tests := []struct {
		name   string
		goos   string
		inputs currentUserPathInputs
		want   string
	}{
		{
			name: "macOS application support", goos: "darwin",
			inputs: currentUserPathInputs{Home: "/Users/alice"},
			want:   "/Users/alice/Library/Application Support/OpenDesk/NativeExtensions",
		},
		{
			name: "Linux XDG data home", goos: "linux",
			inputs: currentUserPathInputs{Home: "hostile-relative-home", XDGDataHome: "/srv/alice-data"},
			want:   "/srv/alice-data/OpenDesk/NativeExtensions",
		},
		{
			name: "Linux default data home", goos: "linux",
			inputs: currentUserPathInputs{Home: "/home/alice"},
			want:   "/home/alice/.local/share/OpenDesk/NativeExtensions",
		},
		{
			name: "Windows LocalAppData known folder", goos: "windows",
			inputs: currentUserPathInputs{LocalAppData: `C:\Users\alice\AppData\Local`},
			want:   `C:\Users\alice\AppData\Local\OpenDesk\NativeExtensions`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := currentUserRootForPlatform(test.goos, test.inputs)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("current-user root = %q, want %q", got, test.want)
			}
		})
	}
}

func TestCurrentUserRootRejectsRelativeRequiredInputs(t *testing.T) {
	tests := []struct {
		name   string
		goos   string
		inputs currentUserPathInputs
	}{
		{name: "macOS relative home", goos: "darwin", inputs: currentUserPathInputs{Home: "relative"}},
		{name: "macOS empty home", goos: "darwin", inputs: currentUserPathInputs{}},
		{name: "Linux missing absolute home", goos: "linux", inputs: currentUserPathInputs{Home: "relative", XDGDataHome: "also-relative"}},
		{name: "Linux rejects relative XDG data home", goos: "linux", inputs: currentUserPathInputs{Home: "/home/alice", XDGDataHome: "relative/data"}},
		{name: "Windows relative LocalAppData", goos: "windows", inputs: currentUserPathInputs{LocalAppData: `relative\Local`}},
		{name: "Windows empty LocalAppData", goos: "windows", inputs: currentUserPathInputs{}},
		{name: "Windows incomplete UNC", goos: "windows", inputs: currentUserPathInputs{LocalAppData: `\\server`}},
		{name: "Windows device path", goos: "windows", inputs: currentUserPathInputs{LocalAppData: `\\?\C:\Users\alice`}},
		{name: "Windows dot segment", goos: "windows", inputs: currentUserPathInputs{LocalAppData: `C:\Users\alice\..\Local`}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := currentUserRootForPlatform(test.goos, test.inputs); err == nil {
				t.Fatal("relative required input was accepted")
			}
		})
	}
}

func TestDiscoverKeepsPublisherRootWhenUserRootIsUnavailable(t *testing.T) {
	packageDir := filepath.Join(secureTestBase(t), "package")
	if err := os.Mkdir(packageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	publisherRoot := filepath.Join(packageDir, "native-extensions")
	if err := os.Mkdir(publisherRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	writeTestBundle(t, publisherRoot, "com.example.publisher", "publisher", "bin/ext", "#!/bin/sh\nexit 0\n")

	registry, err := Discover(DiscoveryOptions{
		ExecutablePath: filepath.Join(packageDir, "opendesk"),
		UserDataDir:    "relative/data",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := registry.Lookup("com.example.publisher"); !ok {
		t.Fatal("valid publisher plugin disappeared when the user root was unavailable")
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 2 || diagnostics[0].RootKind != RootPortable || diagnostics[0].Status != "discovered" ||
		diagnostics[1].RootKind != RootCurrentUser || diagnostics[1].ErrorCode != "user_root_unavailable" {
		t.Fatalf("missing privacy-safe user-root diagnostic: %#v", diagnostics)
	}
}

func TestDiscoverMissingCanonicalRootIsHarmlessAndOrdered(t *testing.T) {
	packageDir := filepath.Join(secureTestBase(t), "package")
	if err := os.Mkdir(packageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	publisherRoot := filepath.Join(packageDir, "native-extensions")
	if err := os.Mkdir(publisherRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	writeTestBundle(t, publisherRoot, "com.example.publisher", "publisher", "bin/ext", "#!/bin/sh\nexit 0\n")

	registry, err := Discover(DiscoveryOptions{
		ExecutablePath: filepath.Join(packageDir, "opendesk"),
		UserDataDir:    filepath.Join(secureTestBase(t), "missing-user-data"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := registry.Lookup("com.example.publisher"); !ok {
		t.Fatal("publisher plugin disappeared when canonical current-user root was absent")
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 2 || diagnostics[0].RootKind != RootPortable || diagnostics[0].Status != "discovered" ||
		diagnostics[1].RootKind != RootCurrentUser || diagnostics[1].Status != "skipped" || diagnostics[1].ErrorCode != "root_unavailable" {
		t.Fatalf("missing root diagnostic was not stable/privacy-safe: %#v", diagnostics)
	}
}

func secureTestBase(t *testing.T) string {
	t.Helper()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return base
}

func testManifest(id, namespace, executable string, methods map[string]ManifestMethod) Manifest {
	return Manifest{
		SchemaVersion: ManifestSchemaVersion, ID: id, Version: "0.1.0",
		Protocol:   ManifestProtocol{Name: ProtocolName, Version: ProtocolVersion},
		Executable: executable, JavaScript: ManifestJavaScript{Namespace: namespace}, Methods: methods,
	}
}

func manifestJSONWithMethods(t *testing.T, manifest Manifest, methods map[string]ManifestMethod) string {
	t.Helper()
	manifest.Methods = methods
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func secureTestRoot(t *testing.T) string {
	t.Helper()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, "NativeExtensions")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	return root
}

func writeTestBundle(t *testing.T, root, id, namespace, executable, body string) Plugin {
	t.Helper()
	bundle := filepath.Join(root, id)
	executablePath := filepath.Join(bundle, filepath.FromSlash(executable))
	if err := os.MkdirAll(filepath.Dir(executablePath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executablePath, []byte(body), 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := testManifest(id, namespace, executable, map[string]ManifestMethod{
		"hello": {WireMethod: "hello", TimeoutMS: 3000},
	})
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(bundle, "extension.json")
	if err := os.WriteFile(manifestPath, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return Plugin{ID: id, Namespace: namespace, RootPath: root, BundlePath: bundle, ManifestPath: manifestPath, ExecutablePath: executablePath}
}
