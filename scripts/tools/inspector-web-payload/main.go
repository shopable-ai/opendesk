package main

import (
	"flag"
	"fmt"
	"os"

	"opendesk/internal/inspectorwebpayload"
)

func main() {
	source := flag.String("source", "", "Inspector frontend source directory")
	destination := flag.String("destination", "", "Inspector frontend destination directory")
	flag.Parse()
	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "inspector-web-payload does not accept positional arguments")
		os.Exit(2)
	}
	files, err := inspectorwebpayload.Stage(*source, *destination)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("Staged Inspector frontend (%d files): %s\n", len(files), *destination)
}
