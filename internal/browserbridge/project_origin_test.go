package browserbridge

import "testing"

func TestProjectOriginMatchesChromeCanonicalSpelling(t *testing.T) {
	for _, origin := range []string{"http://[::ffff:127.0.0.1]:43111", "http://[::ffff:7f00:1]:43111"} {
		if canonicalProjectOrigin(origin) {
			t.Errorf("accepted unsupported mapped IPv6 %s", origin)
		}
	}
	for _, origin := range []string{"https://example.com", "http://127.0.0.1:43111", "http://localhost:43111", "http://[::1]:43111", "https://xn--fsq.com"} {
		if !canonicalProjectOrigin(origin) {
			t.Errorf("valid %s", origin)
		}
	}
	for _, origin := range []string{"https://EXAMPLE.com", "https://example.com:443", "http://example.com:80", "http://example.com:043111", "http://example.com:", "http://example.com:70000", "http://127.1", "http://0x7f000001", "http://2130706433", "http://[0:0:0:0:0:0:0:1]", "https://例.com", "https://example.com/", "https://example.com?", "https://example.com#fragment"} {
		if canonicalProjectOrigin(origin) {
			t.Errorf("accepted noncanonical %s", origin)
		}
	}
}
