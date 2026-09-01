//go:build windows

package nativeextension

import (
	"errors"
	"testing"
)

func TestWindowsCurrentUserDiscoveryRootUsesLocalAppDataKnownFolder(t *testing.T) {
	original := localAppDataKnownFolder
	t.Cleanup(func() { localAppDataKnownFolder = original })
	localAppDataKnownFolder = func() (string, error) {
		return `C:\Users\alice\AppData\Local`, nil
	}

	root, err := currentUserDiscoveryRoot("")
	if err != nil {
		t.Fatal(err)
	}
	if root != `C:\Users\alice\AppData\Local\OpenDesk\NativeExtensions` {
		t.Fatalf("current-user root = %q", root)
	}
}

func TestWindowsCurrentUserDiscoveryRootRejectsKnownFolderFailure(t *testing.T) {
	original := localAppDataKnownFolder
	t.Cleanup(func() { localAppDataKnownFolder = original })
	knownFolderFailure := errors.New("known folder unavailable")
	localAppDataKnownFolder = func() (string, error) {
		return "", knownFolderFailure
	}

	if _, err := currentUserDiscoveryRoot(""); !errors.Is(err, knownFolderFailure) {
		t.Fatalf("known-folder failure = %v, want %v", err, knownFolderFailure)
	}
}

func TestWindowsCurrentUserDiscoveryRootRejectsInvalidKnownFolderPath(t *testing.T) {
	original := localAppDataKnownFolder
	t.Cleanup(func() { localAppDataKnownFolder = original })
	localAppDataKnownFolder = func() (string, error) {
		return `relative\Local`, nil
	}

	if _, err := currentUserDiscoveryRoot(""); err == nil {
		t.Fatal("relative Known Folder path was accepted")
	}
}
