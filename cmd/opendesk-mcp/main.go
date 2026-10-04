package main

import (
	"flag"
	"fmt"
	"opendesk/automation"
	"os"

	pkgContainer "opendesk/pkg/container"
	"opendesk/pkg/mcpserver"
)

func main() {
	var browserPolicy automation.BrowserDOMPolicy
	var browserExecutionID string
	flag.StringVar(&browserPolicy.CoreRoot, "browser-core-root", "", "Absolute verified Browser Core workspace; enables the Browser adapter")
	flag.StringVar(&browserPolicy.Origin, "browser-origin", "", "Host-authorized exact local HTTP origin")
	flag.IntVar(&browserPolicy.Tab, "browser-tab", -1, "Host-authorized exact Chrome tab")
	flag.StringVar(&browserExecutionID, "browser-execution-id", "", "Host-bound Agent execution identity")
	flag.Parse()
	cfg := &pkgContainer.Config{RuntimePoolSize: 2}
	container, err := pkgContainer.NewContainer(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize container: %v\n", err)
		os.Exit(1)
	}
	defer container.Close()

	runtime := mcpserver.NewAutomationRuntime(container)
	runtime.ConfigureBrowser(browserPolicy, browserExecutionID)
	defer runtime.Close()
	server := mcpserver.NewServer(runtime)
	if err := server.ServeStream(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "mcp server exited with error: %v\n", err)
		os.Exit(1)
	}
}
