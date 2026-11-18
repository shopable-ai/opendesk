// agent-cwd is a synthetic, Command-authorized Runner host. Public API
// assertions live in agent-cwd-runtime.js; this host never loads credentials
// or discovers an installed Agent CLI.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"opendesk/pkg/execution"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) != 3 || !filepath.IsAbs(os.Args[1]) || !filepath.IsAbs(os.Args[2]) {
		return fmt.Errorf("usage: agent-cwd absolute-fixture-root absolute-formal-script")
	}
	root := os.Args[1]
	source, err := os.ReadFile(os.Args[2])
	if err != nil {
		return err
	}
	inputData, err := os.ReadFile(filepath.Join(root, "input.json"))
	if err != nil {
		return err
	}
	var input any
	if err := json.Unmarshal(inputData, &input); err != nil {
		return err
	}
	id := execution.NewExecutionID("agent-cwd-fixture")
	artifacts, err := execution.PrepareArtifacts(filepath.Join(root, "artifacts"), id, ".js")
	if err != nil {
		return err
	}
	result, summary, runErr := execution.Run(execution.Request{
		ExecutionID: id, SourceLabel: "Agent cwd synthetic fixture", ScriptContent: source,
		ScriptPath: os.Args[2], WorkDir: filepath.Join(root, "workdir"), Ext: ".js",
		Artifacts: artifacts, Input: input, EnableCommand: true, Timeout: 30 * time.Second,
		Environment: map[string]string{"OPENDESK_AGENT_CONFIG": filepath.Join(root, "profiles.json")},
		Selection:   execution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"result": result, "summary": summary}); err != nil {
		return err
	}
	return runErr
}
