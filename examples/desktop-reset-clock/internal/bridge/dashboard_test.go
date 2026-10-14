package bridge

import (
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "path/filepath"
 "strings"
 "testing"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
)

func TestR26WebOverviewAndFeedLink(t *testing.T){
 now:=func()time.Time{return time.Date(2026,10,14,9,0,0,0,time.UTC)}
 e,err:=New(filepath.Join(t.TempDir(),"bridge.json"),codexreset.Collector{},now)
 if err!=nil{t.Fatal(err)}
 h,err:=e.Handler("http://127.0.0.1:8788")
 if err!=nil{t.Fatal(err)}
 feed:=httptest.NewRecorder()
 h.ServeHTTP(feed,httptest.NewRequest(http.MethodGet,"http://127.0.0.1:8788/feed",nil))
 if feed.Code!=200 {t.Fatalf("feed %d",feed.Code)}
 var got events.Snapshot
 if err:=json.Unmarshal(feed.Body.Bytes(),&got);err!=nil{t.Fatal(err)}
 if got.WebDetailsURL!="http://127.0.0.1:8788/reset-clock/"{t.Fatalf("link %s",got.WebDetailsURL)}
 page:=httptest.NewRecorder()
 h.ServeHTTP(page,httptest.NewRequest(http.MethodGet,got.WebDetailsURL,nil))
 if page.Code!=200||!strings.Contains(page.Body.String(),"记录与动态")||
  !strings.Contains(page.Body.String(),"数据不足")||
  !strings.Contains(page.Body.String(),"codex-reset.com")||
  !strings.Contains(page.Header().Get("Content-Security-Policy"),"default-src 'none'"){
  t.Fatalf("page %d: %s",page.Code,page.Body.String())
 }
 denied:=httptest.NewRecorder()
 h.ServeHTTP(denied,httptest.NewRequest(http.MethodPost,got.WebDetailsURL,nil))
 if denied.Code!=405{t.Fatalf("POST accepted %d",denied.Code)}
 e.mu.Lock()
 e.disk.Snapshot.News=[]news.Item{{ID:"i",Title:"<img src=x onerror=alert(1)>",Summary:"test",State:"active",UpdatedAt:now()}}
 e.mu.Unlock()
 escaped:=httptest.NewRecorder()
 h.ServeHTTP(escaped,httptest.NewRequest(http.MethodGet,got.WebDetailsURL,nil))
 if strings.Contains(escaped.Body.String(),"<img src=x onerror=alert(1)>")||
  !strings.Contains(escaped.Body.String(),"&lt;img") {t.Fatal("feed headline not escaped")}
}
