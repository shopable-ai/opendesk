//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"unicode/utf8"
)

const filesMCPPurpose = "opendesk.files-mcp.v1"

var filesMCPUUID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

type filesMCPCredential struct {
	Purpose    string `json:"purpose"`
	SocketPath string `json:"socketPath"`
	SessionID  string `json:"sessionId"`
	GrantID    string `json:"grantId"`
	Capability string `json:"capability"`
	ExpiresAt  int64  `json:"expiresAt"`
}
type filesMCPApproval struct {
	Purpose           string         `json:"purpose"`
	WorkspaceID       string         `json:"workspaceId"`
	LeaseEpoch        string         `json:"leaseEpoch,omitempty"`
	TTLSeconds        int            `json:"ttlSeconds"`
	BodyEgressConsent bool           `json:"bodyEgressConsent"`
	Files             []filesMCPFile `json:"files"`
}
type filesMCPFile struct {
	Path   string `json:"path"`
	Access string `json:"access"`
}
type filesMCPAuth struct {
	V          int    `json:"v"`
	Kind       string `json:"kind"`
	Purpose    string `json:"purpose"`
	SessionID  string `json:"sessionId"`
	GrantID    string `json:"grantId"`
	Capability string `json:"capability"`
}
type filesMCPControl struct {
	V        int             `json:"v"`
	Kind     string          `json:"kind"`
	Approval json.RawMessage `json:"approval,omitempty"`
	GrantID  string          `json:"grantId,omitempty"`
}
type filesMCPRequest struct {
	V      int             `json:"v"`
	Kind   string          `json:"kind"`
	Method string          `json:"method"`
	Args   json.RawMessage `json:"args"`
}
type filesMCPArgs struct {
	WorkspaceID    string `json:"workspaceId,omitempty"`
	Path           string `json:"path,omitempty"`
	Content        string `json:"content,omitempty"`
	ExpectedSHA256 string `json:"expectedSha256,omitempty"`
	RequestID      string `json:"requestId,omitempty"`
}

// Validate the original JSON, recursively, before decoding loses duplicates,
// nulls, case distinctions or unpaired UTF-16 surrogates.
func filesMCPJSON(raw []byte) bool {
	if len(raw) == 0 || len(raw) > MaxBytes || !utf8.Valid(raw) {
		return false
	}
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
		n, e := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if e != nil {
			return false
		}
		i += 4
		if n >= 0xd800 && n <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			lo, e := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if e != nil || lo < 0xdc00 || lo > 0xdfff {
				return false
			}
			i += 6
		} else if n >= 0xdc00 && n <= 0xdfff {
			return false
		}
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	var value func() bool
	value = func() bool {
		tok, e := d.Token()
		if e != nil || tok == nil {
			return false
		}
		delim, ok := tok.(json.Delim)
		if !ok {
			return true
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				k, e := d.Token()
				s, ok := k.(string)
				if e != nil || !ok || seen[s] {
					return false
				}
				seen[s] = true
				if !value() {
					return false
				}
			}
			end, e := d.Token()
			return e == nil && end == json.Delim('}')
		case '[':
			for d.More() {
				if !value() {
					return false
				}
			}
			end, e := d.Token()
			return e == nil && end == json.Delim(']')
		default:
			return false
		}
	}
	if !value() {
		return false
	}
	_, e := d.Token()
	return e == io.EOF
}
func filesMCPDecode(raw []byte, target any) error {
	if !filesMCPJSON(raw) {
		return ErrSchema
	}
	var exact func(json.RawMessage, reflect.Type) bool
	exact = func(b json.RawMessage, t reflect.Type) bool {
		if t == reflect.TypeOf(json.RawMessage{}) {
			return true
		}
		switch t.Kind() {
		case reflect.Struct:
			var fields map[string]json.RawMessage
			if json.Unmarshal(b, &fields) != nil || fields == nil {
				return false
			}
			allowed := map[string]reflect.Type{}
			for i := 0; i < t.NumField(); i++ {
				field := t.Field(i)
				allowed[strings.Split(field.Tag.Get("json"), ",")[0]] = field.Type
			}
			for k, v := range fields {
				typ, ok := allowed[k]
				if !ok || !exact(v, typ) {
					return false
				}
			}
		case reflect.Slice:
			var items []json.RawMessage
			if json.Unmarshal(b, &items) != nil {
				return false
			}
			for _, v := range items {
				if !exact(v, t.Elem()) {
					return false
				}
			}
		}
		return true
	}
	if !exact(raw, reflect.TypeOf(target).Elem()) {
		return ErrSchema
	}
	return decodeFilesObject(raw, target)
}
func filesMCPError(code string) error { return &CallError{Code: code, Outcome: "NOT_DISPATCHED"} }

// All path operations use a pinned private parent, refuse symlinks/hardlinks,
// and compare pathname and opened identities before returning secret bytes.
func filesMCPPrivateParent(p string) (*os.Root, os.FileInfo, error) {
	if !filepath.IsAbs(p) || filepath.Clean(p) != p || noAbsoluteSymlinks(filepath.Dir(p)) != nil {
		return nil, nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	dir := filepath.Dir(p)
	before, e := os.Lstat(dir)
	if e != nil || !userOwned(before) || before.Mode().Perm() != 0700 {
		return nil, nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	root, e := os.OpenRoot(dir)
	if e != nil {
		return nil, nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	opened, e := root.Stat(".")
	if e != nil || !os.SameFile(before, opened) {
		root.Close()
		return nil, nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	if !filesMCPRootACL(root) {
		root.Close()
		return nil, nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	return root, opened, nil
}
func filesMCPRootACL(root *os.Root) bool {
	parent, e := root.OpenFile(".", os.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW, 0)
	if e != nil {
		return false
	}
	defer parent.Close()
	return filesMCPCheckACL(parent) == nil
}
func filesMCPPrivateStable(p string, info os.FileInfo) bool {
	now, e := os.Lstat(filepath.Dir(p))
	return e == nil && os.SameFile(info, now) && now.Mode().Perm() == 0700 && userOwned(now) && noAbsoluteSymlinks(filepath.Dir(p)) == nil
}
func filesMCPPrivateInfo(info os.FileInfo) bool {
	s, ok := info.Sys().(*syscall.Stat_t)
	return ok && info.Mode().IsRegular() && info.Mode().Perm() == 0600 && userOwned(info) && s.Nlink == 1
}
func filesMCPReadPrivate(p string) ([]byte, error) {
	root, parent, e := filesMCPPrivateParent(p)
	if e != nil {
		return nil, e
	}
	defer root.Close()
	name := filepath.Base(p)
	before, e := root.Lstat(name)
	if e != nil || !filesMCPPrivateInfo(before) || before.Size() > MaxBytes {
		return nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	file, e := root.OpenFile(name, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if e != nil {
		return nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	defer file.Close()
	opened, e := file.Stat()
	if e != nil || !filesMCPPrivateInfo(opened) || !os.SameFile(before, opened) || filesMCPCheckACL(file) != nil || !filesMCPRootACL(root) {
		return nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	raw, e := io.ReadAll(io.LimitReader(file, MaxBytes+1))
	after, se := file.Stat()
	current, ce := root.Lstat(name)
	if e != nil || se != nil || ce != nil || len(raw) > MaxBytes || !filesMCPPrivateInfo(after) || !filesMCPPrivateInfo(current) || !os.SameFile(opened, current) || !opened.ModTime().Equal(after.ModTime()) || opened.Size() != after.Size() || !filesMCPPrivateStable(p, parent) || filesMCPCheckACL(file) != nil || !filesMCPRootACL(root) {
		return nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	return raw, nil
}
func filesMCPWritePrivate(p string, raw []byte) error {
	root, parent, e := filesMCPPrivateParent(p)
	if e != nil {
		return e
	}
	defer root.Close()
	name := filepath.Base(p)
	file, e := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if e != nil {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	defer file.Close()
	created, se := file.Stat()
	current, ce := root.Lstat(name)
	if se != nil || ce != nil || !filesMCPPrivateInfo(created) || !filesMCPPrivateInfo(current) || !os.SameFile(created, current) || filesMCPCheckACL(file) != nil || !filesMCPRootACL(root) || !filesMCPPrivateStable(p, parent) {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	if e = writeAll(file, raw); e != nil {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	if e = file.Sync(); e != nil {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	info, e := file.Stat()
	now, ne := root.Lstat(name)
	if e != nil || ne != nil || !filesMCPPrivateInfo(info) || !filesMCPPrivateInfo(now) || !os.SameFile(info, now) || !filesMCPPrivateStable(p, parent) || filesMCPCheckACL(file) != nil || !filesMCPRootACL(root) {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	return nil
}
