// Package news validates curated, source-linked news included in the trusted feed.
// It never scrapes HTML or treats editorial interpretations as official statements.
package news

import (
 "errors"
 "fmt"
 "net/url"
 "reflect"
 "sort"
 "strings"
 "time"
)
type Item struct {
 ID string `json:"id"`
 Revision int64 `json:"revision"`
 Title string `json:"title"`
 Summary string `json:"summary"`
 PublishedAt time.Time `json:"published_at"`
 UpdatedAt time.Time `json:"updated_at"`
 SourceURL string `json:"source_url"`
 Category string `json:"category"`
 SourceType string `json:"source_type"`
 State string `json:"state"`
 VerifiedAt time.Time `json:"verified_at"`
}
func Validate(items []Item)error{
 if len(items)>64{return errors.New("too many curated updates")}
 ids:=map[string]bool{}
 for _,n:=range items{
  if strings.TrimSpace(n.ID)=="" || len(n.ID)>160 || n.Revision<1 || ids[n.ID] ||
   strings.TrimSpace(n.Title)=="" || len([]rune(n.Title))>130 || len([]rune(n.Summary))>480 ||
   n.PublishedAt.IsZero() || n.UpdatedAt.IsZero() || n.VerifiedAt.IsZero() ||
   n.UpdatedAt.Before(n.PublishedAt) || len(n.Category)>64 || n.Category=="" {
   return fmt.Errorf("invalid news identity/content: %q",n.ID)
  }
  ids[n.ID]=true
  if n.State!="active" && n.State!="withdrawn" && n.State!="source_unavailable" {return fmt.Errorf("invalid news state: %s",n.ID)}
  if n.SourceType!="official" && n.SourceType!="third_party" && n.SourceType!="editorial" {return fmt.Errorf("invalid news provenance: %s",n.ID)}
  u,err:=url.Parse(n.SourceURL)
  if err!=nil || u.Scheme!="https" || u.Host=="" || u.User!=nil || u.Fragment!="" || u.Opaque!="" {
   return fmt.Errorf("news %s requires HTTPS source URL",n.ID)
  }
 }
 return nil
}
// Reconcile requires explicit tombstones; silently disappearing news may be unreliable.
func Reconcile(old,next []Item)(bool,error){
 if err:=Validate(next);err!=nil{return false,err}
 prev:=map[string]Item{}
 for _,n:=range old{prev[n.ID]=n}
 changed:=false
 for _,n:=range next{
  p,ok:=prev[n.ID]
  if !ok {changed=true;continue}
  delete(prev,n.ID)
  if n.Revision<p.Revision {return false,fmt.Errorf("news revision regression: %s",n.ID)}
  if n.Revision==p.Revision && !reflect.DeepEqual(n,p){return false,fmt.Errorf("news content changed without revision: %s",n.ID)}
  if n.Revision>p.Revision{changed=true}
 }
 if len(prev)>0{return false,errors.New("news disappeared without withdrawn tombstone")}
 return changed,nil
}
func Top(items []Item,limit int)[]Item{
 if limit<1{return nil}
 if limit>3{limit=3}
 c:=make([]Item,0,len(items))
 for _,n:=range items{if n.State=="active"{c=append(c,n)}}
 sort.Slice(c,func(i,j int)bool{
  if c[i].UpdatedAt.Equal(c[j].UpdatedAt){return c[i].ID<c[j].ID}
  return c[i].UpdatedAt.After(c[j].UpdatedAt)
 })
 if len(c)>limit {c=c[:limit]}
 return c
}
