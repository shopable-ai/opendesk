package browserbridge

import (
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func pairingURL(now time.Time, nonce string) string {
	return "opendesk://browser-pair?" + url.Values{"v": {"1"}, "extensionId": {strings.Repeat("a", 32)}, "nonce": {nonce}, "issuedAt": {strconv.FormatInt(now.UnixMilli(), 10)}, "channel": {"development"}}.Encode()
}
func TestPairingParserRejectsUntrustedFields(t *testing.T) {
	now := time.UnixMilli(1791600000000)
	raw := pairingURL(now, strings.Repeat("b", 32))
	if intent, err := ParsePairingURL(raw, now); err != nil || intent.ExtensionID != strings.Repeat("a", 32) {
		t.Fatalf("valid request: %v %v", intent, err)
	}
	for _, bad := range []string{
		raw + "&path=%2Fetc", raw + "&v=1", raw + "#fragment", strings.Replace(raw, "browser-pair?", "browser-pair/?", 1),
		strings.Replace(raw, "development", "official", 1), strings.Replace(raw, strings.Repeat("a", 32), strings.Repeat("z", 32), 1),
		strings.Replace(raw, "opendesk://", "https://", 1), strings.Replace(raw, "browser-pair", "user@browser-pair", 1),
		strings.Replace(raw, strings.Repeat("b", 32), "nonce", 1), raw + "&unknown=x",
	} {
		if _, err := ParsePairingURL(bad, now); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	for _, when := range []time.Time{now.Add(-time.Millisecond), now.Add(PairingLifetime), now.Add(24 * time.Hour)} {
		if _, err := ParsePairingURL(raw, when); err == nil || err.Error() != "E_PAIRING_EXPIRED" {
			t.Errorf("time %v: %v", when, err)
		}
	}
}
