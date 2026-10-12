// One-command local HTTP demonstration. NO official feed or external collection.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/app"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/instance"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
)

func main() {
	runtime.LockOSThread()
	m := mock.New(nil)
	url, closeServer, err := m.Start()
	if err != nil {
		log.Fatal(err)
	}
	defer closeServer()
	path := filepath.Join("..", "..", ".runtime", "tests", "desktop-reset-clock", "demo-state.json")
	lease, err := instance.Acquire(path)
	if err != nil {
		log.Fatal(err)
	}
	defer lease.Close()
	a, err := app.New(path, feed.Client{AllowLocalHTTP: true}, nil)
	if err != nil {
		log.Fatal(err)
	}
	if err := a.ConfigureFeed(url, true); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("模拟 Feed: %s\n模拟控制页面: http://%s/\n重要：仅为合成演示数据。\n", url, url[len("http://"):len(url)-len("/feed")])
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	a.DemoSwitch = func(v int) { m.Set(v) }
	if err := a.Run(ctx, desktop.New()); err != nil {
		log.Fatal(err)
	}
}
