package automation

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	appStorageRootDir         = ".clawdesk"
	appStorageDefaultName     = "clawdesk"
	legacyAppStorageRootDir   = ".testmonkey"
	legacyAppStorageDefaultID = "testMonkey"
)

// AppStorage provides localStorage-like persistent storage.
type AppStorage struct {
	mutex    sync.RWMutex
	filePath string
	data     map[string]string
}

func normalizeAppStorageName(appName string) string {
	name := strings.TrimSpace(appName)
	if name == "" || strings.EqualFold(name, legacyAppStorageDefaultID) {
		return appStorageDefaultName
	}
	return name
}

// NewAppStorage creates a new AppStorage instance.
//
// New data is stored under ~/.clawdesk/<app>/storage.json.
// If the canonical file does not exist yet, Clawdesk performs a best-effort,
// non-destructive migration from the historical ~/.testmonkey location.
func NewAppStorage(appName string) *AppStorage {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Sprintf("failed to get home directory: %v", err))
	}

	normalizedName := normalizeAppStorageName(appName)
	storageDir := filepath.Join(homeDir, appStorageRootDir, normalizedName)
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		panic(fmt.Sprintf("failed to create storage directory: %v", err))
	}

	storage := &AppStorage{
		filePath: filepath.Join(storageDir, "storage.json"),
		data:     make(map[string]string),
	}
	storage.migrateLegacyStorage(homeDir, appName)
	storage.load()
	return storage
}

func (s *AppStorage) migrateLegacyStorage(homeDir, requestedName string) {
	if _, err := os.Stat(s.filePath); err == nil {
		return
	}

	names := make([]string, 0, 2)
	if name := strings.TrimSpace(requestedName); name != "" {
		names = append(names, name)
	}
	if len(names) == 0 || !strings.EqualFold(names[0], legacyAppStorageDefaultID) {
		names = append(names, legacyAppStorageDefaultID)
	}

	seen := make(map[string]struct{}, len(names))
	for _, name := range names {
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}

		legacyPath := filepath.Join(homeDir, legacyAppStorageRootDir, name, "storage.json")
		content, err := os.ReadFile(legacyPath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			fmt.Printf("Failed to read legacy AppStorage file %s: %v\n", legacyPath, err)
			continue
		}
		if !json.Valid(content) {
			fmt.Printf("Skipped invalid legacy AppStorage JSON: %s\n", legacyPath)
			continue
		}
		if err := os.WriteFile(s.filePath, content, 0644); err != nil {
			fmt.Printf("Failed to migrate AppStorage from %s to %s: %v\n", legacyPath, s.filePath, err)
			return
		}
		fmt.Printf("Migrated AppStorage from %s to %s\n", legacyPath, s.filePath)
		return
	}
}

func (s *AppStorage) load() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.data == nil {
		s.data = make(map[string]string)
	}

	if _, err := os.Stat(s.filePath); os.IsNotExist(err) {
		return
	}

	content, err := os.ReadFile(s.filePath)
	if err != nil {
		fmt.Printf("Failed to read storage file: %v\n", err)
		return
	}

	if len(content) > 0 {
		if err := json.Unmarshal(content, &s.data); err != nil {
			fmt.Printf("Failed to parse storage file: %v\n", err)
			s.data = make(map[string]string)
		}
	}
}

func (s *AppStorage) save() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.data == nil {
		s.data = make(map[string]string)
	}

	content, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		fmt.Printf("Failed to serialize storage data: %v\n", err)
		return
	}

	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Printf("Failed to create directory: %v\n", err)
		return
	}
	if err := os.WriteFile(s.filePath, content, 0644); err != nil {
		fmt.Printf("Failed to write storage file: %v\n", err)
	}
}

// GetItem retrieves a value by key.
func (s *AppStorage) GetItem(key string) string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if s.data == nil {
		return ""
	}
	value, exists := s.data[key]
	if !exists {
		return ""
	}
	return value
}

// SetItem stores a value.
func (s *AppStorage) SetItem(key string, value interface{}) {
	s.mutex.Lock()
	if s.data == nil {
		s.data = make(map[string]string)
	}

	var strValue string
	switch v := value.(type) {
	case string:
		strValue = v
	case []byte:
		strValue = string(v)
	default:
		strValue = fmt.Sprintf("%v", v)
	}

	s.data[key] = strValue
	s.mutex.Unlock()
	s.save()
}

// RemoveItem removes an item from storage.
func (s *AppStorage) RemoveItem(key string) {
	s.mutex.Lock()
	if s.data == nil {
		s.data = make(map[string]string)
	}
	delete(s.data, key)
	s.mutex.Unlock()
	s.save()
}

// Clear removes all items.
func (s *AppStorage) Clear() {
	s.mutex.Lock()
	s.data = make(map[string]string)
	s.mutex.Unlock()
	s.save()
}

// GetLength returns the number of items.
func (s *AppStorage) GetLength() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	return len(s.data)
}

// Key gets the key at the specified index.
func (s *AppStorage) Key(index int) string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if index < 0 || index >= len(s.data) {
		return ""
	}

	keys := make([]string, 0, len(s.data))
	for k := range s.data {
		keys = append(keys, k)
	}
	return keys[index]
}
