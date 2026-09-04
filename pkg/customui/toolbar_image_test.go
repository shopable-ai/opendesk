package customui

import (
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	mathrand "math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"opendesk/pkg/customui/toolbar"
)

func writeToolbarTestImage(t *testing.T, path, format string, width, height int) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	value := image.NewRGBA(image.Rect(0, 0, width, height))
	value.Set(0, 0, color.RGBA{R: 220, G: 70, B: 40, A: 255})
	if format == "jpeg" {
		err = jpeg.Encode(file, value, &jpeg.Options{Quality: 85})
	} else {
		err = png.Encode(file, value)
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatal(err)
	}
}

func writeNoisyToolbarTestPNG(t *testing.T, path string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	value := image.NewNRGBA(image.Rect(0, 0, 1024, 96))
	if _, err = mathrand.New(mathrand.NewSource(1)).Read(value.Pix); err == nil {
		err = png.Encode(file, value)
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatal(err)
	}
}

func TestValidIconImageRejectsForgedRasterMetadata(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "valid.png")
	writeToolbarTestImage(t, path, "png", 24, 12)
	icon, err := LoadToolbarIconImage(root, "valid.png", "")
	if err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(*toolbar.IconImage){
		"media type": func(value *toolbar.IconImage) { value.MediaType = "image/jpeg" },
		"width":      func(value *toolbar.IconImage) { value.PixelWidth++ },
		"data": func(value *toolbar.IconImage) {
			value.DataBase64 = base64.StdEncoding.EncodeToString(make([]byte, value.ByteLength))
		},
	} {
		t.Run(name, func(t *testing.T) {
			copy := *icon
			mutate(&copy)
			if toolbar.ValidIconImage(&copy) {
				t.Fatalf("ValidIconImage accepted forged %s", name)
			}
		})
	}
}

func TestToolbarIconImageWirePayloadOmitsSourcePath(t *testing.T) {
	root := t.TempDir()
	const source = "private-brand-icon.png"
	writeToolbarTestImage(t, filepath.Join(root, source), "png", 24, 12)
	icon, err := LoadToolbarIconImage(root, source, "")
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(toolbar.ButtonSpec{ID: "brand", Label: "Brand", IconImage: icon})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), source) || strings.Contains(string(payload), root) {
		t.Fatalf("toolbar wire payload leaked caller path: %s", payload)
	}
	var wire map[string]any
	if err := json.Unmarshal(payload, &wire); err != nil {
		t.Fatal(err)
	}
	imageWire, ok := wire["iconImage"].(map[string]any)
	if !ok || imageWire["dataBase64"] == "" || imageWire["mediaType"] != "image/png" || imageWire["renderingMode"] != toolbar.IconRenderingOriginal {
		t.Fatalf("toolbar image wire payload = %#v", wire["iconImage"])
	}
	for _, forbidden := range []string{"source", "path", "file", "url"} {
		if _, exists := imageWire[forbidden]; exists {
			t.Fatalf("toolbar image wire payload exposes %q: %#v", forbidden, imageWire)
		}
	}
}

func TestNormalizeToolbarWindowRejectsCustomImageAggregate(t *testing.T) {
	root := t.TempDir()
	writeNoisyToolbarTestPNG(t, filepath.Join(root, "noisy.png"))
	icon, err := LoadToolbarIconImage(root, "noisy.png", "")
	if err != nil {
		t.Fatal(err)
	}
	count := toolbar.MaxToolbarImageBytes/icon.ByteLength + 1
	if count > toolbar.MaxButtons {
		t.Fatalf("test fixture is too small to exceed aggregate limit with %d buttons: %d bytes", toolbar.MaxButtons, icon.ByteLength)
	}
	items := make([]toolbar.ToolbarItemSpec, 0, count)
	for index := 0; index < count; index++ {
		copy := *icon
		button := toolbar.ButtonSpec{
			ID: "image" + string(rune('A'+index)), Label: "Image", IconImage: &copy,
			State: toolbar.ButtonState{Revision: uint64(index + 1)},
		}
		items = append(items, toolbar.ButtonItem(button))
	}
	spec := WindowSpec{
		ID: "aggregate", Bounds: Bounds{},
		Toolbar: &toolbar.ToolbarSpec{
			SchemaVersion: toolbar.SchemaVersion, Revision: uint64(count),
			Orientation: toolbar.OrientationHorizontal, MaxColumns: toolbar.MaxColumns, Items: items,
		},
	}
	_, err = Normalize(spec, root)
	if err == nil || !strings.Contains(err.Error(), "window limit") {
		t.Fatalf("Normalize aggregate error = %v, want window limit", err)
	}
}

func TestLoadToolbarIconImageAcceptsContainedPNGAndJPEG(t *testing.T) {
	root := t.TempDir()
	writeToolbarTestImage(t, filepath.Join(root, "brand.png"), "png", 48, 24)
	writeToolbarTestImage(t, filepath.Join(root, "photo.jpg"), "jpeg", 32, 18)

	pngIcon, err := LoadToolbarIconImage(root, "brand.png", "")
	if err != nil {
		t.Fatal(err)
	}
	if pngIcon.Source != "brand.png" || pngIcon.MediaType != "image/png" || pngIcon.PixelWidth != 48 || pngIcon.PixelHeight != 24 || pngIcon.RenderingMode != toolbar.IconRenderingOriginal || !toolbar.ValidIconImage(pngIcon) {
		t.Fatalf("unexpected PNG icon: %#v", pngIcon)
	}

	jpegPath := filepath.Join(root, "photo.jpg")
	jpegIcon, err := LoadToolbarIconImage(root, jpegPath, toolbar.IconRenderingTemplate)
	if err != nil {
		t.Fatal(err)
	}
	if jpegIcon.Source != jpegPath || jpegIcon.MediaType != "image/jpeg" || jpegIcon.PixelWidth != 32 || jpegIcon.PixelHeight != 18 || jpegIcon.RenderingMode != toolbar.IconRenderingTemplate || !toolbar.ValidIconImage(jpegIcon) {
		t.Fatalf("unexpected JPEG icon: %#v", jpegIcon)
	}
}

func TestLoadToolbarIconImageRejectsUnsafeOrInvalidSources(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	writeToolbarTestImage(t, filepath.Join(root, "valid.png"), "png", 32, 32)
	writeToolbarTestImage(t, filepath.Join(root, "too-wide.png"), "png", toolbar.MaxIconImageDimension+1, 1)
	writeToolbarTestImage(t, filepath.Join(root, "mismatch.jpg"), "png", 32, 32)
	writeToolbarTestImage(t, filepath.Join(outside, "outside.png"), "png", 32, 32)
	if err := os.WriteFile(filepath.Join(root, "oversized.png"), make([]byte, toolbar.MaxIconImageBytes+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "outside.png"), filepath.Join(root, "escape.png")); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		path string
		mode string
		want string
	}{
		{name: "remote URL", path: "https://example.com/icon.png", want: "local file path"},
		{name: "absolute escape", path: filepath.Join(outside, "outside.png"), want: "stay within"},
		{name: "relative escape", path: filepath.Join("..", filepath.Base(outside), "outside.png"), want: "stay within"},
		{name: "symlink escape", path: "escape.png", want: "stay within"},
		{name: "unsupported extension", path: "valid.svg", want: "only PNG and JPEG"},
		{name: "extension mismatch", path: "mismatch.jpg", want: "do not match"},
		{name: "oversized bytes", path: "oversized.png", want: "1-524288 bytes"},
		{name: "oversized dimension", path: "too-wide.png", want: "between 1x1"},
		{name: "invalid rendering mode", path: "valid.png", mode: "multicolor", want: "renderingMode"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, err := LoadToolbarIconImage(root, test.path, test.mode)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("LoadToolbarIconImage(%q, %q) error = %v, want substring %q", test.path, test.mode, err, test.want)
			}
		})
	}
}
