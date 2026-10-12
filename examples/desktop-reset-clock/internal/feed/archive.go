package feed

import (
 "context"
 "errors"
 "fmt"
 "io"
 "net/http"
 "net/url"
 "strings"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
)
// FetchArchive reads a versioned, fully covered paginated archive. Both URL and redirects
// must remain on the existing feed origin; no new credentials or cross-origin fetches.
func (c Client) FetchArchive(ctx context.Context,feedURL,archiveURL,channel string,version int64)(history.Archive,error){
 if err:=CheckURL(feedURL,c.AllowLocalHTTP);err!=nil{return history.Archive{},err}
 if err:=CheckURL(archiveURL,c.AllowLocalHTTP);err!=nil{return history.Archive{},err}
 base,_:=url.Parse(feedURL)
 dest,_:=url.Parse(archiveURL)
 if base.Scheme!=dest.Scheme || !strings.EqualFold(base.Host,dest.Host) || dest.Query().Has("cursor"){
  return history.Archive{},errors.New("archive must use feed origin without cursor query")
 }
 client:=c.HTTP
 if client==nil{client=&http.Client{Timeout:8*time.Second}}
 clone:=*client
 clone.CheckRedirect=func(req *http.Request,via []*http.Request)error{
  if len(via)>3 || req.URL.Scheme!=base.Scheme || !strings.EqualFold(req.URL.Host,base.Host){
   return errors.New("cross-origin archive redirect denied")
  }
  return CheckURL(req.URL.String(),c.AllowLocalHTTP)
 }
 var pages []history.Page
 cursor:=""
 visited:=map[string]bool{}
 for pageNo:=0;pageNo<12;pageNo++{
  next:=*dest
  q:=next.Query()
  if cursor!=""{q.Set("cursor",cursor)}
  next.RawQuery=q.Encode()
  req,err:=http.NewRequestWithContext(ctx,http.MethodGet,next.String(),nil)
  if err!=nil{return history.Archive{},err}
  req.Header.Set("Accept","application/json")
  req.Header.Set("User-Agent","OpenDesk-Reset-Clock/2")
  res,err:=clone.Do(req)
  if err!=nil{return history.Archive{},fmt.Errorf("archive transport failed: %w",err)}
  if res.StatusCode!=http.StatusOK {res.Body.Close();return history.Archive{},fmt.Errorf("archive HTTP status %d",res.StatusCode)}
  if ct:=res.Header.Get("Content-Type");ct!=""&&!strings.Contains(strings.ToLower(ct),"json"){
   res.Body.Close();return history.Archive{},errors.New("archive is not JSON")
  }
  b,err:=io.ReadAll(io.LimitReader(res.Body,maxBytes+1))
  res.Body.Close()
  if err!=nil||len(b)>maxBytes{return history.Archive{},errors.New("archive response too large or unreadable")}
  p,err:=history.DecodePage(b)
  if err!=nil{return history.Archive{},err}
  if p.ChannelID!=channel || p.ArchiveVersion!=version {return history.Archive{},errors.New("archive channel/version does not match feed")}
  pages=append(pages,p)
  if p.NextCursor==""{return history.Merge(pages)}
  if visited[p.NextCursor] {return history.Archive{},errors.New("archive pagination loop")}
  visited[p.NextCursor]=true
  cursor=p.NextCursor
 }
 return history.Archive{},errors.New("archive pagination exceeded 12-page limit")
}
