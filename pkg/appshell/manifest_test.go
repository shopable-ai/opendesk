package appshell

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"opendesk/pkg/runtimeversion"
)

func boolPtr(value bool) *bool { return &value }

func validManifestJSON() string {
	return `{
	"schemaVersion": 1,
	"id": "com.opendesk.sample",
	"version": "1.2.3-rc.1+build.5",
	"runtime": {"minVersion": "0.1.0"},
  "entry": "main.js",
  "singleInstance": true,
	"window": {"mainId": "main", "closeBehavior": "hide"},
  "tray": {
    "enabled": true,
	"icons": {"windows":"assets/tray.ico", "macos":"assets/tray.png"},
    "tooltip": "Sample",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": [
      {"id":"sync.now","label":"Sync now","action":"sync.now"},
      {"type":"separator"},
      {"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}
    ]
  },
	"capabilities": ["custom-ui", "desktop-automation"]
}`
}

func minimalSchemaV1Manifest(id, version string) string {
	return `{"schemaVersion":1,"id":"` + id + `","version":"` + version + `","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`
}

func legacyManifestJSON() string {
	return `{"id":"com.opendesk.legacy","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`
}

func testPNG(t *testing.T, width, height int, alphaMode string) []byte {
	t.Helper()
	value := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			alpha := uint8(0)
			switch alphaMode {
			case "opaque":
				alpha = 255
			case "template":
				if x >= width/4 && x < width-width/4 && y >= height/4 && y < height-height/4 {
					alpha = 255
				}
			case "transparent":
			default:
				t.Fatalf("unknown alpha mode %q", alphaMode)
			}
			value.SetNRGBA(x, y, color.NRGBA{R: 20, G: 90, B: 180, A: alpha})
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, value); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func testICO(t *testing.T, sizes ...int) []byte {
	t.Helper()
	payloads := make([][]byte, len(sizes))
	for index, size := range sizes {
		payloads[index] = testPNG(t, size, size, "template")
	}
	directorySize := 6 + len(payloads)*16
	totalSize := directorySize
	for _, payload := range payloads {
		totalSize += len(payload)
	}
	output := make([]byte, totalSize)
	binary.LittleEndian.PutUint16(output[2:4], 1)
	binary.LittleEndian.PutUint16(output[4:6], uint16(len(payloads)))
	offset := directorySize
	for index, payload := range payloads {
		entry := output[6+index*16 : 6+(index+1)*16]
		if sizes[index] < 256 {
			entry[0], entry[1] = byte(sizes[index]), byte(sizes[index])
		}
		binary.LittleEndian.PutUint16(entry[4:6], 1)
		binary.LittleEndian.PutUint16(entry[6:8], 32)
		binary.LittleEndian.PutUint32(entry[8:12], uint32(len(payload)))
		binary.LittleEndian.PutUint32(entry[12:16], uint32(offset))
		copy(output[offset:], payload)
		offset += len(payload)
	}
	return output
}

func testICODIB(size int) []byte {
	const headerSize = 40
	payload := make([]byte, headerSize+size*size*4)
	binary.LittleEndian.PutUint32(payload[0:4], headerSize)
	binary.LittleEndian.PutUint32(payload[4:8], uint32(size))
	// ICO DIB height includes the XOR bitmap and its AND mask.
	binary.LittleEndian.PutUint32(payload[8:12], uint32(size*2))
	binary.LittleEndian.PutUint16(payload[12:14], 1)
	binary.LittleEndian.PutUint16(payload[14:16], 32)
	binary.LittleEndian.PutUint32(payload[20:24], uint32(size*size*4))

	output := make([]byte, 6+16+len(payload))
	binary.LittleEndian.PutUint16(output[2:4], 1)
	binary.LittleEndian.PutUint16(output[4:6], 1)
	output[6], output[7] = byte(size), byte(size)
	binary.LittleEndian.PutUint16(output[10:12], 1)
	binary.LittleEndian.PutUint16(output[12:14], 32)
	binary.LittleEndian.PutUint32(output[14:18], uint32(len(payload)))
	binary.LittleEndian.PutUint32(output[18:22], 22)
	copy(output[22:], payload)
	return output
}

func writeValidPackageFixture(t *testing.T, root string) string {
	t.Helper()
	assets := filepath.Join(root, "assets")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	for filePath, content := range map[string][]byte{
		filepath.Join(root, "main.js"):        []byte("console.log('app');"),
		filepath.Join(assets, "tray.ico"):     testICO(t, 16, 24, 32, 48, 256),
		filepath.Join(assets, "tray.png"):     testPNG(t, 36, 36, "template"),
		filepath.Join(root, ManifestFileName): []byte(validManifestJSON()),
	} {
		if err := os.WriteFile(filePath, content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return assets
}

func requirePackageError(t *testing.T, err error, code, field string) *PackageError {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s", code)
	}
	var packageErr *PackageError
	if !errors.As(err, &packageErr) {
		t.Fatalf("expected PackageError %s, got %T: %v", code, err, err)
	}
	if packageErr.Code != code || packageErr.Field != field {
		t.Fatalf("PackageError code/field = %s/%s, want %s/%s: %v", packageErr.Code, packageErr.Field, code, field, err)
	}
	if packageErr.Expected == "" || packageErr.Actual == "" || packageErr.Fix == "" || packageErr.Err == nil {
		t.Fatalf("PackageError lacks actionable context: %+v", packageErr)
	}
	return packageErr
}

func TestParseManifestValid(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.SchemaVersion != 1 || manifest.Version != "1.2.3-rc.1+build.5" || manifest.Runtime.MinVersion != "0.1.0" || manifest.Entry != "main.js" || manifest.Window.CloseBehavior != "hide" || !manifest.SingleInstance || len(manifest.Capabilities) != 2 {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
}

func TestManifestSchemaVersionAndJSONContract(t *testing.T) {
	t.Run("legacy manifest without schemaVersion", func(t *testing.T) {
		manifest, err := ParseManifest([]byte(legacyManifestJSON()))
		if err != nil {
			t.Fatal(err)
		}
		if manifest.SchemaVersion != 0 || manifest.Version != "" || manifest.Runtime.MinVersion != "" {
			t.Fatalf("legacy manifest was not normalized as v0: %+v", manifest)
		}
	})

	t.Run("unsupported schemaVersion", func(t *testing.T) {
		input := strings.Replace(validManifestJSON(), `"schemaVersion": 1`, `"schemaVersion": 2`, 1)
		_, err := ParseManifest([]byte(input))
		requirePackageError(t, err, ErrManifestSchemaUnsupported, "schemaVersion")
	})

	t.Run("schemaVersion must be an integer", func(t *testing.T) {
		input := strings.Replace(validManifestJSON(), `"schemaVersion": 1`, `"schemaVersion": "1"`, 1)
		_, err := ParseManifest([]byte(input))
		requirePackageError(t, err, ErrManifestInvalid, "schemaVersion")
	})

	for name, input := range map[string]string{
		"invalid JSON":            `{"schemaVersion":1,"id":`,
		"JSON null":               `null`,
		"multiple JSON documents": minimalSchemaV1Manifest("com.opendesk.sample", "1.0.0") + ` {}`,
		"unknown top-level field": strings.Replace(validManifestJSON(), `"capabilities":`, `"unexpected":true,"capabilities":`, 1),
		"unknown runtime field":   strings.Replace(validManifestJSON(), `"minVersion": "0.1.0"`, `"minVersion":"0.1.0","maxVersion":"2.0.0"`, 1),
		"unknown nested field":    strings.Replace(validManifestJSON(), `"mainId": "main"`, `"mainId":"main","title":"Main"`, 1),
		"legacy with v1 metadata": strings.Replace(legacyManifestJSON(), `"id":`, `"version":"1.0.0","id":`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := ParseManifest([]byte(input))
			if name == "legacy with v1 metadata" {
				requirePackageError(t, err, ErrManifestSchemaUnsupported, "schemaVersion")
				return
			}
			requirePackageError(t, err, ErrManifestInvalid, "manifest")
		})
	}
}

func TestManifestPackageVersionSemVerContract(t *testing.T) {
	_, err := ParseManifest([]byte(minimalSchemaV1Manifest("com.opendesk.sample", "")))
	requirePackageError(t, err, ErrPackageVersionInvalid, "version")

	for _, version := range []string{"v1.0.0", "1.0", "01.0.0", "1.0.0-01", "1.0.0+"} {
		t.Run("invalid "+version, func(t *testing.T) {
			_, err := ParseManifest([]byte(minimalSchemaV1Manifest("com.opendesk.sample", version)))
			requirePackageError(t, err, ErrPackageVersionInvalid, "version")
		})
	}

	for _, version := range []string{"1.0.0-alpha.1", "1.0.0+build.20260912", "1.0.0-rc.1+build.7"} {
		t.Run("valid "+version, func(t *testing.T) {
			manifest, err := ParseManifest([]byte(minimalSchemaV1Manifest("com.opendesk.sample", version)))
			if err != nil || manifest.Version != version {
				t.Fatalf("valid SemVer %q rejected: manifest=%+v err=%v", version, manifest, err)
			}
		})
	}

	invalidRuntime := strings.Replace(validManifestJSON(), `"minVersion": "0.1.0"`, `"minVersion":"v1.0.0"`, 1)
	_, err = ParseManifest([]byte(invalidRuntime))
	requirePackageError(t, err, ErrManifestInvalid, "runtime.minVersion")
}

func TestRuntimeCompatibilitySemVerContract(t *testing.T) {
	for _, test := range []struct {
		name, current, minimum string
		wantCode               string
	}{
		{name: "minimum lower than current", current: "1.2.4", minimum: "1.2.3"},
		{name: "minimum equal current", current: "1.2.3", minimum: "1.2.3"},
		{name: "minimum higher than current", current: "1.2.2", minimum: "1.2.3", wantCode: ErrRuntimeTooOld},
		{name: "later prerelease accepted", current: "1.2.3-rc.2", minimum: "1.2.3-rc.1"},
		{name: "earlier prerelease rejected", current: "1.2.3-rc.1", minimum: "1.2.3-rc.2", wantCode: ErrRuntimeTooOld},
		{name: "prerelease older than release", current: "1.2.3-rc.2", minimum: "1.2.3", wantCode: ErrRuntimeTooOld},
		{name: "release newer than prerelease", current: "1.2.3", minimum: "1.2.3-rc.9"},
		{name: "build metadata does not affect precedence", current: "1.2.3+runtime.1", minimum: "1.2.3+runtime.2"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateRuntimeCompatibility(Manifest{Runtime: RuntimeCompatibilityManifest{MinVersion: test.minimum}}, test.current)
			if test.wantCode == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			requirePackageError(t, err, test.wantCode, "runtime.minVersion")
		})
	}

	err := ValidateRuntimeCompatibility(Manifest{Runtime: RuntimeCompatibilityManifest{MinVersion: "1.0.0"}}, "development")
	requirePackageError(t, err, ErrRuntimeVersionInvalid, "runtime")
}

func TestManifestCapabilitiesContract(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil || strings.Join(manifest.Capabilities, ",") != "custom-ui,desktop-automation" {
		t.Fatalf("valid capabilities rejected: manifest=%+v err=%v", manifest, err)
	}

	invalid := strings.Replace(validManifestJSON(), `"custom-ui", "desktop-automation"`, `"CustomUI"`, 1)
	_, err = ParseManifest([]byte(invalid))
	requirePackageError(t, err, ErrPackageCapabilityInvalid, "capabilities[0]")

	duplicate := strings.Replace(validManifestJSON(), `"custom-ui", "desktop-automation"`, `"custom-ui", "custom-ui"`, 1)
	_, err = ParseManifest([]byte(duplicate))
	requirePackageError(t, err, ErrPackageCapabilityInvalid, "capabilities[1]")
}

func TestParseManifestDefaultsSingleInstanceTrueAndPreservesExplicitFalse(t *testing.T) {
	manifest, err := ParseManifest([]byte(`{"id":"com.opendesk.minimal","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`))
	if err != nil {
		t.Fatal(err)
	}
	if !manifest.SingleInstance {
		t.Fatal("singleInstance should default to true")
	}

	manifest, err = ParseManifest([]byte(`{"id":"com.opendesk.minimal","entry":"main.js","singleInstance":false,"window":{"mainId":"main"},"tray":{"enabled":false}}`))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.SingleInstance {
		t.Fatal("explicit singleInstance=false must be preserved")
	}
}

func TestParseManifestAllowsDisabledStatusItemWithoutAction(t *testing.T) {
	input := strings.Replace(validManifestJSON(), `{"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}`, `{"id":"status","label":"Status: Idle","enabled":false,"visible":true}`, 1)
	if _, err := ParseManifest([]byte(input)); err != nil {
		t.Fatalf("disabled status item should be valid: %v", err)
	}

	bad := strings.Replace(validManifestJSON(), `{"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}`, `{"id":"status","label":"Status: Idle","enabled":true}`, 1)
	if _, err := ParseManifest([]byte(bad)); err == nil || !strings.Contains(err.Error(), "permanently disabled") {
		t.Fatalf("enabled actionless item should fail, got %v", err)
	}
}

func TestParseManifestRejectsInvalidJSONAndUnknownFields(t *testing.T) {
	for _, input := range []string{
		`{"id":`,
		`{"id":"com.opendesk.invalid","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false},"unknown":true}`,
		`{"id":"com.opendesk.invalid","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}} {"entry":"other.js"}`,
	} {
		if _, err := ParseManifest([]byte(input)); err == nil {
			t.Fatalf("expected rejection for %q", input)
		}
	}
}

func TestManifestRejectsUnsafePaths(t *testing.T) {
	for _, entry := range []string{"../main.js", "/tmp/main.js", `C:\\app\\main.js`, `..\\main.js`} {
		input := strings.Replace(validManifestJSON(), `"main.js"`, `"`+entry+`"`, 1)
		_, err := ParseManifest([]byte(input))
		requirePackageError(t, err, ErrPackageResourceEscape, "entry")
	}
	for _, replacement := range []string{
		`"windows":"../../tray.ico"`,
		`"macos":"../../tray.png"`,
		`"windows":"C:\\outside\\tray.ico"`,
		`"macos":"/tmp/tray.png"`,
	} {
		input := validManifestJSON()
		if strings.Contains(replacement, "windows") {
			input = strings.Replace(input, `"windows":"assets/tray.ico"`, replacement, 1)
		} else {
			input = strings.Replace(input, `"macos":"assets/tray.png"`, replacement, 1)
		}
		_, err := ParseManifest([]byte(input))
		field := "tray.icons.macos"
		if strings.Contains(replacement, "windows") {
			field = "tray.icons.windows"
		}
		requirePackageError(t, err, ErrPackageResourceEscape, field)
	}
}

func TestManifestRequiresBothPlatformIconFormatsWithoutFallback(t *testing.T) {
	for name, test := range map[string]struct{ from, to, want string }{
		"missing Windows icon": {from: `"windows":"assets/tray.ico", `, want: "tray.icons.windows is required"},
		"missing macOS icon":   {from: `, "macos":"assets/tray.png"`, want: "tray.icons.macos is required"},
		"Windows PNG":          {from: `"windows":"assets/tray.ico"`, to: `"windows":"assets/tray.png"`, want: "tray.icons.windows must reference an .ico file"},
		"macOS ICO":            {from: `"macos":"assets/tray.png"`, to: `"macos":"assets/tray.ico"`, want: "tray.icons.macos must reference a .png template image"},
	} {
		t.Run(name, func(t *testing.T) {
			input := strings.Replace(validManifestJSON(), test.from, test.to, 1)
			if _, err := ParseManifest([]byte(input)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
}

func TestManifestRejectsDuplicateAndReservedIDs(t *testing.T) {
	duplicate := strings.Replace(validManifestJSON(), `"sync.pause"`, `"sync.now"`, 1)
	if _, err := ParseManifest([]byte(duplicate)); err == nil {
		t.Fatal("expected duplicate menu id to fail")
	}
	reservedID := strings.Replace(validManifestJSON(), `"sync.now"`, `"opendesk.fake"`, 1)
	if _, err := ParseManifest([]byte(reservedID)); err == nil {
		t.Fatal("expected reserved item id to fail")
	}
	reservedAction := strings.Replace(validManifestJSON(), `"action":"sync.now"`, `"action":"opendesk.fake"`, 1)
	if _, err := ParseManifest([]byte(reservedAction)); err == nil {
		t.Fatal("expected reserved action to fail")
	}
}

func TestEnsureRecorderMenuInjectsRecorderOnce(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	withRecorder := EnsureRecorderMenu(manifest)
	withRecorder = EnsureRecorderMenu(withRecorder)
	var recorderCount int
	for _, item := range withRecorder.Tray.Menu {
		if item.ID == ActionRecorder {
			recorderCount++
			if item.Label != RecorderMenuLabel || item.Action != ActionRecorder {
				t.Fatalf("unexpected recorder item: %+v", item)
			}
		}
		forbidden := map[string]bool{
			"历史录制": true,
			"录制详情": true,
			"重放":   true,
			"生成脚本": true,
			"打开目录": true,
		}
		if forbidden[item.Label] {
			t.Fatalf("unexpected recorder-owned tray item %q", item.Label)
		}
	}
	if recorderCount != 1 {
		t.Fatalf("recorder menu count=%d menu=%+v", recorderCount, withRecorder.Tray.Menu)
	}
	if len(withRecorder.Tray.Menu) < 4 ||
		withRecorder.Tray.Menu[0].ID != ActionRecorder ||
		withRecorder.Tray.Menu[1].Type != "separator" ||
		withRecorder.Tray.Menu[2].ID != manifest.Tray.Menu[0].ID ||
		withRecorder.Tray.Menu[3].Type != "separator" {
		t.Fatalf("business menu was not preserved after recorder injection: %+v", withRecorder.Tray.Menu)
	}
	if err := withRecorder.Validate(); err != nil {
		t.Fatalf("injected manifest should validate: %v", err)
	}
}

func TestEnsureRecorderMenuLeavesDisabledTrayAlone(t *testing.T) {
	manifest, err := ParseManifest([]byte(`{"id":"com.opendesk.minimal","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`))
	if err != nil {
		t.Fatal(err)
	}
	withRecorder := EnsureRecorderMenu(manifest)
	if len(withRecorder.Tray.Menu) != 0 {
		t.Fatalf("disabled tray should not receive recorder item: %+v", withRecorder.Tray.Menu)
	}
}

func TestManifestRejectsInvalidMenuModeCloseBehaviorAndSeparator(t *testing.T) {
	badMode := strings.Replace(validManifestJSON(), `"menuMode": "merge"`, `"menuMode": "replace"`, 1)
	if _, err := ParseManifest([]byte(badMode)); err == nil {
		t.Fatal("expected invalid menu mode to fail")
	}
	badClose := strings.Replace(validManifestJSON(), `"closeBehavior": "hide"`, `"closeBehavior": "minimize"`, 1)
	if _, err := ParseManifest([]byte(badClose)); err == nil {
		t.Fatal("expected invalid close behavior to fail")
	}
	badSeparator := strings.Replace(validManifestJSON(), `{"type":"separator"}`, `{"type":"separator","id":"x"}`, 1)
	if _, err := ParseManifest([]byte(badSeparator)); err == nil {
		t.Fatal("expected invalid separator to fail")
	}
}

func TestManifestHideRequiresReopenPath(t *testing.T) {
	input := strings.Replace(validManifestJSON(), `"primaryAction": "opendesk.open"`, `"primaryAction": "sync.now"`, 1)
	if _, err := ParseManifest([]byte(input)); err == nil || !strings.Contains(err.Error(), "opendesk.open") {
		t.Fatalf("expected reopen validation error, got %v", err)
	}
}

func TestManifestRequiresStableIdentityAndMainWindow(t *testing.T) {
	for name, id := range map[string]string{
		"missing id":       "",
		"invalid id":       "sample",
		"uppercase id":     "Com.Example.Sample",
		"Unicode id":       "com.example.应用",
		"trailing hyphen":  "com.example.sample-",
		"id too long":      strings.Repeat("a.", 128) + "a",
		"segment too long": "com." + strings.Repeat("a", 64),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := ParseManifest([]byte(minimalSchemaV1Manifest(id, "1.0.0")))
			requirePackageError(t, err, ErrPackageIDInvalid, "id")
		})
	}

	input := strings.Replace(minimalSchemaV1Manifest("com.example.sample", "1.0.0"), `"mainId":"main"`, `"mainId":""`, 1)
	if _, err := ParseManifest([]byte(input)); err == nil {
		t.Fatal("missing window.mainId should fail")
	}
}

func TestManifestAllowsReusableActionWithUniqueMenuIDs(t *testing.T) {
	input := strings.Replace(validManifestJSON(),
		`{"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}`,
		`{"id":"sync.also","label":"Sync elsewhere","action":"sync.now","enabled":true,"visible":true}`,
		1)
	if _, err := ParseManifest([]byte(input)); err != nil {
		t.Fatalf("reused action should be valid: %v", err)
	}
}

func TestLoadPackageRejectsMissingEntryAndEntryDirectory(t *testing.T) {
	t.Run("missing entry field", func(t *testing.T) {
		input := strings.Replace(minimalSchemaV1Manifest("com.opendesk.sample", "1.0.0"), `"entry":"main.js"`, `"entry":""`, 1)
		_, err := ParseManifest([]byte(input))
		requirePackageError(t, err, ErrPackageEntryMissing, "entry")
	})

	t.Run("missing entry file", func(t *testing.T) {
		root := t.TempDir()
		writeValidPackageFixture(t, root)
		if err := os.Remove(filepath.Join(root, "main.js")); err != nil {
			t.Fatal(err)
		}
		_, err := LoadPackage(root)
		requirePackageError(t, err, ErrPackageEntryMissing, "entry")
	})

	t.Run("entry is directory", func(t *testing.T) {
		root := t.TempDir()
		writeValidPackageFixture(t, root)
		entryPath := filepath.Join(root, "main.js")
		if err := os.Remove(entryPath); err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(entryPath, 0o700); err != nil {
			t.Fatal(err)
		}
		_, err := LoadPackage(root)
		requirePackageError(t, err, ErrPackageResourceInvalid, "entry")
	})
}

func TestLoadPackageChecksSchemaAndCompatibilityBeforeResources(t *testing.T) {
	for _, test := range []struct {
		name, from, to, code string
	}{
		{name: "unsupported schema before missing entry", from: `"schemaVersion": 1`, to: `"schemaVersion": 999`, code: ErrManifestSchemaUnsupported},
		{name: "runtime compatibility before missing entry", from: `"minVersion": "0.1.0"`, to: `"minVersion": "999.0.0"`, code: ErrRuntimeTooOld},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			writeValidPackageFixture(t, root)
			manifestPath := filepath.Join(root, ManifestFileName)
			data, err := os.ReadFile(manifestPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(manifestPath, []byte(strings.Replace(string(data), test.from, test.to, 1)), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(filepath.Join(root, "main.js")); err != nil {
				t.Fatal(err)
			}
			_, err = LoadPackage(root)
			field := "runtime.minVersion"
			if test.code == ErrManifestSchemaUnsupported {
				field = "schemaVersion"
			}
			requirePackageError(t, err, test.code, field)
		})
	}
}

func TestLoadPackageCanonicalizesRootAndRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	assets := writeValidPackageFixture(t, root)
	loaded, err := LoadPackage(root)
	if err != nil {
		t.Fatal(err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Root != canonicalRoot || loaded.EntryPath != filepath.Join(canonicalRoot, "main.js") {
		t.Fatalf("unexpected package: %+v", loaded)
	}

	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, "main.js")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "main.js")); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadPackage(root); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected entry symlink escape rejection, got %v", err)
	} else {
		requirePackageError(t, err, ErrPackageResourceEscape, "entry")
	}

	if err := os.Remove(filepath.Join(root, "main.js")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "main.js"), []byte("inside"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, file, field string
		content           []byte
	}{
		{name: "macOS", file: "tray.png", field: "tray.icons.macos", content: testPNG(t, 36, 36, "template")},
		{name: "Windows", file: "tray.ico", field: "tray.icons.windows", content: testICO(t, 16, 32)},
	} {
		t.Run(test.name, func(t *testing.T) {
			insidePath := filepath.Join(assets, test.file)
			outsidePath := filepath.Join(t.TempDir(), "outside-"+test.file)
			if err := os.WriteFile(outsidePath, test.content, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(insidePath); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outsidePath, insidePath); err != nil {
				t.Fatal(err)
			}
			_, err := LoadPackage(root)
			if err == nil || !strings.Contains(err.Error(), test.field+" escapes the app package through a symlink") {
				t.Fatalf("expected %s icon symlink escape rejection, got %v", test.name, err)
			}
			requirePackageError(t, err, ErrPackageResourceEscape, test.field)
			if err := os.Remove(insidePath); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(insidePath, test.content, 0o600); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestLoadPackageRejectsMissingAndInvalidIconResources(t *testing.T) {
	tests := []struct {
		name, file, code, field string
		mutate                  func(*testing.T, string)
		want                    []string
	}{
		{name: "missing Windows ICO", file: "tray.ico", code: ErrPackageResourceMissing, field: "tray.icons.windows", mutate: removeTestFile, want: []string{"resolve tray.icons.windows"}},
		{name: "empty Windows ICO", file: "tray.ico", code: ErrPackageResourceInvalid, field: "tray.icons.windows", mutate: emptyTestFile, want: []string{"validate tray.icons.windows", "icon file is empty"}},
		{name: "corrupt Windows ICO", file: "tray.ico", code: ErrPackageResourceInvalid, field: "tray.icons.windows", mutate: func(t *testing.T, path string) { writeTestFile(t, path, []byte("not-an-ico")) }, want: []string{"validate tray.icons.windows", "invalid ICO header"}},
		{name: "PNG disguised as Windows ICO", file: "tray.ico", code: ErrPackageResourceInvalid, field: "tray.icons.windows", mutate: func(t *testing.T, path string) { writeTestFile(t, path, testPNG(t, 32, 32, "template")) }, want: []string{"validate tray.icons.windows", "invalid ICO header"}},
		{name: "missing macOS PNG", file: "tray.png", code: ErrPackageResourceMissing, field: "tray.icons.macos", mutate: removeTestFile, want: []string{"resolve tray.icons.macos"}},
		{name: "empty macOS PNG", file: "tray.png", code: ErrPackageResourceInvalid, field: "tray.icons.macos", mutate: emptyTestFile, want: []string{"validate tray.icons.macos", "icon file is empty"}},
		{name: "corrupt macOS PNG", file: "tray.png", code: ErrPackageResourceInvalid, field: "tray.icons.macos", mutate: func(t *testing.T, path string) {
			writeTestFile(t, path, append(append([]byte(nil), pngSignature...), []byte("broken")...))
		}, want: []string{"validate tray.icons.macos", "decode PNG"}},
		{name: "ICO disguised as macOS PNG", file: "tray.png", code: ErrPackageResourceInvalid, field: "tray.icons.macos", mutate: func(t *testing.T, path string) { writeTestFile(t, path, testICO(t, 32)) }, want: []string{"validate tray.icons.macos", "decode PNG"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			assets := writeValidPackageFixture(t, root)
			test.mutate(t, filepath.Join(assets, test.file))
			_, err := LoadPackage(root)
			if err == nil {
				t.Fatal("expected icon validation failure")
			}
			requirePackageError(t, err, test.code, test.field)
			for _, want := range test.want {
				if !strings.Contains(err.Error(), want) {
					t.Fatalf("error %q does not contain %q", err, want)
				}
			}
		})
	}
}

func removeTestFile(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
}

func emptyTestFile(t *testing.T, path string) {
	t.Helper()
	writeTestFile(t, path, nil)
}

func writeTestFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestMacOSTemplateIconDimensionsAndTransparency(t *testing.T) {
	for _, size := range []int{16, 36, 1024} {
		iconPath := filepath.Join(t.TempDir(), "tray.png")
		writeTestFile(t, iconPath, testPNG(t, size, size, "template"))
		if err := validateMacOSTemplateIcon(iconPath); err != nil {
			t.Fatalf("valid %dx%d template: %v", size, size, err)
		}
	}
	for _, test := range []struct {
		name, alpha   string
		width, height int
		want          string
	}{
		{name: "too small", alpha: "template", width: 15, height: 15, want: "between 16x16 and 1024x1024"},
		{name: "too large", alpha: "template", width: 1025, height: 1025, want: "between 16x16 and 1024x1024"},
		{name: "not square", alpha: "template", width: 32, height: 24, want: "must be square"},
		{name: "fully opaque", alpha: "opaque", width: 32, height: 32, want: "no transparent pixels"},
		{name: "fully transparent", alpha: "transparent", width: 32, height: 32, want: "fully transparent"},
	} {
		t.Run(test.name, func(t *testing.T) {
			iconPath := filepath.Join(t.TempDir(), "tray.png")
			writeTestFile(t, iconPath, testPNG(t, test.width, test.height, test.alpha))
			if err := validateMacOSTemplateIcon(iconPath); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q error, got %v", test.want, err)
			}
		})
	}
}

func TestWindowsTrayIconStructureAndFrameDecode(t *testing.T) {
	for name, sizes := range map[string][]int{
		"single frame remains supported": {32},
		"recommended multiscale set":     {16, 20, 24, 32, 48, 256},
	} {
		t.Run(name, func(t *testing.T) {
			iconPath := filepath.Join(t.TempDir(), "tray.ico")
			writeTestFile(t, iconPath, testICO(t, sizes...))
			if err := validateWindowsTrayIcon(iconPath); err != nil {
				t.Fatal(err)
			}
		})
	}
	for name, data := range map[string][]byte{
		"classic DIB frame": testICODIB(16),
		"256 PNG frame":     testICO(t, 256),
	} {
		t.Run(name, func(t *testing.T) {
			iconPath := filepath.Join(t.TempDir(), "tray.ico")
			writeTestFile(t, iconPath, data)
			if err := validateWindowsTrayIcon(iconPath); err != nil {
				t.Fatal(err)
			}
		})
	}

	valid := testICO(t, 16, 32)
	for _, test := range []struct {
		name   string
		mutate func([]byte)
		want   string
	}{
		{name: "payload outside file", mutate: func(data []byte) { binary.LittleEndian.PutUint32(data[18:22], uint32(len(data)+1)) }, want: "outside the file"},
		{name: "overlapping payloads", mutate: func(data []byte) { copy(data[34:38], data[18:22]) }, want: "overlaps frame 0"},
		{name: "empty payload", mutate: func(data []byte) { binary.LittleEndian.PutUint32(data[14:18], 0) }, want: "empty payload"},
		{name: "reserved byte", mutate: func(data []byte) { data[9] = 1 }, want: "non-zero reserved byte"},
		{name: "dimension mismatch", mutate: func(data []byte) { data[6], data[7] = 24, 24 }, want: "embedded PNG dimensions are 16x16"},
		{name: "corrupt embedded PNG", mutate: func(data []byte) { data[len(data)-1] ^= 0xff }, want: "decode complete embedded PNG"},
	} {
		t.Run(test.name, func(t *testing.T) {
			data := append([]byte(nil), valid...)
			test.mutate(data)
			iconPath := filepath.Join(t.TempDir(), "tray.ico")
			writeTestFile(t, iconPath, data)
			if err := validateWindowsTrayIcon(iconPath); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q error, got %v", test.want, err)
			}
		})
	}

	for _, test := range []struct {
		name   string
		mutate func([]byte) []byte
		want   string
	}{
		{name: "invalid DIB planes", mutate: func(data []byte) []byte { binary.LittleEndian.PutUint16(data[34:36], 2); return data }, want: "invalid DIB plane count"},
		{name: "unsupported DIB compression", mutate: func(data []byte) []byte { binary.LittleEndian.PutUint32(data[38:42], 5); return data }, want: "unsupported DIB compression"},
		{name: "truncated DIB pixels", mutate: func(data []byte) []byte {
			data = data[:len(data)-1]
			binary.LittleEndian.PutUint32(data[14:18], uint32(len(data)-22))
			return data
		}, want: "DIB pixel data is truncated"},
	} {
		t.Run(test.name, func(t *testing.T) {
			data := test.mutate(append([]byte(nil), testICODIB(16)...))
			iconPath := filepath.Join(t.TempDir(), "tray.ico")
			writeTestFile(t, iconPath, data)
			if err := validateWindowsTrayIcon(iconPath); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q error, got %v", test.want, err)
			}
		})
	}
}

func TestPackageErrorCodesProvideActionableContext(t *testing.T) {
	tests := []struct {
		name, code, field string
		failure           func(*testing.T) error
	}{
		{name: "invalid package root", code: ErrPackageRootInvalid, field: "packageRoot", failure: func(t *testing.T) error {
			_, err := LoadPackage("")
			return err
		}},
		{name: "missing manifest", code: ErrManifestNotFound, field: ManifestFileName, failure: func(t *testing.T) error {
			_, err := LoadPackage(t.TempDir())
			return err
		}},
		{name: "invalid manifest", code: ErrManifestInvalid, field: "manifest", failure: func(t *testing.T) error {
			_, err := ParseManifest([]byte(`{"schemaVersion":1,"id":`))
			return err
		}},
		{name: "unsupported schema", code: ErrManifestSchemaUnsupported, field: "schemaVersion", failure: func(t *testing.T) error {
			_, err := ParseManifest([]byte(`{"schemaVersion":2}`))
			return err
		}},
		{name: "invalid package id", code: ErrPackageIDInvalid, field: "id", failure: func(t *testing.T) error {
			_, err := ParseManifest([]byte(minimalSchemaV1Manifest("", "1.0.0")))
			return err
		}},
		{name: "invalid package version", code: ErrPackageVersionInvalid, field: "version", failure: func(t *testing.T) error {
			_, err := ParseManifest([]byte(minimalSchemaV1Manifest("com.opendesk.sample", "")))
			return err
		}},
		{name: "missing entry", code: ErrPackageEntryMissing, field: "entry", failure: func(t *testing.T) error {
			input := strings.Replace(minimalSchemaV1Manifest("com.opendesk.sample", "1.0.0"), `"entry":"main.js"`, `"entry":""`, 1)
			_, err := ParseManifest([]byte(input))
			return err
		}},
		{name: "missing resource", code: ErrPackageResourceMissing, field: "tray.icons.windows", failure: func(t *testing.T) error {
			root := t.TempDir()
			assets := writeValidPackageFixture(t, root)
			if err := os.Remove(filepath.Join(assets, "tray.ico")); err != nil {
				t.Fatal(err)
			}
			_, err := LoadPackage(root)
			return err
		}},
		{name: "escaping resource", code: ErrPackageResourceEscape, field: "entry", failure: func(t *testing.T) error {
			input := strings.Replace(minimalSchemaV1Manifest("com.opendesk.sample", "1.0.0"), `"entry":"main.js"`, `"entry":"../main.js"`, 1)
			_, err := ParseManifest([]byte(input))
			return err
		}},
		{name: "invalid resource", code: ErrPackageResourceInvalid, field: "tray.icons.windows", failure: func(t *testing.T) error {
			input := strings.Replace(validManifestJSON(), `"windows":"assets/tray.ico"`, `"windows":"assets/tray.png"`, 1)
			_, err := ParseManifest([]byte(input))
			return err
		}},
		{name: "invalid capability", code: ErrPackageCapabilityInvalid, field: "capabilities[0]", failure: func(t *testing.T) error {
			input := strings.Replace(validManifestJSON(), `"custom-ui", "desktop-automation"`, `"CustomUI"`, 1)
			_, err := ParseManifest([]byte(input))
			return err
		}},
		{name: "runtime too old", code: ErrRuntimeTooOld, field: "runtime.minVersion", failure: func(t *testing.T) error {
			return ValidateRuntimeCompatibility(Manifest{Runtime: RuntimeCompatibilityManifest{MinVersion: "2.0.0"}}, "1.0.0")
		}},
		{name: "invalid runtime version", code: ErrRuntimeVersionInvalid, field: "runtime", failure: func(t *testing.T) error {
			return ValidateRuntimeCompatibility(Manifest{Runtime: RuntimeCompatibilityManifest{MinVersion: "1.0.0"}}, "development")
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			packageErr := requirePackageError(t, test.failure(t), test.code, test.field)
			message := packageErr.Error()
			for _, fragment := range []string{test.code, "field=", "expected=", "actual=", "fix="} {
				if !strings.Contains(message, fragment) {
					t.Fatalf("PackageError message %q lacks %q", message, fragment)
				}
			}
		})
	}
}

func TestRuntimeVersionBuildWiringUsesCanonicalVariable(t *testing.T) {
	repoRoot := filepath.Clean(filepath.Join("..", ".."))
	versionData, err := os.ReadFile(filepath.Join(repoRoot, "VERSION"))
	if err != nil {
		t.Fatal(err)
	}
	version := strings.TrimSpace(string(versionData))
	if _, ok := parseSemVersion(version); !ok {
		t.Fatalf("VERSION is not valid SemVer: %q", version)
	}
	if runtimeversion.Current != version {
		t.Fatalf("developer Runtime default %q does not match VERSION %q", runtimeversion.Current, version)
	}

	checks := map[string][]string{
		"Makefile": {
			`VERSION_FILE := $(CURDIR)/VERSION`,
			`RUNTIME_VERSION_LDFLAGS := -X opendesk/pkg/runtimeversion.Current=$(VERSION)`,
			`$(GO) build -ldflags "$(RUNTIME_VERSION_LDFLAGS)" -o dist/opendesk`,
		},
		"scripts/build_macos_app.sh": {
			`VERSION_FILE="${ROOT_DIR}/VERSION"`,
			`RUNTIME_VERSION_LDFLAGS="-X opendesk/pkg/runtimeversion.Current=${VERSION}"`,
			`build -trimpath -ldflags "${RUNTIME_VERSION_LDFLAGS}" -o "${EXECUTABLE_STAGE}" ./cmd/opendesk`,
			`<key>CFBundleShortVersionString</key>`,
			`<string>${VERSION}</string>`,
		},
		"scripts/build_windows_app.ps1": {
			`$versionFile = Join-Path $root 'VERSION'`,
			`$runtimeVersionLdflags = "-X opendesk/pkg/runtimeversion.Current=$Version"`,
			`go build -trimpath -ldflags $runtimeVersionLdflags -o $runtimePath ./cmd/opendesk`,
		},
		"scripts/build_windows_distribution.ps1": {
			`$versionFile = Join-Path $root 'VERSION'`,
			`Version = $Version`,
			`runtimeCompatibilityVersion = $Version`,
			`compatibilityVersion = $Version`,
		},
	}
	for relativePath, snippets := range checks {
		data, err := os.ReadFile(filepath.Join(repoRoot, relativePath))
		if err != nil {
			t.Fatal(err)
		}
		content := string(data)
		for _, snippet := range snippets {
			if !strings.Contains(content, snippet) {
				t.Errorf("%s does not wire Runtime version through %q", relativePath, snippet)
			}
		}
		if strings.Contains(content, `0.1.0`) {
			t.Errorf("%s must read the release version source instead of owning a hard-coded default", relativePath)
		}
	}
}

func TestInstanceKeyDependsOnlyOnNormalizedPackageID(t *testing.T) {
	first, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	second := first
	second.Entry = "nested/other.js"
	if first.InstanceKey() != second.InstanceKey() {
		t.Fatal("entry path changed the single-instance identity")
	}
	second.ID = "com.opendesk.other"
	if first.InstanceKey() == second.InstanceKey() {
		t.Fatal("different package IDs share a single-instance identity")
	}
}
