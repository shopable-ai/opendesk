package automation

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRepositoryNotificationIconUsesFlatPublicIconsPath(t *testing.T) {
	const want = "public/icons/opendesk-notification.png"
	if repositoryNotificationIcon != want {
		t.Fatalf("repositoryNotificationIcon = %q, want %q", repositoryNotificationIcon, want)
	}
}

func writeNotificationIconFixture(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("png fixture"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestFindNotificationIconPrefersPackagedResource(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "OpenDesk", "opendesk.exe")
	packaged := filepath.Join(filepath.Dir(executable), "resources", "opendesk-notification.png")
	repository := filepath.Join(root, repositoryNotificationIcon)
	writeNotificationIconFixture(t, packaged)
	writeNotificationIconFixture(t, repository)

	if got := findNotificationIcon(executable, root); got != packaged {
		t.Fatalf("findNotificationIcon() = %q, want packaged resource %q", got, packaged)
	}
}

func TestFindNotificationIconFallsBackToRepositoryPublicAsset(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "dist", "opendesk")
	want := filepath.Join(root, repositoryNotificationIcon)
	writeNotificationIconFixture(t, want)

	if got := findNotificationIcon(executable, root); got != want {
		t.Fatalf("findNotificationIcon() = %q, want repository asset %q", got, want)
	}
}

func TestFindNotificationIconReturnsEmptyWhenUnavailable(t *testing.T) {
	root := t.TempDir()
	if got := findNotificationIcon(filepath.Join(root, "opendesk"), root); got != "" {
		t.Fatalf("findNotificationIcon() = %q, want empty path", got)
	}
}
