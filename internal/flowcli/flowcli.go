package flowcli

import (
	"io"
)

func IsCommand(args []string) bool { return len(args) > 0 && args[0] == "flow" }

func Execute(args []string, stdout, stderr io.Writer) int {
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	if len(args) < 2 || args[0] != "flow" {
		return writeError(stdout, "flow", "invalid_argument", "usage: opendesk flow <pack|inspect|verify|install|list|trust|uninstall> ...")
	}
	switch args[1] {
	case "pack":
		return runPack(args[2:], stdout)
	case "inspect":
		return runInspect(args[2:], stdout)
	case "verify":
		return runVerify(args[2:], stdout)
	case "install":
		return runInstall(args[2:], stdout)
	case "list":
		return runList(args[2:], stdout)
	case "trust":
		return runTrust(args[2:], stdout)
	case "uninstall":
		return runUninstall(args[2:], stdout)
	default:
		return writeError(stdout, "flow "+args[1], "invalid_argument", "unknown flow command")
	}
}
