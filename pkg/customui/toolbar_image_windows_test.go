//go:build windows

package customui

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlatformToolbarLocalPathWindowsSyntax(t *testing.T) {
	cases := []struct {
		name       string
		source     string
		want       string
		recognized bool
		wantErr    string
	}{
		{name: "C drive absolute", source: `C:\dir\icon.png`, want: `C:\dir\icon.png`, recognized: true},
		{name: "D drive slash absolute", source: `D:/dir/icon.jpg`, want: `D:\dir\icon.jpg`, recognized: true},
		{name: "UNC backslash", source: `\\server\share\icon.png`, want: `\\server\share\icon.png`, recognized: true},
		{name: "UNC slash", source: `//server/share/icon.png`, want: `\\server\share\icon.png`, recognized: true},
		{name: "extended drive", source: `\\?\C:\dir\icon.png`, want: `C:\dir\icon.png`, recognized: true},
		{name: "extended UNC", source: `\\?\UNC\server\share\icon.png`, want: `\\server\share\icon.png`, recognized: true},
		{name: "drive relative", source: `C:icon.png`, recognized: true, wantErr: "drive-relative"},
		{name: "device namespace", source: `\\.\C:\dir\icon.png`, recognized: true, wantErr: "device namespace"},
		{name: "HTTP URL", source: `https://example.com/icon.png`, recognized: false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			got, recognized, err := platformToolbarLocalPath(test.source)
			if recognized != test.recognized {
				t.Fatalf("recognized = %v, want %v", recognized, test.recognized)
			}
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("error = %v, want substring %q", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("path = %q, want %q", got, test.want)
			}
		})
	}
}

func TestLoadToolbarIconImageWindowsPathMatrix(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "图标 space")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "brand icon.png")
	writeToolbarTestImage(t, path, "png", 24, 12)

	valid := []struct {
		name   string
		source string
	}{
		{name: "drive absolute", source: path},
		{name: "slash drive absolute", source: strings.ReplaceAll(path, `\`, "/")},
		{name: "extended drive absolute", source: `\\?\` + path},
		{name: "relative backslash Unicode and spaces", source: filepath.Join("图标 space", "brand icon.png")},
		{name: "relative mixed separators", source: "图标 space/brand icon.png"},
	}
	for _, test := range valid {
		t.Run(test.name, func(t *testing.T) {
			icon, err := LoadToolbarIconImage(root, test.source, "")
			if err != nil {
				t.Fatal(err)
			}
			if icon.MediaType != "image/png" || icon.PixelWidth != 24 || icon.PixelHeight != 12 {
				t.Fatalf("unexpected icon: %#v", icon)
			}
		})
	}

	volume := filepath.VolumeName(root)
	if len(volume) < 2 || volume[1] != ':' {
		t.Fatalf("temporary directory is not on a drive-qualified path: %q", root)
	}
	invalid := []struct {
		name   string
		source string
		want   string
	}{
		{name: "drive relative", source: volume + "brand icon.png", want: "drive-relative"},
		{name: "query suffix", source: path + "?version=1", want: "only PNG and JPEG"},
		{name: "fragment suffix", source: path + "#fragment", want: "only PNG and JPEG"},
		{name: "ADS suffix", source: path + ":alternate", want: "only PNG and JPEG"},
		{name: "remote URL", source: "https://example.com/icon.png?version=1#fragment", want: "local file path"},
		{name: "UNC outside root", source: `\\server\share\icon.png`, want: "stay within"},
	}
	for _, test := range invalid {
		t.Run(test.name, func(t *testing.T) {
			_, err := LoadToolbarIconImage(root, test.source, "")
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func TestLoadToolbarIconImageRejectsWindowsJunctionEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	writeToolbarTestImage(t, filepath.Join(outside, "outside.png"), "png", 24, 12)
	junction := filepath.Join(root, "junction")
	output, err := exec.Command("cmd", "/c", "mklink", "/J", junction, outside).CombinedOutput()
	if err != nil {
		t.Fatalf("create junction: %v: %s", err, output)
	}
	_, err = LoadToolbarIconImage(root, filepath.Join("junction", "outside.png"), "")
	if err == nil || !strings.Contains(err.Error(), "stay within") {
		t.Fatalf("junction escape error = %v, want containment rejection", err)
	}
}
