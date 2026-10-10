//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func pairingHome(t *testing.T) string {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "od-pair-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(home) })
	t.Setenv("HOME", home)
	return home
}
func TestPairingCancelReplayAndRestart(t *testing.T) {
	pairingHome(t)
	service := &PairingService{}
	raw := pairingURL(time.Now(), strings.Repeat("c", 32))
	calls := 0
	deny := func(context.Context, PairingIntent) (bool, error) { calls++; return false, nil }
	result, err := service.Handle(context.Background(), raw, deny)
	if err != nil || result["cancelled"] != true {
		t.Fatalf("cancel %v %v", result, err)
	}
	if _, err = os.Lstat(configPath()); !os.IsNotExist(err) {
		t.Fatalf("cancel created install: %v", err)
	}
	for _, s := range []*PairingService{service, {}} {
		if _, err = s.Handle(context.Background(), raw, deny); err == nil || err.Error() != "E_PAIRING_REPLAY" {
			t.Fatalf("replay %v", err)
		}
	}
	if calls != 1 {
		t.Fatalf("prompt replayed %d", calls)
	}
}
func TestPairingRequiresConfirmationAndProtectsExistingIdentity(t *testing.T) {
	pairingHome(t)
	service := &PairingService{}
	raw := pairingURL(time.Now(), strings.Repeat("d", 32))
	if _, err := service.Handle(context.Background(), raw, nil); err == nil {
		t.Fatal("nil confirmer accepted")
	}
	allow := func(context.Context, PairingIntent) (bool, error) { return true, nil }
	if result, err := service.Handle(context.Background(), raw, allow); err != nil || result["paired"] != true {
		t.Fatalf("confirmed %v %v", result, err)
	}
	file, _ := ManifestFor("chrome", "")
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	conflict := strings.Replace(pairingURL(time.Now(), strings.Repeat("e", 32)), strings.Repeat("a", 32), strings.Repeat("b", 32), 1)
	if _, err = service.Handle(context.Background(), conflict, allow); err == nil || err.Error() != "E_EXTENSION_ID_CONFLICT" {
		t.Fatalf("conflict: %v", err)
	}
	after, _ := os.ReadFile(file)
	if !bytes.Equal(before, after) {
		t.Fatal("existing manifest changed")
	}
}
func TestPairingRejectsSymlinkLedgerAndExpiredAfterConfirmation(t *testing.T) {
	home := pairingHome(t)
	service := &PairingService{}
	if err := os.MkdirAll(filepath.Join(home, ".opendesk-browser"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(home, filepath.Join(home, ".opendesk-browser", "pairing-r2")); err != nil {
		t.Fatal(err)
	}
	calls := 0
	allow := func(context.Context, PairingIntent) (bool, error) { calls++; return true, nil }
	if _, err := service.Handle(context.Background(), pairingURL(time.Now(), strings.Repeat("f", 32)), allow); err == nil {
		t.Fatal("symlink accepted")
	}
	if calls != 0 {
		t.Fatal("prompt shown before ledger validation")
	}
	os.Remove(filepath.Join(home, ".opendesk-browser", "pairing-r2"))
	raw := pairingURL(time.Now().Add(-PairingLifetime+100*time.Millisecond), strings.Repeat("f", 32))
	allow = func(context.Context, PairingIntent) (bool, error) {
		time.Sleep(150 * time.Millisecond)
		return true, nil
	}
	if _, err := service.Handle(context.Background(), raw, allow); err == nil || err.Error() != "E_PAIRING_EXPIRED" {
		t.Fatalf("expired: %v", err)
	}
	if _, err := os.Lstat(configPath()); !os.IsNotExist(err) {
		t.Fatal("expired request installed")
	}
}
