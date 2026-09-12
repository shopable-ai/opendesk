package main

import (
	"os"

	"opendesk/internal/configcli"
)

// config is a first-level CLI command, not a Runtime flag. Dispatch it during
// package initialization so the existing flag.CommandLine never interprets the
// subcommand arguments (especially the already-public -config Runtime flag).
// Other first-level commands remain dispatched by main; this isolated bootstrap
// keeps the new command additive without widening the main entrypoint surface.
func init() {
	args := commandLineArgs()
	if !configcli.IsCommand(args) {
		return
	}
	os.Exit(configcli.Execute(args, os.Stdout, os.Stderr))
}
