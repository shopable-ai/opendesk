// Package catalog validates external resource/service links without handling
// credentials, account resale or undisclosed paid placements.
package catalog

import(
 "errors"
 "fmt"
 "net/url"
 "strings"
)
type Entry struct{
 ID string `json:"id"`
 Category string `json:"category"`
 Title string `json:"title"`
 Description string `json:"description"`
 URL string `json:"url"`
 Source string `json:"source"`
 SourceType string `json:"source_type"`
 Promoted bool `json:"promoted"`
 Disclosure string `json:"disclosure,omitempty"`
}
func Validate(entries []Entry)error{
 if len(entries)>100{return errors.New("catalog too large")}
 seen:=map[string]bool{}
 for _,e:=range entries{
  if e.ID==""||len(e.ID)>120||seen[e.ID]||e.Title==""||len([]rune(e.Title))>120||
   e.Category==""||len(e.Category)>60||e.Source==""||len(e.Description)>500 {
    return fmt.Errorf("invalid catalog entry %s",e.ID)
  }
  seen[e.ID]=true
  if e.SourceType!="official"&&e.SourceType!="third_party"&&e.SourceType!="partner"{
   return fmt.Errorf("unknown catalog source type: %s",e.ID)
  }
  if e.Promoted && strings.TrimSpace(e.Disclosure)==""{return fmt.Errorf("undisclosed promoted entry: %s",e.ID)}
  u,err:=url.Parse(e.URL)
  if err!=nil || u.Scheme!="https"||u.Host==""||u.User!=nil||u.Fragment!=""||u.Opaque!=""{
   return fmt.Errorf("unsafe URL: %s",e.ID)
  }
 }
 return nil
}
// Current bundled entries are official public documentation, not products for sale.
func Default()[]Entry{
 return []Entry{
  {ID:"codex-guide",Category:"documentation",Title:"Codex 官方资源",Description:"官方使用指南和最佳实践",
   URL:"https://developers.openai.com/learn/codex",Source:"OpenAI Developers",SourceType:"official"},
  {ID:"api-quickstart",Category:"documentation",Title:"API 开发指南",Description:"官方 API 快速开始说明",
   URL:"https://developers.openai.com/api/docs/quickstart",Source:"OpenAI Developers",SourceType:"official"},
 }
}
