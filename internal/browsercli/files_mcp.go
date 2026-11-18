package browsercli

import (
	"context"
	"io"
	"os"
	"os/signal"
	"syscall"

	"opendesk/internal/browserbridge"
)

func runFilesMCP(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		return exitError(stderr, browserbridge.ErrSchema)
	}
	switch args[0] {
	case "grant":
		opts, e := parseOptions(args[1:], map[string]bool{"--approval-file": true, "--credential-file": true})
		if e != nil || opts["--approval-file"] == "" || opts["--credential-file"] == "" {
			return exitError(stderr, browserbridge.ErrSchema)
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		lease, e := browserbridge.GrantFilesMCP(ctx, opts["--approval-file"], opts["--credential-file"])
		if e != nil {
			return exitError(stderr, e)
		}
		defer lease.Close()
		writeJSON(stdout, map[string]any{"ok": true, "grantId": lease.GrantID, "lease": "held-until-exit"})
		select {
		case <-ctx.Done():
			return 0
		case <-lease.Done():
			return 0
		}
	case "revoke":
		opts, e := parseOptions(args[1:], map[string]bool{"--grant-id": true})
		if e != nil {
			return exitError(stderr, browserbridge.ErrSchema)
		}
		if e = browserbridge.RevokeFilesMCP(context.Background(), opts["--grant-id"]); e != nil {
			return exitError(stderr, e)
		}
		writeJSON(stdout, map[string]any{"ok": true})
		return 0
	default:
		return exitError(stderr, browserbridge.ErrSchema)
	}
}
