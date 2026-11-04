package browsercli

import (
	"errors"
	"io"
	"opendesk/internal/browserbridge"
)

func runExtensionAuthorization(args []string, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "list" {
		result, err := browserbridge.ExtensionList()
		if err != nil {
			return exitError(stderr, err)
		}
		writeJSON(stdout, result)
		return 0
	}
	if len(args) != 3 || args[1] != "--extension-id" {
		return exitError(stderr, errors.New("E_SCHEMA: browser extension [list|approve --extension-id <id>|revoke --extension-id <id>]"))
	}
	var result map[string]any
	var err error
	switch args[0] {
	case "approve":
		result, err = browserbridge.ExtensionApprove(args[2])
	case "revoke":
		result, err = browserbridge.ExtensionRevoke(args[2])
	default:
		return exitError(stderr, browserbridge.ErrSchema)
	}
	if err != nil {
		return exitError(stderr, err)
	}
	writeJSON(stdout, result)
	return 0
}
