package settings

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAtomicAndDamagedCache(t *testing.T) {
	p := filepath.Join(t.TempDir(), "clock", "state.json")
	s := Default()
	s.Config.FeedURL = "https://example.org/feed"
	if err := Save(p, s); err != nil {
		t.Fatal(err)
	}
	mode, e := os.Stat(p)
	// Go FileMode.Perm is not a Windows ACL; validate POSIX permissions only on Unix.
	if e != nil || (runtime.GOOS != "windows" && mode.Mode().Perm()&0077 != 0) {
		t.Fatal("state is world accessible")
	}
	other, e := Load(p)
	if e != nil || other.Config.FeedURL != s.Config.FeedURL {
		t.Fatalf("reload: %v", e)
	}
	if e := os.WriteFile(p, []byte("broken"), 0600); e != nil {
		t.Fatal(e)
	}
	if _, e := Load(p); e == nil {
		t.Fatal("accepted corrupted cache")
	}
}
