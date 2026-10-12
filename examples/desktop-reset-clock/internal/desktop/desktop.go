// Package desktop owns platform presentation; no event or HTTP logic runs here.
package desktop

import "context"

type Display struct {
	Demo        bool   `json:"demo"`
	Clock       string `json:"clock"`
	Title       string `json:"title"`
	Summary     string `json:"summary"`
	SourceURL   string `json:"source_url"`
	Published   string `json:"published"`
	Effective   string `json:"effective"`
	Countdown   string `json:"countdown"`
	Health      string `json:"health"`
	Diagnostics string `json:"diagnostics"`
	FeedURL     string `json:"feed_url"`
	Show        bool   `json:"show"`
	Locked      bool   `json:"locked"`
	Quiet       bool   `json:"quiet"`
	Advance10   bool   `json:"advance_10"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
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
