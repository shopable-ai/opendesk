package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApplyWorkingDirectoryChangesProcessDirectory(t *testing.T) {
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(original) })

	want := t.TempDir()
	if err := applyWorkingDirectory(want); err != nil {
		t.Fatalf("applyWorkingDirectory: %v", err)
	}
	got, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	gotInfo, err := os.Stat(got)
	if err != nil {
		t.Fatal(err)
	}
	wantInfo, err := os.Stat(want)
	if err != nil {
		t.Fatal(err)
	}
	if !os.SameFile(gotInfo, wantInfo) {
		t.Fatalf("working directory = %q, want %q", got, want)
	}
}

func TestApplyWorkingDirectoryRejectsMissingDirectory(t *testing.T) {
	err := applyWorkingDirectory(filepath.Join(t.TempDir(), "missing"))
	if err == nil {
		t.Fatal("expected missing directory error")
	}
}
