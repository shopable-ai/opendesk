package measurementshortcut

import "testing"

func TestGlobalShortcutContract(t *testing.T) {
	if got, want := GlobalShortcutAccelerator, "CommandOrControl+Shift+M"; got != want {
		t.Fatalf("GlobalShortcutAccelerator = %q, want %q", got, want)
	}

	for _, tc := range []struct {
		goos string
		want string
	}{
		{goos: "darwin", want: "⌘⇧M"},
		{goos: "windows", want: "Ctrl+Shift+M"},
		{goos: "linux", want: ""},
	} {
		t.Run(tc.goos, func(t *testing.T) {
			if got := GlobalShortcutLabel(tc.goos); got != tc.want {
				t.Fatalf("GlobalShortcutLabel(%q) = %q, want %q", tc.goos, got, tc.want)
			}
		})
	}
}
