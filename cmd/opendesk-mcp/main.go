package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"opendesk/automation"
	"os"
	"strings"

	"opendesk/internal/browserbridge"
	pkgContainer "opendesk/pkg/container"
	"opendesk/pkg/mcpserver"
)

func main() {
	var browserPolicy automation.BrowserDOMPolicy
	var browserExecutionID string
	var readOnly bool
	var webFileTestDir string
	var filesBridgeCredentialFile string
	var allowScripts bool
	var scriptCapabilities, apiDocsRoot string
	flag.BoolVar(&allowScripts, "allow-script-execution", false, "Enable trusted local Runtime scripts; not a sandbox and never suitable for a restricted remote tunnel")
	flag.StringVar(&scriptCapabilities, "script-capabilities", "", "Host-only script capabilities: command,download,webhook,accessibility,sqlite,custom-ui,native-extensions; requires allow-script-execution")
	flag.StringVar(&apiDocsRoot, "api-docs-root", "", "Absolute trusted OpenDesk checkout for canonical API discovery; requires Node.js")
	flag.StringVar(&filesBridgeCredentialFile, "files-bridge-credential-file", "", "Private local credential reference for the existing Native owner's approved file-only bridge; no desktop runtime")
	flag.StringVar(&webFileTestDir, "web-file-test-dir", "", "Dedicated existing absolute repository .runtime/tests/mcp-chatgpt-web run directory; exposes only nonce proof tools")
	flag.BoolVar(&readOnly, "read-only", false, "Expose only read-only tools; use this mode for official tunnel connections (no caller-selected screenshot output files)")
	flag.StringVar(&browserPolicy.CoreRoot, "browser-core-root", "", "Absolute verified Browser Core workspace; enables the Browser adapter")
	flag.StringVar(&browserPolicy.Origin, "browser-origin", "", "Host-authorized exact local HTTP origin")
	flag.IntVar(&browserPolicy.Tab, "browser-tab", -1, "Host-authorized exact Chrome tab")
	flag.StringVar(&browserExecutionID, "browser-execution-id", "", "Host-bound Agent execution identity")
	flag.Parse()
	// flag stops at the first positional argument (including after "--").
	// Reject it before any mode can initialize the desktop Runtime.
	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "positional arguments are not supported")
		os.Exit(1)
	}
	webMode, browserMode, readOnlyOption, filesMode, advancedOption := false, false, false, false, false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "allow-script-execution" || f.Name == "script-capabilities" || f.Name == "api-docs-root" {
			advancedOption = true
		}
		if f.Name == "files-bridge-credential-file" {
			filesMode = true
		}
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
	if filesMode {
		if webMode || readOnlyOption || browserMode || advancedOption {
			fmt.Fprintln(os.Stderr, "files-bridge-credential-file conflicts with other modes or positional arguments")
			os.Exit(1)
		}
		if err := serveFilesBridge(filesBridgeCredentialFile); err != nil {
			fmt.Fprintln(os.Stderr, "file bridge unavailable: E_FILES_BRIDGE")
			os.Exit(1)
		}
		return
	}
	if webMode {
		if readOnlyOption || browserMode || advancedOption {
			fmt.Fprintln(os.Stderr, "web-file-test-dir conflicts with read-only, Browser options or positional arguments")
			os.Exit(1)
		}
		if err := serveWebFileTest(webFileTestDir); err != nil {
			fmt.Fprintln(os.Stderr, "web file test mode failed:", err)
			os.Exit(1)
		}
		return
	}
	if (allowScripts && readOnly) || (scriptCapabilities != "" && !allowScripts) {
		fmt.Fprintln(os.Stderr, "script execution conflicts with read-only; script-capabilities requires allow-script-execution")
		os.Exit(1)
	}
	var docs *mcpserver.APIDocs
	if apiDocsRoot != "" {
		var err error
		docs, err = mcpserver.NewAPIDocs(apiDocsRoot)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	var scripts *mcpserver.ScriptService
	if allowScripts {
		var capabilities []string
		if scriptCapabilities != "" {
			capabilities = strings.Split(scriptCapabilities, ",")
		}
		var err error
		scripts, err = mcpserver.NewScriptService(mcpserver.ScriptOptions{Capabilities: capabilities})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		defer scripts.Close()
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
	server := mcpserver.NewServerWithOptions(runtime, mcpserver.ServerOptions{ReadOnly: readOnly, Scripts: scripts, APIDocs: docs})
	serveErr := server.ServeStream(os.Stdin, os.Stdout)
	// os.Exit skips defers. Finish execution teardown on error as well as EOF.
	if scripts != nil {
		if err := scripts.Close(); err != nil && serveErr == nil {
			serveErr = fmt.Errorf("script shutdown: %w", err)
		}
	}
	if serveErr != nil {
		fmt.Fprintf(os.Stderr, "mcp server exited with error: %v\n", serveErr)
		os.Exit(1)
	}
}

// nativeFilesBackend makes one authenticated Native call. In particular, a
// lost write response stays unknown; the adapter never retries or leaks an
// internal transport error to the model.
type nativeFilesBackend struct{ client mcpserver.FilesBridgeBackend }

func (b nativeFilesBackend) Call(ctx context.Context, method string, params json.RawMessage) (json.RawMessage, error) {
	result, err := b.client.Call(ctx, method, params)
	if err == nil {
		return result, nil
	}
	var nativeErr *browserbridge.CallError
	if errors.As(err, &nativeErr) {
		return nil, &mcpserver.FilesBridgeBackendError{Code: nativeErr.Code, Outcome: nativeErr.Outcome}
	}
	return nil, &mcpserver.FilesBridgeBackendError{Code: "E_FILES_BRIDGE", Outcome: "OUTCOME_UNKNOWN"}
}

func serveFilesBridge(credentialFile string) error {
	client, err := browserbridge.NewFilesMCPClient(credentialFile)
	if err != nil {
		return err
	}
	defer client.Close()
	server, err := mcpserver.NewFilesBridgeServer(nativeFilesBackend{client: client})
	if err != nil {
		return err
	}
	defer server.Close()
	return server.ServeStream(os.Stdin, os.Stdout)
}

func serveWebFileTest(dir string) error {
	server, err := mcpserver.NewWebFileTestServer(dir)
	if err != nil {
		return err
	}
	defer server.Close()
	return server.ServeStream(os.Stdin, os.Stdout)
}
