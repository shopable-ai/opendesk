//go:build darwin || linux

package browserbridge

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

// Source identity is installation-scoped and cannot be guessed from a basename.
// Neither a source ID nor the public lease epoch is a directory credential.
func directorySourceID(cfg Installation, grant workspaceGrant) string {
	mac := hmac.New(sha256.New, []byte(cfg.ClientCredential))
	_, _ = fmt.Fprintf(mac, "%s\x00%d\x00%d", grant.Path, grant.Device, grant.Inode)
	return "source-" + hex.EncodeToString(mac.Sum(nil))[:24]
}
func temporaryWorkspaceID(cfg Installation, grant workspaceGrant) string {
	mac := hmac.New(sha256.New, []byte(cfg.ClientCredential))
	_, _ = fmt.Fprintf(mac, "workspace\x00%s\x00%d\x00%d", grant.Path, grant.Device, grant.Inode)
	raw := hex.EncodeToString(mac.Sum(nil)[:16])
	return "workspace-" + raw[:8] + "-" + raw[8:12] + "-" + raw[12:16] + "-" + raw[16:20] + "-" + raw[20:32]
}

type devWorkspaceBinding struct {
	sourceID   string
	leaseEpoch string
	temporary  bool
	access     string
	retired    bool
}

// Called under the file-service mutex and existing workspace-store lock.
// Missing/retired records only move an epoch towards retirement; restoring a
// former access string can never make that epoch live again.
func (f *nativeFiles) refreshDevLeaseFences(state workspaceStore) {
	for id, binding := range f.devBindings {
		live := false
		for _, fence := range state.DevLeaseFences {
			if fence.SessionID == f.sessionID && fence.WorkspaceID == id &&
				fence.SourceID == binding.sourceID && fence.LeaseEpoch == binding.leaseEpoch && !fence.Retired {
				live = true
				break
			}
		}
		if binding.retired || !live {
			binding.retired = true
			f.devBindings[id] = binding
			delete(f.temporary, id)
		}
	}
}

func (f *nativeFiles) recordDevLeaseFence(state *workspaceStore, id string, binding devWorkspaceBinding) error {
	// attachDevWorkspace is entered only by the credential-authenticated Host
	// owning this installation's sole socket. Other Native session records are
	// inert leftovers from a prior Host, not another live directory owner.
	kept := make([]workspaceDevLeaseFence, 0, len(f.devBindings)+1)
	for _, fence := range state.DevLeaseFences {
		active, owned := f.devBindings[fence.WorkspaceID]
		if fence.SessionID == f.sessionID && owned && active.leaseEpoch == fence.LeaseEpoch {
			kept = append(kept, fence)
		}
	}
	if len(kept) >= maxWorkspaceDevLeaseFences {
		return filesFailure("E_FILES_LIMIT")
	}
	state.DevLeaseFences = append(kept, workspaceDevLeaseFence{SessionID: f.sessionID,
		WorkspaceID: id, SourceID: binding.sourceID, LeaseEpoch: binding.leaseEpoch})
	return writeWorkspaceStore(f.cfg, *state)
}

func devWorkspacePublic(grant workspaceGrant, binding devWorkspaceBinding, reason string) map[string]any {
	row := workspacePublic(grant)
	row["sourceId"] = binding.sourceID
	row["leaseEpoch"] = binding.leaseEpoch
	row["temporary"] = binding.temporary
	row["accessReason"] = reason
	return row
}

// requestedAccess is empty only for old clients. They retain the previous
// temporary read-only semantics, including reuse of a permanent grant.
// Explicit read-only must never report success over writable authority.
func (f *nativeFiles) attachDevWorkspace(p, requestedAccess string) (map[string]any, bool, error) {
	if requestedAccess != "" && !validWorkspaceAccess(requestedAccess) {
		return nil, false, filesFailure("E_SCHEMA")
	}
	if !filepath.IsAbs(p) || p == string(filepath.Separator) || filepath.Clean(p) != p ||
		len(p) > 4096 || !utf8.ValidString(p) || strings.ContainsRune(p, 0) {
		return nil, false, filesFailure("E_FILES_PATH")
	}
	grant := workspaceGrant{Path: p, Name: filepath.Base(p), Access: requestedAccess}
	if grant.Access == "" {
		grant.Access = "read-only"
	}
	if grant.Name == "" || grant.Name == "." || len(grant.Name) > 160 ||
		strings.HasPrefix(grant.Name, ".") || strings.EqualFold(grant.Name, "node_modules") {
		return nil, false, filesFailure("E_FILES_PATH")
	}
	root, err := openWorkspaceRoot(grant)
	if err != nil {
		return nil, false, err
	}
	info, err := root.Stat(".")
	_ = root.Close()
	if err != nil {
		return nil, false, filesFailure("E_FILES_ACCESS")
	}
	grant.Device, grant.Inode, err = inodeIdentity(info)
	if err != nil {
		return nil, false, filesFailure("E_FILES_ACCESS")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if err = f.live(); err != nil {
		return nil, false, err
	}
	release, err := lockWorkspaceStore(f.cfg)
	if err != nil {
		return nil, false, err
	}
	defer release()
	state, err := readWorkspaceStore(f.cfg)
	if err != nil {
		return nil, false, err
	}
	f.refreshDevLeaseFences(state)
	sourceID := directorySourceID(f.cfg, grant)
	var persistent workspaceGrant
	for _, item := range state.Workspaces {
		if item.Path != p {
			continue
		}
		if item.Device != grant.Device || item.Inode != grant.Inode {
			return nil, false, filesFailure("E_FILES_CONFLICT")
		}
		persistent = item
		break
	}
	// A duplicate launch only describes the owner already holding this source.
	// It cannot change access, replace an identity or acquire that owner's lease.
	for id, binding := range f.devBindings {
		if binding.sourceID != sourceID {
			continue
		}
		if requestedAccess == "read-only" && persistent.Access == "read-write" {
			return nil, false, filesFailure("E_DEV_ACCESS_CONFLICT")
		}
		if binding.retired {
			return nil, false, filesFailure("E_FILES_SESSION")
		}
		active := persistent
		if binding.temporary {
			active = f.temporary[id]
			// Do not retain parallel temporary authority after an explicit
			// permanent authorization changes this root while the CLI is live.
			if persistent.WorkspaceID != "" {
				return nil, false, filesFailure("E_FILES_ACCESS")
			}
		}
		if active.WorkspaceID != id {
			return nil, false, filesFailure("E_FILES_ACCESS")
		}
		if requestedAccess == "read-only" && active.Access != "read-only" {
			return nil, false, filesFailure("E_DEV_ACCESS_CONFLICT")
		}
		if active.Access != binding.access {
			return nil, false, filesFailure("E_FILES_SESSION")
		}
		row := devWorkspacePublic(active, binding, "active-session")
		row["alreadyActive"] = true
		row["alreadyAuthorized"] = !binding.temporary
		return row, false, nil
	}
	temporary := persistent.WorkspaceID == ""
	reason := "temporary-cli"
	if !temporary {
		grant = persistent
		if requestedAccess == "read-only" && grant.Access != "read-only" {
			return nil, false, filesFailure("E_DEV_ACCESS_CONFLICT")
		}
		reason = "persistent-" + grant.Access
	} else {
		grant.WorkspaceID = temporaryWorkspaceID(f.cfg, grant)
		if len(f.temporary) >= 4 {
			return nil, false, filesFailure("E_FILES_LIMIT")
		}
	}
	epoch, err := NewID()
	if err != nil {
		return nil, false, filesFailure("E_FILES_IO")
	}
	binding := devWorkspaceBinding{sourceID: sourceID, leaseEpoch: epoch, temporary: temporary, access: grant.Access}
	// Register the invalidation fence before granting in-memory authority.
	// A failed metadata write cannot create an unrevocable temporary lease.
	if err := f.recordDevLeaseFence(&state, grant.WorkspaceID, binding); err != nil {
		return nil, false, err
	}
	if temporary {
		f.temporary[grant.WorkspaceID] = grant
	}
	f.devBindings[grant.WorkspaceID] = binding
	row := devWorkspacePublic(grant, binding, reason)
	row["alreadyActive"] = false
	row["alreadyAuthorized"] = !temporary
	return row, temporary, nil
}

// Only the owner holding this exact epoch can retire the public binding. A
// persistent grant survives, while its old CLI-bound requests become invalid.
func (f *nativeFiles) releaseDevWorkspace(id, epoch string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	binding, ok := f.devBindings[id]
	if !ok || binding.leaseEpoch != epoch {
		return false
	}
	if binding.temporary {
		delete(f.temporary, id)
	}
	delete(f.devBindings, id)
	// Memory revocation above is authoritative even if a concurrent store
	// writer delays cleanup. Inert records are never usable as directory grants.
	if release, err := lockWorkspaceStore(f.cfg); err == nil {
		defer release()
		if state, err := readWorkspaceStore(f.cfg); err == nil {
			kept := state.DevLeaseFences[:0]
			for _, fence := range state.DevLeaseFences {
				if fence.SessionID != f.sessionID || fence.WorkspaceID != id || fence.LeaseEpoch != epoch {
					kept = append(kept, fence)
				}
			}
			state.DevLeaseFences = kept
			_ = writeWorkspaceStore(f.cfg, state)
		}
	}
	return true
}

func (f *nativeFiles) publicWorkspaces(state workspaceStore) map[string]any {
	rows := make([]map[string]any, 0, len(state.Workspaces)+len(f.temporary))
	seenSources := make(map[string]bool)
	for _, grant := range state.Workspaces {
		sourceID := directorySourceID(f.cfg, grant)
		row := workspacePublic(grant)
		row["sourceId"] = sourceID
		row["accessReason"] = "persistent-" + grant.Access
		if binding, ok := f.devBindings[grant.WorkspaceID]; ok && !binding.retired && binding.access == grant.Access {
			row["leaseEpoch"] = binding.leaseEpoch
		}
		rows = append(rows, row)
		seenSources[sourceID] = true
	}
	for id, grant := range f.temporary {
		binding := f.devBindings[id]
		if seenSources[binding.sourceID] {
			continue
		}
		rows = append(rows, devWorkspacePublic(grant, binding, "temporary-cli"))
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i]["workspaceId"].(string) < rows[j]["workspaceId"].(string) })
	return map[string]any{"workspaces": rows}
}

// CLI paths are consumed only by the local authenticated socket handler, never
// by the Native Chrome wire or by page-originated requests.
func (f *nativeFiles) verifyInstall() error {
	cfg, err := Load()
	if err != nil || cfg.InstallRoot != f.cfg.InstallRoot ||
		cfg.ExtensionID != f.cfg.ExtensionID || cfg.ClientCredential != f.cfg.ClientCredential {
		return filesFailure("E_FILES_ACCESS")
	}
	return nil
}
