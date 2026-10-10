package browserbridge

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// AdmissionDigest mirrors Browser platform/protocol.js canonical+digest.
// Numeric literals are interpreted as JavaScript binary64 for the digest only;
// Call continues to send the original raw params without rewriting source.
func AdmissionDigest(method string, params json.RawMessage, registrationID string) (string, error) {
	if method != "run.start" && method != "page.preview" || !RequestIDValid(registrationID) {
		return "", ErrSchema
	}
	if !json.Valid(params) || !utf8.Valid(params) || !validJSONSurrogates(params) {
		return "", ErrSchema
	}
	decoder := json.NewDecoder(bytes.NewReader(params))
	decoder.UseNumber()
	var p any
	if decoder.Decode(&p) != nil {
		return "", ErrSchema
	}
	if _, ok := p.(map[string]any); !ok {
		return "", ErrSchema
	}
	value := map[string]any{"method": method, "params": p, "registrationId": registrationID}
	var out strings.Builder
	if err := admissionCanonical(&out, value, 0); err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(out.String()))
	return hex.EncodeToString(sum[:]), nil
}
func validJSONSurrogates(raw []byte) bool {
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) {
			return false
		}
		if raw[i] != 'u' {
			continue
		}
		if i+4 >= len(raw) {
			return false
		}
		n, err := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if err != nil {
			return false
		}
		i += 4
		if n >= 0xdc00 && n <= 0xdfff {
			return false
		}
		if n >= 0xd800 && n <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			low, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}
func admissionString(out *strings.Builder, s string) {
	out.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"', '\\':
			out.WriteByte('\\')
			out.WriteRune(r)
		case '\b':
			out.WriteString("\\b")
		case '\f':
			out.WriteString("\\f")
		case '\n':
			out.WriteString("\\n")
		case '\r':
			out.WriteString("\\r")
		case '\t':
			out.WriteString("\\t")
		default:
			if r < 32 {
				out.WriteString("\\u00")
				const h = "0123456789abcdef"
				out.WriteByte(h[r>>4])
				out.WriteByte(h[r&15])
			} else {
				out.WriteRune(r)
			}
		}
	}
	out.WriteByte('"')
}
func admissionCanonical(out *strings.Builder, value any, depth int) error {
	if depth > 12 {
		return ErrSchema
	}
	switch v := value.(type) {
	case nil:
		out.WriteString("null")
	case string:
		admissionString(out, v)
	case bool:
		if v {
			out.WriteString("true")
		} else {
			out.WriteString("false")
		}
	case json.Number:
		n, err := strconv.ParseFloat(string(v), 64)
		if err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
			return ErrSchema
		}
		if n == 0 {
			out.WriteByte('0')
			break
		}
		if math.Abs(n) >= 1e-6 && math.Abs(n) < 1e21 {
			out.WriteString(strconv.FormatFloat(n, 'f', -1, 64))
			break
		}
		s := strconv.FormatFloat(n, 'e', -1, 64)
		parts := strings.Split(s, "e")
		exponent, _ := strconv.Atoi(parts[1])
		out.WriteString(parts[0])
		out.WriteByte('e')
		if exponent >= 0 {
			out.WriteByte('+')
		}
		out.WriteString(strconv.Itoa(exponent))
	case []any:
		out.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				out.WriteByte(',')
			}
			if err := admissionCanonical(out, item, depth+1); err != nil {
				return err
			}
		}
		out.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(v))
		for key := range v {
			if key == "" || key == "__proto__" || key == "prototype" || key == "constructor" {
				return ErrSchema
			}
			for _, r := range key {
				if r < 32 || r > 126 {
					return ErrSchema
				}
			}
			keys = append(keys, key)
		}
		sort.Strings(keys)
		out.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				out.WriteByte(',')
			}
			admissionString(out, key)
			out.WriteByte(':')
			if err := admissionCanonical(out, v[key], depth+1); err != nil {
				return err
			}
		}
		out.WriteByte('}')
	default:
		return ErrSchema
	}
	return nil
}
