package customui

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

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
var cssImportPattern = regexp.MustCompile(`(?i)@\s*import\b`)
var cssCommentPattern = regexp.MustCompile(`(?s)/\*.*?\*/`)
var safeDataImagePattern = regexp.MustCompile(`(?i)^data:image/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\r\n]+$`)

var interactiveElements = map[string]bool{
	"button": true, "input": true, "select": true,
}

// Normalize validates a public declaration, loads local HTML/CSS files, and
// produces the stable control order consumed by every platform driver.
func Normalize(spec WindowSpec, baseDir string) (WindowSpec, error) {
	spec.ID = strings.TrimSpace(spec.ID)
	if !publicIDPattern.MatchString(spec.ID) {
		return WindowSpec{}, invalidSpec("window id must match ^[A-Za-z][A-Za-z0-9_-]{0,63}$")
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
	if spec.Theme != "system" && spec.Theme != "light" && spec.Theme != "dark" {
		return WindowSpec{}, invalidSpec("theme must be system, light, or dark")
	}
	if spec.Bounds.Width <= 0 || spec.Bounds.Height <= 0 {
		return WindowSpec{}, invalidSpec("window bounds width and height must be positive")
	}
	if len(spec.Content.Assets) != 0 {
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
				if name == "id" {
					id = value
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
			if id != "" {
				if !publicIDPattern.MatchString(id) {
					return invalidSpec("control id " + id + " is invalid")
				}
				if _, exists := ids[id]; exists {
					return &Error{Code: CodeDuplicateID, Operation: "createWindow", TargetID: id, Message: "duplicate control id " + id}
				}
				ids[id] = struct{}{}
				controls = append(controls, Control{ID: id, Type: controlType(node), Order: len(controls)})
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
	if cssImportPattern.MatchString(withoutComments) || cssURLPattern.MatchString(withoutComments) {
		return invalidSpec("CSS imports and url() resources are not supported in custom UI v1")
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
	if patch.Text == nil && patch.Value == nil && patch.Checked == nil && patch.Disabled == nil && patch.Visible == nil && patch.Classes == nil && patch.Source == nil && patch.Options == nil {
		return invalidSpec("control patch must change at least one supported property")
	}
	if patch.Text != nil && control.Type != "button" && control.Type != "text" && control.Type != "container" {
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
