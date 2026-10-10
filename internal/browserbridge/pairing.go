package browserbridge

import (
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

const PairingLifetime = 2 * time.Minute

// PairingIntent is an untrusted claim. Parsing never grants Native or file access.
type PairingIntent struct {
	ExtensionID string
	Nonce       string
	IssuedAt    time.Time
}

var pairingNonceRE = regexp.MustCompile(`^[a-f0-9]{32}$`)

func ParsePairingURL(raw string, now time.Time) (PairingIntent, error) {
	var intent PairingIntent
	if len(raw) > 512 {
		return intent, errors.New("E_PAIRING_SCHEMA")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "opendesk" || u.Host != "browser-pair" || u.User != nil ||
		u.Path != "" || u.Fragment != "" || u.Opaque != "" {
		return intent, errors.New("E_PAIRING_SCHEMA")
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil || len(q) != 5 {
		return intent, errors.New("E_PAIRING_SCHEMA")
	}
	for _, key := range []string{"v", "extensionId", "nonce", "issuedAt", "channel"} {
		if len(q[key]) != 1 {
			return intent, errors.New("E_PAIRING_SCHEMA")
		}
	}
	if q.Get("v") != "1" || q.Get("channel") != "development" ||
		!ExtensionIDValid(q.Get("extensionId")) || !pairingNonceRE.MatchString(q.Get("nonce")) {
		return intent, errors.New("E_PAIRING_SCHEMA")
	}
	millis, err := strconv.ParseInt(q.Get("issuedAt"), 10, 64)
	if err != nil || strconv.FormatInt(millis, 10) != q.Get("issuedAt") {
		return intent, errors.New("E_PAIRING_SCHEMA")
	}
	intent = PairingIntent{ExtensionID: q.Get("extensionId"), Nonce: q.Get("nonce"), IssuedAt: time.UnixMilli(millis)}
	if intent.IssuedAt.After(now) || !now.Before(intent.IssuedAt.Add(PairingLifetime)) {
		return PairingIntent{}, errors.New("E_PAIRING_EXPIRED")
	}
	return intent, nil
}
