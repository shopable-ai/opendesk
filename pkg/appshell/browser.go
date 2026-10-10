package appshell

import (
	"context"
	"errors"
)

const (
	ActionBrowserStatus        = "opendesk.browser.status"
	ActionBrowserProjectAdd    = "opendesk.browser.project.add"
	ActionBrowserProjectRevoke = "opendesk.browser.project.revoke"
)

// BrowserPromptHost returns native user choices only. The Browser owner validates grants.
type BrowserPromptHost interface {
	BrowserPrompt(context.Context, BrowserPrompt) (BrowserChoice, error)
}
type BrowserProject struct {
	BindingID string `json:"bindingId"`
	Name      string `json:"name"`
}
type BrowserPrompt struct {
	Token          uint64           `json:"token,omitempty"`
	DeadlineMillis int64            `json:"deadlineMillis,omitempty"`
	Kind           string           `json:"kind"`
	ExtensionID    string           `json:"extensionId,omitempty"`
	Message        string           `json:"message,omitempty"`
	Projects       []BrowserProject `json:"projects,omitempty"`
}
type BrowserChoice struct {
	Approved    bool   `json:"approved"`
	Path        string `json:"path,omitempty"`
	RuntimeKind string `json:"runtimeKind,omitempty"`
	EntryFormat string `json:"entryFormat,omitempty"`
	SiteOrigin  string `json:"siteOrigin,omitempty"`
	BindingID   string `json:"bindingId,omitempty"`
}

func (s *Shell) BindBrowserAction(sink ActionSink) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown {
		return ErrTornDown
	}
	if s.state != StateRunning {
		return ErrNotRunning
	}
	if !IsOpenDeskProduct(s.manifest) || sink == nil || s.browser != nil {
		return errors.New("native Browser action unavailable")
	}
	s.browser = sink
	return nil
}
func (s *Shell) dispatchBrowser(event ActionEvent) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	sink := s.browser
	s.mu.Unlock()
	if sink == nil {
		return errors.New("native Browser action unavailable")
	}
	return sink(event)
}
