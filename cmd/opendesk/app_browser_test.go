//go:build darwin || linux

package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"opendesk/internal/browserbridge"
)

func TestProductStartupPreservesExistingExecutableAndCredentials(t *testing.T) {
	home, err := os.MkdirTemp("/tmp", "od-app-browser-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(home) })
	t.Setenv("HOME", home)
	executable := filepath.Join(home, "trusted-installed-opendesk")
	if err = os.WriteFile(executable, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err = browserbridge.Setup("abcdefghijklmnopabcdefghijklmnop", "chrome", "", executable); err != nil {
		t.Fatal(err)
	}
	before, err := browserbridge.Load()
	if err != nil {
		t.Fatal(err)
	}
	prepareAppBrowser(context.Background())
	after, err := browserbridge.Load()
	if err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Fatal("ordinary startup rebound trusted installation to test executable")
	}
}
