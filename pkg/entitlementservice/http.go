package entitlementservice

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"time"

	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
)

const MaxRequestSize = 64 * 1024

var identifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type Handler struct {
	Authenticator Authenticator
	Registry      Registry
	Issuer        CacheIssuer
	Now           func() time.Time
}

func (handler Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	if request == nil || request.TLS == nil {
		writeHTTPError(writer, http.StatusUpgradeRequired, licensing.CodeServiceUnavailable)
		return
	}
	if request.Method != http.MethodPost || request.URL.RawQuery != "" {
		writeHTTPError(writer, http.StatusNotFound, licensing.CodeLicenseDenied)
		return
	}
	if handler.Authenticator == nil || handler.Registry == nil || handler.Issuer == nil {
		writeHTTPError(writer, http.StatusServiceUnavailable, licensing.CodeServiceUnavailable)
		return
	}
	credential, err := bearerCredential(request.Header.Values("Authorization"))
	if err != nil {
		writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
		return
	}
	defer zero(credential)
	subjectID, err := handler.Authenticator.Authenticate(request.Context(), credential)
	if err != nil {
		writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
		return
	}
	current := time.Now().UTC()
	if handler.Now != nil {
		current = handler.Now().UTC()
	}

	var cache []byte
	switch {
	case request.URL.Path == "/v1/activations":
		var payload entitlement.ActivateRequest
		if err := decodeRequest(writer, request, &payload); err != nil {
			writeHTTPError(writer, http.StatusBadRequest, licensing.CodeInvalidOnlineCache)
			return
		}
		if err := validateActivateRequest(payload); err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
		decision, err := handler.Registry.Activate(request.Context(), subjectID, payload, current)
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
		cache, err = handler.Issuer.Issue(request.Context(), IssueRequest{Decision: decision, RequestNonce: payload.RequestNonce, Current: current})
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
	case strings.HasPrefix(request.URL.Path, "/v1/activations/") && strings.HasSuffix(request.URL.Path, "/refresh"):
		activationID, ok := activationPathID(request.URL.Path, "/refresh")
		if !ok {
			writeHTTPError(writer, http.StatusNotFound, licensing.CodeLicenseDenied)
			return
		}
		var payload entitlement.RefreshRequest
		if err := decodeRequest(writer, request, &payload); err != nil || payload.ActivationID != activationID || validateRefreshRequest(payload) != nil {
			writeHTTPError(writer, http.StatusBadRequest, licensing.CodeInvalidOnlineCache)
			return
		}
		decision, err := handler.Registry.Refresh(request.Context(), subjectID, payload, current)
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
		cache, err = handler.Issuer.Issue(request.Context(), IssueRequest{Decision: decision, RequestNonce: payload.RequestNonce, Current: current})
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
	case strings.HasPrefix(request.URL.Path, "/v1/activations/") && strings.HasSuffix(request.URL.Path, "/deactivate"):
		activationID, ok := activationPathID(request.URL.Path, "/deactivate")
		if !ok {
			writeHTTPError(writer, http.StatusNotFound, licensing.CodeLicenseDenied)
			return
		}
		var payload entitlement.DeactivateRequest
		if err := decodeRequest(writer, request, &payload); err != nil || payload.ActivationID != activationID || validateDeactivateRequest(payload) != nil {
			writeHTTPError(writer, http.StatusBadRequest, licensing.CodeInvalidOnlineCache)
			return
		}
		decision, err := handler.Registry.Deactivate(request.Context(), subjectID, payload, current)
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
		cache, err = handler.Issuer.Issue(request.Context(), IssueRequest{Decision: decision, RequestNonce: payload.RequestNonce, Current: current})
		if err != nil {
			writeHTTPError(writer, statusForError(err), licensing.CodeOf(err))
			return
		}
	default:
		writeHTTPError(writer, http.StatusNotFound, licensing.CodeLicenseDenied)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(cache)
}

func decodeRequest(writer http.ResponseWriter, request *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return fmt.Errorf("content type must be application/json")
	}
	request.Body = http.MaxBytesReader(writer, request.Body, MaxRequestSize)
	data, err := io.ReadAll(request.Body)
	if err != nil || len(data) == 0 || len(data) > MaxRequestSize {
		return fmt.Errorf("request body is invalid")
	}
	if err := rejectDuplicateKeys(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("request must contain one JSON value")
	}
	return nil
}

func rejectDuplicateKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := scanJSONValue(decoder); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("request must contain one JSON value")
	}
	return nil
}

func scanJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("request object key is invalid")
			}
			if _, exists := seen[key]; exists {
				return fmt.Errorf("request contains duplicate key %q", key)
			}
			seen[key] = struct{}{}
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		_, err = decoder.Token()
		return err
	case '[':
		for decoder.More() {
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		_, err = decoder.Token()
		return err
	default:
		return fmt.Errorf("request contains an invalid JSON delimiter")
	}
}

func bearerCredential(values []string) ([]byte, error) {
	if len(values) != 1 || !strings.HasPrefix(values[0], "Bearer ") {
		return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement service authentication failed", nil)
	}
	credential := []byte(strings.TrimPrefix(values[0], "Bearer "))
	if len(credential) == 0 || len(credential) > entitlement.MaxTokenSize || bytes.IndexFunc(credential, func(character rune) bool {
		return character < 0x21 || character == 0x7f
	}) >= 0 {
		zero(credential)
		return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement service authentication failed", nil)
	}
	return credential, nil
}

func activationPathID(path, suffix string) (string, bool) {
	middle := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/activations/"), suffix)
	if strings.Contains(middle, "/") || !identifier.MatchString(middle) {
		return "", false
	}
	return middle, true
}

func validateActivateRequest(request entitlement.ActivateRequest) error {
	if err := validateRequestNonce(request.RequestNonce); err != nil {
		return err
	}
	if err := request.Device.Validate(); err != nil {
		return licensing.NewError(licensing.CodeWrongDevice, "device identity is invalid", err)
	}
	return validatePackageBinding(request.Package)
}

func validateRefreshRequest(request entitlement.RefreshRequest) error {
	if err := validateRequestNonce(request.RequestNonce); err != nil {
		return err
	}
	if !identifier.MatchString(request.ActivationID) || !deviceID.MatchString(request.DeviceID) || request.Sequence == 0 {
		return licensing.NewError(licensing.CodeInvalidOnlineCache, "refresh request is invalid", nil)
	}
	return nil
}

func validateDeactivateRequest(request entitlement.DeactivateRequest) error {
	return validateRefreshRequest(entitlement.RefreshRequest{
		RequestNonce: request.RequestNonce,
		ActivationID: request.ActivationID,
		Sequence:     request.Sequence,
		DeviceID:     request.DeviceID,
	})
}

var deviceID = regexp.MustCompile(`^device_[a-f0-9]{64}$`)

func statusForError(err error) int {
	switch licensing.CodeOf(err) {
	case licensing.CodeAuthenticationRequired:
		return http.StatusUnauthorized
	case licensing.CodeDeviceLimitExceeded:
		return http.StatusConflict
	case licensing.CodeLicenseDenied, licensing.CodeLicenseRevoked, licensing.CodeWrongDevice:
		return http.StatusForbidden
	case licensing.CodeInvalidOnlineCache, licensing.CodeOnlineReplay:
		return http.StatusBadRequest
	default:
		return http.StatusServiceUnavailable
	}
}

func writeHTTPError(writer http.ResponseWriter, status int, code licensing.ErrorCode) {
	if code == "" {
		code = licensing.CodeServiceUnavailable
	}
	message := "entitlement service request failed"
	switch code {
	case licensing.CodeAuthenticationRequired:
		message = "entitlement service authentication failed"
	case licensing.CodeDeviceLimitExceeded:
		message = "product device limit was exceeded"
	case licensing.CodeLicenseDenied, licensing.CodeLicenseRevoked:
		message = "product entitlement was denied"
	case licensing.CodeInvalidOnlineCache, licensing.CodeOnlineReplay, licensing.CodeWrongDevice:
		message = "entitlement request is invalid"
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"ok":    false,
		"error": map[string]string{"code": string(code), "message": message},
	})
}
