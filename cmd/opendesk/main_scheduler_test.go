package main

import (
	"path/filepath"
	"testing"
	"time"

	pkgContainer "opendesk/pkg/container"
	"opendesk/pkg/customui"
)

func TestHTTPSchedulerExecutorOptionsPassServerCustomUIConfiguration(t *testing.T) {
	driver := customui.NewMemoryDriver()
	hostPath := filepath.Join(t.TempDir(), "opendesk-ui-host")
	options := httpSchedulerExecutorOptions(&pkgContainer.Config{
		EnableCustomUI:           true,
		CustomUIActivationSource: customui.ActivationProjectConfig,
		CustomUIHostPath:         hostPath,
		CustomUIDriver:           driver,
	})

	if !options.EnableCustomUI {
		t.Fatal("HTTP Scheduler did not inherit the server Custom UI capability")
	}
	if options.CustomUIActivationSource != customui.ActivationProjectConfig {
		t.Fatalf("activation source = %q", options.CustomUIActivationSource)
	}
	if options.CustomUIHostPath != hostPath {
		t.Fatalf("Custom UI host path = %q, want %q", options.CustomUIHostPath, hostPath)
	}
	if options.CustomUIDriver != driver {
		t.Fatal("HTTP Scheduler did not inherit the server Custom UI driver")
	}
	if options.Timeout != 30*time.Minute {
		t.Fatalf("timeout = %s, want 30m", options.Timeout)
	}
}

func TestHTTPSchedulerExecutorOptionsKeepCustomUIDisabledByDefault(t *testing.T) {
	options := httpSchedulerExecutorOptions(&pkgContainer.Config{})
	if options.EnableCustomUI || options.CustomUIDriver != nil || options.CustomUIHostPath != "" {
		t.Fatalf("unexpected default Custom UI options: %+v", options)
	}
}
