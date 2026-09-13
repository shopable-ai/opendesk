package main

import (
	"fmt"
	"os"
	"path/filepath"
)

type assetSync struct {
	sourceDir string
	name      string
}

var assets = []assetSync{
	{sourceDir: filepath.Join("..", "..", "apps", "opendesk", "recorder"), name: "controller.js"},
	{sourceDir: filepath.Join("..", "..", "apps", "opendesk", "recorder"), name: "controller-core.js"},
	{sourceDir: filepath.Join("..", "..", "apps", "opendesk", "recorder"), name: "recording-history.js"},
	{sourceDir: filepath.Join("..", "..", "apps", "opendesk", "assets"), name: "opendesk-logo.png"},
}

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	targetRoot := filepath.Join(cwd, "assets")
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		panic(err)
	}
	for _, asset := range assets {
		source := filepath.Clean(filepath.Join(cwd, asset.sourceDir, asset.name))
		target := filepath.Join(targetRoot, asset.name)
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
