// Package mock is a clearly labeled synthetic feed for local development only.
package mock

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
)

type Server struct {
	mu        sync.Mutex
	version   int
	heartbeat bool
	created   time.Time
	updated   time.Time
	now       func() time.Time
}

func New(now func() time.Time) *Server {
	if now == nil {
		now = time.Now
	}
	return &Server{version: 1, created: now().UTC(), now: now}
}
func (s *Server) Set(v int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v >= 1 && v <= 4 {
		if s.version != v {
			s.updated = s.now().UTC()
		}
		s.version = v
	}
}
func (s *Server) Version() int          { s.mu.Lock(); defer s.mu.Unlock(); return s.version }
func (s *Server) Handler() http.Handler { return http.HandlerFunc(s.serve) }
func (s *Server) Start() (string, func() error, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	h := &http.Server{Handler: s.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go h.Serve(ln)
	return "http://" + ln.Addr().String() + "/feed", h.Close, nil
}
func (s *Server) snapshot(v int) events.Snapshot {
	s.mu.Lock()
	updated := s.updated
	s.mu.Unlock()
	now := s.now().UTC()
	pub := s.created.Add(-72 * time.Hour)
	verified := s.created.Add(-2 * time.Minute)
	e := events.Event{ID: "demo-official-history-001", Revision: 1, Type: "reset_announcement", State: "active", Audience: "all_users", SourcePublishedAt: &pub, VerifiedAt: &verified, SourceURL: "https://example.org/synthetic-demo-not-an-official-feed", Summary: "【模拟数据】历史官方公告：预计下一次统一重置"}
	switch v {
	case 1:
		at := s.created.Add(40 * time.Minute)
		e.EffectiveAt = &at
	case 2:
		at := s.created.Add(90 * time.Minute)
		e.Revision = 2
		e.EffectiveAt = &at
		e.Summary = "【模拟数据】历史公告更正：重置时间已推迟"
		e.SourceUpdatedAt = &updated
	case 3:
		e.Revision = 3
		e.State = "withdrawn"
		e.Summary = "【模拟数据】该公告已撤回"
		e.SourceUpdatedAt = &updated
	case 4:
		at := s.created.Add(-time.Hour)
		e.Revision = 4
		e.EffectiveAt = &at
		e.Summary = "【模拟数据】过期历史公告"
	}
	return events.Snapshot{SchemaVersion: 1, ChannelID: "demo-synthetic-announcements", FeedVersion: int64(v), GeneratedAt: now, SourceHealth: events.SourceHealth{Status: "ok", LastCheckedAt: &now}, Events: []events.Event{e}}
}
func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/feed":
		if r.Method != "GET" {
			http.Error(w, "method", 405)
			return
		}
		s.mu.Lock()
		v := s.version
		hb := s.heartbeat
		s.mu.Unlock()
		etag := fmt.Sprintf("\"mock-v%d\"", v)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("ETag", etag)
		if !hb && r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(304)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		snap:=s.snapshot(v)
		snap.HistoryURL="http://"+r.Host+"/archive"
		snap.HistoryVersion=int64(v)
		snap.News=s.curated(v)
		_ = json.NewEncoder(w).Encode(snap)
	case "/archive":
		if r.Method!=http.MethodGet {http.Error(w,"method",405);return}
		cursor:=r.URL.Query().Get("cursor")
		if cursor!="" && cursor!="more"{http.Error(w,"unknown cursor",400);return}
		s.mu.Lock();v:=s.version;s.mu.Unlock()
		w.Header().Set("Content-Type","application/json; charset=utf-8")
		w.Header().Set("Cache-Control","no-store")
		_ = json.NewEncoder(w).Encode(s.archivePage(v,cursor))
	case "/control":
		if r.Method != "POST" || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "require POST JSON", 405)
			return
		}
		origin := r.Header.Get("Origin")
		if origin != "" && origin != "http://"+r.Host {
			http.Error(w, "cross-origin control denied", 403)
			return
		}
		b, err := io.ReadAll(io.LimitReader(r.Body, 1025))
		r.Body.Close()
		if err != nil || len(b) > 1024 {
			http.Error(w, "invalid body", 400)
			return
		}
		var cmd struct {
			Version   int   `json:"version"`
			Heartbeat *bool `json:"heartbeat"`
		}
		if err := json.Unmarshal(b, &cmd); err != nil {
			http.Error(w, "bad JSON", 400)
			return
		}
		s.mu.Lock()
		if cmd.Version >= 1 && cmd.Version <= 4 {
			s.version = cmd.Version
		}
		if cmd.Heartbeat != nil {
			s.heartbeat = *cmd.Heartbeat
		}
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ok":true}`)
	case "/":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reset Clock 本地演示</title><style>body{font:15px system-ui;max-width:650px;margin:40px auto;padding:0 20px}button{padding:9px 16px;margin:6px;border-radius:7px;cursor:pointer}pre{background:#f2f2f2;padding:14px;white-space:pre-wrap}</style><h2>Reset Clock · 本地模拟公告</h2><p>这是合成数据，不代表官方实时消息。选择一个版本后返回客户端点击「立即刷新」，或等待自动轮询。</p><div><button onclick="set(1)">V1 历史公告</button><button onclick="set(2)">V2 更正时间</button><button onclick="set(3)">V3 撤回</button><button onclick="set(4)">V4 过期记录</button></div><button onclick="heartbeat(true)">启用正常上游检查（200）</button><button onclick="heartbeat(false)">模拟无变化（304）</button><p id="state"></p><pre id="out"></pre><script>async function set(v){await fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:v})});view()}async function heartbeat(v){await fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({heartbeat:v})});view()}async function view(){out.textContent=JSON.stringify(await(await fetch('/feed')).json(),null,2);state.textContent='当前接口 /feed';}view()</script></html>`)
	default:
		http.NotFound(w, r)
	}
}
