package automation

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/color"
	"image/png"
	"os"
	"reflect"
	"testing"

	"github.com/dop251/goja"
)

type fakePageBinaryRoundtrip struct {
	pngBytes []byte
}

func (p *fakePageBinaryRoundtrip) Screenshot(options interface{}) ([]byte, error) {
	return append([]byte(nil), p.pngBytes...), nil
}

func TestJSArrayBufferCanBeSavedAsPNGAndVerified(t *testing.T) {
	vm := goja.New()
	outDir := t.TempDir()
	outPath := outDir + "/roundtrip.png"

	sourcePNG := makeRoundtripPNG(t)
	page := &fakePageBinaryRoundtrip{pngBytes: sourcePNG}
	fileSystem := NewFileSystem()

	// Test adapters are deliberately explicit. AutoMapObject only exports the
	// documented production types, so a test-only fake must not gain a JS API
	// merely because it has an exported Go method. Use the production method
	// wrapper to retain its ArrayBuffer conversion contract.
	pageValue := reflect.ValueOf(page)
	screenshotMethod, ok := pageValue.Type().MethodByName("Screenshot")
	if !ok {
		t.Fatal("fake screenshot method is missing")
	}
	vm.Set("page", map[string]interface{}{
		"screenshot": createJSMethodWrapper(vm, pageValue, screenshotMethod),
	})
	vm.Set("File", AutoMapObject(vm, fileSystem))
	vm.Set("outPath", outPath)

	script := `
		const raw = page.screenshot({ returnType: "bytes" });
		const bytes = new Uint8Array(raw);
		File.writeBytes(outPath, bytes);
		({
		  byteLength: raw.byteLength,
		  firstBytes: Array.from(bytes.slice(0, 8))
		});
	`

	value, err := vm.RunString(script)
	if err != nil {
		t.Fatalf("RunString returned error: %v", err)
	}

	result, ok := value.Export().(map[string]interface{})
	if !ok {
		t.Fatalf("unexpected JS result type: %T", value.Export())
	}
	if got := result["byteLength"]; got != int64(len(sourcePNG)) {
		t.Fatalf("unexpected byteLength: got=%v want=%d", got, len(sourcePNG))
	}

	written, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read roundtrip file: %v", err)
	}
	if !bytes.Equal(sourcePNG, written) {
		t.Fatalf("roundtrip bytes mismatch: src=%s dst=%s", sha256Hex(sourcePNG), sha256Hex(written))
	}

	cfg, err := png.DecodeConfig(bytes.NewReader(written))
	if err != nil {
		t.Fatalf("failed to decode written png: %v", err)
	}
	if cfg.Width != 3 || cfg.Height != 2 {
		t.Fatalf("unexpected png size: %dx%d", cfg.Width, cfg.Height)
	}
}

func makeRoundtripPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	img.Set(1, 0, color.RGBA{G: 255, A: 255})
	img.Set(2, 0, color.RGBA{B: 255, A: 255})
	img.Set(0, 1, color.RGBA{R: 255, G: 255, A: 255})
	img.Set(1, 1, color.RGBA{G: 255, B: 255, A: 255})
	img.Set(2, 1, color.RGBA{R: 255, B: 255, A: 255})

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode roundtrip png: %v", err)
	}
	return buf.Bytes()
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
