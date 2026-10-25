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
	var readOnly bool
	var webFileTestDir string
	flag.StringVar(&webFileTestDir, "web-file-test-dir", "", "Dedicated existing absolute repository .runtime/tests/mcp-chatgpt-web run directory; exposes only nonce proof tools")
	flag.BoolVar(&readOnly, "read-only", false, "Expose only read-only tools; use this mode for official tunnel connections (no caller-selected screenshot output files)")
	flag.StringVar(&browserPolicy.CoreRoot, "browser-core-root", "", "Absolute verified Browser Core workspace; enables the Browser adapter")
	flag.StringVar(&browserPolicy.Origin, "browser-origin", "", "Host-authorized exact local HTTP origin")
	flag.IntVar(&browserPolicy.Tab, "browser-tab", -1, "Host-authorized exact Chrome tab")
	flag.StringVar(&browserExecutionID, "browser-execution-id", "", "Host-bound Agent execution identity")
	flag.Parse()
	webMode, browserMode, readOnlyOption := false, false, false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "read-only" {
			readOnlyOption = true
		}
		if f.Name == "web-file-test-dir" {
			webMode = true
		}
		if len(f.Name) >= 8 && f.Name[:8] == "browser-" {
			browserMode = true
		}
	})
	if webMode {
		if readOnlyOption || browserMode || flag.NArg() != 0 {
			fmt.Fprintln(os.Stderr, "web-file-test-dir conflicts with read-only, Browser options or positional arguments")
			os.Exit(1)
		}
		if err := serveWebFileTest(webFileTestDir); err != nil {
			fmt.Fprintln(os.Stderr, "web file test mode failed:", err)
			os.Exit(1)
		}
		return
	}
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
	server := mcpserver.NewServerWithOptions(runtime, mcpserver.ServerOptions{ReadOnly: readOnly})
	if err := server.ServeStream(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "mcp server exited with error: %v\n", err)
		os.Exit(1)
	}
}

func serveWebFileTest(dir string) error {
	server, err := mcpserver.NewWebFileTestServer(dir)
	if err != nil {
		return err
	}
	defer server.Close()
	return server.ServeStream(os.Stdin, os.Stdout)
}
