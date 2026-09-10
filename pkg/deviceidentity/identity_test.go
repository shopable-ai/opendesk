package deviceidentity

import (
	"context"
	"errors"
	"testing"

	"opendesk/pkg/securestore"
)

type memoryStore struct {
	value   []byte
	loadErr error
}

func (store *memoryStore) Load(context.Context, string) ([]byte, error) {
	if store.loadErr != nil {
		return nil, store.loadErr
	}
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *memoryStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

func TestEnsureCreatesStablePublicIdentity(t *testing.T) {
	store := &memoryStore{}
	manager := NewManager(store)
	first, err := manager.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("identity changed: %#v != %#v", first, second)
	}
	if err := first.Validate(); err != nil {
		t.Fatal(err)
	}
	if first.PublicKey == "" || first.DeviceID == "" {
		t.Fatal("public identity is incomplete")
	}
}

func TestEnsureRejectsCorruptSecureStoreData(t *testing.T) {
	manager := NewManager(&memoryStore{value: []byte("not-a-p256-private-key")})
	_, err := manager.Ensure(context.Background())
	if CodeOf(err) != CodeInvalidIdentity {
		t.Fatalf("error = %v, code = %q", err, CodeOf(err))
	}
}

func TestEnsureDoesNotReplaceUnavailableStore(t *testing.T) {
	manager := NewManager(&memoryStore{loadErr: errors.New("store unavailable")})
	_, err := manager.Ensure(context.Background())
	if CodeOf(err) != CodeDeviceKeyUnavailable {
		t.Fatalf("error = %v, code = %q", err, CodeOf(err))
	}
}

func TestParsePublicIdentityRejectsDuplicateAndMismatchedDeviceID(t *testing.T) {
	manager := NewManager(&memoryStore{})
	identity, err := manager.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	duplicate := []byte(`{"format":"opendesk-device-identity","format":"opendesk-device-identity","formatVersion":1,"deviceId":"x","keyAlgorithm":"P-256","publicKey":"x"}`)
	if _, err := ParsePublicIdentity(duplicate); CodeOf(err) != CodeInvalidIdentity {
		t.Fatalf("duplicate error = %v", err)
	}
	identity.DeviceID = "device_wrong"
	data := []byte(`{"format":"` + identity.Format + `","formatVersion":1,"deviceId":"` + identity.DeviceID + `","keyAlgorithm":"` + identity.KeyAlgorithm + `","publicKey":"` + identity.PublicKey + `"}`)
	if _, err := ParsePublicIdentity(data); CodeOf(err) != CodeInvalidIdentity {
		t.Fatalf("mismatch error = %v", err)
	}
}
