package automation

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
)

const (
	defaultHTTPDownloadMaxBytes = int64(64 << 20)
	maxHTTPDownloadMaxBytes     = int64(1 << 30)
	httpDownloadBufferSize      = 32 * 1024
)

// DownloadErrorCode is the stable, structured error class for http.download.
// Its message deliberately stays descriptive without reproducing URLs,
// headers, paths, or host-provided body content.
type DownloadErrorCode string

const (
	DownloadDisabled          DownloadErrorCode = "DOWNLOAD_DISABLED"
	DownloadInvalidArgument   DownloadErrorCode = "INVALID_ARGUMENT"
	DownloadInvalidURL        DownloadErrorCode = "INVALID_URL"
	DownloadConcurrencyLimit  DownloadErrorCode = "CONCURRENCY_LIMIT"
	DownloadHTTPStatus        DownloadErrorCode = "HTTP_STATUS"
	DownloadRedirectDenied    DownloadErrorCode = "REDIRECT_DENIED"
	DownloadResponseEncoding  DownloadErrorCode = "UNSUPPORTED_ENCODING"
	DownloadTooLarge          DownloadErrorCode = "MAX_BYTES_EXCEEDED"
	DownloadDigestMismatch    DownloadErrorCode = "SHA256_MISMATCH"
	DownloadTargetExists      DownloadErrorCode = "TARGET_EXISTS"
	DownloadUnsupportedTarget DownloadErrorCode = "UNSUPPORTED_FILE_TYPE"
	DownloadPermissionDenied  DownloadErrorCode = "PERMISSION_DENIED"
	DownloadCanceled          DownloadErrorCode = "CANCELED"
	DownloadTimedOut          DownloadErrorCode = "TIMEOUT"
	DownloadAtomicUnsupported DownloadErrorCode = "ATOMIC_COMMIT_UNSUPPORTED"
	DownloadCleanupFailed     DownloadErrorCode = "CLEANUP_FAILED"
	DownloadIOFailed          DownloadErrorCode = "IO_FAILED"
)

type downloadErrorValue struct {
	Code      DownloadErrorCode
	Operation string
	Message   string
	Status    int
	Committed bool
	Cause     error
}

func (e *downloadErrorValue) Error() string {
	if e == nil {
		return "http.download failed"
	}
	message := e.Message
	if message == "" {
		message = "http.download failed"
	}
	return fmt.Sprintf("%s: %s", e.Code, message)
}

func (e *downloadErrorValue) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func downloadError(code DownloadErrorCode, operation, message string, status int, committed bool, cause error) *downloadErrorValue {
	return &downloadErrorValue{Code: code, Operation: operation, Message: message, Status: status, Committed: committed, Cause: cause}
}

type httpDownloadRequest struct {
	context                  context.Context
	cancel                   context.CancelFunc
	url                      *url.URL
	headers                  http.Header
	path                     string
	maxBytes                 int64
	overwrite                bool
	createDirs               bool
	expectedSHA256           string
	allowCrossOriginRedirect bool
	commit                   *downloadCommitState
}

type httpDownloadResult struct {
	path         string
	bytesWritten int64
	status       int
	sha256       string
	committed    bool
}

// downloadCommitState serializes explicit abort/teardown with the name
// publication point. The lock ensures that a cancellation seen before commit
// prevents publication, while a cancellation observed after publication is
// reported honestly as committed=true.
type downloadCommitState struct {
	mu              sync.Mutex
	cancelRequested bool
	committed       bool
}

func (s *downloadCommitState) cancel() bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelRequested = true
	return s.committed
}

func (s *downloadCommitState) replace(ctx context.Context, replace func() (bool, error)) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelRequested {
		return false, downloadContextError(ctx, false)
	}
	if err := downloadContextError(ctx, false); err != nil {
		return false, err
	}
	committed, err := replace()
	if committed {
		s.committed = true
	}
	return committed, err
}

func (h *HTTPClient) downloadSpec(rawURL string, options *goja.Object) (httpDownloadRequest, func(), *downloadCommitState, error) {
	const operation = "http.download"
	if options == nil {
		options = h.runtime.NewObject()
	}
	if err := downloadOptionsObject(options); err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	parsedURL, err := downloadURL(rawURL)
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	path, err := h.downloadPath(downloadOption(options, "path"))
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	headers, err := downloadHeaders(h.runtime, downloadOption(options, "headers"))
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	if headers.Get("Range") != "" || headers.Get("If-Range") != "" {
		return httpDownloadRequest{}, nil, nil, downloadError(DownloadInvalidArgument, operation, "Range and If-Range headers are not supported for complete downloads", 0, false, nil)
	}
	maxBytes, err := downloadMaxBytes(downloadOption(options, "maxBytes"))
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	overwrite, err := downloadBoolean(downloadOption(options, "overwrite"), false, "overwrite")
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	createDirs, err := downloadBoolean(downloadOption(options, "createDirs"), false, "createDirs")
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	allowCrossOriginRedirect, err := downloadBoolean(downloadOption(options, "allowCrossOriginRedirects"), false, "allowCrossOriginRedirects")
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	expectedSHA256, err := downloadSHA256(downloadOption(options, "sha256"))
	if err != nil {
		return httpDownloadRequest{}, nil, nil, err
	}
	ctx, cancel := h.requestContext(downloadOption(options, "timeout"))
	commit := &downloadCommitState{}
	cleanupAbort := h.bindAbortSignalCallback(downloadOption(options, "signal"), func() {
		commit.cancel()
		cancel()
	})
	return httpDownloadRequest{
			context:                  ctx,
			cancel:                   cancel,
			url:                      parsedURL,
			headers:                  headers,
			path:                     path,
			maxBytes:                 maxBytes,
			overwrite:                overwrite,
			createDirs:               createDirs,
			expectedSHA256:           expectedSHA256,
			allowCrossOriginRedirect: allowCrossOriginRedirect,
			commit:                   commit,
		}, func() {
			cleanupAbort()
			cancel()
		}, commit, nil
}

func downloadOptionsObject(options *goja.Object) error {
	const operation = "http.download"
	allowed := map[string]bool{
		"path": true, "headers": true, "timeout": true, "signal": true,
		"maxBytes": true, "overwrite": true, "createDirs": true,
		"sha256": true, "allowCrossOriginRedirects": true,
	}
	for _, key := range options.GetOwnPropertyNames() {
		if !allowed[key] {
			return downloadError(DownloadInvalidArgument, operation, "options contains unknown field "+key, 0, false, nil)
		}
	}
	if len(options.Symbols()) != 0 {
		return downloadError(DownloadInvalidArgument, operation, "options must not contain symbol fields", 0, false, nil)
	}
	return nil
}

func downloadOption(options *goja.Object, name string) goja.Value {
	if options == nil {
		return goja.Undefined()
	}
	for _, key := range options.GetOwnPropertyNames() {
		if key == name {
			return options.Get(name)
		}
	}
	return goja.Undefined()
}

func downloadURL(raw string) (*url.URL, error) {
	const operation = "http.download"
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || !parsed.IsAbs() || parsed.Host == "" {
		return nil, downloadError(DownloadInvalidURL, operation, "url must be an absolute HTTP or HTTPS URL", 0, false, err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, downloadError(DownloadInvalidURL, operation, "url must use HTTP or HTTPS", 0, false, nil)
	}
	if parsed.User != nil {
		return nil, downloadError(DownloadInvalidURL, operation, "url must not contain embedded credentials", 0, false, nil)
	}
	return parsed, nil
}

func (h *HTTPClient) downloadPath(value goja.Value) (string, error) {
	const operation = "http.download"
	path, ok := value.Export().(string)
	if !ok || strings.TrimSpace(path) == "" {
		return "", downloadError(DownloadInvalidArgument, operation, "path must be a non-empty file path", 0, false, nil)
	}
	if filepath.Base(path) == "." || filepath.Base(path) == string(filepath.Separator) {
		return "", downloadError(DownloadInvalidArgument, operation, "path must name a final file", 0, false, nil)
	}
	base := h.workDir
	if base == "" {
		return "", downloadError(DownloadIOFailed, operation, "execution workdir is unavailable", 0, false, nil)
	}
	resolved := path
	if !filepath.IsAbs(resolved) {
		resolved = filepath.Join(base, resolved)
	}
	abs, err := filepath.Abs(resolved)
	if err != nil {
		return "", downloadError(DownloadInvalidArgument, operation, "path could not be resolved", 0, false, err)
	}
	if err := downloadPlatformPathError(abs); err != nil {
		return "", err
	}
	return abs, nil
}

func downloadHeaders(runtime *goja.Runtime, value goja.Value) (http.Header, error) {
	const operation = "http.download"
	headers := make(http.Header)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return headers, nil
	}
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Object" {
		return nil, downloadError(DownloadInvalidArgument, operation, "headers must be an object", 0, false, nil)
	}
	for _, key := range object.GetOwnPropertyNames() {
		entry := object.Get(key)
		if entry == nil || goja.IsUndefined(entry) || goja.IsNull(entry) {
			return nil, downloadError(DownloadInvalidArgument, operation, "header values must be strings", 0, false, nil)
		}
		text, ok := entry.Export().(string)
		if !ok || strings.ContainsAny(text, "\r\n") || strings.ContainsAny(key, "\r\n") {
			return nil, downloadError(DownloadInvalidArgument, operation, "headers contain an invalid value", 0, false, nil)
		}
		headers.Set(key, text)
	}
	return headers, nil
}

func downloadBoolean(value goja.Value, fallback bool, name string) (bool, error) {
	const operation = "http.download"
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return fallback, nil
	}
	result, ok := value.Export().(bool)
	if !ok {
		return false, downloadError(DownloadInvalidArgument, operation, name+" must be a boolean", 0, false, nil)
	}
	return result, nil
}

func downloadMaxBytes(value goja.Value) (int64, error) {
	const operation = "http.download"
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return defaultHTTPDownloadMaxBytes, nil
	}
	integer, ok := downloadInteger(value)
	if !ok || integer < 1 || integer > maxHTTPDownloadMaxBytes {
		return 0, downloadError(DownloadInvalidArgument, operation, fmt.Sprintf("maxBytes must be an integer from 1 through %d", maxHTTPDownloadMaxBytes), 0, false, nil)
	}
	return integer, nil
}

func downloadInteger(value goja.Value) (int64, bool) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return 0, false
	}
	var number float64
	switch typed := value.Export().(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < 1 || number > float64(math.MaxInt64) {
		return 0, false
	}
	return int64(number), true
}

func downloadSHA256(value goja.Value) (string, error) {
	const operation = "http.download"
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", nil
	}
	digest, ok := value.Export().(string)
	if !ok || len(digest) != sha256.Size*2 {
		return "", downloadError(DownloadInvalidArgument, operation, "sha256 must be a 64-character hexadecimal digest", 0, false, nil)
	}
	if _, err := hex.DecodeString(digest); err != nil {
		return "", downloadError(DownloadInvalidArgument, operation, "sha256 must be a 64-character hexadecimal digest", 0, false, err)
	}
	return strings.ToLower(digest), nil
}

func performHTTPDownload(baseClient *http.Client, request httpDownloadRequest, activeTemps *atomic.Int64) (httpDownloadResult, error) {
	const operation = "http.download"
	if err := downloadContextError(request.context, false); err != nil {
		return httpDownloadResult{}, err
	}
	if err := downloadCheckTarget(request.path, request.overwrite); err != nil {
		return httpDownloadResult{}, err
	}
	clientCopy := *baseClient
	clientCopy.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	current := *request.url
	headers := request.headers.Clone()
	crossedOrigin := false
	for redirects := 0; ; {
		if err := downloadContextError(request.context, false); err != nil {
			return httpDownloadResult{}, err
		}
		req, err := http.NewRequestWithContext(request.context, http.MethodGet, current.String(), nil)
		if err != nil {
			return httpDownloadResult{}, downloadError(DownloadInvalidURL, operation, "could not create download request", 0, false, err)
		}
		if !crossedOrigin {
			req.Header = headers.Clone()
		}
		response, err := clientCopy.Do(req)
		if err != nil {
			return httpDownloadResult{}, downloadNetworkError(request.context, err)
		}
		if isHTTPRedirect(response.StatusCode) {
			location := response.Header.Get("Location")
			closeErr := response.Body.Close()
			if closeErr != nil {
				return httpDownloadResult{}, downloadError(DownloadIOFailed, operation, "could not close redirect response", response.StatusCode, false, closeErr)
			}
			if redirects >= 5 {
				return httpDownloadResult{}, downloadError(DownloadRedirectDenied, operation, "redirect limit exceeded", response.StatusCode, false, nil)
			}
			next, err := current.Parse(location)
			if err != nil || next == nil || !next.IsAbs() || next.Host == "" || (next.Scheme != "http" && next.Scheme != "https") || next.User != nil {
				return httpDownloadResult{}, downloadError(DownloadRedirectDenied, operation, "redirect location is not a supported absolute HTTP or HTTPS URL", response.StatusCode, false, err)
			}
			if current.Scheme == "https" && next.Scheme == "http" {
				return httpDownloadResult{}, downloadError(DownloadRedirectDenied, operation, "HTTPS redirects may not downgrade to HTTP", response.StatusCode, false, nil)
			}
			if !downloadSameOrigin(&current, next) {
				if !request.allowCrossOriginRedirect {
					return httpDownloadResult{}, downloadError(DownloadRedirectDenied, operation, "cross-origin redirects are disabled", response.StatusCode, false, nil)
				}
				crossedOrigin = true
			}
			current = *next
			redirects++
			continue
		}
		if response.StatusCode != http.StatusOK {
			_ = response.Body.Close()
			return httpDownloadResult{}, downloadError(DownloadHTTPStatus, operation, "download requires final HTTP status 200", response.StatusCode, false, nil)
		}
		result, bodyErr := streamHTTPDownloadResponse(response, request, activeTemps)
		closeErr := response.Body.Close()
		if bodyErr != nil {
			return result, bodyErr
		}
		if closeErr != nil {
			return result, downloadError(DownloadIOFailed, operation, "could not close download response", response.StatusCode, result.committed, closeErr)
		}
		return result, nil
	}
}

func streamHTTPDownloadResponse(response *http.Response, request httpDownloadRequest, activeTemps *atomic.Int64) (httpDownloadResult, error) {
	const operation = "http.download"
	reader := io.Reader(response.Body)
	encoding := strings.ToLower(strings.TrimSpace(response.Header.Get("Content-Encoding")))
	var gzipReader *gzip.Reader
	switch encoding {
	case "", "identity":
		if response.ContentLength > request.maxBytes {
			return httpDownloadResult{}, downloadError(DownloadTooLarge, operation, "download exceeds maxBytes", response.StatusCode, false, nil)
		}
	case "gzip":
		var err error
		gzipReader, err = gzip.NewReader(response.Body)
		if err != nil {
			return httpDownloadResult{}, downloadError(DownloadResponseEncoding, operation, "gzip response could not be decoded", response.StatusCode, false, err)
		}
		defer gzipReader.Close()
		reader = gzipReader
	default:
		return httpDownloadResult{}, downloadError(DownloadResponseEncoding, operation, "response content encoding is not supported", response.StatusCode, false, nil)
	}
	return downloadResponseToFile(reader, response.StatusCode, request, activeTemps)
}

func downloadResponseToFile(reader io.Reader, status int, request httpDownloadRequest, activeTemps *atomic.Int64) (result httpDownloadResult, returnErr error) {
	const operation = "http.download"
	if err := downloadContextError(request.context, false); err != nil {
		return result, withDownloadStatus(err, status, false)
	}
	parent := filepath.Dir(request.path)
	if request.createDirs {
		if err := os.MkdirAll(parent, 0o750); err != nil {
			return result, downloadHostError(operation, "could not create download parent directory", status, false, err)
		}
	} else if info, err := os.Stat(parent); err != nil || !info.IsDir() {
		if err != nil {
			return result, downloadHostError(operation, "download parent directory does not exist", status, false, err)
		}
		return result, downloadError(DownloadUnsupportedTarget, operation, "download parent path must be a directory", status, false, nil)
	}
	if err := downloadCheckTarget(request.path, request.overwrite); err != nil {
		return result, withDownloadStatus(err, status, false)
	}
	temporary, err := os.CreateTemp(parent, ".opendesk-download-*")
	if err != nil {
		return result, downloadHostError(operation, "could not create temporary download file", status, false, err)
	}
	if activeTemps != nil {
		activeTemps.Add(1)
	}
	temporaryPath := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			if err := temporary.Close(); err != nil && returnErr == nil {
				returnErr = downloadError(DownloadIOFailed, operation, "could not close temporary download file", status, result.committed, err)
			}
		}
		if temporaryPath == "" {
			return
		}
		if err := os.Remove(temporaryPath); err != nil {
			// Retain the counter because the resource still exists. The cleanup
			// failure is intentionally observable instead of claiming zero.
			if returnErr == nil {
				returnErr = downloadError(DownloadCleanupFailed, operation, "could not remove temporary download file", status, result.committed, err)
			}
			return
		}
		if activeTemps != nil {
			activeTemps.Add(-1)
		}
	}()

	hash := sha256.New()
	buffer := make([]byte, httpDownloadBufferSize)
	for {
		if err := downloadContextError(request.context, false); err != nil {
			return result, withDownloadStatus(err, status, result.committed)
		}
		read, readErr := reader.Read(buffer)
		if read > 0 {
			if result.bytesWritten+int64(read) > request.maxBytes {
				return result, downloadError(DownloadTooLarge, operation, "download exceeds maxBytes", status, false, nil)
			}
			remaining := buffer[:read]
			for len(remaining) > 0 {
				if err := downloadContextError(request.context, false); err != nil {
					return result, withDownloadStatus(err, status, result.committed)
				}
				written, writeErr := temporary.Write(remaining)
				if written > 0 {
					if _, err := hash.Write(remaining[:written]); err != nil {
						return result, downloadError(DownloadIOFailed, operation, "could not hash downloaded bytes", status, false, err)
					}
					result.bytesWritten += int64(written)
					remaining = remaining[written:]
				}
				if writeErr != nil {
					return result, downloadHostError(operation, "could not write temporary download file", status, false, writeErr)
				}
				if written == 0 {
					return result, downloadError(DownloadIOFailed, operation, "temporary download file write made no progress", status, false, nil)
				}
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return result, withDownloadStatus(downloadNetworkError(request.context, readErr), status, result.committed)
		}
	}
	if err := temporary.Close(); err != nil {
		closed = true
		return result, downloadHostError(operation, "could not close temporary download file", status, false, err)
	}
	closed = true
	result.sha256 = hex.EncodeToString(hash.Sum(nil))
	result.status = status
	result.path = request.path
	if request.expectedSHA256 != "" && result.sha256 != request.expectedSHA256 {
		return result, downloadError(DownloadDigestMismatch, operation, "download SHA-256 does not match", status, false, nil)
	}
	if err := downloadContextError(request.context, false); err != nil {
		return result, withDownloadStatus(err, status, false)
	}
	if err := downloadCheckTarget(request.path, request.overwrite); err != nil {
		return result, withDownloadStatus(err, status, false)
	}
	committed, err := request.commit.replace(request.context, func() (bool, error) {
		return downloadAtomicCommit(temporaryPath, request.path, request.overwrite)
	})
	if committed {
		result.committed = true
		// A no-overwrite publication can succeed before unlinking its source
		// temporary name. Keep that name and its resource count until cleanup
		// actually succeeds; otherwise a cleanup error would falsely claim no
		// temporary resource remains.
		if err == nil {
			temporaryPath = ""
			if activeTemps != nil {
				activeTemps.Add(-1)
			}
		}
	}
	if err != nil {
		if errors.Is(err, errDownloadAtomicUnsupported) {
			return result, downloadError(DownloadAtomicUnsupported, operation, "safe atomic download commit is unsupported on this platform", status, result.committed, err)
		}
		if typed := withDownloadStatus(err, status, result.committed); typed != nil {
			return result, typed
		}
		if !request.overwrite && !result.committed && errors.Is(err, os.ErrExist) {
			return result, downloadError(DownloadTargetExists, operation, "download target already exists", status, false, err)
		}
		return result, downloadHostError(operation, "could not atomically publish downloaded file", status, result.committed, err)
	}
	if err := downloadContextError(request.context, result.committed); err != nil {
		return result, withDownloadStatus(err, status, result.committed)
	}
	return result, nil
}

func isHTTPRedirect(status int) bool {
	return status == http.StatusMovedPermanently || status == http.StatusFound || status == http.StatusSeeOther || status == http.StatusTemporaryRedirect || status == http.StatusPermanentRedirect
}

func downloadSameOrigin(left, right *url.URL) bool {
	if left == nil || right == nil {
		return false
	}
	return left.Scheme == right.Scheme && strings.EqualFold(left.Host, right.Host)
}

func downloadCheckTarget(path string, overwrite bool) error {
	const operation = "http.download"
	info, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return downloadHostError(operation, "could not inspect download target", 0, false, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return downloadError(DownloadUnsupportedTarget, operation, "download target must be a regular file and not a symbolic link", 0, false, nil)
	}
	if !overwrite {
		return downloadError(DownloadTargetExists, operation, "download target already exists", 0, false, nil)
	}
	return nil
}

func downloadContextError(ctx context.Context, committed bool) error {
	if ctx == nil || ctx.Err() == nil {
		return nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return downloadError(DownloadTimedOut, "http.download", "download timed out", 0, committed, ctx.Err())
	}
	return downloadError(DownloadCanceled, "http.download", "download was canceled", 0, committed, ctx.Err())
}

func downloadNetworkError(ctx context.Context, err error) error {
	if contextErr := downloadContextError(ctx, false); contextErr != nil {
		return contextErr
	}
	return downloadError(DownloadIOFailed, "http.download", "download request failed", 0, false, err)
}

func downloadHostError(operation, message string, status int, committed bool, err error) error {
	if errors.Is(err, os.ErrPermission) {
		return downloadError(DownloadPermissionDenied, operation, message, status, committed, err)
	}
	return downloadError(DownloadIOFailed, operation, message, status, committed, err)
}

func withDownloadStatus(err error, status int, committed bool) error {
	var typed *downloadErrorValue
	if errors.As(err, &typed) {
		if typed.Status == 0 {
			typed.Status = status
		}
		if committed {
			typed.Committed = true
		}
		return typed
	}
	return nil
}

func downloadJSError(runtime *goja.Runtime, err error) *goja.Object {
	var typed *downloadErrorValue
	if !errors.As(err, &typed) {
		typed = downloadError(DownloadIOFailed, "http.download", "download failed", 0, false, err)
	}
	object := runtime.NewGoError(typed)
	_ = object.Set("name", "HTTPDownloadError")
	_ = object.Set("code", string(typed.Code))
	_ = object.Set("operation", typed.Operation)
	_ = object.Set("status", typed.Status)
	_ = object.Set("committed", typed.Committed)
	return object
}

func (h *HTTPClient) downloadValue(result httpDownloadResult) goja.Value {
	value := h.runtime.NewObject()
	must(value.Set("path", result.path))
	must(value.Set("bytesWritten", result.bytesWritten))
	must(value.Set("status", result.status))
	must(value.Set("sha256", result.sha256))
	must(value.Set("committed", result.committed))
	return value
}
