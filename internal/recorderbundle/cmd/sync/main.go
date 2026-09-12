package main

import (
	"fmt"
	"os"
	"path/filepath"
)

var files = []string{
	"controller.js",
	"controller-core.js",
	"recording-history.js",
	"runtime-icon-adapter.js",
}

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	sourceRoot := filepath.Clean(filepath.Join(cwd, "..", "..", "apps", "opendesk", "recorder"))
	targetRoot := filepath.Join(cwd, "assets")
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		panic(err)
	}
	for _, name := range files {
		source := filepath.Join(sourceRoot, name)
		target := filepath.Join(targetRoot, name)
		data, err := os.ReadFile(source)
		if err != nil {
			panic(fmt.Errorf("read %s: %w", source, err))
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			panic(fmt.Errorf("write %s: %w", target, err))
		}
		fmt.Printf("synced %s -> %s\n", source, target)
	}
}
