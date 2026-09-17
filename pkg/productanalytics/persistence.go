package productanalytics

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func (s *Service) consentPath() string {
	return filepath.Join(s.dataRoot, "analytics", "consent.json")
}

func readConsent(path string) (persistedConsent, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return persistedConsent{SchemaVersion: SchemaVersion, State: ConsentUnknown}, nil
	}
	if err != nil {
		return persistedConsent{}, err
	}
	var value persistedConsent
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return persistedConsent{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return persistedConsent{}, errors.New("analytics consent contains trailing JSON")
		}
		return persistedConsent{}, err
	}
	if value.SchemaVersion != SchemaVersion || (value.State != ConsentGranted && value.State != ConsentDenied) {
		return persistedConsent{}, errors.New("invalid analytics consent state")
	}
	if value.State == ConsentDenied && value.InstallID != "" {
		return persistedConsent{}, errors.New("denied analytics consent cannot retain an install id")
	}
	return value, nil
}

func writeConsent(path string, value persistedConsent) error {
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(parent, ".consent-*.tmp")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err := temp.Chmod(0o600); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}
