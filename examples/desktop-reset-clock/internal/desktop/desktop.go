// Package desktop owns platform presentation; HTTP, source truth and reminder
// eligibility remain in the Go app. Both native backends consume the same view.
package desktop

import "context"

// Display is intentionally flattened: AppKit/Win32 render it and must not
// reinterpret feed validity, event type, revision or account eligibility.
// SourceEvidence lets the user inspect the specific evidence behind a statistic.
type SourceEvidence struct {
 Label string `json:"label"`
 URL string `json:"url"`
}
// TickerItem is a validated, active news headline; tombstones stay in AllNews.
type TickerItem struct {
 ID string `json:"id"`
 Title string `json:"title"`
 Source string `json:"source"`
 Updated string `json:"updated"`
 URL string `json:"url"`
}
// HistoryRow is a versioned source event, including corrections and withdrawals.
type HistoryRow struct {
 When string `json:"when"`
 Kind string `json:"kind"`
 State string `json:"state"`
 Title string `json:"title"`
 Summary string `json:"summary"`
 Revision int64 `json:"revision"`
 URL string `json:"url"`
}
type MetricRow struct {
 Name string `json:"name"`
 Value string `json:"value"`
 Detail string `json:"detail"`
}
// MenuStatus is a read-only Go projection of a verified future event.
// AppKit and Win32 must never calculate source eligibility on their own.
type MenuStatus struct {
	State string `json:"state"`
	ShortRemaining string `json:"short_remaining"`
	Label string `json:"label"`
	Tooltip string `json:"tooltip"`
}
type Display struct {
	MenuStatus MenuStatus `json:"menu_status"`
	WebDetailsURL string `json:"web_details_url,omitempty"`
	Demo        bool   `json:"demo"`
	Clock       string `json:"clock"`
	LocalTime   string `json:"local_time"`
	LocalDate   string `json:"local_date"`
	Title       string `json:"title"`
	Summary     string `json:"summary"`
	SourceURL   string `json:"source_url"`
	Published   string `json:"published"`
	Effective   string `json:"effective"`
	Countdown   string `json:"countdown"`
	Health      string `json:"health"`
	DataSourceURL string `json:"data_source_url"`
	TickerCached bool `json:"ticker_cached"`
	Diagnostics string `json:"diagnostics"`
	FeedURL     string `json:"feed_url"`

	Badge        string `json:"badge"`
	StatusKind   string `json:"status_kind"` // active, revised, withdrawn, stale, error, empty
	CardHint     string `json:"card_hint"`
	CardValue    string `json:"card_value"`
	CardSummary  string `json:"card_summary"`
	CardMeta     string `json:"card_meta"`
	CardFoot     string `json:"card_foot"`
 TickerItems []TickerItem `json:"ticker_items"`
 TickerIndex int `json:"ticker_index"`
 TickerExpanded bool `json:"ticker_expanded"`
 HistoryRows []HistoryRow `json:"history_rows,omitempty"`
 Stats30 []MetricRow `json:"stats_30,omitempty"`
 StatsMonth []MetricRow `json:"stats_month,omitempty"`
 DetailsOverviewNews string `json:"details_overview_news"`
 DetailsFullNews string `json:"details_full_news"`
	HasUpcoming  bool   `json:"has_upcoming"`
	HasSourceURL bool   `json:"has_source_url"`
	LastRequest  string `json:"last_request"`
	LastChecked  string `json:"last_checked"`
	LastChanged  string `json:"last_changed"`
	DetailsHistory string `json:"details_history"`
	DetailsNews    string `json:"details_news"`
	MemberStatus   string `json:"member_status"`
	DetailsResources string `json:"details_resources"`
	ResourceURLs [2]string `json:"resource_urls"`
	HistorySourceURL string `json:"history_source_url"`
	HistoryEvidence []SourceEvidence `json:"history_evidence,omitempty"`
	NewsURLs [3]string `json:"news_urls"`
	AllNews []SourceEvidence `json:"all_news,omitempty"`

	MenuText bool `json:"menu_text"`
	MiniShow bool `json:"mini_show"`
	MiniFloat bool `json:"mini_float"`
	MiniX int `json:"mini_x"`
	MiniY int `json:"mini_y"`
	Show      bool `json:"show"`
	Locked    bool `json:"locked"`
	Quiet     bool `json:"quiet"`
	Advance10 bool `json:"advance_10"`
	Clock24   bool `json:"clock_24"`
	X         int  `json:"x"`
	Y         int  `json:"y"`
}
type Action struct {
	Name  string
	Value string
}
type UI interface {
	Run(context.Context, func(Action)) error
	Update(Display)
	Notify(string)
}

func New() UI { return newNative() }
