package customui

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/url"
	"opendesk/pkg/customui/toolbar"
	"os"
	"path/filepath"
	"strings"
)

// LoadToolbarIconImage resolves a JavaScript-declared icon path against the
// execution's script directory, validates the raster payload, and returns the
// path-free wire representation consumed by the native host.
func LoadToolbarIconImage(baseDir, source, renderingMode string) (*toolbar.IconImage, error) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" || trimmed != source {
		return nil, invalidSpec("custom icon path must be a non-empty string without surrounding whitespace")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || parsed.RawQuery != "" || parsed.Fragment != "" || strings.HasPrefix(trimmed, "//") {
		return nil, invalidSpec("custom icon path must be a local file path, not a URL")
	}
	resourcePath, err := url.PathUnescape(parsed.EscapedPath())
	if err != nil || strings.TrimSpace(resourcePath) == "" {
		return nil, invalidSpec("custom icon path is invalid")
	}
	extension := strings.ToLower(filepath.Ext(resourcePath))
	if extension != ".png" && extension != ".jpg" && extension != ".jpeg" {
		return nil, invalidSpec("custom toolbar icons support only PNG and JPEG files")
	}
	if renderingMode == "" {
		renderingMode = toolbar.IconRenderingOriginal
	}
	if renderingMode != toolbar.IconRenderingOriginal && renderingMode != toolbar.IconRenderingTemplate {
		return nil, invalidSpec(`custom icon renderingMode must be "original" or "template"`)
	}
	root, err := canonicalDirectory(baseDir)
	if err != nil {
		return nil, invalidSpec("script base directory is invalid: " + err.Error())
	}
	path, err := resolveContainedPath(root, resourcePath, false)
	if err != nil {
		return nil, invalidSpec("custom icon path must stay within the script directory: " + err.Error())
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, invalidSpec("custom icon file is unavailable: " + err.Error())
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, invalidSpec("inspect custom icon file: " + err.Error())
	}
	if !info.Mode().IsRegular() {
		return nil, invalidSpec("custom icon path must resolve to a regular file")
	}
	if info.Size() < 1 || info.Size() > toolbar.MaxIconImageBytes {
		return nil, invalidSpec(fmt.Sprintf("custom icon file must contain 1-%d bytes", toolbar.MaxIconImageBytes))
	}
	data, err := io.ReadAll(io.LimitReader(file, toolbar.MaxIconImageBytes+1))
	if err != nil {
		return nil, invalidSpec("read custom icon file: " + err.Error())
	}
	if len(data) < 1 || len(data) > toolbar.MaxIconImageBytes {
		return nil, invalidSpec(fmt.Sprintf("custom icon file must contain 1-%d bytes", toolbar.MaxIconImageBytes))
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, invalidSpec("custom icon file is not a valid PNG or JPEG image")
	}
	wantFormat := "png"
	mediaType := "image/png"
	if extension == ".jpg" || extension == ".jpeg" {
		wantFormat, mediaType = "jpeg", "image/jpeg"
	}
	if format != wantFormat {
		return nil, invalidSpec("custom icon contents do not match the file extension")
	}
	if config.Width < 1 || config.Width > toolbar.MaxIconImageDimension || config.Height < 1 || config.Height > toolbar.MaxIconImageDimension {
		return nil, invalidSpec(fmt.Sprintf("custom icon dimensions must be between 1x1 and %dx%d pixels", toolbar.MaxIconImageDimension, toolbar.MaxIconImageDimension))
	}
	value := &toolbar.IconImage{
		Source: trimmed, MediaType: mediaType, DataBase64: base64.StdEncoding.EncodeToString(data),
		ByteLength: len(data), PixelWidth: config.Width, PixelHeight: config.Height, RenderingMode: renderingMode,
	}
	if !toolbar.ValidIconImage(value) {
		return nil, invalidSpec("custom icon payload failed validation")
	}
	return value, nil
}
