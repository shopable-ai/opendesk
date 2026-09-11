package appshell

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func boolPtr(value bool) *bool { return &value }

func validManifestJSON() string {
	return `{
	"id": "com.opendesk.sample",
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
  }
}`
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

func TestParseManifestValid(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Entry != "main.js" || manifest.Window.CloseBehavior != "hide" || !manifest.SingleInstance {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
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
		if _, err := ParseManifest([]byte(input)); err == nil {
			t.Fatalf("expected unsafe entry %q to fail", entry)
		}
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
		if _, err := ParseManifest([]byte(input)); err == nil {
			t.Fatalf("expected unsafe icon path %s to fail", replacement)
		}
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
	for name, input := range map[string]string{
		"missing id":      `{"entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`,
		"non reverse DNS": `{"id":"sample","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`,
		"uppercase id":    `{"id":"Com.Example.Sample","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`,
		"trailing hyphen": `{"id":"com.example.sample-","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`,
		"missing mainId":  `{"id":"com.example.sample","entry":"main.js","window":{},"tray":{"enabled":false}}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseManifest([]byte(input)); err == nil {
				t.Fatal("expected validation failure")
			}
		})
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
		name, file string
		mutate     func(*testing.T, string)
		want       []string
	}{
		{name: "missing Windows ICO", file: "tray.ico", mutate: removeTestFile, want: []string{"resolve tray.icons.windows"}},
		{name: "empty Windows ICO", file: "tray.ico", mutate: emptyTestFile, want: []string{"validate tray.icons.windows", "icon file is empty"}},
		{name: "corrupt Windows ICO", file: "tray.ico", mutate: func(t *testing.T, path string) { writeTestFile(t, path, []byte("not-an-ico")) }, want: []string{"validate tray.icons.windows", "invalid ICO header"}},
		{name: "PNG disguised as Windows ICO", file: "tray.ico", mutate: func(t *testing.T, path string) { writeTestFile(t, path, testPNG(t, 32, 32, "template")) }, want: []string{"validate tray.icons.windows", "invalid ICO header"}},
		{name: "missing macOS PNG", file: "tray.png", mutate: removeTestFile, want: []string{"resolve tray.icons.macos"}},
		{name: "empty macOS PNG", file: "tray.png", mutate: emptyTestFile, want: []string{"validate tray.icons.macos", "icon file is empty"}},
		{name: "corrupt macOS PNG", file: "tray.png", mutate: func(t *testing.T, path string) {
			writeTestFile(t, path, append(append([]byte(nil), pngSignature...), []byte("broken")...))
		}, want: []string{"validate tray.icons.macos", "decode PNG"}},
		{name: "ICO disguised as macOS PNG", file: "tray.png", mutate: func(t *testing.T, path string) { writeTestFile(t, path, testICO(t, 32)) }, want: []string{"validate tray.icons.macos", "decode PNG"}},
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
