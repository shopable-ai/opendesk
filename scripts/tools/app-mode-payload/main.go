package main

import (
	"flag"
	"fmt"
	"os"

	"opendesk/internal/appmodepayload"
)

func main() {
	source := flag.String("source", "", "App Mode source package directory")
	destination := flag.String("destination", "", "release staging destination")
	flag.Parse()
	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "unexpected positional arguments")
		os.Exit(2)
	}
	result, err := appmodepayload.Stage(*source, *destination)
	if err != nil {
		fmt.Fprintf(os.Stderr, "stage App Mode payload: %v\n", err)
		os.Exit(1)
	}
	mode := "full-package"
	if result.PolicyApplied {
		mode = "release-policy"
	}
	fmt.Printf("Staged App Mode payload (%s, %d files): %s\n", mode, len(result.Files), *destination)
}
