package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/health"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/reminder"
)

type Config struct {
	FeedURL        string `json:"feed_url"`
	AllowLocalHTTP bool   `json:"allow_local_http"`
	Advance10      bool   `json:"advance_10"`
	Quiet          bool   `json:"quiet"`
	Clock24        bool   `json:"clock_24"`
	Zone           string `json:"zone,omitempty"`
	Show           bool   `json:"show"`
	Locked         bool   `json:"locked"`
	X              int    `json:"x"`
	Y              int    `json:"y"`
	PollSeconds    int    `json:"poll_seconds"`
}
type State struct {
	Config         Config           `json:"config"`
	Snapshot       *events.Snapshot `json:"snapshot,omitempty"`
	ETag           string           `json:"etag,omitempty"`
	SourceIdentity string           `json:"source_identity,omitempty"`
	Health         health.Status    `json:"health"`
	Fired          map[string]bool  `json:"fired,omitempty"`
	Manual         []reminder.Plan  `json:"manual,omitempty"`
	SavedAt        *time.Time       `json:"saved_at,omitempty"`
}

func Default() State {
	return State{Config: Config{Clock24: true, Show: true, Locked: true, X: 70, Y: 70, PollSeconds: 300}, Fired: map[string]bool{}}
}
func Path() (string, error) {
	if home := os.Getenv("OPENDESK_RESET_HOME"); home != "" {
		return filepath.Join(home, "state.json"), nil
	}
	p, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(p, "OpenDesk", "reset-clock", "state.json"), nil
}
func Load(path string) (State, error) {
	s := Default()
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(b, &s); err != nil {
		return Default(), fmt.Errorf("damaged state cache: %w", err)
	}
	if s.Config.PollSeconds < 15 || s.Config.PollSeconds > 3600 {
		s.Config.PollSeconds = 300
	}
	if s.Fired == nil {
		s.Fired = map[string]bool{}
	}
	if s.Snapshot != nil {
		if err := events.Validate(*s.Snapshot); err != nil {
			return Default(), fmt.Errorf("invalid cached feed: %w", err)
		}
		if s.SourceIdentity != s.Config.FeedURL {
			s.Snapshot = nil
			s.ETag = ""
			s.SourceIdentity = ""
		}
	}
	return s, nil
}
func Save(path string, s State) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".clock-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	return nil
}
