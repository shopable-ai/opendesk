package browserbridge

import (
	"encoding/json"
	"os"
	"testing"
)

func TestAdmissionDigestMatchesActualBrowserCanonical(t *testing.T) {
	data, err := os.ReadFile("testdata/admission-digest.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct{ Method, RegistrationID, Raw, Digest string }
	}
	if err = json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) != 10 {
		t.Fatal("missing independent Browser vectors")
	}
	for i, c := range fixture.Cases {
		got, err := AdmissionDigest(c.Method, json.RawMessage(c.Raw), c.RegistrationID)
		if err != nil || got != c.Digest {
			t.Fatalf("Browser vector %d: got %s want %s err %v", i, got, c.Digest, err)
		}
	}
}
func TestAdmissionDigestRejectsUnsupportedIdentity(t *testing.T) {
	for _, raw := range []string{`{"x":"\ud800"}`, `{"x":"\udc00"}`, `{"x":"\ud800\ud800"}`, `{"x":1e999}`, `{"constructor":1}`, `{"中文":1}`, `{} {}`, `[]`} {
		if _, err := AdmissionDigest("run.start", json.RawMessage(raw), "sidebar"); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}
