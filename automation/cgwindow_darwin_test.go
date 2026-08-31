//go:build darwin

package automation

import "testing"

func TestCStringBytesStopsAtNull(t *testing.T) {
	if got := cStringBytes([]byte{'a', 'b', 0, 'c'}); got != "ab" {
		t.Fatalf("cStringBytes = %q, want ab", got)
	}
}

func TestLSAppInfoPIDPattern(t *testing.T) {
	match := lsappinfoPIDPattern.FindStringSubmatch(`"pid"=53703`)
	if len(match) != 2 || match[1] != "53703" {
		t.Fatalf("unexpected match: %#v", match)
	}
}
