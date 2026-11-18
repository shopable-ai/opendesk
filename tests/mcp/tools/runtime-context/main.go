// runtime-context is a test host for contexts which the production CLI does
// not accept from requests. Runtime assertions remain in formal JavaScript.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"opendesk/pkg/execution"
	"opendesk/pkg/mcpserver"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 3 || !filepath.IsAbs(os.Args[2]) {
		return fmt.Errorf("usage: runtime-context mcp|environment absolute-workdir [absolute-script]")
	}
	workdir := os.Args[2]
	switch os.Args[1] {
	case "mcp":
		if len(os.Args) != 3 {
			return fmt.Errorf("unexpected MCP host arguments")
		}
		scripts, err := mcpserver.NewScriptService(mcpserver.ScriptOptions{WorkDir: workdir, Capabilities: []string{"command"}})
		if err != nil {
			return err
		}
		defer scripts.Close()
		// No desktop adapter is installed in this test host. Only the production
		// script tools are exercised; it cannot be used as a desktop fixture.
		server := mcpserver.NewServerWithOptions(nil, mcpserver.ServerOptions{Scripts: scripts})
		return server.ServeStream(os.Stdin, os.Stdout)
	case "environment":
		if len(os.Args) != 4 || !filepath.IsAbs(os.Args[3]) {
			return fmt.Errorf("absolute formal JS path required")
		}
		source, err := os.ReadFile(os.Args[3])
		if err != nil {
			return err
		}
		id := execution.NewExecutionID("context-fixture")
		artifacts, err := execution.PrepareArtifacts(filepath.Join(workdir, ".runtime", id), id, ".js")
		if err != nil {
			return err
		}
		result, summary, runErr := execution.Run(execution.Request{
			ExecutionID: id, SourceLabel: "runtime-context fixture", ScriptContent: source,
			ScriptPath: os.Args[3], WorkDir: workdir, Ext: ".js", Artifacts: artifacts,
			Environment: map[string]string{"OPENDESK_CONTEXT_FIXTURE": "present", "OPENDESK_CONTEXT_EMPTY": ""},
			Input:       map[string]any{"scenario": "environment"}, Timeout: 5 * time.Second,
			Selection: execution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		})
		if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"result": result, "summary": summary}); err != nil {
			return err
		}
		return runErr
	default:
		return fmt.Errorf("unknown fixture mode")
	}
}
