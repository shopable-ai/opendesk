package app
import("testing";"time")
func TestCompactStatusTransitions(t *testing.T){
 now:=time.Date(2026,10,14,10,0,0,0,time.UTC)
 future:=now.Add(2*time.Hour+13*time.Minute+1*time.Second)
 active:=compactStatus(now,&future,true,"active")
 if active.State!="upcoming"||active.ShortRemaining!="2h14m"{t.Fatalf("active %+v",active)}
 revised:=compactStatus(now,&future,true,"revised")
 if revised.State!="revised"||revised.ShortRemaining!=active.ShortRemaining{t.Fatalf("revised %+v",revised)}
 near:=now.Add(14*time.Minute+10*time.Second)
 soon:=compactStatus(now,&near,true,"active")
 if soon.State!="soon"||soon.ShortRemaining!="15m"{t.Fatalf("soon %+v",soon)}
 for _,tc:=range []struct{kind,want string}{{"empty","idle"},{"withdrawn","withdrawn"},{"stale","stale"},{"error","error"}} {
  got:=compactStatus(now,&future,false,tc.kind)
  if got.State!=tc.want||got.ShortRemaining!=""{t.Fatalf("%s %+v",tc.kind,got)}
 }
 past:=now.Add(-time.Second)
 if compactStatus(now,&past,true,"active").ShortRemaining!="" {t.Fatal("expired")}
 if compactStatus(now,&future,false,"active").ShortRemaining!="" {t.Fatal("unverified")}
 if compactRemaining(24*60+5)!="1d 0h"{t.Fatal("days")}
}
func TestWebDetailsSameOrigin(t *testing.T){
 cases:=[]struct{feed,site string;local,allow bool}{
  {"http://127.0.0.1:8788/feed","http://127.0.0.1:8788/reset-clock/",true,true},
  {"https://reset.example.org/feed","https://reset.example.org/reset-clock/",false,true},
  {"https://reset.example.org/feed","https://other.example.org/reset-clock/",false,false},
  {"https://reset.example.org/feed","https://reset.example.org.evil/reset-clock/",false,false},
  {"https://reset.example.org/feed","https://reset.example.org/reset-clock/?redirect=https://bad.test",false,false},
  {"http://127.0.0.1:8788/feed","http://127.0.0.1:8789/reset-clock/",true,false},
  {"http://127.0.0.1:8788/feed","http://127.0.0.1:8788/reset-clock/",false,false},
 }
 for _,tc:=range cases{
  got:=sameOriginWebDetails(tc.feed,tc.site,tc.local)!=""
  if got!=tc.allow {t.Fatalf("%s expected %t got %t",tc.site,tc.allow,got)}
 }
}
