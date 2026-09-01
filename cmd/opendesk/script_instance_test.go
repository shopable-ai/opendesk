package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestScriptInstanceTakeoverReplacesSameScript(t *testing.T) {
	stateDir := t.TempDir()
	script := filepath.Join(t.TempDir(), "shortcut.js")

	oldCanceled := make(chan struct{})
	oldLease, err := acquireScriptInstance(stateDir, script, func() { close(oldCanceled) })
	if err != nil {
		t.Fatal(err)
	}
	defer oldLease.Close()
	go func() {
		<-oldCanceled
		oldLease.Close()
	}()

	newLease, err := acquireScriptInstance(stateDir, script, func() {})
	if err != nil {
		t.Fatal(err)
	}
	defer newLease.Close()
	select {
	case <-oldCanceled:
	case <-time.After(time.Second):
		t.Fatal("replacement invocation did not cancel the previous script")
	}
	if !oldLease.WasReplaced() {
		t.Fatal("previous script was canceled without being marked as replaced")
	}
}

func TestScriptInstanceDoesNotReplaceDifferentScripts(t *testing.T) {
	stateDir := t.TempDir()
	firstCanceled := make(chan struct{})
	first, err := acquireScriptInstance(stateDir, filepath.Join(t.TempDir(), "first.js"), func() { close(firstCanceled) })
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := acquireScriptInstance(stateDir, filepath.Join(t.TempDir(), "second.js"), func() {})
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	select {
	case <-firstCanceled:
		t.Fatal("different script was incorrectly canceled")
	default:
	}
}
