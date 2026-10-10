//go:build darwin || linux

package browserbridge

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"unicode/utf8"
)

const workspaceStoreName = "workspace-grants.v1.json"
const workspaceLockName = "workspace-grants.lock"
const workspaceStoreFormat = "opendesk.browser-native-workspaces.v1"
const maxWorkspaceGrants = 8
const maxWorkspaceDevLeaseFences = maxWorkspaceGrants + 4

var workspaceIDPattern = regexp.MustCompile(`^workspace-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var workspaceSourcePattern = regexp.MustCompile(`^source-[a-f0-9]{24}$`)

type workspaceGrant struct {
	WorkspaceID string `json:"workspaceId"`
	Name        string `json:"name"`
	Path        string `json:"path"`
	Access      string `json:"access"`
	Device      uint64 `json:"device"`
	Inode       uint64 `json:"inode"`
}

type workspaceStore struct {
	Format           string                   `json:"format"`
	ExtensionID      string                   `json:"extensionId"`
	CredentialDigest string                   `json:"credentialDigest"`
	Workspaces       []workspaceGrant         `json:"workspaces"`
	DevLeaseFences   []workspaceDevLeaseFence `json:"devLeaseFences,omitempty"`
}

// These bounded records only invalidate an in-memory CLI epoch. They contain
// no path, access level, owner secret or grant, and cannot reconstruct a
// temporary workspace after Host exit. Keeping the revocation bit in the same
// locked store lets a different CLI process retire an epoch even if access
// changes away and back between two Native requests.
type workspaceDevLeaseFence struct {
	SessionID   string `json:"sessionId"`
	WorkspaceID string `json:"workspaceId"`
	SourceID    string `json:"sourceId"`
	LeaseEpoch  string `json:"leaseEpoch"`
	Retired     bool   `json:"retired,omitempty"`
}

func retireWorkspaceDevLeases(state *workspaceStore, sourceID string) {
	for i := range state.DevLeaseFences {
		if state.DevLeaseFences[i].SourceID == sourceID {
			state.DevLeaseFences[i].Retired = true
		}
	}
}

func emptyWorkspaceStore(cfg Installation) workspaceStore {
	return workspaceStore{Format: workspaceStoreFormat, ExtensionID: cfg.ExtensionID,
		CredentialDigest: digestCredential(cfg.ClientCredential), Workspaces: []workspaceGrant{}}
}

func workspaceStorePath(cfg Installation) string {
	return filepath.Join(cfg.InstallRoot, workspaceStoreName)
}

// The same OS lock guards grants AND file operations. A completed revoke cannot
// race an operation admitted using an older grant, and two Native connections
// cannot independently pass the service's optimistic content precondition.
func lockWorkspaceStore(cfg Installation) (func(), error) {
	if err := requireDir(cfg.InstallRoot); err != nil {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	fd, err := syscall.Open(filepath.Join(cfg.InstallRoot, workspaceLockName),
		syscall.O_RDWR|syscall.O_CREAT|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	f := os.NewFile(uintptr(fd), workspaceLockName)
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || !userOwned(info) || info.Mode().Perm() != 0600 {
		_ = f.Close()
		return nil, filesFailure("E_FILES_ACCESS")
	}
	if err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		return nil, filesFailure("E_FILES_BUSY")
	}
	return func() { _ = syscall.Flock(fd, syscall.LOCK_UN); _ = f.Close() }, nil
}

func readWorkspaceStore(cfg Installation) (workspaceStore, error) {
	state := emptyWorkspaceStore(cfg)
	p := workspaceStorePath(cfg)
	info, err := os.Lstat(p)
	if os.IsNotExist(err) {
		return state, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 ||
		!userOwned(info) || info.Mode().Perm() != 0600 || info.Size() > 65536 {
		return state, filesFailure("E_FILES_ACCESS")
	}
	fd, err := syscall.Open(p, syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return state, filesFailure("E_FILES_ACCESS")
	}
	f := os.NewFile(uintptr(fd), workspaceStoreName)
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return state, filesFailure("E_FILES_ACCESS")
	}
	data, err := io.ReadAll(io.LimitReader(f, 65537))
	if err != nil || len(data) > 65536 || decodeFilesObject(data, &state) != nil ||
		state.Format != workspaceStoreFormat || state.ExtensionID != cfg.ExtensionID ||
		state.CredentialDigest != digestCredential(cfg.ClientCredential) || len(state.Workspaces) > maxWorkspaceGrants {
		return emptyWorkspaceStore(cfg), filesFailure("E_FILES_ACCESS")
	}
	seen := map[string]bool{}
	for _, grant := range state.Workspaces {
		if !workspaceIDPattern.MatchString(grant.WorkspaceID) || seen[grant.WorkspaceID] ||
			!filepath.IsAbs(grant.Path) || filepath.Clean(grant.Path) != grant.Path ||
			grant.Path == string(filepath.Separator) || len(grant.Path) > 4096 ||
			grant.Device == 0 || grant.Inode == 0 || !validWorkspaceAccess(grant.Access) ||
			grant.Name == "" || len(grant.Name) > 160 || !utf8.ValidString(grant.Name) {
			return emptyWorkspaceStore(cfg), filesFailure("E_FILES_ACCESS")
		}
		seen[grant.WorkspaceID] = true
	}
	if len(state.DevLeaseFences) > maxWorkspaceDevLeaseFences {
		return emptyWorkspaceStore(cfg), filesFailure("E_FILES_ACCESS")
	}
	fences := map[string]bool{}
	for _, fence := range state.DevLeaseFences {
		key := fence.SessionID + "/" + fence.WorkspaceID
		if !RequestIDValid(fence.SessionID) || !RequestIDValid(fence.LeaseEpoch) ||
			!workspaceIDPattern.MatchString(fence.WorkspaceID) ||
			!workspaceSourcePattern.MatchString(fence.SourceID) || fences[key] {
			return emptyWorkspaceStore(cfg), filesFailure("E_FILES_ACCESS")
		}
		fences[key] = true
	}
	return state, nil
}

func writeWorkspaceStore(cfg Installation, state workspaceStore) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil || len(data) > 65535 {
		return filesFailure("E_FILES_LIMIT")
	}
	if err := writeAtomic(workspaceStorePath(cfg), append(data, '\n'), 0600); err != nil {
		return filesFailure("E_FILES_IO")
	}
	return nil
}

func validWorkspaceAccess(access string) bool { return access == "read-only" || access == "read-write" }

func noAbsoluteSymlinks(p string) error {
	if p == "" || len(p) > 4096 || !utf8.ValidString(p) || !filepath.IsAbs(p) ||
		filepath.Clean(p) != p || strings.ContainsRune(p, 0) {
		return filesFailure("E_FILES_PATH")
	}
	for part := p; ; part = filepath.Dir(part) {
		info, err := os.Lstat(part)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return filesFailure("E_FILES_PATH")
		}
		if part == filepath.Dir(part) {
			break
		}
	}
	return nil
}

// Open the authorized inode rather than treating a cleaned path as a sandbox.
// os.Root preserves containment if a child path is concurrently replaced.
func openWorkspaceRoot(grant workspaceGrant) (*os.Root, error) {
	if err := noAbsoluteSymlinks(grant.Path); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(grant.Path)
	if err != nil {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	info, err := root.Stat(".")
	if err != nil || !info.IsDir() || !userOwned(info) || info.Mode().Perm()&0022 != 0 {
		_ = root.Close()
		return nil, filesFailure("E_FILES_ACCESS")
	}
	device, inode, err := inodeIdentity(info)
	if err != nil || (grant.Device != 0 && (device != grant.Device || inode != grant.Inode)) {
		_ = root.Close()
		return nil, filesFailure("E_FILES_ACCESS")
	}
	now, err := os.Lstat(grant.Path)
	if err != nil || !os.SameFile(info, now) || noAbsoluteSymlinks(grant.Path) != nil {
		_ = root.Close()
		return nil, filesFailure("E_FILES_ACCESS")
	}
	return root, nil
}

func workspacePublic(grant workspaceGrant) map[string]any {
	return map[string]any{"workspaceId": grant.WorkspaceID, "name": grant.Name, "access": grant.Access}
}

// WorkspaceAdd is a trusted LOCAL CLI action. No Native request can authorize
// an arbitrary path or expand this access. Repeating it does not show a prompt.
func WorkspaceAdd(p, access string) (map[string]any, error) {
	if !validWorkspaceAccess(access) {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	cfg, err := Load()
	if err != nil {
		return nil, err
	}
	if p == string(filepath.Separator) {
		return nil, filesFailure("E_FILES_PATH")
	}
	grant := workspaceGrant{Path: p, Access: access, Name: filepath.Base(p)}
	if grant.Name == "." || grant.Name == "" || len(grant.Name) > 160 || strings.HasPrefix(grant.Name, ".") || strings.EqualFold(grant.Name, "node_modules") {
		return nil, filesFailure("E_FILES_PATH")
	}
	root, err := openWorkspaceRoot(grant)
	if err != nil {
		return nil, err
	}
	info, err := root.Stat(".")
	_ = root.Close()
	if err != nil {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	grant.Device, grant.Inode, err = inodeIdentity(info)
	if err != nil {
		return nil, filesFailure("E_FILES_ACCESS")
	}
	release, err := lockWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	defer release()
	state, err := readWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	for i, old := range state.Workspaces {
		if old.Path != p {
			continue
		}
		if old.Device != grant.Device || old.Inode != grant.Inode {
			return nil, filesFailure("E_FILES_CONFLICT")
		}
		grant.WorkspaceID = old.WorkspaceID
		if old != grant {
			retireWorkspaceDevLeases(&state, directorySourceID(cfg, grant))
		}
		state.Workspaces[i] = grant
		if err := writeWorkspaceStore(cfg, state); err != nil {
			return nil, err
		}
		result := workspacePublic(grant)
		result["authorized"] = true
		result["unchanged"] = old == grant
		return result, nil
	}
	if len(state.Workspaces) >= maxWorkspaceGrants {
		return nil, filesFailure("E_FILES_LIMIT")
	}
	id, err := NewID()
	if err != nil {
		return nil, filesFailure("E_FILES_IO")
	}
	grant.WorkspaceID = "workspace-" + id
	retireWorkspaceDevLeases(&state, directorySourceID(cfg, grant))
	state.Workspaces = append(state.Workspaces, grant)
	if err := writeWorkspaceStore(cfg, state); err != nil {
		return nil, err
	}
	result := workspacePublic(grant)
	result["authorized"] = true
	return result, nil
}

func WorkspaceList() (map[string]any, error) {
	cfg, err := Load()
	if err != nil {
		return nil, err
	}
	release, err := lockWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	defer release()
	state, err := readWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	return workspacesPublic(state), nil
}

func workspacesPublic(state workspaceStore) map[string]any {
	rows := make([]map[string]any, 0, len(state.Workspaces))
	for _, grant := range state.Workspaces {
		rows = append(rows, workspacePublic(grant))
	}
	return map[string]any{"workspaces": rows}
}

func WorkspaceRevoke(id string) (map[string]any, error) {
	if !workspaceIDPattern.MatchString(id) {
		return nil, ErrSchema
	}
	cfg, err := Load()
	if err != nil {
		return nil, err
	}
	release, err := lockWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	defer release()
	state, err := readWorkspaceStore(cfg)
	if err != nil {
		return nil, err
	}
	for i, grant := range state.Workspaces {
		if grant.WorkspaceID != id {
			continue
		}
		retireWorkspaceDevLeases(&state, directorySourceID(cfg, grant))
		state.Workspaces = append(state.Workspaces[:i], state.Workspaces[i+1:]...)
		if err := writeWorkspaceStore(cfg, state); err != nil {
			return nil, err
		}
		return map[string]any{"workspaceId": id, "revoked": true}, nil
	}
	return nil, filesFailure("E_FILES_ACCESS")
}
