package recorder

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Store struct {
	root string
	mu   sync.Mutex
}

func NewStore(root string) (*Store, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		root = filepath.Join(".runtime", "recordings")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve recorder root: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("create recorder root: %w", err)
	}
	return &Store{root: filepath.Clean(abs)}, nil
}

func (s *Store) Root() string { return s.root }

func (s *Store) SessionDir(sessionID string) (string, error) {
	if !validID(sessionID) {
		return "", fmt.Errorf("invalid session id %q", sessionID)
	}
	dir := filepath.Join(s.root, sessionID)
	if !withinRoot(s.root, dir) {
		return "", errors.New("session path escapes recorder root")
	}
	return dir, nil
}

func (s *Store) PrepareSession(sessionID string) (string, error) {
	dir, err := s.SessionDir(sessionID)
	if err != nil {
		return "", err
	}
	paths := []string{
		filepath.Join(dir, "raw"),
		filepath.Join(dir, "observations", "screenshots"),
		filepath.Join(dir, "observations", "windows"),
		filepath.Join(dir, "observations", "accessibility"),
		filepath.Join(dir, "observations", "vision"),
		filepath.Join(dir, "distilled"),
		filepath.Join(dir, "generated"),
		filepath.Join(dir, "runs"),
	}
	for _, path := range paths {
		if err := os.MkdirAll(path, 0o755); err != nil {
			return "", fmt.Errorf("prepare recorder session: %w", err)
		}
	}
	return dir, nil
}

func (s *Store) AppendEvent(sessionID string, event TraceEvent) error {
	dir, err := s.SessionDir(sessionID)
	if err != nil {
		return err
	}
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("encode trace event: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(dir, "raw", "events.ndjson")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open trace: %w", err)
	}
	defer file.Close()
	if _, err := file.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("append trace: %w", err)
	}
	return file.Sync()
}

func (s *Store) LoadEvents(sessionID string) ([]TraceEvent, error) {
	dir, err := s.SessionDir(sessionID)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(filepath.Join(dir, "raw", "events.ndjson"))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := bufio.NewReader(file)
	var events []TraceEvent
	for {
		line, readErr := reader.ReadBytes('\n')
		trimmed := strings.TrimSpace(string(line))
		if trimmed != "" {
			var event TraceEvent
			if err := json.Unmarshal([]byte(trimmed), &event); err != nil {
				if readErr == io.EOF {
					break // recover an interrupted, damaged tail without discarding prior events
				}
				return nil, fmt.Errorf("decode trace event %d: %w", len(events)+1, err)
			}
			events = append(events, event)
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, readErr
		}
	}
	return events, nil
}

func (s *Store) WriteJSON(sessionID, relative string, value any) (string, error) {
	dir, err := s.SessionDir(sessionID)
	if err != nil {
		return "", err
	}
	target := filepath.Clean(filepath.Join(dir, relative))
	if !withinRoot(dir, target) {
		return "", errors.New("artifact path escapes session root")
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", err
	}
	temporary := target + ".tmp"
	if err := os.WriteFile(temporary, append(data, '\n'), 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(temporary, target); err != nil {
		return "", err
	}
	return target, nil
}

func (s *Store) ArtifactPath(sessionID, relative string) (string, error) {
	dir, err := s.SessionDir(sessionID)
	if err != nil {
		return "", err
	}
	target := filepath.Clean(filepath.Join(dir, relative))
	if !withinRoot(dir, target) {
		return "", errors.New("artifact path escapes session root")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", err
	}
	return target, nil
}

func validID(value string) bool {
	if value == "" || value == "." || value == ".." || strings.ContainsAny(value, `/\\`) {
		return false
	}
	return true
}

func withinRoot(root, target string) bool {
	rel, err := filepath.Rel(root, target)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
