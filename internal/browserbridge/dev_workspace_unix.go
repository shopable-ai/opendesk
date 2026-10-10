//go:build darwin || linux

package browserbridge

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "os"
    "path/filepath"
    "strings"
    "unicode/utf8"
)

// An explicit, credential-authenticated local CLI attachment is a temporary,
// read-only workspace, never a persistent grant or an executable project.
// Source identity is installation-scoped and cannot be guessed from a basename.
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

func (f *nativeFiles) attachDevWorkspace(p string) (map[string]any, bool, error) {
    if !filepath.IsAbs(p) || p == string(filepath.Separator) || filepath.Clean(p) != p ||
        len(p) > 4096 || !utf8.ValidString(p) || strings.ContainsRune(p, 0) {
        return nil, false, filesFailure("E_FILES_PATH")
    }
    grant := workspaceGrant{Path: p, Name: filepath.Base(p), Access: "read-only"}
    if grant.Name == "" || grant.Name == "." || len(grant.Name) > 160 ||
        strings.HasPrefix(grant.Name, ".") || strings.EqualFold(grant.Name, "node_modules") {
        return nil, false, filesFailure("E_FILES_PATH")
    }
    root, err := openWorkspaceRoot(grant)
    if err != nil { return nil, false, err }
    info, err := root.Stat(".")
    _ = root.Close()
    if err != nil { return nil, false, filesFailure("E_FILES_ACCESS") }
    grant.Device, grant.Inode, err = inodeIdentity(info)
    if err != nil { return nil, false, filesFailure("E_FILES_ACCESS") }
    f.mu.Lock()
    defer f.mu.Unlock()
    if err = f.live(); err != nil { return nil, false, err }
    release, err := lockWorkspaceStore(f.cfg)
    if err != nil { return nil, false, err }
    state, err := readWorkspaceStore(f.cfg)
    release()
    if err != nil { return nil, false, err }
    for _, item := range state.Workspaces {
        if item.Path == p && item.Device == grant.Device && item.Inode == grant.Inode {
            return map[string]any{"workspaceId": item.WorkspaceID, "name": item.Name,
                "sourceId": directorySourceID(f.cfg, grant), "access": item.Access,
                "temporary": false, "alreadyAuthorized": true}, false, nil
        }
    }
    grant.WorkspaceID = temporaryWorkspaceID(f.cfg, grant)
    if old, exists := f.temporary[grant.WorkspaceID]; exists {
        if old != grant { return nil, false, filesFailure("E_FILES_CONFLICT") }
        return map[string]any{"workspaceId": grant.WorkspaceID, "name": grant.Name,
            "sourceId": directorySourceID(f.cfg, grant), "access": grant.Access,
            "temporary": true, "alreadyActive": true}, false, nil
    }
    if len(f.temporary) >= 4 { return nil, false, filesFailure("E_FILES_LIMIT") }
    f.temporary[grant.WorkspaceID] = grant
    return map[string]any{"workspaceId": grant.WorkspaceID, "name": grant.Name,
        "sourceId": directorySourceID(f.cfg, grant), "access": grant.Access,
        "temporary": true, "alreadyActive": false}, true, nil
}
func (f *nativeFiles) detachDevWorkspace(id string) bool {
    f.mu.Lock()
    defer f.mu.Unlock()
    if _, ok := f.temporary[id]; !ok { return false }
    delete(f.temporary, id)
    return true
}
func (f *nativeFiles) publicWorkspaces(state workspaceStore) map[string]any {
    rows := make([]map[string]any, 0, len(state.Workspaces)+len(f.temporary))
    seen := make(map[string]bool)
    for _, grant := range state.Workspaces {
        row := workspacePublic(grant)
        row["sourceId"] = directorySourceID(f.cfg, grant)
        rows = append(rows, row)
        seen[grant.WorkspaceID] = true
    }
    for _, grant := range f.temporary {
        if seen[grant.WorkspaceID] { continue }
        row := workspacePublic(grant)
        row["sourceId"] = directorySourceID(f.cfg, grant)
        row["temporary"] = true
        rows = append(rows, row)
    }
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

var _ os.FileInfo
