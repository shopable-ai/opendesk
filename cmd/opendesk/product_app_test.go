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
	for itemID, expectedAction := range map[string]string{
		"open-scheduler-center": "scheduler.center",
		"new-schedule":          "scheduler.new",
		"open-runtime-log":      "runtime.log",
		"open-examples":         appshell.ActionProductExamples,
		"open-api-docs":         appshell.ActionProductAPIDocs,
	} {
		if action, ok := appPackage.Manifest.MenuAction(itemID); !ok || action != expectedAction {
			t.Fatalf("%s action=%q ok=%v, want %q", itemID, action, ok, expectedAction)
		}
	}
	if _, ok := appPackage.Manifest.MenuAction(appshell.ActionRecorder); ok {
		t.Fatal("product manifest must not declare the reserved framework Recorder action")
	}
	if _, ok := appPackage.Manifest.MenuAction("open-opendesk"); ok {
		t.Fatal("product manifest must not duplicate the App Shell-owned OpenDesk entry")
	}
	if _, ok := appPackage.Manifest.MenuAction("open-inspector"); ok {
		t.Fatal("product manifest must not duplicate the Developer-owned Inspector entry")
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
	for _, required := range []string{"OpenDeskProductAppController.create", "OpenDeskSchedulerCenter.create", "OpenDeskDeveloperTools.create", "runner", "schedulerCenter", "runtimeLog", "developerTools", "recipeProcessModel: 'child-opendesk-process'"} {
		if !strings.Contains(mainText, required) {
			t.Fatalf("main.js missing %q", required)
		}
	}
	if strings.Count(mainText, "const runner =") != 1 {
		t.Fatalf("main.js must create exactly one product runner; declarations=%d", strings.Count(mainText, "const runner ="))
	}
	for _, legacyLifecycle := range []string{"runner.waitUntilClosed", "unsubscribeAppActions"} {
		if strings.Contains(mainText, legacyLifecycle) {
			t.Fatalf("main.js must leave App Shell action handling alive after its initial window closes; found %q", legacyLifecycle)
		}
	}
	if strings.Contains(mainText, "await developerTools.initialize()") || !strings.Contains(mainText, "void developerTools.initialize()") {
		t.Fatal("main.js must initialize auxiliary Inspector state without blocking the primary desktop UI")
	}

	coreSource, err := os.ReadFile(filepath.Join(root, "script-runner", "controller.js"))
	if err != nil {
		t.Fatal(err)
	}
	coreText := string(coreSource)
	for _, required := range []string{"getExecutablePath", "command.run", "'-script'", "hideWindow: true"} {
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
		filepath.Join("..", "..", "apps", "opendesk", "recorder", "controller.js"),
		filepath.Join("..", "..", "apps", "opendesk", "recorder", "controller-core.js"),
		filepath.Join("..", "..", "apps", "opendesk", "recorder", "recording-history.js"),
		filepath.Join("..", "..", "apps", "opendesk", "script-runner", "controller.js"),
	} {
		if info, err := os.Stat(canonical); err != nil || !info.Mode().IsRegular() {
			t.Fatalf("missing canonical productized implementation %s: info=%v err=%v", canonical, info, err)
		}
	}
}

func TestProductAppUsesOnlyTheSharedAppLocalServicesRuntime(t *testing.T) {
	source, err := os.ReadFile("app_mode.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	if strings.Count(text, "startAppScheduler(") != 1 {
		t.Fatalf("App Mode must start exactly one App Local Services runtime; source=%s", text)
	}
	for _, forbidden := range []string{"startAppDeveloperRuntime", "appDeveloper", "OPENDESK_APP_INSPECTOR_CONTROL_TOKEN"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("App Mode still references legacy standalone Inspector ownership %q", forbidden)
		}
	}
	if _, err := os.Stat("app_developer.go"); !os.IsNotExist(err) {
		t.Fatalf("legacy standalone Inspector runtime must not remain in the product startup package: %v", err)
	}
}
