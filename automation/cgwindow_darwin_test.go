//go:build darwin

package automation

import "testing"

func TestCStringBytesStopsAtNull(t *testing.T) {
	if got := cStringBytes([]byte{'a', 'b', 0, 'c'}); got != "ab" {
		t.Fatalf("cStringBytes = %q, want ab", got)
	}
}
