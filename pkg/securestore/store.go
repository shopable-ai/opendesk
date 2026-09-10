// Package securestore provides the narrow OS-protected storage boundary used
// for OpenDesk installation secrets. Public licenses and trust pins are stored
// separately; this package is only for private device key material.
package securestore

import (
	"context"
	"errors"
	"fmt"
	"regexp"
)

var (
	ErrNotFound      = errors.New("secure store value not found")
	ErrAlreadyExists = errors.New("secure store value already exists")
	ErrUnavailable   = errors.New("secure store is unavailable")
)

const MaxValueSize = 16 * 1024

var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

// Store deliberately exposes create-only writes. Installation identities must
// not be silently replaced, including when two first-run processes race.
type Store interface {
	Load(ctx context.Context, name string) ([]byte, error)
	Create(ctx context.Context, name string, value []byte) error
}

// NewPlatformStore returns the current OS secure-storage implementation.
// namespace is a stable application-owned service name, never user input.
func NewPlatformStore(namespace string) (Store, error) {
	if !namePattern.MatchString(namespace) {
		return nil, fmt.Errorf("secure store namespace is invalid")
	}
	return newPlatformStore(namespace)
}

func validateName(name string) error {
	if !namePattern.MatchString(name) {
		return fmt.Errorf("secure store item name is invalid")
	}
	return nil
}

func clone(value []byte) []byte {
	return append([]byte(nil), value...)
}
