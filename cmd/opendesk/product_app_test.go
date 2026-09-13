package main

import (
	"context"
	"io"
	"net/http"
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

func TestProductAppDeveloperRuntimeIsProcessOwnedAndReleasesEndpoint(t *testing.T) {
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	repositoryRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(repositoryRoot); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(workingDirectory) })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runtime, err := startAppDeveloperRuntime(ctx, "com.opendesk.desktop", map[string]string{
		"OPENDESK_APP_DATA_DIR": t.TempDir(),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	environment := runtime.Environment(map[string]string{"KEEP": "value"})
	if environment["KEEP"] != "value" || environment[appInspectorEndpointEnv] != runtime.Endpoint() ||
		environment[appInspectorTokenEnv] == "" {
		t.Fatalf("developer environment=%+v", environment)
	}
	request, err := http.NewRequest(http.MethodGet, runtime.Endpoint()+"/api/accessibility-workbench/v1/internal/lan", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-OpenDesk-Inspector-Control", environment[appInspectorTokenEnv])
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	body, readErr := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if readErr != nil || response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"allowLAN":false`) {
		t.Fatalf("Inspector LAN status=%d body=%s readErr=%v", response.StatusCode, body, readErr)
	}
	if err := runtime.Close(); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("second close: %v", err)
	}
}
