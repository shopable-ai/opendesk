package nativeextension

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	ManifestSchemaVersion = 1
	ManifestMaxBytes      = 64 << 10
	ManifestMaxDepth      = 12
	ManifestMaxMethods    = 64
	ManifestMaxTimeoutMS  = 60_000
	ManifestMaxExecutable = 512
)

var (
	pluginIDPattern   = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9.-]{0,126}[a-z0-9])?$`)
	identifierPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,63}$`)
	versionPattern    = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$`)
	digestPattern     = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

var reservedMemberIdentifiers = map[string]struct{}{
	"__proto__": {}, "prototype": {}, "constructor": {}, "then": {},
	"list": {}, "get": {}, "diagnostics": {},
}

var reservedNamespaceIdentifiers = map[string]struct{}{
	"__proto__": {}, "prototype": {}, "constructor": {}, "then": {},
	"list": {}, "get": {}, "diagnostics": {},
	"file": {}, "system": {}, "page": {}, "nativeextension": {},
	"nativeextensions": {}, "globalthis": {}, "object": {}, "function": {},
	"app": {}, "appstorage": {}, "audio": {}, "axios": {}, "browser": {}, "clipboard": {},
	"console": {}, "context": {}, "floatingwindow": {}, "http": {},
	"imagecolor": {}, "keyboard": {}, "mouse": {}, "ocr": {}, "screen": {},
	"sound": {}, "sqlite": {}, "touchscreen": {}, "ui": {}, "vision": {}, "window": {},
}

// Manifest is the strict, public Native Extension bundle contract. Unknown
// fields and duplicate JSON keys are rejected before any artifact is used.
type Manifest struct {
	SchemaVersion    int                       `json:"schemaVersion"`
	ID               string                    `json:"id"`
	Version          string                    `json:"version"`
	Protocol         ManifestProtocol          `json:"protocol"`
	Executable       string                    `json:"executable"`
	ExecutableSHA256 string                    `json:"executableSha256,omitempty"`
	JavaScript       ManifestJavaScript        `json:"javascript"`
	Methods          map[string]ManifestMethod `json:"methods"`
}

type ManifestProtocol struct {
	Name    string `json:"name"`
	Version int    `json:"version"`
}

type ManifestJavaScript struct {
	Namespace string `json:"namespace"`
}

type ManifestMethod struct {
	WireMethod string `json:"wireMethod"`
	TimeoutMS  int    `json:"timeoutMs"`
}

func ParseManifest(raw []byte) (Manifest, error) {
	if len(raw) == 0 {
		return Manifest{}, fmt.Errorf("manifest is empty")
	}
	if len(raw) > ManifestMaxBytes {
		return Manifest{}, fmt.Errorf("manifest exceeds %d bytes", ManifestMaxBytes)
	}
	if err := validateStrictJSON(raw); err != nil {
		return Manifest{}, err
	}
	if err := validateManifestJSONFields(raw); err != nil {
		return Manifest{}, err
	}

	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode strict manifest: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return Manifest{}, err
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.SchemaVersion != ManifestSchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", manifest.SchemaVersion)
	}
	if !pluginIDPattern.MatchString(manifest.ID) || isReservedMemberIdentifier(manifest.ID) {
		return fmt.Errorf("id is not a safe, non-reserved canonical plugin id")
	}
	if !versionPattern.MatchString(manifest.Version) {
		return fmt.Errorf("version must be a semantic version")
	}
	if manifest.Protocol.Name != ProtocolName || manifest.Protocol.Version != ProtocolVersion {
		return fmt.Errorf("protocol identity must be %s version %d", ProtocolName, ProtocolVersion)
	}
	if err := validateRelativeExecutable(manifest.Executable); err != nil {
		return err
	}
	if manifest.ExecutableSHA256 != "" && !digestPattern.MatchString(manifest.ExecutableSHA256) {
		return fmt.Errorf("executableSha256 must be 64 lowercase hexadecimal characters")
	}
	if err := validateNamespaceIdentifier("javascript.namespace", manifest.JavaScript.Namespace); err != nil {
		return err
	}
	if len(manifest.Methods) == 0 || len(manifest.Methods) > ManifestMaxMethods {
		return fmt.Errorf("methods must contain between 1 and %d entries", ManifestMaxMethods)
	}

	methodCaseFold := make(map[string]string, len(manifest.Methods))
	wireCaseFold := make(map[string]string, len(manifest.Methods))
	methodNames := make([]string, 0, len(manifest.Methods))
	for name := range manifest.Methods {
		methodNames = append(methodNames, name)
	}
	sort.Strings(methodNames)
	for _, name := range methodNames {
		method := manifest.Methods[name]
		if err := validatePublicIdentifier("method name", name); err != nil {
			return err
		}
		folded := strings.ToLower(name)
		if previous, exists := methodCaseFold[folded]; exists {
			return fmt.Errorf("method names %q and %q collide case-insensitively", previous, name)
		}
		methodCaseFold[folded] = name
		if !identifierPattern.MatchString(method.WireMethod) || isReservedMemberIdentifier(method.WireMethod) {
			return fmt.Errorf("methods.%s.wireMethod is not a safe, non-reserved identifier", name)
		}
		wireFolded := strings.ToLower(method.WireMethod)
		if previous, exists := wireCaseFold[wireFolded]; exists {
			return fmt.Errorf("wire methods %q and %q collide case-insensitively", previous, method.WireMethod)
		}
		wireCaseFold[wireFolded] = method.WireMethod
		if method.TimeoutMS <= 0 || method.TimeoutMS > ManifestMaxTimeoutMS {
			return fmt.Errorf("methods.%s.timeoutMs must be between 1 and %d", name, ManifestMaxTimeoutMS)
		}
	}
	return nil
}

func validatePublicIdentifier(field, value string) error {
	if !identifierPattern.MatchString(value) || isReservedMemberIdentifier(value) {
		return fmt.Errorf("%s is not a safe, non-reserved identifier", field)
	}
	return nil
}

func validateNamespaceIdentifier(field, value string) error {
	if !identifierPattern.MatchString(value) {
		return fmt.Errorf("%s is not a safe identifier", field)
	}
	_, reserved := reservedNamespaceIdentifiers[strings.ToLower(value)]
	if reserved {
		return fmt.Errorf("%s is reserved by the Runtime", field)
	}
	return nil
}

func isReservedMemberIdentifier(value string) bool {
	_, reserved := reservedMemberIdentifiers[strings.ToLower(value)]
	return reserved
}

func validateRelativeExecutable(value string) error {
	if value == "" || strings.TrimSpace(value) != value || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("executable must be a non-empty bundle-relative path")
	}
	if utf8.RuneCountInString(value) > ManifestMaxExecutable {
		return fmt.Errorf("executable must not exceed %d characters", ManifestMaxExecutable)
	}
	if strings.Contains(value, `\`) || strings.Contains(value, ":") || filepath.IsAbs(value) || path.IsAbs(value) || filepath.VolumeName(value) != "" {
		return fmt.Errorf("executable must use a bundle-relative slash path")
	}
	cleaned := path.Clean(value)
	if cleaned == "." || cleaned != value || strings.HasPrefix(cleaned, "../") || cleaned == ".." {
		return fmt.Errorf("executable path traversal or normalization is not allowed")
	}
	for _, component := range strings.Split(value, "/") {
		if component == "" || component == "." || component == ".." {
			return fmt.Errorf("executable path contains an invalid component")
		}
	}
	return nil
}

func validateStrictJSON(raw []byte) error {
	return validateStrictJSONDepth(raw, ManifestMaxDepth)
}

func validateStrictJSONDepth(raw []byte, maxDepth int) error {
	if !utf8.Valid(raw) {
		return fmt.Errorf("invalid strict JSON: input is not UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := walkJSONValue(decoder, 1, maxDepth); err != nil {
		return fmt.Errorf("invalid strict JSON: %w", err)
	}
	return ensureJSONEOF(decoder)
}

func walkJSONValue(decoder *json.Decoder, depth, maxDepth int) error {
	if depth > maxDepth {
		return fmt.Errorf("JSON depth exceeds %d", maxDepth)
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		keys := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("object key is not a string")
			}
			if _, exists := keys[key]; exists {
				return fmt.Errorf("duplicate key %q", key)
			}
			keys[key] = struct{}{}
			if err := walkJSONValue(decoder, depth+1, maxDepth); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil {
			return err
		}
		if closing != json.Delim('}') {
			return fmt.Errorf("object is not closed")
		}
	case '[':
		for decoder.More() {
			if err := walkJSONValue(decoder, depth+1, maxDepth); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil {
			return err
		}
		if closing != json.Delim(']') {
			return fmt.Errorf("array is not closed")
		}
	default:
		return fmt.Errorf("unexpected delimiter %q", delimiter)
	}
	return nil
}

func validateManifestJSONFields(raw []byte) error {
	top, err := decodeExactJSONObject(raw, "manifest")
	if err != nil {
		return err
	}
	if err := validateExactObjectFields(top, "manifest",
		[]string{"schemaVersion", "id", "version", "protocol", "executable", "javascript", "methods"},
		[]string{"executableSha256"}); err != nil {
		return err
	}
	protocol, err := decodeExactJSONObject(top["protocol"], "protocol")
	if err != nil {
		return err
	}
	if err := validateExactObjectFields(protocol, "protocol", []string{"name", "version"}, nil); err != nil {
		return err
	}
	javascript, err := decodeExactJSONObject(top["javascript"], "javascript")
	if err != nil {
		return err
	}
	if err := validateExactObjectFields(javascript, "javascript", []string{"namespace"}, nil); err != nil {
		return err
	}
	methods, err := decodeExactJSONObject(top["methods"], "methods")
	if err != nil {
		return err
	}
	for name, rawMethod := range methods {
		method, err := decodeExactJSONObject(rawMethod, "methods."+name)
		if err != nil {
			return err
		}
		if err := validateExactObjectFields(method, "methods."+name, []string{"wireMethod", "timeoutMs"}, nil); err != nil {
			return err
		}
	}
	return nil
}

func decodeExactJSONObject(raw []byte, location string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		if err == nil {
			err = fmt.Errorf("value is null")
		}
		return nil, fmt.Errorf("%s must be a JSON object: %w", location, err)
	}
	return object, nil
}

func validateExactObjectFields(object map[string]json.RawMessage, location string, required, optional []string) error {
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, name := range required {
		allowed[name] = struct{}{}
		if _, exists := object[name]; !exists {
			return fmt.Errorf("%s is missing required field %q", location, name)
		}
	}
	for _, name := range optional {
		allowed[name] = struct{}{}
	}
	for name := range object {
		if _, exists := allowed[name]; !exists {
			return fmt.Errorf("%s contains unknown or incorrectly-cased field %q", location, name)
		}
	}
	return nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	if token, err := decoder.Token(); err != io.EOF {
		if err != nil {
			return fmt.Errorf("manifest has trailing content: %w", err)
		}
		return fmt.Errorf("manifest has trailing JSON value %v", token)
	}
	return nil
}
