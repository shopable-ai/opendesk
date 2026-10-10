// Command native-host is a component-test executable, not an OpenDesk desktop
// distribution. It uses the production Browser CLI and Native Host unchanged
// so protocol tests can run without unrelated desktop/cgo dependencies.
package main

import (
	"os"

	"opendesk/internal/browsercli"
)

func main() {
	os.Exit(browsercli.Execute(os.Args[1:], os.Stdout, os.Stderr))
}
