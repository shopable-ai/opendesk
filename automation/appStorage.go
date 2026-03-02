package automation

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// AppStorage provides localStorage-like persistent storage
type AppStorage struct {
	mutex    sync.RWMutex
	filePath string
	data     map[string]string
}

// NewAppStorage creates a new AppStorage instance
func NewAppStorage(appName string) *AppStorage {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Sprintf("failed to get home directory: %v", err))
	}

	storageDir := filepath.Join(homeDir, ".testmonkey", appName)
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		panic(fmt.Sprintf("failed to create storage directory: %v", err))
	}

	storage := &AppStorage{
		filePath: filepath.Join(storageDir, "storage.json"),
		data:     make(map[string]string),
	}

	storage.load()
	return storage
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

// GetItem retrieves a value by key
func (s *AppStorage) GetItem(key string) string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if s.data == nil {
		s.data = make(map[string]string)
		return ""
	}

	value, exists := s.data[key]
	if !exists {
		return ""
	}
	return value
}

// SetItem stores a value
func (s *AppStorage) SetItem(key string, value interface{}) {
	s.mutex.Lock()

	if s.data == nil {
		s.data = make(map[string]string)
	}

	// Convert value to string
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

// RemoveItem removes an item from storage
func (s *AppStorage) RemoveItem(key string) {
	s.mutex.Lock()
	if s.data == nil {
		s.data = make(map[string]string)
	}
	delete(s.data, key)
	s.mutex.Unlock()
	s.save()
}

// Clear removes all items
func (s *AppStorage) Clear() {
	s.mutex.Lock()
	s.data = make(map[string]string)
	s.mutex.Unlock()
	s.save()
}

// GetLength returns the number of items
func (s *AppStorage) GetLength() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if s.data == nil {
		s.data = make(map[string]string)
		return 0
	}
	return len(s.data)
}

// Key gets the key at the specified index
func (s *AppStorage) Key(index int) string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if s.data == nil {
		s.data = make(map[string]string)
		return ""
	}

	if index < 0 || index >= len(s.data) {
		return ""
	}

	keys := make([]string, 0, len(s.data))
	for k := range s.data {
		keys = append(keys, k)
	}

	return keys[index]
}
