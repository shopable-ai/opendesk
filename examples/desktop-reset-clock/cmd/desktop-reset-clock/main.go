// Desktop production entry: use a legitimate HTTPS feed, never mock by default.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/app"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/instance"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/settings"
)

func main() {
	runtime.LockOSThread()
	path, _ := settings.Path()
	url := flag.String("feed", "", "trusted HTTPS JSON feed; empty = saved setting")
	state := flag.String("state", path, "settings/cache file path")
	loopback := flag.Bool("allow-local-http", false, "allow HTTP loopback for development only")
	flag.Parse()
	lease, err := instance.Acquire(*state)
	if err != nil {
		log.Fatal(err)
	}
	defer lease.Close()
	a, err := app.New(*state, feed.Client{}, nil)
	if err != nil {
		log.Fatal(err)
	}
	if *url != "" {
		if err = a.ConfigureFeed(*url, *loopback); err != nil {
			log.Fatal(err)
		}
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := a.Run(ctx, desktop.New()); err != nil {
		log.Fatal(err)
	}
}
