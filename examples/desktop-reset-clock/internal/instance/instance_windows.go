//go:build windows

package instance

// Native Windows UI owns its named mutex; keep a no-op lease for shared cmd.
type Lease struct{}

func Acquire(string) (*Lease, error) { return &Lease{}, nil }
func (*Lease) Close() error          { return nil }
