package customui

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTrustedFixedBytesAndContainment(t *testing.T) {
	root := t.TempDir()
	html := []byte("<script>window.React={};</script>")
	path := filepath.Join(root, "app.html")
	if err := os.WriteFile(path, html, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(html)
	input := TrustedFile{File: "app.html", SHA256: hex.EncodeToString(sum[:])}
	fixed, err := LoadTrustedContent(input, root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if fixed.HTML != string(html) {
		t.Fatal("snapshot changed")
	}
	if _, err = LoadTrustedContent(input, root); err == nil {
		t.Fatal("digest mismatch accepted")
	}
	for _, file := range []string{"../app.html", "https://example.org/app.html", ""} {
		input.File = file
		if _, err = LoadTrustedContent(input, root); err == nil {
			t.Fatalf("accepted %q", file)
		}
	}
}

func TestTrustedJSONLimitsAndNull(t *testing.T) {
	for _, data := range []string{`null`, `{"text":"</script>\\u2028","list":[true,1]}`} {
		if err := ValidateTrustedJSON([]byte(data)); err != nil {
			t.Fatal(err)
		}
	}
	for _, data := range []string{`NaN`, strings.Repeat("[", 34) + "0" + strings.Repeat("]", 34), `"` + strings.Repeat("a", 65536) + `"`, `[` + strings.Repeat("0,", 4096) + `0]`} {
		if err := ValidateTrustedJSON([]byte(data)); err == nil {
			t.Fatal("unbounded JSON accepted")
		}
	}
	data, err := json.Marshal(Event{Type: "message", Value: nil})
	if err != nil || !strings.Contains(string(data), `"value":null`) {
		t.Fatalf("null lost: %s %v", data, err)
	}
}

func TestTrustedNormalizeKeepsSeparateSurface(t *testing.T) {
	root := t.TempDir()
	spec := WindowSpec{ID: "trusted", Kind: "floating", Bounds: Bounds{Width: 380, Height: 480}, Trusted: &TrustedContent{HTML: "<script>window.React={}</script>"}}
	normalized, err := Normalize(spec, root)
	if err != nil || normalized.Kind != "floating" || normalized.Trusted.HTML != spec.Trusted.HTML || len(normalized.Controls) != 0 || normalized.Content.HTML != "" {
		t.Fatalf("trusted normalization: %+v %v", normalized, err)
	}
	spec.Content.HTML = "<div></div>"
	if _, err = Normalize(spec, root); err == nil {
		t.Fatal("mixed restricted/trusted content accepted")
	}
	spec.Trusted = nil
	spec.Content.HTML = "<script>window.React={}</script>"
	if _, err = Normalize(spec, root); err == nil {
		t.Fatal("ordinary window accepted scripts")
	}
}
