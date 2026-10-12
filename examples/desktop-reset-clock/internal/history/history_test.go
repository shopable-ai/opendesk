package history

import (
 "encoding/json"
 "testing"
 "time"
)

func TestArchiveRevisionCountsDSTAndUnknown(t *testing.T) {
 loc,err:=time.LoadLocation("America/New_York");if err!=nil{t.Fatal(err)}
 now:=time.Date(2026,11,8,17,0,0,0,time.UTC)
 day:=now.Add(-10*24*time.Hour)
 early:=now.Add(-40*24*time.Hour)
 rec:=func(id,kind,src string,at time.Time)Record{
  v:=at
  return Record{ID:id,Revision:1,Kind:kind,State:"active",SourceType:src,
    Audience:"public",SourcePublishedAt:&v,ConfirmedAt:&v,ObservedAt:&v,VerifiedAt:&v,SourceURL:"https://example.org/e/"+id}
 }
 records:=[]Record{
  rec("announce","reset_announcement","official",day),
  rec("complete","reset_completed","official",day),
  rec("gift","extra_opportunity","official",day),
  rec("observed","observed_reset","user_observation",day),
  rec("early","reset_announcement","official",early),
 }
 revised:=records[0];revised.Revision=2;revised.SourceUpdatedAt=&day
 records=append(records,revised)
 withdrawn:=records[2];withdrawn.Revision=2;withdrawn.State="withdrawn"
 records=append(records,withdrawn)
 p:=Page{SchemaVersion:1,ChannelID:"demo",ArchiveVersion:3,CoverageStart:now.Add(-65*24*time.Hour),
 CoverageEnd:now.Add(time.Minute),Complete:true,Records:records}
 a,e:=Merge([]Page{p});if e!=nil{t.Fatal(e)}
 s:=Analyze(&a,now,loc)
 if s.Last30Days.Announcements.Count!=1 || s.Last30Days.Confirmations.Count!=1 ||
 s.Last30Days.Gifts.Count!=0 || s.Last30Days.Observations.Count!=1 ||
 s.CurrentMonth.Announcements.Count!=1 || len(s.Last30Days.Announcements.Evidence)!=1 {
  t.Fatalf("incorrect evidence-backed counts %+v",s)
 }
 a.Complete=false
 if got:=Analyze(&a,now,loc).Last30Days.Announcements.Label();got!="数据不足" {t.Fatal(got)}
 a.Complete=true;a.CoverageStart=now.Add(-3*24*time.Hour)
 if Analyze(&a,now,loc).Last30Days.Announcements.Known {t.Fatal("partial 30-day coverage was counted")}
}
func TestArchiveUntrustedAndPaging(t *testing.T) {
 now:=time.Now().UTC()
 r:=Record{ID:"a",Revision:1,Kind:"reset_announcement",State:"active",SourceType:"official",
 Audience:"public",SourcePublishedAt:&now,VerifiedAt:&now,SourceURL:"https://example.org/source"}
 p:=Page{SchemaVersion:1,ChannelID:"demo",ArchiveVersion:1,CoverageStart:now.Add(-50*24*time.Hour),
 CoverageEnd:now.Add(time.Minute),Complete:true,Records:[]Record{r},NextCursor:"next"}
 b,_:=json.Marshal(p)
 d,e:=DecodePage(b);if e!=nil||d.NextCursor!="next"{t.Fatalf("decode: %v",e)}
 end:=p;end.Records=nil;end.NextCursor=""
 if _,e:=Merge([]Page{p,end});e!=nil{t.Fatal(e)}
 if _,e:=Merge([]Page{p,p});e==nil{t.Fatal("cursor incomplete accepted")}
 p.Records[0].SourceURL="javascript:alert(1)"
 if e:=ValidatePage(p);e==nil{t.Fatal("unsafe source URL accepted")}
}
