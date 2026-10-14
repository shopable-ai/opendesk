package events
import("testing";"time")
func TestR26WebDetailsURLValidation(t *testing.T){
 s:=Snapshot{SchemaVersion:1,ChannelID:"test",FeedVersion:1,GeneratedAt:time.Now().UTC(),Events:[]Event{}}
 for _,tc:=range []struct{url string;valid bool}{
  {"https://example.org/reset-clock/",true},
  {"http://127.0.0.1:8788/reset-clock/",true},
  {"https://evil.org/reset-clock/?next=https://good.org",false},
  {"javascript:alert(1)",false},
  {"http://evil.org/reset-clock/",false},
  {"https://example.org/unrelated",false},
 }{
  s.WebDetailsURL=tc.url
  err:=Validate(s)
  if (err==nil)!=tc.valid {t.Fatalf("%s valid=%t err=%v",tc.url,tc.valid,err)}
 }
}
