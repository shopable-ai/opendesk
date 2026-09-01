package customui

import (
	"fmt"
	"math"
	"net/url"
	"opendesk/pkg/customui/toolbar"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"
)

var publicIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)

var allowedElements = map[string]bool{
	"html": true, "head": true, "body": true, "meta": true, "title": true, "style": true,
	"div": true, "section": true, "main": true, "header": true, "footer": true,
	"button": true, "span": true, "p": true, "label": true, "strong": true, "em": true,
	"img": true, "input": true, "select": true, "option": true,
}

var cssURLPattern = regexp.MustCompile(`(?i)url\s*\(`)
var cssImageSetPattern = regexp.MustCompile(`(?i)(?:-webkit-)?image-set\s*\(`)
var cssImportPattern = regexp.MustCompile(`(?i)@\s*import\b`)
var cssCommentPattern = regexp.MustCompile(`(?s)/\*.*?\*/`)
var safeDataImagePattern = regexp.MustCompile(`(?i)^data:image/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\r\n]+$`)

var interactiveElements = map[string]bool{
	"button": true, "input": true, "select": true,
}

var publicControlTypes = map[string]bool{
	"button": true, "text": true, "img": true, "switch": true,
	"input": true, "select": true, "container": true,
}

var allowedInputTypes = map[string]bool{
	"text": true, "checkbox": true, "number": true, "email": true,
	"search": true, "password": true, "range": true,
}

// Normalize validates a public declaration, loads local HTML/CSS files, and
// produces the stable control order consumed by every platform driver.
func Normalize(spec WindowSpec, baseDir string) (WindowSpec, error) {
	spec.ID = strings.TrimSpace(spec.ID)
	if !publicIDPattern.MatchString(spec.ID) {
		return WindowSpec{}, invalidSpec("window id must match ^[A-Za-z][A-Za-z0-9_-]{0,63}$")
	}
	if spec.Controls != nil {
		return WindowSpec{}, invalidSpec("controls is derived and cannot be declared")
	}
	if spec.Toolbar != nil {
		return normalizeToolbarWindow(spec)
	}
	if spec.Kind == "" {
		spec.Kind = "normal"
	}
	if spec.Kind != "normal" && spec.Kind != "floating" {
		return WindowSpec{}, invalidSpec("window kind must be normal or floating")
	}
	if spec.Theme == "" {
		spec.Theme = "system"
	}
	if spec.Theme != "system" && spec.Theme != "dark" {
		return WindowSpec{}, &Error{Code: CodeUnsupportedCapability, Operation: "createWindow", Capability: "theme", Message: "custom UI v1 supports system or dark themes"}
	}
	if !validBounds(spec.Bounds) {
		return WindowSpec{}, invalidSpec("window bounds must contain finite coordinates and positive finite width and height")
	}
	if spec.Content.Assets != nil {
		return WindowSpec{}, invalidSpec("content.assets is not supported in custom UI v1; use relative img src paths under basePath")
	}

	fileSet := strings.TrimSpace(spec.Content.File) != ""
	htmlSet := strings.TrimSpace(spec.Content.HTML) != ""
	if fileSet == htmlSet {
		return WindowSpec{}, invalidSpec("content requires exactly one of file or html")
	}
	if baseDir == "" {
		baseDir = "."
	}
	rootDir, err := canonicalDirectory(baseDir)
	if err != nil {
		return WindowSpec{}, invalidSpec("script base directory is invalid: " + err.Error())
	}
	if fileSet {
		path, err := resolveContainedPath(rootDir, spec.Content.File, false)
		if err != nil {
			return WindowSpec{}, invalidSpec("content.file must stay within the script directory: " + err.Error())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", Message: "read HTML content", Cause: err}
		}
		spec.Content.HTML = string(data)
		spec.Content.File = path
		if spec.Content.BasePath == "" {
			spec.Content.BasePath = filepath.Dir(path)
		}
	} else if spec.Content.BasePath == "" {
		spec.Content.BasePath = rootDir
	}
	if strings.TrimSpace(spec.Content.CSSFile) != "" {
		path, err := resolveContainedPath(rootDir, spec.Content.CSSFile, false)
		if err != nil {
			return WindowSpec{}, invalidSpec("content.cssFile must stay within the script directory: " + err.Error())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", Message: "read CSS content", Cause: err}
		}
		spec.Content.CSS += "\n" + string(data)
		spec.Content.CSSFile = path
	}
	basePath, err := resolveContainedPath(rootDir, spec.Content.BasePath, true)
	if err != nil {
		return WindowSpec{}, invalidSpec("content.basePath must stay within the script directory: " + err.Error())
	}
	spec.Content.BasePath = basePath
	if err := validateCSS(spec.Content.CSS); err != nil {
		return WindowSpec{}, err
	}

	controls, err := inspectHTML(spec.Content.HTML, basePath)
	if err != nil {
		return WindowSpec{}, err
	}
	spec.Controls = controls
	return spec, nil
}

func normalizeToolbarWindow(spec WindowSpec) (WindowSpec, error) {
	if spec.Kind != "" && spec.Kind != "floating" {
		return WindowSpec{}, invalidSpec("native toolbar window kind must be floating")
	}
	spec.Kind = "floating"
	if spec.Theme != "" && spec.Theme != "dark" {
		return WindowSpec{}, &Error{Code: CodeUnsupportedCapability, Operation: "createWindow", Capability: "theme", Message: "FloatingWindow v1 supports only the dark theme"}
	}
	spec.Theme = "dark"
	if !finiteNumber(spec.Bounds.X) || !finiteNumber(spec.Bounds.Y) {
		return WindowSpec{}, invalidSpec("native toolbar position must contain finite x and y")
	}
	if spec.Content.File != "" || spec.Content.HTML != "" || spec.Content.CSSFile != "" ||
		spec.Content.CSS != "" || spec.Content.BasePath != "" || spec.Content.Assets != nil {
		return WindowSpec{}, invalidSpec("native toolbar declarations cannot contain HTML, CSS, assets, URLs, or paths")
	}
	declaration := *spec.Toolbar
	if declaration.SchemaVersion != toolbar.SchemaVersion {
		return WindowSpec{}, invalidSpec("native toolbar schemaVersion is unsupported")
	}
	if declaration.Orientation == "" {
		declaration.Orientation = toolbar.OrientationHorizontal
	}
	if !toolbar.IsValidOrientation(declaration.Orientation) {
		return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", Capability: "orientation", Message: "native toolbar orientation must be horizontal or vertical"}
	}
	maxButtons := toolbar.MaxButtonsForOrientation(declaration.Orientation)
	if len(declaration.Buttons) < toolbar.MinButtons || len(declaration.Buttons) > maxButtons {
		return WindowSpec{}, invalidSpec(fmt.Sprintf("native %s toolbar requires between 1 and %d buttons", declaration.Orientation, maxButtons))
	}
	if declaration.Revision == 0 {
		return WindowSpec{}, invalidSpec("native toolbar revision must be positive")
	}
	seen := make(map[string]struct{}, len(declaration.Buttons))
	controls := make([]Control, 0, len(declaration.Buttons))
	buttons := make([]toolbar.ButtonSpec, len(declaration.Buttons))
	for index, button := range declaration.Buttons {
		if !publicIDPattern.MatchString(button.ID) {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", TargetID: button.ID, Capability: "button", Message: "toolbar button id is invalid"}
		}
		if _, exists := seen[button.ID]; exists {
			return WindowSpec{}, &Error{Code: CodeDuplicateID, Operation: "createWindow", TargetID: button.ID, Capability: "button", Message: "duplicate toolbar button id"}
		}
		seen[button.ID] = struct{}{}
		if strings.TrimSpace(button.Label) == "" || utf8.RuneCountInString(button.Label) > 60 {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", TargetID: button.ID, Capability: "label", Message: "toolbar button label must contain 1 to 60 Unicode characters"}
		}
		if _, ok := toolbar.IconPresentationFor(button.Icon); !ok {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", TargetID: button.ID, Capability: "icon", Message: "unknown built-in toolbar icon " + button.Icon}
		}
		if button.State.Revision == 0 || button.State.Revision > declaration.Revision {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", TargetID: button.ID, Capability: "revision", Message: "toolbar button revision is invalid"}
		}
		if len(button.State.Error) > 2048 {
			return WindowSpec{}, &Error{Code: CodeInvalidSpec, Operation: "createWindow", TargetID: button.ID, Capability: "state", Message: "toolbar button error is too long"}
		}
		buttons[index] = button
		controls = append(controls, Control{ID: button.ID, Type: "button", Order: index})
	}
	declaration.Buttons = buttons
	spec.Toolbar = &declaration
	spec.Controls = controls
	// The native host owns the real outer dimensions. A positive placeholder
	// keeps the generic window transport valid until native create readback.
	spec.Bounds.Width, spec.Bounds.Height = 1, 1
	return spec, nil
}

func validBounds(bounds Bounds) bool {
	return finiteNumber(bounds.X) && finiteNumber(bounds.Y) &&
		finiteNumber(bounds.Width) && finiteNumber(bounds.Height) &&
		bounds.Width > 0 && bounds.Height > 0
}

func finiteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func canonicalDirectory(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		path = "."
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	realPath, err := filepath.EvalSymlinks(absPath)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(realPath)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a directory", path)
	}
	return realPath, nil
}

func resolveContainedPath(root, path string, wantDirectory bool) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		trimmed = root
	}
	candidate := filepath.Clean(trimmed)
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}
	realCandidate, err := filepath.EvalSymlinks(absCandidate)
	if err != nil {
		return "", err
	}
	if err := ensureContained(root, realCandidate); err != nil {
		return "", err
	}
	info, err := os.Stat(realCandidate)
	if err != nil {
		return "", err
	}
	if wantDirectory && !info.IsDir() {
		return "", fmt.Errorf("%s is not a directory", path)
	}
	if !wantDirectory && !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s is not a regular file", path)
	}
	return realCandidate, nil
}

func ensureContained(root, candidate string) error {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return fmt.Errorf("path escapes %s", root)
	}
	return nil
}

func inspectHTML(source, basePath string) ([]Control, error) {
	doc, err := html.Parse(strings.NewReader(source))
	if err != nil {
		return nil, invalidSpec("HTML could not be parsed: " + err.Error())
	}
	ids := map[string]struct{}{}
	controls := make([]Control, 0)
	var visit func(*html.Node) error
	visit = func(node *html.Node) error {
		if node.Type == html.ElementNode {
			tag := strings.ToLower(node.Data)
			if tag == "script" {
				return invalidSpec("HTML business scripts are not allowed")
			}
			if !allowedElements[tag] {
				return invalidSpec("HTML element <" + tag + "> is not supported in custom UI v1")
			}
			id := ""
			dragRegion := false
			publicDragRegion := false
			if tag == "meta" {
				if len(node.Attr) != 1 || strings.ToLower(node.Attr[0].Key) != "charset" || !strings.EqualFold(strings.TrimSpace(node.Attr[0].Val), "utf-8") {
					return invalidSpec("only <meta charset=\"utf-8\"> is allowed")
				}
			}
			for _, attribute := range node.Attr {
				name := strings.ToLower(attribute.Key)
				value := strings.TrimSpace(attribute.Val)
				if strings.HasPrefix(name, "on") {
					return invalidSpec("inline HTML event handlers are not allowed")
				}
				if name == "autofocus" {
					return invalidSpec("autofocus is not allowed; floating windows must not take focus when shown")
				}
				if name == "srcset" {
					return invalidSpec("srcset is not supported; use one validated local img src")
				}
				if tag == "select" && name == "multiple" {
					return invalidSpec("multiple select is not supported in custom UI v1")
				}
				if tag == "input" && name == "type" {
					inputType := strings.ToLower(value)
					if !allowedInputTypes[inputType] {
						return invalidSpec("input type " + inputType + " is not supported in custom UI v1")
					}
				}
				if name == "id" {
					id = value
				}
				if name == "data-clawdesk-drag" || name == "data-opendesk-drag" {
					if value != "" && !strings.EqualFold(value, "true") {
						return invalidSpec("custom UI drag attributes accept only an empty value or true")
					}
					dragRegion = true
					publicDragRegion = publicDragRegion || name == "data-clawdesk-drag"
				}
				if name == "style" {
					if err := validateCSS(value); err != nil {
						return err
					}
				}
				if name == "src" || name == "href" || name == "poster" || name == "action" || name == "formaction" {
					if tag != "img" || name != "src" {
						return invalidSpec("only validated img src resources are supported")
					}
					if err := validateResourceReference(value, basePath); err != nil {
						return err
					}
				}
			}
			if tag == "style" {
				for child := node.FirstChild; child != nil; child = child.NextSibling {
					if child.Type == html.TextNode {
						if err := validateCSS(child.Data); err != nil {
							return err
						}
					}
				}
			}
			if interactiveElements[tag] && id == "" {
				return invalidSpec(fmt.Sprintf("interactive <%s> requires a stable id", tag))
			}
			if dragRegion && controlType(node) != "container" {
				return invalidSpec("custom UI drag regions require a supported container element")
			}
			if publicDragRegion && id == "" {
				return invalidSpec("data-clawdesk-drag regions require a stable id")
			}
			if id != "" {
				if !publicIDPattern.MatchString(id) {
					return invalidSpec("control id " + id + " is invalid")
				}
				controlType := controlType(node)
				if !publicControlTypes[controlType] {
					return invalidSpec(fmt.Sprintf("HTML element <%s> cannot declare a public control id in custom UI v1", tag))
				}
				if _, exists := ids[id]; exists {
					return &Error{Code: CodeDuplicateID, Operation: "createWindow", TargetID: id, Message: "duplicate control id " + id}
				}
				ids[id] = struct{}{}
				controls = append(controls, Control{ID: id, Type: controlType, Order: len(controls)})
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if err := visit(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err := visit(doc); err != nil {
		return nil, err
	}
	return controls, nil
}

func validateResourceReference(value, basePath string) error {
	trimmed := strings.TrimSpace(value)
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "data:") {
		if safeDataImagePattern.MatchString(trimmed) {
			return nil
		}
		return invalidSpec("only base64 PNG, JPEG, GIF, and WebP data images are allowed")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || strings.HasPrefix(trimmed, "//") {
		return invalidSpec("remote, file, data document, and javascript resources are not allowed")
	}
	resourcePath, err := url.PathUnescape(parsed.EscapedPath())
	if err != nil || strings.TrimSpace(resourcePath) == "" {
		return invalidSpec("image source path is invalid")
	}
	extension := strings.ToLower(filepath.Ext(resourcePath))
	switch extension {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico":
	default:
		return invalidSpec("image source type is not supported in custom UI v1")
	}
	if _, err := resolveContainedPath(basePath, resourcePath, false); err != nil {
		return invalidSpec("image source must stay within content.basePath: " + err.Error())
	}
	return nil
}

func validateCSS(source string) error {
	withoutComments := cssCommentPattern.ReplaceAllString(source, "")
	lower := strings.ToLower(withoutComments)
	if strings.Contains(lower, "</style") || strings.Contains(source, `\`) {
		return invalidSpec("CSS closing style tags and escape sequences are not allowed")
	}
	if cssImportPattern.MatchString(withoutComments) || cssURLPattern.MatchString(withoutComments) || cssImageSetPattern.MatchString(withoutComments) {
		return invalidSpec("CSS imports, url(), and image-set() resources are not supported in custom UI v1")
	}
	return nil
}

func controlType(node *html.Node) string {
	tag := strings.ToLower(node.Data)
	if tag == "div" || tag == "section" || tag == "main" || tag == "header" || tag == "footer" {
		return "container"
	}
	if tag != "input" {
		if tag == "span" || tag == "p" || tag == "label" || tag == "strong" || tag == "em" {
			return "text"
		}
		return tag
	}
	typeName := "text"
	role := ""
	for _, attribute := range node.Attr {
		switch strings.ToLower(attribute.Key) {
		case "type":
			typeName = strings.ToLower(strings.TrimSpace(attribute.Val))
		case "role":
			role = strings.ToLower(strings.TrimSpace(attribute.Val))
		}
	}
	if typeName == "checkbox" && role == "switch" {
		return "switch"
	}
	return "input"
}

func validateControlPatch(control Control, patch ControlPatch, basePath string) error {
	if patch.Text == nil && patch.Icon == nil && patch.IconPresentation == nil && patch.Value == nil && patch.Checked == nil && patch.Active == nil &&
		patch.Disabled == nil && patch.Busy == nil && patch.Error == nil && patch.Visible == nil &&
		patch.Classes == nil && patch.Source == nil && patch.Options == nil {
		return invalidSpec("control patch must change at least one supported property")
	}
	if patch.Text != nil && control.Type != "button" && control.Type != "text" {
		return unsupportedControlPatch(control, "text")
	}
	if patch.Value != nil && control.Type != "input" && control.Type != "select" {
		return unsupportedControlPatch(control, "value")
	}
	if patch.Checked != nil && control.Type != "input" && control.Type != "switch" {
		return unsupportedControlPatch(control, "checked")
	}
	if patch.Disabled != nil && control.Type != "button" && control.Type != "input" && control.Type != "select" && control.Type != "switch" {
		return unsupportedControlPatch(control, "disabled")
	}
	if patch.Icon != nil {
		if control.Type != "button" {
			return unsupportedControlPatch(control, "icon")
		}
		if _, ok := ToolbarIconToken(*patch.Icon); !ok {
			return &Error{Code: CodeInvalidSpec, Operation: "updateControl", TargetID: control.ID, Capability: "icon", Message: "unknown built-in toolbar icon " + *patch.Icon}
		}
	}
	if patch.IconPresentation != nil {
		if control.Type != "button" || patch.Icon == nil {
			return &Error{Code: CodeInvalidSpec, Operation: "updateControl", TargetID: control.ID, Capability: "icon", Message: "icon presentation requires a trusted button icon update"}
		}
		expected, ok := ToolbarIconPresentationFor(*patch.Icon)
		if !ok || expected != *patch.IconPresentation {
			return &Error{Code: CodeInvalidSpec, Operation: "updateControl", TargetID: control.ID, Capability: "icon", Message: "icon presentation does not match the trusted toolbar registry"}
		}
	}
	if patch.Active != nil && control.Type != "button" {
		return unsupportedControlPatch(control, "active")
	}
	if patch.Busy != nil && control.Type != "button" {
		return unsupportedControlPatch(control, "busy")
	}
	if patch.Error != nil {
		if control.Type != "button" {
			return unsupportedControlPatch(control, "error")
		}
		if len(*patch.Error) > 2048 {
			return invalidSpec("button error state must contain at most 2048 bytes")
		}
	}
	if patch.Source != nil {
		if control.Type != "img" {
			return unsupportedControlPatch(control, "source")
		}
		if err := validateResourceReference(*patch.Source, basePath); err != nil {
			return err
		}
	}
	if patch.Options != nil && control.Type != "select" {
		return unsupportedControlPatch(control, "options")
	}
	return nil
}

func unsupportedControlPatch(control Control, capability string) error {
	return &Error{
		Code:       CodeUnsupportedCapability,
		Operation:  "updateControl",
		TargetID:   control.ID,
		Capability: capability,
		Message:    fmt.Sprintf("%s controls do not support %s updates", control.Type, capability),
	}
}
