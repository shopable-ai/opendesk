package appcli

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dlclark/regexp2/v2"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"opendesk/internal/packagecli"
	"opendesk/pkg/appshell"
)

const validTestManifest = `{
  "schemaVersion": 1,
  "id": "com.example.app",
  "version": "1.0.0",
  "runtime": {"minVersion": "0.1.0"},
  "entry": "main.js",
  "window": {"mainId": "main"},
  "tray": {"enabled": false}
}`

type testEnvelope struct {
	OK      bool            `json:"ok"`
	Command string          `json:"command"`
	Result  json.RawMessage `json:"result"`
	Error   *errorBody      `json:"error"`
}

type ecmaRegexp regexp2.Regexp

func (regexp *ecmaRegexp) MatchString(value string) bool {
	matched, err := (*regexp2.Regexp)(regexp).MatchString(value)
	return err == nil && matched
}

func (regexp *ecmaRegexp) String() string {
	return (*regexp2.Regexp)(regexp).String()
}

func compileECMARegexp(pattern string) (jsonschema.Regexp, error) {
	regexp, err := regexp2.Compile(pattern, regexp2.ECMAScript)
	if err != nil {
		return nil, err
	}
	return (*ecmaRegexp)(regexp), nil
}

func TestValidateHumanAndJSONSuccess(t *testing.T) {
	packageDir := writeTestPackage(t, validTestManifest, true)

	var humanOut, humanErr bytes.Buffer
	if code := Execute([]string{"app", "validate", packageDir}, &humanOut, &humanErr); code != 0 {
		t.Fatalf("human validate exit=%d stdout=%s stderr=%s", code, humanOut.String(), humanErr.String())
	}
	for _, fragment := range []string{"App package is valid.", "Schema:       1", "ID:           com.example.app", "Version:      1.0.0", "Runtime:      compatible", "Entry:        main.js"} {
		if !strings.Contains(humanOut.String(), fragment) {
			t.Errorf("human output missing %q: %s", fragment, humanOut.String())
		}
	}
	if humanErr.Len() != 0 {
		t.Fatalf("human success wrote stderr: %s", humanErr.String())
	}

	for _, args := range [][]string{
		{"app", "validate", packageDir, "--json"},
		{"app", "validate", "--json", packageDir},
	} {
		var stdout, stderr bytes.Buffer
		if code := Execute(args, &stdout, &stderr); code != 0 {
			t.Fatalf("JSON validate exit=%d output=%s stderr=%s", code, stdout.String(), stderr.String())
		}
		envelope := decodeEnvelope(t, stdout.Bytes())
		if !envelope.OK || envelope.Command != "app.validate" || envelope.Error != nil {
			t.Fatalf("unexpected success envelope: %+v", envelope)
		}
		var result validationResult
		if err := json.Unmarshal(envelope.Result, &result); err != nil {
			t.Fatal(err)
		}
		if result.SchemaVersion != 1 || result.ID != "com.example.app" || result.Version != "1.0.0" || !result.RuntimeCompatible || result.Entry != "main.js" || result.RuntimeVersion == "" {
			t.Fatalf("unexpected result: %+v", result)
		}
		if stderr.Len() != 0 {
			t.Fatalf("JSON success wrote stderr: %s", stderr.String())
		}
	}
}

func TestValidateLegacyV0(t *testing.T) {
	packageDir := writeTestPackage(t, `{"id":"com.example.legacy","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`, true)
	var stdout bytes.Buffer
	if code := Execute([]string{"app", "validate", packageDir, "--json"}, &stdout, &bytes.Buffer{}); code != 0 {
		t.Fatalf("legacy validate exit=%d output=%s", code, stdout.String())
	}
	var result validationResult
	envelope := decodeEnvelope(t, stdout.Bytes())
	if err := json.Unmarshal(envelope.Result, &result); err != nil {
		t.Fatal(err)
	}
	if result.SchemaVersion != 0 || result.Version != "" || !result.RuntimeCompatible {
		t.Fatalf("legacy result = %+v", result)
	}
}

func TestValidatePackageFailuresReturnStableJSONAndExitOne(t *testing.T) {
	tests := []struct {
		name       string
		manifest   string
		writeEntry bool
		wantCode   string
		wantField  string
		prepare    func(*testing.T, string)
	}{
		{name: "future schema", manifest: strings.Replace(validTestManifest, `"schemaVersion": 1`, `"schemaVersion": 999`, 1), writeEntry: true, wantCode: appshell.ErrManifestSchemaUnsupported, wantField: "schemaVersion"},
		{name: "unknown field", manifest: strings.Replace(validTestManifest, `"entry":`, `"unexpected": true, "entry":`, 1), writeEntry: true, wantCode: appshell.ErrManifestInvalid, wantField: "manifest"},
		{name: "runtime too old", manifest: strings.Replace(validTestManifest, `"minVersion": "0.1.0"`, `"minVersion": "999.0.0"`, 1), writeEntry: true, wantCode: appshell.ErrRuntimeTooOld, wantField: "runtime.minVersion"},
		{name: "missing entry", manifest: validTestManifest, wantCode: appshell.ErrPackageEntryMissing, wantField: "entry"},
		{name: "unsafe entry", manifest: strings.Replace(validTestManifest, `"main.js"`, `"..\\main.js"`, 1), writeEntry: true, wantCode: appshell.ErrPackageResourceEscape, wantField: "entry"},
		{name: "missing resource", manifest: trayTestManifest(), writeEntry: true, wantCode: appshell.ErrPackageResourceMissing, wantField: "tray.icons.windows"},
		{name: "symlink escape", manifest: validTestManifest, wantCode: appshell.ErrPackageResourceEscape, wantField: "entry", prepare: prepareEscapingEntry},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			packageDir := writeTestPackage(t, test.manifest, test.writeEntry)
			if test.prepare != nil {
				test.prepare(t, packageDir)
			}
			var stdout, stderr bytes.Buffer
			code := Execute([]string{"app", "validate", packageDir, "--json"}, &stdout, &stderr)
			if code != 1 {
				t.Fatalf("exit=%d output=%s stderr=%s", code, stdout.String(), stderr.String())
			}
			envelope := decodeEnvelope(t, stdout.Bytes())
			if envelope.OK || envelope.Command != "app.validate" || envelope.Error == nil {
				t.Fatalf("unexpected failure envelope: %+v", envelope)
			}
			if envelope.Error.Code != test.wantCode || envelope.Error.Field != test.wantField {
				t.Fatalf("error=%+v, want code/field=%s/%s", envelope.Error, test.wantCode, test.wantField)
			}
			if envelope.Error.Expected == "" || envelope.Error.Actual == "" || envelope.Error.Hint == "" {
				t.Fatalf("error is not actionable: %+v", envelope.Error)
			}
			if stderr.Len() != 0 {
				t.Fatalf("JSON failure wrote stderr: %s", stderr.String())
			}
		})
	}
}

func TestUsageErrorsAndUnknownSubcommandExitTwo(t *testing.T) {
	for _, args := range [][]string{
		{"app"},
		{"app", "validate"},
		{"app", "doctor", "one", "two"},
		{"app", "unknown"},
	} {
		var stdout, stderr bytes.Buffer
		if code := Execute(args, &stdout, &stderr); code != 2 {
			t.Fatalf("args=%v exit=%d stdout=%s stderr=%s", args, code, stdout.String(), stderr.String())
		}
		if stdout.Len() != 0 || !strings.Contains(stderr.String(), "Usage: "+usage) {
			t.Fatalf("args=%v stdout=%q stderr=%q", args, stdout.String(), stderr.String())
		}
	}

	var stdout, stderr bytes.Buffer
	if code := Execute([]string{"app", "validate", "--json"}, &stdout, &stderr); code != 2 {
		t.Fatalf("JSON usage exit=%d output=%s", code, stdout.String())
	}
	envelope := decodeEnvelope(t, stdout.Bytes())
	if envelope.OK || envelope.Error == nil || envelope.Error.Code != "APP_CLI_USAGE" || envelope.Error.Expected != usage {
		t.Fatalf("unexpected usage envelope: %+v", envelope)
	}
	if stderr.Len() != 0 {
		t.Fatalf("JSON usage wrote stderr: %s", stderr.String())
	}
}

func TestAppAndProtectedPackageNamespacesRemainIsolated(t *testing.T) {
	if !IsCommand([]string{"app", "validate", "example"}) || IsCommand([]string{"package", "verify", "recipe.odpkg"}) {
		t.Fatal("appcli command detection crossed the protected-package namespace")
	}
	if !packagecli.IsCommand([]string{"package", "verify", "recipe.odpkg"}) || packagecli.IsCommand([]string{"app", "validate", "example"}) {
		t.Fatal("packagecli command detection crossed the App Mode namespace")
	}
}

func TestDoctorReportsAuthoritativeStagesAndNotChecked(t *testing.T) {
	repoRoot := repositoryRoot(t)
	var validOut bytes.Buffer
	if code := Execute([]string{"app", "doctor", filepath.Join(repoRoot, "examples", "app-mode", "basic"), "--json"}, &validOut, &bytes.Buffer{}); code != 0 {
		t.Fatalf("doctor valid exit=%d output=%s", code, validOut.String())
	}
	valid := decodeDoctorResult(t, validOut.Bytes())
	for _, check := range valid.Checks {
		if check.Status != appshell.CheckPass {
			t.Fatalf("official package check %s=%s: %s", check.ID, check.Status, check.Message)
		}
	}

	tests := []struct {
		name       string
		manifest   string
		failedID   string
		unchecked  string
		writeEntry bool
	}{
		{name: "manifest", manifest: strings.Replace(validTestManifest, `"entry":`, `"unknown": true, "entry":`, 1), failedID: appshell.CheckManifest, unchecked: appshell.CheckRuntimeCompatibility, writeEntry: true},
		{name: "compatibility", manifest: strings.Replace(validTestManifest, `"minVersion": "0.1.0"`, `"minVersion": "999.0.0"`, 1), failedID: appshell.CheckRuntimeCompatibility, unchecked: appshell.CheckEntry, writeEntry: true},
		{name: "resource", manifest: trayTestManifest(), failedID: appshell.CheckWindowsTrayResource, unchecked: appshell.CheckMacOSTrayResource, writeEntry: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			packageDir := writeTestPackage(t, test.manifest, test.writeEntry)
			var stdout bytes.Buffer
			if code := Execute([]string{"app", "doctor", packageDir, "--json"}, &stdout, &bytes.Buffer{}); code != 1 {
				t.Fatalf("doctor exit=%d output=%s", code, stdout.String())
			}
			envelope := decodeEnvelope(t, stdout.Bytes())
			if envelope.OK || envelope.Error == nil || envelope.Error.Hint == "" {
				t.Fatalf("doctor error is not actionable: %+v", envelope)
			}
			result := decodeDoctorResult(t, stdout.Bytes())
			if checkStatus(result.Checks, test.failedID) != appshell.CheckFail {
				t.Fatalf("%s did not fail: %+v", test.failedID, result.Checks)
			}
			if checkStatus(result.Checks, test.unchecked) != appshell.CheckNotChecked {
				t.Fatalf("%s was not NOT_CHECKED: %+v", test.unchecked, result.Checks)
			}
		})
	}
}

func TestJSONSchemaV1CompilesAndMatchesRuntimeContract(t *testing.T) {
	repoRoot := repositoryRoot(t)
	schemaPath := filepath.Join(repoRoot, "schemas", "app-package", "opendesk.app.schema.json")
	compiler := jsonschema.NewCompiler()
	compiler.UseRegexpEngine(compileECMARegexp)
	schema, err := compiler.Compile(schemaPath)
	if err != nil {
		t.Fatalf("compile App Package schema: %v", err)
	}

	for _, relative := range []string{
		filepath.Join("examples", "app-mode", "basic"),
		filepath.Join("apps", "opendesk"),
	} {
		t.Run(relative, func(t *testing.T) {
			packageDir := filepath.Join(repoRoot, relative)
			manifestData, err := os.ReadFile(filepath.Join(packageDir, appshell.ManifestFileName))
			if err != nil {
				t.Fatal(err)
			}
			instance := decodeJSONValue(t, manifestData)
			if err := schema.Validate(instance); err != nil {
				t.Fatalf("official manifest rejected by JSON Schema: %v", err)
			}
			if _, err := appshell.ValidatePackage(packageDir); err != nil {
				t.Fatalf("official package rejected by Runtime validator: %v", err)
			}
		})
	}

	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{name: "unknown property", mutate: func(value map[string]any) { value["unexpected"] = true }},
		{name: "$schema is not a v1 field", mutate: func(value map[string]any) {
			value["$schema"] = "https://opendesk.dev/schemas/app-package/opendesk.app.schema.json"
		}},
		{name: "required version", mutate: func(value map[string]any) { delete(value, "version") }},
		{name: "nested strictness", mutate: func(value map[string]any) { value["window"].(map[string]any)["title"] = "Main" }},
		{name: "capability uniqueness", mutate: func(value map[string]any) { value["capabilities"] = []any{"custom-ui", "custom-ui"} }},
		{name: "reserved business action", mutate: func(value map[string]any) {
			value["tray"] = map[string]any{
				"enabled":       true,
				"icons":         map[string]any{"windows": "tray.ico", "macos": "tray.png"},
				"primaryAction": "opendesk.open",
				"menu":          []any{map[string]any{"id": "item", "label": "Item", "action": "opendesk.private"}},
			}
		}},
		{name: "Windows traversal", mutate: func(value map[string]any) { value["entry"] = `..\main.js` }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := decodeJSONMap(t, []byte(validTestManifest))
			test.mutate(value)
			if err := schema.Validate(value); err == nil {
				t.Fatal("JSON Schema accepted invalid manifest")
			}
			manifestData, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := appshell.ParseManifest(manifestData); err == nil {
				t.Fatal("Runtime validator accepted invalid manifest")
			}
		})
	}
}

func writeTestPackage(t *testing.T, manifest string, writeEntry bool) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, appshell.ManifestFileName), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	if writeEntry {
		if err := os.WriteFile(filepath.Join(root, "main.js"), []byte("throw new Error('must not execute');"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func trayTestManifest() string {
	return strings.Replace(validTestManifest, `"tray": {"enabled": false}`, `"tray":{"enabled":true,"icons":{"windows":"assets/tray.ico","macos":"assets/tray.png"},"primaryAction":"opendesk.open"}`, 1)
}

func prepareEscapingEntry(t *testing.T, packageDir string) {
	t.Helper()
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("throw new Error('must not execute');"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(packageDir, "main.js")); err != nil {
		if errors.Is(err, os.ErrPermission) {
			t.Skipf("symlinks unavailable: %v", err)
		}
		t.Fatal(err)
	}
}

func decodeEnvelope(t *testing.T, data []byte) testEnvelope {
	t.Helper()
	var envelope testEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, data)
	}
	return envelope
}

func decodeDoctorResult(t *testing.T, data []byte) doctorResult {
	t.Helper()
	envelope := decodeEnvelope(t, data)
	var result doctorResult
	if err := json.Unmarshal(envelope.Result, &result); err != nil {
		t.Fatalf("decode doctor result: %v", err)
	}
	return result
}

func checkStatus(checks []appshell.PackageCheck, id string) appshell.CheckStatus {
	for _, check := range checks {
		if check.ID == id {
			return check.Status
		}
	}
	return ""
}

func decodeJSONValue(t *testing.T, data []byte) any {
	t.Helper()
	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func decodeJSONMap(t *testing.T, data []byte) map[string]any {
	t.Helper()
	value := decodeJSONValue(t, data)
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("manifest is %T, want object", value)
	}
	return object
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}
