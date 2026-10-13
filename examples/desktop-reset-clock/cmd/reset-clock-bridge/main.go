// reset-clock-bridge: standalone Go collector and loopback OpenDesk Feed bridge.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/bridge"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
func liveProbeVerified(results map[string]codexreset.Result, err error) bool {
	if err != nil {
		return false
	}
	for _, name := range codexreset.Endpoints {
		r, ok := results[name]
		if !ok || r.Status != "ok" || r.FromCache || (r.HTTPStatus != http.StatusOK && r.HTTPStatus != http.StatusNotModified) {
			return false
		}
	}
	return true
}
func run(args []string) error {
	if len(args) == 0 || (args[0] != "probe" && args[0] != "serve") {
		return errors.New("usage: reset-clock-bridge probe|serve [-state path] [-listen 127.0.0.1:8788]")
	}
	mode := args[0]
	fs := flag.NewFlagSet(mode, flag.ContinueOnError)
	state := fs.String("state", "../../.runtime/desktop-reset-clock/bridge-state.json", "persistent state file, relative to examples/desktop-reset-clock")
	listen := fs.String("listen", "127.0.0.1:8788", "loopback listener (serve only)")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	release, err := bridge.Acquire(*state)
	if err != nil {
		return err
	}
	defer release()
	collector := codexreset.Collector{}
	service, err := bridge.New(*state, collector, nil)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if mode == "probe" {
		results, err := service.Poll(ctx)
		report := map[string]any{"source": codexreset.SourceURL, "results": results, "source_health": service.Report().Snapshot.SourceHealth, "next_allowed_at": service.Report().Provider.NextAllowedAt, "live_api_verified": liveProbeVerified(results, err)}
		if encodeErr := json.NewEncoder(os.Stdout).Encode(report); encodeErr != nil {
			return encodeErr
		}
		return err
	}
	host, _, err := net.SplitHostPort(*listen)
	if err != nil {
		return err
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	if ip == nil || !ip.IsLoopback() {
		return errors.New("bridge only permits a numeric loopback IP listener")
	}
	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		return err
	}
	origin := "http://" + ln.Addr().String()
	handler, err := service.Handler(origin)
	if err != nil {
		ln.Close()
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
	go func() {
		for {
			roundCtx, cancel := context.WithTimeout(ctx, 12*time.Minute)
			results, err := service.Poll(roundCtx)
			cancel()
			for name, r := range results {
				log.Printf("upstream=%s status=%s http=%d duration_ms=%d error=%s", name, r.Status, r.HTTPStatus, r.DurationMS, r.Error)
			}
			if err != nil {
				log.Printf("collector: %v (previous cache retained)", err)
			}
			// A completed four-endpoint round takes at least 3 minutes. Refresh after
			// five idle minutes so the first source clock does not age out at 30m.
			timer := time.NewTimer(5 * time.Minute)
			select {
			case <-timer.C:
			case <-ctx.Done():
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				return
			}
		}
	}()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	fmt.Printf("OpenDesk Reset Clock Bridge: %s/feed\nArchive: %s/archive\nSource: %s\n", origin, origin, codexreset.SourceURL)
	err = server.Serve(ln)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}