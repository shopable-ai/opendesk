//go:build !darwin && !windows

package desktop

import (
	"context"
	"fmt"
	"os"
	"time"
)

type console struct{ last Display }

func newNative() UI { return &console{} }
func (c *console) Run(ctx context.Context, action func(Action)) error {
	fmt.Fprintln(os.Stdout, "Reset Clock: Linux console fallback (native desktop supported on macOS/Windows only)")
	<-ctx.Done()
	return nil
}
func (c *console) Update(d Display) {
	if d.Title != c.last.Title || d.Effective != c.last.Effective || d.Health != c.last.Health {
		fmt.Printf("[%s] %s | %s | %s | %s\n", time.Now().Format(time.RFC3339), d.Title, d.Summary, d.Effective, d.Health)
	}
	c.last = d
}
func (c *console) Notify(text string) { fmt.Println("NOTIFICATION:", text) }
