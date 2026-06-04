package main

import (
	"fmt"
	"os"

	pkgContainer "clawdesk/pkg/container"
	"clawdesk/pkg/mcpserver"
)

func main() {
	cfg := &pkgContainer.Config{RuntimePoolSize: 2}
	container, err := pkgContainer.NewContainer(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize container: %v\n", err)
		os.Exit(1)
	}
	defer container.Close()

	runtime := mcpserver.NewAutomationRuntime(container)
	server := mcpserver.NewServer(runtime)
	if err := server.ServeStream(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "mcp server exited with error: %v\n", err)
		os.Exit(1)
	}
}
