//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net"
	"path"
	"sort"
	"strings"
	"time"
)

type filesMCPGrant struct {
	id, token, workspaceID, leaseEpoch string
	expires                            time.Time
	active, ownsBinding                bool
	files                              map[string]string
	owner                              net.Conn
}

func (f *nativeFiles) mcpGrant(approval filesMCPApproval) (filesMCPCredential, error) {
	denied := filesMCPError("E_FILES_ACCESS")
	if approval.Purpose != filesMCPPurpose || !workspaceIDPattern.MatchString(approval.WorkspaceID) || approval.TTLSeconds < 1 || approval.TTLSeconds > 1800 || !approval.BodyEgressConsent || len(approval.Files) < 1 || len(approval.Files) > 32 {
		return filesMCPCredential{}, denied
	}
	scope := map[string]string{}
	for _, entry := range approval.Files {
		if validFilesPath(entry.Path, false, true) != nil || (entry.Access != "read" && entry.Access != "read-write") || scope[entry.Path] != "" {
			return filesMCPCredential{}, denied
		}
		scope[entry.Path] = entry.Access
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.live() != nil || f.verifyInstall() != nil {
		return filesMCPCredential{}, denied
	}
	release, e := lockWorkspaceStore(f.cfg)
	if e != nil {
		return filesMCPCredential{}, e
	}
	defer release()
	state, e := readWorkspaceStore(f.cfg)
	if e != nil {
		return filesMCPCredential{}, e
	}
	f.refreshDevLeaseFences(state)
	if e = f.mcpPruneLocked(&state); e != nil {
		return filesMCPCredential{}, e
	}
	var workspace workspaceGrant
	for _, w := range state.Workspaces {
		if w.WorkspaceID == approval.WorkspaceID {
			workspace = w
		}
	}
	// Existing attached temporary workspaces are accepted only with their actual
	// epoch. Omitted epochs may establish a lease solely over durable grants.
	if workspace.WorkspaceID == "" && approval.LeaseEpoch != "" {
		workspace = f.temporary[approval.WorkspaceID]
	}
	if workspace.WorkspaceID == "" {
		return filesMCPCredential{}, denied
	}
	for p, access := range scope {
		if access == "read-write" && workspace.Access != "read-write" {
			return filesMCPCredential{}, denied
		}
		raw, _ := json.Marshal(filesLocation{WorkspaceID: workspace.WorkspaceID, Path: p})
		if _, e = f.call(filesRequest{Method: "files.read", Params: raw}, state); e != nil {
			return filesMCPCredential{}, e
		}
	}
	binding, exists := f.devBindings[workspace.WorkspaceID]
	owns := false
	if approval.LeaseEpoch != "" {
		if !exists || binding.retired || binding.leaseEpoch != approval.LeaseEpoch || binding.access != workspace.Access {
			return filesMCPCredential{}, denied
		}
	} else {
		if exists {
			return filesMCPCredential{}, filesMCPError("E_FILES_SESSION")
		}
		epoch, e := NewID()
		if e != nil {
			return filesMCPCredential{}, denied
		}
		binding = devWorkspaceBinding{sourceID: directorySourceID(f.cfg, workspace), leaseEpoch: epoch, access: workspace.Access}
		owns = true
	}
	if f.mcpGrants == nil {
		f.mcpGrants = map[string]*filesMCPGrant{}
	}
	// Bound simultaneously live capabilities; retired tokens are never reused.
	if len(f.mcpGrants) >= 32 {
		return filesMCPCredential{}, filesMCPError("E_FILES_LIMIT")
	}
	id, e := NewID()
	if e != nil {
		return filesMCPCredential{}, denied
	}
	var secret [32]byte
	if _, e = rand.Read(secret[:]); e != nil {
		return filesMCPCredential{}, denied
	}
	if owns {
		if e = f.recordDevLeaseFence(&state, workspace.WorkspaceID, binding); e != nil {
			return filesMCPCredential{}, e
		}
		f.devBindings[workspace.WorkspaceID] = binding
	}
	token := hex.EncodeToString(secret[:])
	expires := time.Now().Add(time.Duration(approval.TTLSeconds) * time.Second)
	f.mcpGrants[id] = &filesMCPGrant{id: id, token: token, workspaceID: workspace.WorkspaceID, leaseEpoch: binding.leaseEpoch, expires: expires, active: true, ownsBinding: owns, files: scope}
	return filesMCPCredential{Purpose: filesMCPPurpose, SocketPath: f.cfg.SocketPath, SessionID: f.sessionID, GrantID: id, Capability: token, ExpiresAt: expires.Unix()}, nil
}

// Caller owns both service and durable store locks. Retired/expired authority
// is removed only after its owner connection and matching binding are retired.
func (f *nativeFiles) mcpPruneLocked(state *workspaceStore) error {
	removed := []string{}
	changed := false
	for id, g := range f.mcpGrants {
		if g.active && time.Now().Before(g.expires) {
			continue
		}
		g.active = false
		if g.owner != nil {
			_ = g.owner.Close()
		}
		if g.ownsBinding {
			if binding, ok := f.devBindings[g.workspaceID]; ok && binding.leaseEpoch == g.leaseEpoch {
				delete(f.devBindings, g.workspaceID)
				delete(f.temporary, g.workspaceID)
			}
			kept := state.DevLeaseFences[:0]
			for _, fence := range state.DevLeaseFences {
				if fence.SessionID == f.sessionID && fence.WorkspaceID == g.workspaceID && fence.LeaseEpoch == g.leaseEpoch {
					changed = true
					continue
				}
				kept = append(kept, fence)
			}
			state.DevLeaseFences = kept
		}
		removed = append(removed, id)
	}
	if changed {
		if e := writeWorkspaceStore(f.cfg, *state); e != nil {
			return e
		}
	}
	for _, id := range removed {
		delete(f.mcpGrants, id)
	}
	return nil
}

// Grant creation and this handoff are separate transactions. Expiry/pruning,
// revocation or Host shutdown may happen while the handler is paused between
// them. Never resurrect a retired grant or dereference a removed map entry.
func (f *nativeFiles) mcpRegisterOwner(id string, owner net.Conn) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	g := f.mcpGrants[id]
	if g == nil || !g.active || !time.Now().Before(g.expires) || f.live() != nil || owner == nil || g.owner != nil && g.owner != owner {
		return false
	}
	g.owner = owner
	return true
}
func (f *nativeFiles) mcpRevoke(id string) {
	f.mu.Lock()
	g := f.mcpGrants[id]
	if g != nil {
		g.active = false
	}
	var owner net.Conn
	if g != nil {
		owner = g.owner
	}
	owns := g != nil && g.ownsBinding
	var workspace, epoch string
	if owns {
		workspace, epoch = g.workspaceID, g.leaseEpoch
	}
	f.mu.Unlock()
	if owner != nil {
		_ = owner.Close()
	}
	if owns {
		f.releaseDevWorkspace(workspace, epoch)
	}
}
func filesMCPResult(data any, err *filesError, write bool, confirmed ...bool) map[string]any {
	accepted, written, verified := "ACCEPTED", "NOT_APPLICABLE", false
	if write {
		written = "CONFIRMED"
		verified = true
	}
	result := map[string]any{"ok": err == nil}
	if err != nil {
		result["error"] = err
		accepted = "REJECTED"
		verified = false
		if write {
			written = "NOT_WRITTEN"
		}
		if err.Outcome == "OUTCOME_UNKNOWN" {
			accepted = "UNKNOWN"
			if write {
				written = "UNKNOWN"
			}
		}
	} else {
		result["data"] = data
	}
	if err != nil && write && len(confirmed) > 0 && confirmed[0] {
		accepted = "ACCEPTED"
		written = "CONFIRMED"
		verified = false
	}
	result["stages"] = map[string]any{"requestAccepted": accepted, "fileWritten": written, "readBackVerified": verified, "toolResult": "PREPARED"}
	return result
}
func filesMCPArgsDecode(method string, raw json.RawMessage) (filesMCPArgs, error) {
	var args filesMCPArgs
	if filesMCPDecode(raw, &args) != nil {
		return args, ErrSchema
	}
	var fields map[string]json.RawMessage
	json.Unmarshal(raw, &fields)
	var required []string
	switch method {
	case "files.status":
		if len(fields) > 1 || len(fields) == 1 && fields["requestId"] == nil {
			return args, ErrSchema
		}
	case "files.list", "files.read":
		required = []string{"workspaceId", "path"}
	case "files.write":
		required = []string{"workspaceId", "path", "content", "expectedSha256", "requestId"}
	default:
		return args, ErrSchema
	}
	if required != nil {
		if len(fields) != len(required) {
			return args, ErrSchema
		}
		for _, key := range required {
			if fields[key] == nil {
				return args, ErrSchema
			}
		}
		if !workspaceIDPattern.MatchString(args.WorkspaceID) || validFilesPath(args.Path, method == "files.list", method != "files.list") != nil {
			return args, ErrSchema
		}
	}
	if fields["requestId"] != nil && !filesMCPUUID.MatchString(args.RequestID) {
		return args, ErrSchema
	}
	if method == "files.write" {
		sha, e := hex.DecodeString(args.ExpectedSHA256)
		if e != nil || len(sha) != 32 || strings.ToLower(args.ExpectedSHA256) != args.ExpectedSHA256 || validFileText([]byte(args.Content)) != nil {
			return args, ErrSchema
		}
	}
	return args, nil
}

// The original nativeFiles mutex AND durable workspace lock cover admission,
// receipt lookup and actual file I/O. No snapshot grant can outlive its fence.
func (f *nativeFiles) mcpCall(id, method string, raw json.RawMessage) map[string]any {
	write := method == "files.write"
	fail := func(code string) map[string]any { return filesMCPResult(nil, filesFailure(code), write) }
	args, e := filesMCPArgsDecode(method, raw)
	if e != nil {
		return fail("E_SCHEMA")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	g := f.mcpGrants[id]
	if g == nil || !g.active || !time.Now().Before(g.expires) || f.live() != nil || f.verifyInstall() != nil {
		return fail("E_FILES_ACCESS")
	}
	release, e := lockWorkspaceStore(f.cfg)
	if e != nil {
		return fail(filesAsError(e).Code)
	}
	defer release()
	state, e := readWorkspaceStore(f.cfg)
	if e != nil {
		return fail(filesAsError(e).Code)
	}
	f.refreshDevLeaseFences(state)
	binding, ok := f.devBindings[g.workspaceID]
	if !ok || binding.retired || binding.leaseEpoch != g.leaseEpoch {
		g.active = false
		return fail("E_FILES_SESSION")
	}
	// Check root identity and access even for status receipts. A replaced or
	// unsafe workspace root cannot expose history.
	var workspace workspaceGrant
	for _, w := range state.Workspaces {
		if w.WorkspaceID == g.workspaceID {
			workspace = w
		}
	}
	if workspace.WorkspaceID == "" {
		workspace = f.temporary[g.workspaceID]
	}
	if workspace.WorkspaceID == "" || workspace.Access != binding.access {
		g.active = false
		return fail("E_FILES_ACCESS")
	}
	root, e := openWorkspaceRoot(workspace)
	if e != nil {
		return fail(filesAsError(e).Code)
	}
	root.Close()
	// Browser request IDs are public; derive a secret namespace so Browser
	// cannot plant a receipt reachable through this capability.
	mac := hmac.New(sha256.New, []byte(g.token))
	_, _ = mac.Write([]byte(args.RequestID))
	key := "mcp-" + hex.EncodeToString(mac.Sum(nil))
	if method == "files.status" {
		data := map[string]any{}
		if args.RequestID != "" {
			data["requestId"] = args.RequestID
			data["receiptStatus"] = "UNKNOWN"
			if receipt, ok := f.receipts[key]; ok {
				data["receiptStatus"] = "KNOWN"
				data["receipt"] = filesMCPResult(receipt.response.Result, receipt.response.Error, true, receipt.confirmed)
			}
		}
		return filesMCPResult(data, nil, false)
	}
	if args.WorkspaceID != g.workspaceID {
		return fail("E_FILES_ACCESS")
	}
	if method == "files.list" {
		return f.mcpList(g, args, state)
	}
	if g.files[args.Path] == "" || write && g.files[args.Path] != "read-write" {
		return fail("E_FILES_ACCESS")
	}
	params := map[string]any{"workspaceId": args.WorkspaceID, "path": args.Path, "leaseEpoch": g.leaseEpoch}
	if write {
		params["content"] = args.Content
		params["expectedSha256"] = args.ExpectedSHA256
	}
	encoded, _ := json.Marshal(params)
	req := filesRequest{V: 1, Kind: "files.request", Protocol: FilesProtocol, RequestID: key, SessionID: f.sessionID, Method: method, Params: encoded}
	// Existing digest/id ledger provides no-replay and conflicting-content checks.
	response := f.handleLocked(req, state)
	return filesMCPResult(response.Result, response.Error, write, f.writeConfirmed)
}
func (f *nativeFiles) mcpList(g *filesMCPGrant, args filesMCPArgs, state workspaceStore) map[string]any {
	rows := map[string]map[string]any{}
	prefix := args.Path
	if prefix != "" {
		prefix += "/"
	}
	for p := range g.files {
		if !strings.HasPrefix(p, prefix) {
			continue
		}
		remaining := strings.TrimPrefix(p, prefix)
		name := strings.SplitN(remaining, "/", 2)[0]
		relative := path.Join(args.Path, name)
		if name == remaining {
			raw, _ := json.Marshal(filesLocation{WorkspaceID: g.workspaceID, Path: p, LeaseEpoch: g.leaseEpoch})
			result, e := f.call(filesRequest{Method: "files.read", Params: raw}, state)
			if e != nil {
				return filesMCPResult(nil, filesAsError(e), false)
			}
			rows[name] = map[string]any{"name": name, "path": relative, "kind": "file", "bytes": result.(map[string]any)["bytes"]}
		} else {
			rows[name] = map[string]any{"name": name, "path": relative, "kind": "directory"}
		}
	}
	names := make([]string, 0, len(rows))
	for name := range rows {
		names = append(names, name)
	}
	sort.Strings(names)
	entries := []map[string]any{}
	for _, name := range names {
		entries = append(entries, rows[name])
	}
	return filesMCPResult(map[string]any{"workspaceId": g.workspaceID, "path": args.Path, "entries": entries, "truncated": false}, nil, false)
}
func (h *Host) serveFilesMCPAuth(c *localClient, raw []byte, reader *bufio.Reader) bool {
	var fields map[string]json.RawMessage
	json.Unmarshal(raw, &fields)
	var kind string
	json.Unmarshal(fields["kind"], &kind)
	if kind != "files-mcp.auth" {
		return false
	}
	var auth filesMCPAuth
	if filesMCPDecode(raw, &auth) != nil || auth.V != 1 || auth.Purpose != filesMCPPurpose || !CredentialValid(auth.Capability) {
		return true
	}
	h.files.mu.Lock()
	g := h.files.mcpGrants[auth.GrantID]
	valid := g != nil && auth.SessionID == h.files.sessionID && subtle.ConstantTimeCompare([]byte(g.token), []byte(auth.Capability)) == 1
	h.files.mu.Unlock()
	if !valid {
		return true
	}
	if h.sendLocal(c, []byte(`{"v":1,"kind":"files-mcp.authenticated"}`)) != nil {
		return true
	}
	_ = c.socket.SetReadDeadline(time.Now().Add(16 * time.Second))
	payload, e := ReadLine(reader)
	if e != nil {
		return true
	}
	var req filesMCPRequest
	if filesMCPDecode(payload, &req) != nil || req.V != 1 || req.Kind != "files-mcp.call" {
		return true
	}
	h.mu.Lock()
	ready := !h.closed && h.ready
	h.mu.Unlock()
	var result map[string]any
	if ready {
		result = h.files.mcpCall(auth.GrantID, req.Method, req.Args)
	} else {
		result = filesMCPResult(nil, filesFailure("E_NATIVE_NOT_READY"), req.Method == "files.write")
	}
	encoded, e := Encode(result)
	if e != nil {
		encoded, _ = Encode(filesMCPResult(nil, &filesError{Code: "E_FILES_LIMIT", Message: "E_FILES_LIMIT", Outcome: "OUTCOME_UNKNOWN"}, req.Method == "files.write"))
	}
	_ = h.sendLocal(c, encoded)
	return true
}
func (h *Host) serveFilesMCPControl(c *localClient, raw []byte, reader *bufio.Reader) {
	var req filesMCPControl
	reject := func() { _ = h.sendLocal(c, []byte(`{"ok":false,"error":{"code":"E_FILES_ACCESS"}}`)) }
	if filesMCPDecode(raw, &req) != nil || req.V != 1 {
		reject()
		return
	}
	h.mu.Lock()
	ready := h.ready && !h.closed
	h.mu.Unlock()
	if !ready {
		reject()
		return
	}
	if req.Kind == "files-mcp.revoke" {
		if len(req.Approval) != 0 || !filesMCPUUID.MatchString(req.GrantID) {
			reject()
			return
		}
		h.files.mcpRevoke(req.GrantID)
		_ = h.sendLocal(c, []byte(`{"ok":true}`))
		return
	}
	if req.Kind != "files-mcp.grant" || req.GrantID != "" {
		reject()
		return
	}
	var approval filesMCPApproval
	if filesMCPDecode(req.Approval, &approval) != nil {
		reject()
		return
	}
	credential, e := h.files.mcpGrant(approval)
	if e != nil {
		reject()
		return
	}
	defer h.files.mcpRevoke(credential.GrantID)
	if !h.files.mcpRegisterOwner(credential.GrantID, c.socket) {
		reject()
		return
	}
	reply, _ := Encode(map[string]any{"ok": true, "credential": credential})
	if h.sendLocal(c, reply) != nil {
		return
	}
	_ = c.socket.SetReadDeadline(time.Unix(credential.ExpiresAt, 0))
	// There are no lease-renewal or command frames on this owner connection.
	// EOF, unexpected input or TTL ends the capability, never replays work.
	_, _ = ReadLine(reader)
}
