package feed

import(
 "context"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "testing"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
)
func TestArchiveOriginPaginationAndVersion(t *testing.T){
 now:=time.Now().UTC()
 calls:=0
 s:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  calls++
  if r.URL.Path!="/archive"{http.NotFound(w,r);return}
  p:=history.Page{SchemaVersion:1,ChannelID:"demo",ArchiveVersion:2,CoverageStart:now.Add(-60*24*time.Hour),CoverageEnd:now.Add(time.Minute),Complete:true}
  if r.URL.Query().Get("cursor")=="" {p.NextCursor="page-2"} else if r.URL.Query().Get("cursor")=="page-2"{
    p.Records=[]history.Record{{ID:"x",Revision:1,Kind:"reset_announcement",State:"active",
      SourceType:"official",Audience:"public",SourcePublishedAt:&now,VerifiedAt:&now,SourceURL:"https://example.org/a"}}
  } else {t.Errorf("unknown cursor %q",r.URL.RawQuery)}
  w.Header().Set("Content-Type","application/json");json.NewEncoder(w).Encode(p)
 }))
 defer s.Close()
 c:=Client{AllowLocalHTTP:true}
 a,e:=c.FetchArchive(context.Background(),s.URL+"/feed",s.URL+"/archive","demo",2)
 if e!=nil || calls!=2 || len(a.Records)!=1 {t.Fatalf("two pages: %+v %d %v",a,calls,e)}
 if _,e=c.FetchArchive(context.Background(),s.URL+"/feed","https://evil.example/archive","demo",2);e==nil{
  t.Fatal("cross origin accepted")
 }
 if _,e=c.FetchArchive(context.Background(),s.URL+"/feed",s.URL+"/archive","demo",3);e==nil{
  t.Fatal("mismatched version accepted")
 }
}
