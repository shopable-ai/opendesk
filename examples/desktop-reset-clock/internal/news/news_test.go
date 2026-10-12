package news

import (
 "testing"
 "time"
)
func TestRevisionWithdrawalSortingAndUntrustedURL(t *testing.T){
 now:=time.Now().UTC()
 n:=func(id string,ago time.Duration)Item{return Item{ID:id,Revision:1,Title:id,
 Summary:"模拟数据",PublishedAt:now.Add(-ago),UpdatedAt:now.Add(-ago),
 VerifiedAt:now,SourceURL:"https://example.org/"+id,Category:"release",SourceType:"third_party",State:"active"}}
 old:=[]Item{n("a",time.Hour),n("b",2*time.Hour),n("c",3*time.Hour)}
 if len(Top(old,2))!=2 || Top(old,2)[0].ID!="a"{t.Fatal("wrong sorting")}
 next:=append([]Item(nil),old...)
 next[0].Revision=2;next[0].State="withdrawn"
 if changed,e:=Reconcile(old,next);e!=nil||!changed{t.Fatalf("withdrawn: %v %t",e,changed)}
 if len(Top(next,3))!=2{t.Fatal("withdrawn shown")}
 if _,e:=Reconcile(old,next[1:]);e==nil{t.Fatal("missing tombstone allowed")}
 next[0].SourceURL="http://invalid.example"
 if Validate(next)==nil{t.Fatal("unsafe link allowed")}
}
