// Package history validates external, versioned archives and computes evidence-backed counts.
// No web scraping, account access or predictive reset times belong in this package.
package history

import (
 "bytes"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/url"
 "sort"
 "strings"
 "time"
)

const MaxPageRecords = 200

type Record struct {
 ID string `json:"id"`
 Revision int64 `json:"revision"`
 Kind string `json:"kind"`
 State string `json:"state"`
 SourceType string `json:"source_type"`
 Audience string `json:"audience"`
 SourcePublishedAt *time.Time `json:"source_published_at,omitempty"`
 SourceUpdatedAt *time.Time `json:"source_updated_at,omitempty"`
 EffectiveAt *time.Time `json:"effective_at,omitempty"`
 ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
 ObservedAt *time.Time `json:"observed_at,omitempty"`
 VerifiedAt *time.Time `json:"verified_at,omitempty"`
 SourceURL string `json:"source_url"`
 Summary string `json:"summary,omitempty"`
}
type Page struct {
 SchemaVersion int `json:"schema_version"`
 ChannelID string `json:"channel_id"`
 ArchiveVersion int64 `json:"archive_version"`
 CoverageStart time.Time `json:"coverage_start"`
 CoverageEnd time.Time `json:"coverage_end"`
 Complete bool `json:"complete"`
 Records []Record `json:"records"`
 NextCursor string `json:"next_cursor,omitempty"`
}
type Archive struct {
 ChannelID string `json:"channel_id"`
 ArchiveVersion int64 `json:"archive_version"`
 CoverageStart time.Time `json:"coverage_start"`
 CoverageEnd time.Time `json:"coverage_end"`
 Complete bool `json:"complete"`
 Records []Record `json:"records"`
}
type Evidence struct {
 ID string `json:"id"`
 Revision int64 `json:"revision"`
 SourceURL string `json:"source_url"`
}
type Metric struct {
 Known bool `json:"known"`
 Count int `json:"count"`
 Evidence []Evidence `json:"evidence,omitempty"`
}
func (m Metric) Label() string {
 if !m.Known { return "数据不足" }
 return fmt.Sprintf("%d 次",m.Count)
}
type Window struct {
 From time.Time `json:"from"`
 To time.Time `json:"to"`
 Announcements Metric `json:"announcements"`
 Confirmations Metric `json:"confirmations"`
 Gifts Metric `json:"gifts"`
 Observations Metric `json:"observations"`
}
type Summary struct {
 Last30Days Window `json:"last_30_days"`
 CurrentMonth Window `json:"current_month"`
}

func DecodePage(data []byte) (Page,error) {
 var p Page
 d:=json.NewDecoder(bytes.NewReader(data))
 if err:=d.Decode(&p);err!=nil{return p,fmt.Errorf("invalid archive JSON: %w",err)}
 var extra any
 if err:=d.Decode(&extra);!errors.Is(err,io.EOF){return p,errors.New("archive JSON has trailing content")}
 return p,ValidatePage(p)
}
func ValidatePage(p Page) error {
 if p.SchemaVersion!=1 || p.ArchiveVersion<1 || strings.TrimSpace(p.ChannelID)=="" || len(p.ChannelID)>128 ||
 p.CoverageStart.IsZero() || !p.CoverageEnd.After(p.CoverageStart) || len(p.Records)>MaxPageRecords ||
 len(p.NextCursor)>128 || strings.ContainsAny(p.NextCursor,"\r\n") {
  return errors.New("invalid archive metadata, coverage or page size")
 }
 for _,r:=range p.Records {if err:=ValidateRecord(r);err!=nil{return fmt.Errorf("record %q: %w",r.ID,err)}}
 return nil
}
func ValidateRecord(r Record) error {
 if strings.TrimSpace(r.ID)=="" || len(r.ID)>160 || r.Revision<1 || len(r.Summary)>2048 ||
 strings.TrimSpace(r.Audience)=="" || len(r.Audience)>128 {
  return errors.New("invalid record identity, audience or summary")
 }
 if r.State!="active" && r.State!="withdrawn" && r.State!="superseded" {return errors.New("invalid state")}
 if r.SourceType!="official" && r.SourceType!="user_observation" {return errors.New("invalid source type")}
 switch r.Kind {
 case "reset_announcement","reset_completed","extra_opportunity":
  if r.SourceType!="official" || r.SourcePublishedAt==nil || r.VerifiedAt==nil {
   return errors.New("official evidence requires published and verified timestamps")
  }
  if r.Kind=="reset_completed" && r.State=="active" && r.ConfirmedAt==nil {return errors.New("missing official completion timestamp")}
 case "observed_reset":
  if r.SourceType!="user_observation" || r.ObservedAt==nil {return errors.New("observation must have observation timestamp")}
 default: return errors.New("unrecognized history kind")
 }
 u,err:=url.Parse(r.SourceURL)
 if err!=nil || u.Scheme!="https" || u.Host=="" || u.User!=nil || u.Fragment!="" || u.Opaque!="" {
  return errors.New("HTTPS evidence URL required")
 }
 return nil
}
// Merge rejects mismatched pagination metadata and any repeated event revision.
// A declaration of "complete" is a provider claim, not a cryptographic proof of official provenance.
func Merge(pages []Page) (Archive,error) {
 if len(pages)==0 || len(pages)>12 {return Archive{},errors.New("invalid archive page count")}
 first:=pages[0]
 if err:=ValidatePage(first);err!=nil{return Archive{},err}
 a:=Archive{ChannelID:first.ChannelID,ArchiveVersion:first.ArchiveVersion,CoverageStart:first.CoverageStart,CoverageEnd:first.CoverageEnd,Complete:first.Complete}
 seen:=map[string]bool{}
 for i,p:=range pages {
  if err:=ValidatePage(p);err!=nil{return Archive{},err}
  if p.ChannelID!=a.ChannelID || p.ArchiveVersion!=a.ArchiveVersion || !p.CoverageStart.Equal(a.CoverageStart) ||
  !p.CoverageEnd.Equal(a.CoverageEnd) || p.Complete!=a.Complete {
   return Archive{},errors.New("archive pagination metadata changed")
  }
  if (i+1<len(pages))!=(p.NextCursor!="") {return Archive{},errors.New("incomplete or unexpected archive pagination")}
  for _,r:=range p.Records {
   k:=fmt.Sprintf("%s:%d",r.ID,r.Revision)
   if seen[k] {return Archive{},fmt.Errorf("duplicate revision %s",k)}
   seen[k]=true
   a.Records=append(a.Records,r)
  }
 }
 if err:=ValidateArchive(a);err!=nil{return Archive{},err}
 return a,nil
}
// ValidateArchive checks flattened persisted history separately from individual
// HTTP pages. Locally cached data does not become authenticated official data.
func ValidateArchive(a Archive) error {
 if a.ArchiveVersion<1 || strings.TrimSpace(a.ChannelID)=="" || len(a.ChannelID)>128 ||
  a.CoverageStart.IsZero() || !a.CoverageEnd.After(a.CoverageStart) ||
  len(a.Records)>MaxPageRecords*12 {
  return errors.New("invalid cached archive metadata or record count")
 }
 seen:=map[string]bool{}
 for _,r:=range a.Records {
  if err:=ValidateRecord(r);err!=nil{return fmt.Errorf("invalid cached archive %s: %w",r.ID,err)}
  key:=fmt.Sprintf("%s:%d",r.ID,r.Revision)
  if seen[key]{return fmt.Errorf("duplicate cached archive revision: %s",key)}
  seen[key]=true
 }
 return nil
}
// Analyze uses exact instants for rolling days, and the chosen IANA location for calendar months.
// Counts are unknown until the provider explicitly covers the WHOLE window.
func Analyze(a *Archive, now time.Time, loc *time.Location) Summary {
 if loc==nil {loc=time.Local}
 local:=now.In(loc)
 month:=time.Date(local.Year(),local.Month(),1,0,0,0,0,loc)
 result:=Summary{Last30Days:Window{From:now.Add(-30*24*time.Hour),To:now},
 CurrentMonth:Window{From:month,To:now}}
 count(a,&result.Last30Days)
 count(a,&result.CurrentMonth)
 return result
}
func count(a *Archive, w *Window) {
 if a==nil || !a.Complete || a.CoverageStart.After(w.From) || a.CoverageEnd.Before(w.To) {return}
 w.Announcements.Known=true
 w.Confirmations.Known=true
 w.Gifts.Known=true
 w.Observations.Known=true
 latest:=map[string]Record{}
 for _,r:=range a.Records {
  if prev,ok:=latest[r.ID];!ok || r.Revision>prev.Revision {latest[r.ID]=r}
 }
 for _,r:=range latest {
  if r.State!="active" {continue}
  var at *time.Time
  var metric *Metric
  switch r.Kind {
  case "reset_announcement":
   if r.SourceType=="official" {at=r.SourcePublishedAt;metric=&w.Announcements}
  case "reset_completed":
   if r.SourceType=="official" {at=r.ConfirmedAt;metric=&w.Confirmations}
  case "extra_opportunity":
   if r.SourceType=="official" {at=r.SourcePublishedAt;metric=&w.Gifts}
  case "observed_reset":
   if r.SourceType=="user_observation" {at=r.ObservedAt;metric=&w.Observations}
  }
  if metric==nil || at==nil || at.Before(w.From) || !at.Before(w.To) {continue}
  metric.Count++
  metric.Evidence=append(metric.Evidence,Evidence{ID:r.ID,Revision:r.Revision,SourceURL:r.SourceURL})
 }
 for _,m:=range []*Metric{&w.Announcements,&w.Confirmations,&w.Gifts,&w.Observations} {
  sort.Slice(m.Evidence,func(i,j int)bool{return m.Evidence[i].ID<m.Evidence[j].ID})
 }
}
