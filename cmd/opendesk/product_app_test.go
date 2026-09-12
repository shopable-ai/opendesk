package main

import (
	"opendesk/pkg/appshell"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProductAppPackageOwnsRunnerButNotReservedRecorderAction(t *testing.T) {
	root := filepath.Join("..", "..", "apps", "opendesk")
	appPackage, err := appshell.LoadPackage(root)
	if err != nil {
		t.Fatalf("load product App Mode package: %v", err)
	}
	if appPackage.Manifest.ID != "com.opendesk.desktop" {
		t.Fatalf("package id=%q", appPackage.Manifest.ID)
	}
	if action, ok := appPackage.Manifest.MenuAction("runner.open"); !ok || action != "runner.open" {
		t.Fatalf("runner.open action=%q ok=%v", action, ok)
	}
	if _, ok := appPackage.Manifest.MenuAction(appshell.ActionRecorder); ok {
		t.Fatal("product manifest must not declare the reserved framework Recorder action")
	}

	merged := appshell.EnsureRecorderMenu(appPackage.Manifest)
	if action, ok := merged.MenuAction(appshell.ActionRecorder); !ok || action != appshell.ActionRecorder {
		t.Fatalf("framework Recorder action=%q ok=%v", action, ok)
	}
}

func TestProductAppKeepsRecipeExecutionAsChildOpenDeskProcess(t *testing.T) {
	root := filepath.Join("..", "..", "apps", "opendesk")
	mainSource, err := os.ReadFile(filepath.Join(root, "main.js"))
	if err != nil {
		t.Fatal(err)
	}
	mainText := string(mainSource)
	for _, required := range []string{"automation.app.onAction", "runner.open", "recipeProcessModel: 'child-opendesk-process'"} {
		if !strings.Contains(mainText, required) {
			t.Fatalf("main.js missing %q", required)
		}
	}
	for _, legacyLifecycle := range []string{"runner.waitUntilClosed", "unsubscribeAppActions"} {
		if strings.Contains(mainText, legacyLifecycle) {
			t.Fatalf("main.js must leave App Shell action handling alive after its initial window closes; found %q", legacyLifecycle)
		}
	}

	coreSource, err := os.ReadFile(filepath.Join(root, "script-runner", "controller.js"))
	if err != nil {
		t.Fatal(err)
	}
	coreText := string(coreSource)
	for _, required := range []string{"getExecutablePath", "command.run", "'-script'"} {
		if !strings.Contains(coreText, required) {
			t.Fatalf("Script Runner controller missing child-process contract %q", required)
		}
	}
}

func TestProductizedUIsHaveSingleCanonicalImplementations(t *testing.T) {
	for _, legacy := range []string{
		filepath.Join("..", "..", "examples", "custom-ui", "recording-console-simple", "assets.go"),
		filepath.Join("..", "..", "examples", "custom-ui", "recording-console-simple", "controller.js"),
		filepath.Join("..", "..", "examples", "custom-ui", "recording-console-simple", "controller-core.js"),
		filepath.Join("..", "..", "examples", "custom-ui", "recording-console-simple", "recording-history.js"),
		filepath.Join("..", "..", "examples", "custom-ui", "script-runner-simple", "controller.js"),
	} {
		if _, err := os.Stat(legacy); !os.IsNotExist(err) {
			t.Fatalf("legacy productized implementation still exists at %s: %v", legacy, err)
		}
	}

	for _, canonical := range []string{
		filepath.Join("..", "..", "internal", "recorderbundle", "bundle.go"),
		filepath.Join("..", "..", "internal", "recorderbundle", "ui", "controller.js"),
		filepath.Join("..", "..", "apps", "opendesk", "script-runner", "controller.js"),
	} {
		if info, err := os.Stat(canonical); err != nil || !info.Mode().IsRegular() {
			t.Fatalf("missing canonical productized implementation %s: info=%v err=%v", canonical, info, err)
		}
	}
}
