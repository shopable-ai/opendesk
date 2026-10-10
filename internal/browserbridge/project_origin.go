package browserbridge

import (
	"net/netip"
	"net/url"
	"strconv"
	"strings"
)

// Keep Go grants byte-equal to Chrome URL.origin. Unsupported spellings are
// rejected rather than silently changing the website scope the user approved.
func canonicalProjectOrigin(raw string) bool {
	if raw == "" || len(raw) > 1024 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil ||
		u.Path != "" || u.RawPath != "" || u.RawQuery != "" || u.Fragment != "" || u.ForceQuery || u.String() != raw {
		return false
	}
	host := u.Hostname()
	if host == "" || strings.ToLower(host) != host {
		return false
	}
	for _, r := range host {
		if r > 127 {
			return false
		}
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		if ip.Is4In6() || ip.String() != host || strings.Contains(host, "%") {
			return false
		}
	} else {
		// WHATWG accepts legacy numeric IPv4 forms; do not grant those ambiguous names.
		labels := strings.Split(strings.TrimSuffix(host, "."), ".")
		if len(labels) == 0 {
			return false
		}
		last := labels[len(labels)-1]
		if _, err := strconv.ParseUint(last, 0, 32); err == nil {
			return false
		}
		if _, err := strconv.ParseUint(last, 10, 32); err == nil {
			return false
		}
		for _, label := range labels {
			if label == "" {
				return false
			}
			for _, r := range label {
				if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
					return false
				}
			}
		}
	}
	port := u.Port()
	if port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port {
			return false
		}
		if u.Scheme == "https" && n == 443 || u.Scheme == "http" && n == 80 {
			return false
		}
	}
	return !strings.HasSuffix(u.Host, ":")
}
