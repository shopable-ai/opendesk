//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"syscall"
	"unicode/utf8"
)

const filesMaxPathBytes = 512
const filesMaxMutations = 128
const filesMaxDirectoryScan = 512

var filesExtensions = map[string]bool{
	".md": true, ".markdown": true, ".txt": true, ".html": true, ".htm": true,
	".json": true, ".css": true, ".js": true, ".jsx": true, ".ts": true, ".tsx": true, ".mjs": true,
}

type filesReceipt struct {
	digest   [32]byte
	response filesResponse
}

type nativeFiles struct {
	cfg       Installation
	sessionID string
	mu        sync.Mutex
	done      chan struct{}
	closeOnce sync.Once
	receipts  map[string]filesReceipt
	temporary map[string]workspaceGrant
}

func newNativeFiles(cfg Installation) (*nativeFiles, error) {
	id, err := NewID()
	if err != nil {
		return nil, err
	}
	return &nativeFiles{cfg: cfg, sessionID: id, done: make(chan struct{}), receipts: map[string]filesReceipt{}, temporary: map[string]workspaceGrant{}}, nil
}

func (f *nativeFiles) Close() { f.closeOnce.Do(func() { close(f.done) }) }

func (f *nativeFiles) live() error {
	select {
	case <-f.done:
		return filesFailure("E_FILES_SESSION")
	default:
		return nil
	}
}

func (f *nativeFiles) state() map[string]any {
	return map[string]any{"v": 1, "kind": "files.state", "protocol": FilesProtocol,
		"connected": true, "sessionId": f.sessionID, "maxContentBytes": FilesMaxContentBytes}
}

func filesCapabilities() map[string]any {
	return map[string]any{"supported": true, "version": FilesVersion, "maxContentBytes": FilesMaxContentBytes,
		"maxFrameBytes": MaxBytes, "writePrecondition": "sha256-optimistic", "createExclusive": true,
		"methods": []string{"files.status", "workspaces.list", "files.list", "files.read", "files.write", "files.create"}}
}

func (f *nativeFiles) Handle(req filesRequest) filesResponse {
	response := newFilesResponse(req)
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.live(); err != nil || req.SessionID != f.sessionID {
		response.Error = filesFailure("E_FILES_SESSION")
		return response
	}
	mutation := req.Method == "files.write" || req.Method == "files.create"
	if mutation {
		encoded, _ := json.Marshal(req)
		digest := sha256.Sum256(encoded)
		if previous, ok := f.receipts[req.RequestID]; ok {
			if previous.digest != digest {
				response.Error = filesFailure("E_REQUEST_CONFLICT")
				return response
			}
			return previous.response
		}
		if len(f.receipts) >= filesMaxMutations {
			response.Error = filesFailure("E_FILES_LIMIT")
			return response
		}
		// This ledger is bounded and lasts exactly one native session. It is a
		// receipt for a known request, never permission to replay an unknown
		// write after a disconnect or with a new request/session ID.
		defer func() { f.receipts[req.RequestID] = filesReceipt{digest, response} }()
	}
	result, err := f.call(req)
	if err != nil {
		response.Error = filesAsError(err)
	} else {
		response.Result = result
	}
	if _, err := Encode(response); err != nil {
		response.Result = nil
		if mutation && response.Error == nil {
			response.Error = &filesError{Code: "E_EFFECT_UNKNOWN", Message: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
		} else {
			response.Error = filesFailure("E_FILES_LIMIT")
		}
	}
	return response
}

type filesLocation struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
}

type filesWriteParams struct {
	WorkspaceID    string  `json:"workspaceId"`
	Path           string  `json:"path"`
	Content        *string `json:"content"`
	ExpectedSHA256 *string `json:"expectedSha256"`
}

type filesCreateParams struct {
	WorkspaceID string  `json:"workspaceId"`
	Path        string  `json:"path"`
	Content     *string `json:"content"`
}

func (f *nativeFiles) call(req filesRequest) (any, error) {
	var location filesLocation
	var content, expected string
	switch req.Method {
	case "files.status", "workspaces.list":
		if decodeFilesObject(req.Params, &struct{}{}) != nil {
			return nil, filesFailure("E_SCHEMA")
		}
		if req.Method == "files.status" {
			return filesCapabilities(), nil
		}
	case "files.list", "files.read":
		if decodeFilesObject(req.Params, &location) != nil {
			return nil, filesFailure("E_SCHEMA")
		}
	case "files.write":
		var params filesWriteParams
		if decodeFilesObject(req.Params, &params) != nil || params.Content == nil || params.ExpectedSHA256 == nil {
			return nil, filesFailure("E_SCHEMA")
		}
		location = filesLocation{params.WorkspaceID, params.Path}
		content, expected = *params.Content, *params.ExpectedSHA256
		if len(expected) != 64 || strings.ToLower(expected) != expected {
			return nil, filesFailure("E_SCHEMA")
		}
		if decoded, err := hex.DecodeString(expected); err != nil || len(decoded) != 32 {
			return nil, filesFailure("E_SCHEMA")
		}
	case "files.create":
		var params filesCreateParams
		if decodeFilesObject(req.Params, &params) != nil || params.Content == nil {
			return nil, filesFailure("E_SCHEMA")
		}
		location = filesLocation{params.WorkspaceID, params.Path}
		content = *params.Content
	default:
		return nil, filesFailure("E_SCHEMA")
	}
	if req.Method == "files.write" || req.Method == "files.create" {
		if err := validFileText([]byte(content)); err != nil {
			return nil, err
		}
	}
	// A Host retaining an old cfg must not retain authority after the current
	// installation identity or credential is replaced.
	current, err := Load()
	if err != nil || current.ExtensionID != f.cfg.ExtensionID ||
		current.ClientCredential != f.cfg.ClientCredential || current.InstallRoot != f.cfg.InstallRoot {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	release, err := lockWorkspaceStore(f.cfg)
	if err != nil {
		return nil, err
	}
	defer release()
	state, err := readWorkspaceStore(f.cfg)
	if err != nil {
		return nil, err
	}
	if req.Method == "workspaces.list" {
		return f.publicWorkspaces(state), nil
	}
	if !workspaceIDPattern.MatchString(location.WorkspaceID) {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	var grant workspaceGrant
	for _, candidate := range state.Workspaces {
		if candidate.WorkspaceID == location.WorkspaceID {
			grant = candidate
			break
		}
	}
	if grant.WorkspaceID == "" {
        if candidate, ok := f.temporary[location.WorkspaceID]; ok { grant = candidate }
    }
    if grant.WorkspaceID == "" ||
		((req.Method == "files.write" || req.Method == "files.create") && grant.Access != "read-write") {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	if err := validFilesPath(location.Path, req.Method == "files.list", req.Method != "files.list"); err != nil {
		return nil, err
	}
	root, err := openWorkspaceRoot(grant)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := f.live(); err != nil {
		return nil, err
	}
	if req.Method == "files.list" {
		return listWorkspaceFiles(root, grant, location.Path)
	}
	dir, base := path.Split(location.Path)
	dir = strings.TrimSuffix(dir, "/")
	parent, parentInfo, err := openFilesDirectory(root, dir, grant.Device)
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	if req.Method == "files.read" {
		snapshot, err := readFileSnapshot(parent, base, grant.Device)
		if err != nil {
			return nil, err
		}
		return map[string]any{"workspaceId": grant.WorkspaceID, "path": location.Path,
			"content": string(snapshot.content), "sha256": snapshot.sha256, "bytes": len(snapshot.content)}, nil
	}
	return f.saveFile(root, parent, parentInfo, grant, dir, base, location.Path, content, expected, req.Method == "files.create")
}

func validFilesPath(p string, allowRoot, requireExtension bool) error {
	if p == "" && allowRoot {
		return nil
	}
	if p == "" || len(p) > filesMaxPathBytes || !utf8.ValidString(p) || path.Clean(p) != p ||
		strings.HasPrefix(p, "/") || strings.ContainsAny(p, "\\\x00") {
		return filesFailure("E_FILES_PATH")
	}
	parts := strings.Split(p, "/")
	if len(parts) > 16 {
		return filesFailure("E_FILES_PATH")
	}
	for _, part := range parts {
		if part == "" || strings.HasPrefix(part, ".") || strings.EqualFold(part, "node_modules") {
			return filesFailure("E_FILES_PATH")
		}
		for _, r := range part {
			if r < 32 || r == 127 {
				return filesFailure("E_FILES_PATH")
			}
		}
	}
	if requireExtension && !filesExtensions[strings.ToLower(path.Ext(p))] {
		return filesFailure("E_FILES_TYPE")
	}
	return nil
}

func validFileText(content []byte) error {
	if len(content) > FilesMaxContentBytes {
		return filesFailure("E_FILES_LIMIT")
	}
	if !utf8.Valid(content) || bytes.IndexByte(content, 0) != -1 {
		return filesFailure("E_FILES_ENCODING")
	}
	return nil
}

func checkFilesDirectory(root *os.Root, dir string, device uint64) (os.FileInfo, error) {
	current := "."
	parts := []string{}
	if dir != "" {
		parts = strings.Split(dir, "/")
	}
	var last os.FileInfo
	for i := -1; i < len(parts); i++ {
		if i >= 0 {
			current = path.Join(current, parts[i])
		}
		info, err := root.Lstat(current)
		if err != nil {
			return nil, fileIOError(err)
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || !userOwned(info) || info.Mode().Perm()&0022 != 0 {
			return nil, filesFailure("E_FILES_ACCESS")
		}
		dev, _, err := inodeIdentity(info)
		if err != nil || dev != device {
			return nil, filesFailure("E_FILES_ACCESS")
		}
		last = info
	}
	return last, nil
}

func openFilesDirectory(root *os.Root, dir string, device uint64) (*os.Root, os.FileInfo, error) {
	before, err := checkFilesDirectory(root, dir, device)
	if err != nil {
		return nil, nil, err
	}
	name := dir
	if name == "" {
		name = "."
	}
	parent, err := root.OpenRoot(name)
	if err != nil {
		return nil, nil, fileIOError(err)
	}
	opened, err := parent.Stat(".")
	after, recheckErr := checkFilesDirectory(root, dir, device)
	if err != nil || recheckErr != nil || !os.SameFile(before, opened) || !os.SameFile(after, opened) {
		_ = parent.Close()
		return nil, nil, filesFailure("E_FILES_ACCESS")
	}
	return parent, opened, nil
}

type fileSnapshot struct {
	content []byte
	sha256  string
	info    os.FileInfo
}

func validFilesInfo(info os.FileInfo, device uint64) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && info.Mode().IsRegular() && userOwned(info) && info.Mode().Perm()&0022 == 0 &&
		uint64(stat.Dev) == device && stat.Nlink == 1
}

func readFileSnapshot(parent *os.Root, base string, device uint64) (fileSnapshot, error) {
	var out fileSnapshot
	before, err := parent.Lstat(base)
	if err != nil {
		return out, fileIOError(err)
	}
	if !validFilesInfo(before, device) {
		return out, filesFailure("E_FILES_ACCESS")
	}
	if before.Size() > FilesMaxContentBytes {
		return out, filesFailure("E_FILES_LIMIT")
	}
	file, err := parent.OpenFile(base, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return out, fileIOError(err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !validFilesInfo(opened, device) || !os.SameFile(before, opened) {
		return out, filesFailure("E_FILES_CONFLICT")
	}
	content, err := io.ReadAll(io.LimitReader(file, FilesMaxContentBytes+1))
	if err != nil {
		return out, fileIOError(err)
	}
	if err := validFileText(content); err != nil {
		return out, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return out, fileIOError(err)
	}
	again, err := io.ReadAll(io.LimitReader(file, FilesMaxContentBytes+1))
	after, statErr := file.Stat()
	current, pathErr := parent.Lstat(base)
	if err != nil || statErr != nil || pathErr != nil || !bytes.Equal(content, again) ||
		!os.SameFile(opened, current) || !validFilesInfo(current, device) ||
		opened.Size() != after.Size() || !opened.ModTime().Equal(after.ModTime()) {
		return out, filesFailure("E_FILES_CONFLICT")
	}
	digest := sha256.Sum256(content)
	return fileSnapshot{content: content, sha256: hex.EncodeToString(digest[:]), info: current}, nil
}

func listWorkspaceFiles(root *os.Root, grant workspaceGrant, dir string) (any, error) {
	parent, _, err := openFilesDirectory(root, dir, grant.Device)
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	directory, err := parent.OpenFile(".", os.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, fileIOError(err)
	}
	defer directory.Close()
	entries, err := directory.ReadDir(filesMaxDirectoryScan + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fileIOError(err)
	}
	truncated := len(entries) > filesMaxDirectoryScan
	if truncated {
		entries = entries[:filesMaxDirectoryScan]
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	rows := []map[string]any{}
	budget := 0
	for _, entry := range entries {
		relative := path.Join(dir, entry.Name())
		if validFilesPath(relative, false, false) != nil {
			continue
		}
		info, err := parent.Lstat(entry.Name())
		if err != nil || info.Mode()&os.ModeSymlink != 0 || !userOwned(info) || info.Mode().Perm()&0022 != 0 {
			continue
		}
		dev, _, err := inodeIdentity(info)
		if err != nil || dev != grant.Device {
			continue
		}
		row := map[string]any{"name": entry.Name(), "path": relative}
		if info.IsDir() {
			row["kind"] = "directory"
		} else if validFilesInfo(info, grant.Device) && validFilesPath(relative, false, true) == nil && info.Size() <= FilesMaxContentBytes {
			row["kind"], row["bytes"] = "file", info.Size()
		} else {
			continue
		}
		encoded, _ := json.Marshal(row)
		if len(rows) >= 128 || budget+len(encoded) > 40*1024 {
			truncated = true
			break
		}
		budget += len(encoded)
		rows = append(rows, row)
	}
	return map[string]any{"workspaceId": grant.WorkspaceID, "path": dir, "entries": rows, "truncated": truncated}, nil
}

func fileIOError(err error) *filesError {
	if errors.Is(err, os.ErrNotExist) {
		return filesFailure("E_FILES_NOT_FOUND")
	}
	if errors.Is(err, os.ErrExist) {
		return filesFailure("E_FILES_EXISTS")
	}
	if errors.Is(err, os.ErrPermission) {
		return filesFailure("E_FILES_ACCESS")
	}
	return filesFailure("E_FILES_IO")
}

func (f *nativeFiles) saveFile(root, parent *os.Root, parentInfo os.FileInfo, grant workspaceGrant,
	dir, base, relative, content, expected string, create bool) (any, error) {
	var before fileSnapshot
	var err error
	mode := os.FileMode(0600)
	if !create {
		before, err = readFileSnapshot(parent, base, grant.Device)
		if err != nil {
			return nil, err
		}
		if before.sha256 != expected {
			return nil, filesFailure("E_FILES_CONFLICT")
		}
		if before.info.Mode().Perm()&0200 == 0 {
			return nil, filesFailure("E_FILES_ACCESS")
		}
		mode = before.info.Mode().Perm()
	}
	id, err := NewID()
	if err != nil {
		return nil, filesFailure("E_FILES_IO")
	}
	tempName := ".opendesk-edit-" + id
	temporary, err := parent.OpenFile(tempName, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, fileIOError(err)
	}
	defer func() { _ = temporary.Close(); _ = parent.Remove(tempName) }()
	if err := writeAll(temporary, []byte(content)); err != nil {
		return nil, fileIOError(err)
	}
	if err := temporary.Chmod(mode); err != nil {
		return nil, fileIOError(err)
	}
	if err := temporary.Sync(); err != nil {
		return nil, fileIOError(err)
	}
	tempInfo, err := temporary.Stat()
	if err != nil {
		return nil, fileIOError(err)
	}
	if err := temporary.Close(); err != nil {
		return nil, fileIOError(err)
	}
	// Recheck the granted directory and the exact open parent immediately
	// before commit. All subsequent name operations are relative to that open
	// parent, so replacing any ancestor cannot redirect a write outside it.
	checkRoot, err := openWorkspaceRoot(grant)
	if err != nil {
		return nil, err
	}
	_ = checkRoot.Close()
	currentParent, err := checkFilesDirectory(root, dir, grant.Device)
	if err != nil || !os.SameFile(parentInfo, currentParent) {
		return nil, filesFailure("E_FILES_CONFLICT")
	}
	if !create {
		latest, err := readFileSnapshot(parent, base, grant.Device)
		if err != nil {
			return nil, err
		}
		if !os.SameFile(before.info, latest.info) || latest.sha256 != expected ||
			!before.info.ModTime().Equal(latest.info.ModTime()) || before.info.Size() != latest.info.Size() {
			return nil, filesFailure("E_FILES_CONFLICT")
		}
	}
	if err := f.live(); err != nil {
		return nil, err
	}
	if create {
		// Publish a completely written inode with no-replace semantics. The
		// O_EXCL temporary plus Link prevents partial final files and never
		// replaces a path created by an external editor during the operation.
		err = parent.Link(tempName, base)
		if err == nil {
			err = parent.Remove(tempName)
			if err != nil {
				return nil, &filesError{Code: "E_EFFECT_UNKNOWN", Message: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
			}
		}
	} else {
		// Atomic name replacement plus optimistic hash/identity checking. The
		// OS offers no universal compare-and-rename against noncooperating
		// external editors; the small final-check-to-rename race is documented.
		err = parent.Rename(tempName, base)
	}
	if err != nil {
		if create && errors.Is(err, os.ErrExist) {
			return nil, filesFailure("E_FILES_EXISTS")
		}
		// The final publication syscall was attempted. An I/O failure (for
		// example on a disconnected filesystem) is not proof that no rename
		// or link occurred; do not invite a second write with another ID.
		return nil, &filesError{Code: "E_EFFECT_UNKNOWN", Message: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
	}
	// Once committed, any failed verification is an unknown final effect,
	// never a retryable "not dispatched" error.
	unknown := &filesError{Code: "E_EFFECT_UNKNOWN", Message: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
	published, err := parent.Lstat(base)
	if err != nil || !os.SameFile(tempInfo, published) {
		return nil, unknown
	}
	actual, err := readFileSnapshot(parent, base, grant.Device)
	if err != nil || !bytes.Equal(actual.content, []byte(content)) {
		return nil, unknown
	}
	directory, err := parent.Open(".")
	if err != nil {
		return nil, unknown
	}
	syncErr := directory.Sync()
	closeErr := directory.Close()
	if syncErr != nil || closeErr != nil {
		return nil, unknown
	}
	result := map[string]any{"workspaceId": grant.WorkspaceID, "path": relative,
		"saved": true, "sha256": actual.sha256, "bytes": len(actual.content)}
	if create {
		result["created"] = true
	}
	return result, nil
}
