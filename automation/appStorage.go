package automation

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// AppStorage provides persistent key-value storage functionality
type AppStorage struct {
	mutex    sync.RWMutex
	filePath string
	data     map[string]string
}

// NewAppStorage creates a new AppStorage instance
func NewAppStorage(appName string) *AppStorage {
	// Determine storage path based on OS
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Sprintf("failed to get home directory: %v", err))
	}

	// Create app-specific storage directory
	storageDir := filepath.Join(homeDir, ".testmonkey", appName)
	err = os.MkdirAll(storageDir, 0755)
	if err != nil {
		panic(fmt.Sprintf("failed to create storage directory: %v", err))
	}

	// Storage file path
	filePath := filepath.Join(storageDir, "storage.json")

	storage := &AppStorage{
		filePath: filePath,
		data:     make(map[string]string),
	}

	// Load existing data
	storage.load()

	return storage
}

// load reads data from the storage file
func (s *AppStorage) load() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// If file doesn't exist, initialize an empty map
	if _, err := os.Stat(s.filePath); os.IsNotExist(err) {
		return
	}

	// Read file
	content, err := os.ReadFile(s.filePath)
	if err != nil {
		fmt.Printf("Failed to read storage file: %v\n", err)
		return
	}

	// Unmarshal JSON
	if len(content) > 0 {
		if err := json.Unmarshal(content, &s.data); err != nil {
			fmt.Printf("Failed to parse storage file: %v\n", err)
		}
	}
}

// save writes data to the storage file
func (s *AppStorage) save() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Marshal data to JSON
	content, err := json.Marshal(s.data)
	if err != nil {
		return fmt.Errorf("failed to serialize storage data: %v", err)
	}

	// Write to file
	return os.WriteFile(s.filePath, content, 0644)
}

// SetItem stores a key-value pair
func (s *AppStorage) SetItem(key, value string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.data[key] = value
	return s.save()
}

// GetItem retrieves a value by key
func (s *AppStorage) GetItem(key string) (string, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	value, exists := s.data[key]
	return value, exists
}

// RemoveItem removes a key-value pair
func (s *AppStorage) RemoveItem(key string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	delete(s.data, key)
	return s.save()
}

// Clear removes all items
func (s *AppStorage) Clear() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.data = make(map[string]string)
	return s.save()
}

// Keys returns all stored keys
func (s *AppStorage) Keys() []string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	keys := make([]string, 0, len(s.data))
	for k := range s.data {
		keys = append(keys, k)
	}
	return keys
}
