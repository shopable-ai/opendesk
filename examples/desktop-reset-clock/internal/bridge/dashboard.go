package bridge

import (
    "html/template"
    "net/http"
    "sort"
    "time"

    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
)

// The web overview is a read-only public-data page served by the existing
// Bridge, ready to be published at a verified product origin later. It is NOT
// an OpenAI official site, personal quota dashboard or a second collector.
type webMetric struct {Name,Value string}
type webRow struct {Date,Kind,State,Summary,URL string}
type webNews struct {Date,Title,Summary,State,URL string}
type webView struct {
    Health,Checked,Generated string
    Metrics []webMetric
    Records []webRow
    Stories []webNews
    SourceURL string
}
var overviewTemplate=template.Must(template.New("reset-clock").Parse(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset Clock · 记录与动态</title>
<style>
:root{color-scheme:light;--ink:#173c37;--muted:#5f7770;--mint:#c5f9df}
*{box-sizing:border-box}body{margin:0;background:#f3f7f5;color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:#136b5d;text-decoration:none}a:hover{text-decoration:underline}
header{background:radial-gradient(circle at 87% 20%,#318d79,transparent 42%),linear-gradient(115deg,#083f39,#174d49);color:#f3fffa;padding:38px max(22px,calc((100vw - 1000px)/2))}
header h1{margin:5px 0;font-size:31px;font-weight:750;letter-spacing:-.04em}header p{color:#b7dccc;margin:0}
nav{display:flex;gap:20px;margin-top:22px}nav a{color:#ddffec}
main{max-width:1040px;margin:0 auto;padding:20px 20px 64px}.notice{margin:10px 0 20px;padding:14px 18px;background:#e7f1eb;border-left:3px solid #538f7d;border-radius:9px;color:#315b50}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card,.panel{background:white;border:1px solid #dfebe4;border-radius:17px;box-shadow:0 8px 30px #17483b0b}
.card{padding:17px}.card strong{display:block;font-size:23px;margin-top:8px}.kicker{font-size:12px;color:var(--muted)}
.panel{padding:18px 22px;margin-top:20px}h2{font-size:20px;margin:0 0 12px}h3{font-size:15px;margin:0 0 4px}.entry{padding:15px 0;border-bottom:1px solid #e8eee9}.entry:last-child{border:0}.entry p{margin:6px 0;color:#46685f;overflow-wrap:anywhere}.meta{color:#688076;font-size:12px}
footer{font-size:12px;color:#60796e;margin-top:24px}footer a{font-weight:600}
@media(max-width:670px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}header h1{font-size:25px}nav{flex-wrap:wrap}.panel{padding:16px}}
</style></head><body>
<header><div class="kicker" style="color:#b8ebd2">OpenDesk · Reset Clock</div><h1>记录与动态</h1>
<p>来源健康：{{.Health}} · 最近上游检查：{{.Checked}}</p>
<nav aria-label="页面导航"><a href="#overview">概览</a><a href="#history">历史记录</a><a href="#news">资讯</a></nav></header>
<main><div class="notice">这里显示的是独立第三方追踪信息，不是 OpenAI 官方公告，也不代表任何个人账户额度已恢复。没有可核验未来时刻时，不显示精确倒计时。</div>
<section id="overview" aria-labelledby="overview-title"><h2 id="overview-title">最近 30 天</h2><div class="cards">
{{range .Metrics}}<div class="card"><span class="kicker">{{.Name}}</span><strong>{{.Value}}</strong></div>{{end}}
</div></section>
<section id="history" class="panel" aria-labelledby="history-title"><h2 id="history-title">历史记录</h2>
{{if .Records}}{{range .Records}}<article class="entry"><div class="meta">{{.Date}} · {{.State}}</div>
<h3>{{.Kind}}</h3><p>{{.Summary}}</p>{{if .URL}}<a href="{{.URL}}" target="_blank" rel="noopener noreferrer">查看原始证据 ↗</a>{{end}}</article>{{end}}
{{else}}<p>暂无可核验历史记录。记录不完整不代表重置次数为零。</p>{{end}}</section>
<section id="news" class="panel" aria-labelledby="news-title"><h2 id="news-title">最新资讯</h2>
{{if .Stories}}{{range .Stories}}<article class="entry"><div class="meta">{{.Date}} · {{.State}}</div>
<h3>{{.Title}}</h3><p>{{.Summary}}</p>{{if .URL}}<a href="{{.URL}}" target="_blank" rel="noopener noreferrer">阅读来源 ↗</a>{{end}}</article>{{end}}
{{else}}<p>暂无有效资讯。</p>{{end}}</section>
<footer>生成时间：{{.Generated}} UTC　·　第三方数据来源：<a href="{{.SourceURL}}" target="_blank" rel="noopener noreferrer">Data: codex-reset.com ↗</a><p>此页由当前 Feed Bridge 提供；若访问地址为 localhost，它是本机开发页面，并非已经上线的产品官网。</p></footer>
</main></body></html>`))

func webRecordDate(r history.Record) time.Time {
    for _,at:=range []*time.Time{r.ProviderReportedAt,r.ConfirmedAt,r.EffectiveAt,r.ObservedAt,r.SourceUpdatedAt,r.SourcePublishedAt} {
        if at!=nil {return *at}
    }
    return time.Time{}
}
func (e *Engine) webOverview(w http.ResponseWriter,r *http.Request){
    if r.Method!=http.MethodGet {http.Error(w,"GET required",http.StatusMethodNotAllowed);return}
    e.mu.RLock()
    s:=e.disk.Snapshot
    records:=append([]history.Record(nil),e.disk.Archive.Records...)
    archive:=e.disk.Archive
    s.News=append([]news.Item(nil),s.News...)
    e.mu.RUnlock()
    archive.Records=records
    health:=e.liveHealth(s.SourceHealth)
    now:=e.currentTime()
    view:=webView{Health:health.Status,Checked:"暂无上游检查记录",Generated:now.UTC().Format("2006-01-02 15:04"),SourceURL:codexreset.SourceURL}
    if health.LastCheckedAt!=nil {view.Checked=health.LastCheckedAt.UTC().Format("2006-01-02 15:04 UTC")}
    window:=history.Analyze(&archive,now,time.UTC).Last30Days
    view.Metrics=[]webMetric{
        {"来源预告",window.Announcements.Label()},{"确认完成",window.Confirmations.Label()},
        {"赠送机会",window.Gifts.Label()},{"用户观察",window.Observations.Label()},
    }
    sort.SliceStable(records,func(i,j int)bool{return webRecordDate(records[i]).After(webRecordDate(records[j]))})
    kinds:=map[string]string{
        "third_party_reset":"全员重置（第三方）","third_party_credits":"储备重置（第三方）",
        "service_incident":"服务故障","reset_announcement":"来源预告",
        "reset_completed":"确认完成","extra_opportunity":"赠送机会","observed_reset":"用户观察",
    }
    states:=map[string]string{"active":"有效","withdrawn":"已撤回","superseded":"已更正"}
    for _,row:=range records {
        if len(view.Records)>=40 {break}
        label:=kinds[row.Kind];if label=="" {label=row.Kind}
        date:="日期未知";if at:=webRecordDate(row);!at.IsZero(){date=at.UTC().Format("2006-01-02 15:04 UTC")}
        view.Records=append(view.Records,webRow{Date:date,Kind:label,State:states[row.State],Summary:row.Summary,URL:row.SourceURL})
    }
    for _,story:=range news.Ordered(s.News){
        if len(view.Stories)>=20 {break}
        url:=story.SourceURL
        if story.State=="source_unavailable" {url=""}
        label:=map[string]string{"active":"有效","withdrawn":"已撤回","source_unavailable":"来源失效"}[story.State]
        view.Stories=append(view.Stories,webNews{Date:story.UpdatedAt.UTC().Format("2006-01-02 15:04 UTC"),
            Title:story.Title,Summary:story.Summary,State:label,URL:url})
    }
    w.Header().Set("Content-Type","text/html; charset=utf-8")
    w.Header().Set("Cache-Control","no-store")
    w.Header().Set("X-Content-Type-Options","nosniff")
    w.Header().Set("Referrer-Policy","no-referrer")
    w.Header().Set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    if err:=overviewTemplate.Execute(w,view);err!=nil {return}
}
