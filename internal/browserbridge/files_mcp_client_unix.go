//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"path/filepath"
	"sync"
	"time"
)

// FilesMCPClient holds only the dedicated capability, never ClientCredential.
// Each Call opens one connection and sends at most one operation. No replay.
type FilesMCPClient struct {
	mu          sync.Mutex
	credential  filesMCPCredential
	closed      bool
	connections map[net.Conn]bool
}

func NewFilesMCPClient(credentialFile string) (*FilesMCPClient, error) {
	raw, e := filesMCPReadPrivate(credentialFile)
	if e != nil {
		return nil, e
	}
	var credential filesMCPCredential
	if filesMCPDecode(raw, &credential) != nil || credential.Purpose != filesMCPPurpose || !filepath.IsAbs(credential.SocketPath) || filepath.Clean(credential.SocketPath) != credential.SocketPath || !filesMCPUUID.MatchString(credential.SessionID) || !filesMCPUUID.MatchString(credential.GrantID) || !CredentialValid(credential.Capability) || credential.ExpiresAt <= time.Now().Unix() || credential.ExpiresAt > time.Now().Add(1800*time.Second).Unix() {
		return nil, filesMCPError("E_FILES_CREDENTIAL")
	}
	return &FilesMCPClient{credential: credential, connections: map[net.Conn]bool{}}, nil
}
func (c *FilesMCPClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
	for conn := range c.connections {
		_ = conn.Close()
	}
	return nil
}
func (c *FilesMCPClient) Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error) {
	if _, e := filesMCPArgsDecode(method, args); e != nil {
		return nil, filesMCPError("E_SCHEMA")
	}
	request, e := Encode(filesMCPRequest{V: 1, Kind: "files-mcp.call", Method: method, Args: args})
	if e != nil {
		return nil, filesMCPError("E_FILES_LIMIT")
	}
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, filesMCPError("E_FILES_SESSION")
	}
	credential := c.credential
	c.mu.Unlock()
	dialer := net.Dialer{Timeout: 3 * time.Second}
	conn, e := dialer.DialContext(ctx, "unix", credential.SocketPath)
	if e != nil {
		return nil, callError(false)
	}
	defer conn.Close()
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, filesMCPError("E_FILES_SESSION")
	}
	c.connections[conn] = true
	c.mu.Unlock()
	defer func() { c.mu.Lock(); delete(c.connections, conn); c.mu.Unlock() }()
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	deadline := time.Now().Add(16 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	auth, _ := Encode(filesMCPAuth{V: 1, Kind: "files-mcp.auth", Purpose: filesMCPPurpose, SessionID: credential.SessionID, GrantID: credential.GrantID, Capability: credential.Capability})
	if WriteLine(conn, auth) != nil {
		return nil, callError(false)
	}
	reader := bufio.NewReaderSize(conn, MaxBytes+2)
	raw, e := ReadLine(reader)
	if e != nil {
		return nil, filesMCPError("E_AUTH")
	}
	var authenticated struct {
		V    int    `json:"v"`
		Kind string `json:"kind"`
	}
	if filesMCPDecode(raw, &authenticated) != nil || authenticated.V != 1 || authenticated.Kind != "files-mcp.authenticated" {
		return nil, filesMCPError("E_AUTH")
	}
	if ctx.Err() != nil {
		return nil, callError(false)
	}
	// Any failure after attempting transmission can follow a committed write.
	if WriteLine(conn, request) != nil {
		return nil, callError(true)
	}
	raw, e = ReadLine(reader)
	if e != nil || !filesMCPJSON(raw) {
		return nil, callError(true)
	}
	return json.RawMessage(raw), nil
}

type FilesMCPLease struct {
	GrantID string
	conn    net.Conn
	done    chan struct{}
	once    sync.Once
}

func (l *FilesMCPLease) Done() <-chan struct{} { return l.done }
func (l *FilesMCPLease) Close() error          { l.once.Do(func() { _ = l.conn.Close() }); return nil }

func filesMCPControlConnect(ctx context.Context) (net.Conn, *bufio.Reader, error) {
	cfg, e := LoadClient()
	if e != nil {
		return nil, nil, e
	}
	dialer := net.Dialer{Timeout: 3 * time.Second}
	conn, e := dialer.DialContext(ctx, "unix", cfg.SocketPath)
	if e != nil {
		return nil, nil, callError(false)
	}
	deadline := time.Now().Add(5 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	raw, _ := Encode(map[string]any{"v": 1, "kind": "auth", "credential": cfg.ClientCredential})
	if WriteLine(conn, raw) != nil {
		conn.Close()
		return nil, nil, callError(false)
	}
	reader := bufio.NewReaderSize(conn, MaxBytes+2)
	raw, e = ReadLine(reader)
	fields, de := Decode(raw)
	if e != nil || de != nil || Int(fields, "v") != Version || String(fields, "kind") != "authenticated" || !Bool(fields, "browserReady") {
		conn.Close()
		return nil, nil, filesMCPError("E_AUTH")
	}
	// Discovery probes a separate socket. Pin the actual control connection
	// before sending a grant/revoke; legacy hosts do not report scoped identity.
	if cfg.ConnectionID != "" && (String(fields, "connectionId") != cfg.ConnectionID || String(fields, "extensionId") != cfg.ExtensionID) {
		conn.Close()
		return nil, nil, filesMCPError("E_CONNECTION_IDENTITY")
	}
	return conn, reader, nil
}

// GrantFilesMCP is a trusted LOCAL management API, not a file-model method.
// Successful return leaves a live connection owned by the caller until Close,
// context cancellation, server revocation/expiry or Host exit.
func GrantFilesMCP(ctx context.Context, approvalFile, credentialFile string) (*FilesMCPLease, error) {
	raw, e := filesMCPReadPrivate(approvalFile)
	if e != nil {
		return nil, e
	}
	var approval filesMCPApproval
	if filesMCPDecode(raw, &approval) != nil {
		return nil, filesMCPError("E_SCHEMA")
	}
	conn, reader, e := filesMCPControlConnect(ctx)
	if e != nil {
		return nil, e
	}
	success := false
	defer func() {
		if !success {
			conn.Close()
		}
	}()
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	request, e := Encode(filesMCPControl{V: 1, Kind: "files-mcp.grant", Approval: raw})
	if e != nil {
		stop()
		return nil, filesMCPError("E_SCHEMA")
	}
	if WriteLine(conn, request) != nil {
		stop()
		return nil, callError(false)
	}
	reply, e := ReadLine(reader)
	var result struct {
		OK         bool               `json:"ok"`
		Credential filesMCPCredential `json:"credential"`
	}
	if e != nil || filesMCPDecode(reply, &result) != nil || !result.OK || result.Credential.Purpose != filesMCPPurpose {
		stop()
		return nil, filesMCPError("E_FILES_ACCESS")
	}
	secret, _ := json.Marshal(result.Credential)
	if e = filesMCPWritePrivate(credentialFile, secret); e != nil {
		stop()
		return nil, e
	}
	_ = conn.SetDeadline(time.Time{})
	lease := &FilesMCPLease{GrantID: result.Credential.GrantID, conn: conn, done: make(chan struct{})}
	success = true
	go func() { defer close(lease.done); defer stop(); defer lease.Close(); _, _ = ReadLine(reader) }()
	return lease, nil
}
func RevokeFilesMCP(ctx context.Context, grantID string) error {
	if !filesMCPUUID.MatchString(grantID) {
		return filesMCPError("E_SCHEMA")
	}
	conn, reader, e := filesMCPControlConnect(ctx)
	if e != nil {
		return e
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	request, _ := Encode(filesMCPControl{V: 1, Kind: "files-mcp.revoke", GrantID: grantID})
	if WriteLine(conn, request) != nil {
		return callError(false)
	}
	raw, e := ReadLine(reader)
	var result struct {
		OK bool `json:"ok"`
	}
	if e != nil || filesMCPDecode(raw, &result) != nil || !result.OK {
		return filesMCPError("E_FILES_ACCESS")
	}
	return nil
}
