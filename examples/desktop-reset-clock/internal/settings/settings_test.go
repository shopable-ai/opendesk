package settings

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
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

func TestInvalidHistoryCacheIsIsolatedFromClockAndTrial(t *testing.T) {
 p:=filepath.Join(t.TempDir(),"state.json")
 now:=time.Now().UTC()
 s:=Default()
 s.Config.FeedURL="https://example.org/feed"
 s.SourceIdentity=s.Config.FeedURL
 s.Snapshot=&events.Snapshot{
   SchemaVersion:1,ChannelID:"demo",FeedVersion:1,GeneratedAt:now,
   HistoryURL:"https://example.org/archive",HistoryVersion:1,
 }
 s.ArchiveSource=s.Snapshot.HistoryURL
 s.Archive=&history.Archive{
   ChannelID:"demo",ArchiveVersion:1,CoverageStart:now.Add(-40*24*time.Hour),
   CoverageEnd:now.Add(time.Hour),Complete:true,
   Records:[]history.Record{{ID:"tampered",Revision:1,Kind:"reset_announcement",
     State:"active",SourceType:"official",Audience:"public",SourceURL:"javascript:bad"}},
 }
 s.Membership.PremiumFired=map[string]bool{"notice-one":true}
 if err:=Save(p,s);err!=nil{t.Fatal(err)}
 loaded,err:=Load(p)
 if err!=nil{t.Fatal(err)}
 if loaded.Archive!=nil || loaded.ArchiveError=="" || loaded.Snapshot==nil {
   t.Fatalf("damaged history must not replace base clock or become a zero: %+v",loaded)
 }
 if !loaded.Membership.PremiumFired["notice-one"] {
   t.Fatal("damaged history reset premium trial counter")
 }
}
