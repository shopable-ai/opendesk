//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"syscall"
	"time"
)

// Connection records are discovery data for the existing Host, never a relay
// or a second dispatcher. Chrome's private stdio Port remains its sole owner.
const ConnectionEnvironment = "OPENDESK_NATIVE_CONNECTION"

var connectionIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

func connectionDirectory() (string, error) {
	base, err := browserBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "c"), nil
}
func randomConnectionHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// NewConnectionHost isolates a Chrome-launched Port without installing another
// OpenDesk or transferring any file grants from the installation/another Port.
func NewConnectionHost(parent Installation, origin string, input io.Reader, output io.Writer) (*Host, error) {
	if parent.ConnectionID != "" || parent.ParentRoot != "" || parent.ParentCredentialDigest != "" {
		return nil, ErrSchema
	}
	var host *Host
	_, err := withInstallLock(context.Background(), false, func() (map[string]any, error) {
		current, err := loadInstallation()
		if err != nil {
			return nil, err
		}
		// A launcher admitted before any installation transaction cannot
		// reappear after revoke/approve with its old authorization generation.
		if current != parent {
			return nil, errors.New("E_CONNECTION_REVOKED")
		}
		host, err = allocateConnectionHost(current, origin, input, output)
		return nil, err
	})
	return host, err
}

// Keep installation -> allocation -> scope lock order through publication.
func allocateConnectionHost(parent Installation, origin string, input io.Reader, output io.Writer) (*Host, error) {
	id := originExtension(origin)
	if !InstallationAllowsExtension(parent, id) {
		return nil, errors.New("E_EXTENSION_ID")
	}
	base, err := connectionDirectory()
	if err != nil {
		return nil, err
	}
	if err = ensureDir(base); err != nil {
		return nil, err
	}
	// This short allocation lock serializes discovery publication only. Each
	// Host holds its own existing lifecycle lock for its entire lifetime.
	releaseAllocation, err := lockConnectionRoot(base)
	if err != nil {
		return nil, err
	}
	defer releaseAllocation()
	connections, err := connectionCandidates(parent)
	if err != nil {
		return nil, err
	}
	if len(connections) >= MaxClients {
		return nil, ErrLimit
	}
	connectionID, err := randomConnectionHex(16)
	if err != nil {
		return nil, err
	}
	root := filepath.Join(base, connectionID)
	if err = os.Mkdir(root, 0700); err != nil {
		return nil, err
	}
	cfg := parent
	cfg.ConnectionID = connectionID
	cfg.ParentRoot = parent.InstallRoot
	cfg.ParentCredentialDigest = digestCredential(parent.ClientCredential)
	cfg.InstallRoot = root
	cfg.SocketPath = filepath.Join(root, "agent.sock")
	cfg.ExtensionID = id
	cfg.ClientCredential, err = randomConnectionHex(32)
	if err != nil {
		_ = os.Remove(root)
		return nil, err
	}
	if len(cfg.SocketPath) >= 104 {
		_ = os.Remove(root)
		return nil, errors.New("E_SOCKET_PATH")
	}
	h, err := NewHost(cfg, origin, input, output)
	if err != nil {
		_ = os.Remove(root)
		return nil, err
	}
	h.releaseConnection, err = lockConnectionRoot(root)
	if err != nil {
		h.Close()
		return nil, err
	}
	data, err := json.Marshal(cfg)
	if err == nil {
		err = writeAtomic(filepath.Join(root, "connection.json"), data, 0600)
	}
	if err != nil {
		h.Close()
		return nil, err
	}
	h.connectionInfo, err = os.Lstat(filepath.Join(root, "connection.json"))
	if err != nil {
		h.Close()
		return nil, err
	}
	return h, nil
}

func originExtension(origin string) string {
	const prefix = "chrome-extension://"
	if len(origin) != len(prefix)+32+1 || origin[:len(prefix)] != prefix || origin[len(origin)-1] != '/' {
		return ""
	}
	id := origin[len(prefix) : len(prefix)+32]
	if !ExtensionIDValid(id) {
		return ""
	}
	return id
}

func validateConnectionParent(cfg, parent Installation) error {
	base, err := connectionDirectory()
	if err != nil {
		return err
	}
	if !connectionIDPattern.MatchString(cfg.ConnectionID) || cfg.ParentRoot != parent.InstallRoot ||
		cfg.ParentCredentialDigest != digestCredential(parent.ClientCredential) || !InstallationAllowsExtension(parent, cfg.ExtensionID) {
		return errors.New("E_CONNECTION_REVOKED")
	}
	if cfg.Name != parent.Name || cfg.Provider != parent.Provider || cfg.Executable != parent.Executable ||
		cfg.Browser != parent.Browser || cfg.UserDataDir != parent.UserDataDir || !CredentialValid(cfg.ClientCredential) ||
		cfg.InstallRoot != filepath.Join(base, cfg.ConnectionID) || cfg.SocketPath != filepath.Join(cfg.InstallRoot, "agent.sock") {
		return errors.New("E_CONNECTION_INVALID")
	}
	if err = requireDir(base); err != nil {
		return err
	}
	return requireDir(cfg.InstallRoot)
}

func readConnection(parent Installation, id string) (Installation, error) {
	var cfg Installation
	if !connectionIDPattern.MatchString(id) {
		return cfg, errors.New("E_CONNECTION_INVALID")
	}
	base, err := connectionDirectory()
	if err != nil {
		return cfg, err
	}
	root := filepath.Join(base, id)
	if _, err := os.Lstat(filepath.Join(root, "revoked")); err == nil {
		return cfg, errors.New("E_CONNECTION_REVOKED")
	} else if !os.IsNotExist(err) {
		return cfg, err
	}
	if err = requireDir(base); err != nil {
		return cfg, err
	}
	if err = requireDir(root); err != nil {
		return cfg, err
	}
	file := filepath.Join(root, "connection.json")
	info, err := requireRegular(file, 0600)
	if err != nil {
		return cfg, err
	}
	if info.Size() > 16384 {
		return cfg, errors.New("E_CONNECTION_INVALID")
	}
	fd, err := syscall.Open(file, syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return cfg, err
	}
	f := os.NewFile(uintptr(fd), file)
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return cfg, errors.New("E_CONNECTION_INVALID")
	}
	data, err := io.ReadAll(io.LimitReader(f, 16385))
	if err != nil || len(data) > 16384 {
		return cfg, errors.New("E_CONNECTION_INVALID")
	}
	if json.Unmarshal(data, &cfg) != nil || cfg.ConnectionID != id {
		return Installation{}, errors.New("E_CONNECTION_INVALID")
	}
	if err = validateConnectionParent(cfg, parent); err != nil {
		return Installation{}, err
	}
	return cfg, nil
}

// dialConnection verifies the server's connection identity before a request can
// be sent. A mismatched endpoint is NOT_DISPATCHED and never tried elsewhere.
func dialConnection(cfg Installation) (net.Conn, error) {
	dialer := net.Dialer{Timeout: 250 * time.Millisecond}
	c, err := dialer.Dial("unix", cfg.SocketPath)
	if err != nil {
		return nil, err
	}
	fail := func(err error) (net.Conn, error) { _ = c.Close(); return nil, err }
	if err = c.SetDeadline(time.Now().Add(time.Second)); err != nil {
		return fail(err)
	}
	if err = WriteLine(c, MustEncode(map[string]any{"v": 1, "kind": "auth", "credential": cfg.ClientCredential})); err != nil {
		return fail(err)
	}
	data, err := ReadLine(bufio.NewReaderSize(c, MaxBytes+2))
	if err != nil {
		return fail(err)
	}
	f, err := Decode(data)
	if err != nil || Int(f, "v") != 1 || String(f, "kind") != "authenticated" || !Bool(f, "browserReady") ||
		String(f, "connectionId") != cfg.ConnectionID || String(f, "extensionId") != cfg.ExtensionID {
		return fail(errors.New("E_CONNECTION_IDENTITY"))
	}
	return c, nil
}

func connectionCandidates(parent Installation) ([]Installation, error) {
	base, err := connectionDirectory()
	if err != nil {
		return nil, err
	}
	if _, err = os.Lstat(base); os.IsNotExist(err) {
		return nil, nil
	}
	if err = requireDir(base); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(base)
	if err != nil {
		return nil, err
	}
	var result []Installation
	for _, e := range entries {
		if !connectionIDPattern.MatchString(e.Name()) {
			continue
		}
		cfg, err := readConnection(parent, e.Name())
		if err != nil {
			continue
		}
		// A blocked/busy/unready live Host is still a possible target. Never
		// silently choose the other browser because a probe temporarily failed.
		// An acquired lifetime lock proves only this scoped Host is retired.
		if release, lockErr := lockConnectionRoot(cfg.InstallRoot); lockErr == nil {
			retireConnectionFiles(cfg, nil)
			release()
			continue
		}
		result = append(result, cfg)
	}
	return result, nil
}

// Explicit IDs never fall back to another connection, including after EOF.
func LoadConnection(id string) (Installation, error) {
	parent, err := Load()
	if err != nil {
		return Installation{}, err
	}
	if id == "legacy" {
		if _, err := requireSocket(parent.SocketPath); err != nil {
			return Installation{}, errors.New("E_CONNECTION_GONE")
		}
		return parent, nil
	}
	if id != "" {
		cfg, err := readConnection(parent, id)
		if err != nil {
			return Installation{}, errors.New("E_CONNECTION_GONE")
		}
		c, err := dialConnection(cfg)
		if err != nil {
			return Installation{}, errors.New("E_CONNECTION_GONE")
		}
		_ = c.Close()
		return cfg, nil
	}
	connections, err := connectionCandidates(parent)
	if err != nil {
		return Installation{}, err
	}
	_, legacyErr := os.Lstat(parent.SocketPath)
	if legacyErr != nil && !os.IsNotExist(legacyErr) {
		return Installation{}, legacyErr
	}
	if len(connections) > 1 || (len(connections) > 0 && legacyErr == nil) {
		return Installation{}, errors.New("E_CONNECTION_REQUIRED")
	}
	if len(connections) == 1 {
		c, err := dialConnection(connections[0])
		if err != nil {
			return Installation{}, errors.New("E_CONNECTION_NOT_READY")
		}
		_ = c.Close()
		return connections[0], nil
	}
	return Installation{}, errors.New("E_CONNECTION_GONE")
}

// Legacy single-Host installations remain callable until their owner upgrades.
// Once a new connection is explicitly selected it cannot fall back to legacy.
func LoadClient() (Installation, error) {
	id, set := os.LookupEnv(ConnectionEnvironment)
	if set && id != "legacy" && !connectionIDPattern.MatchString(id) {
		return Installation{}, errors.New("E_CONNECTION_INVALID")
	}
	if set {
		return LoadConnection(id)
	}
	cfg, err := LoadConnection("")
	if err == nil || err.Error() != "E_CONNECTION_GONE" {
		return cfg, err
	}
	return Load()
}

func Connections() (map[string]any, error) {
	parent, err := Load()
	if err != nil {
		return nil, err
	}
	connections, err := connectionCandidates(parent)
	if err != nil {
		return nil, err
	}
	rows := make([]map[string]any, 0, len(connections))
	for _, c := range connections {
		probe, err := dialConnection(c)
		if err == nil {
			_ = probe.Close()
		}
		rows = append(rows, map[string]any{"connectionId": c.ConnectionID, "extensionId": c.ExtensionID, "browser": c.Browser, "ready": err == nil})
	}
	return map[string]any{"connections": rows}, nil
}

func verifyClientInstallation(cfg Installation) error {
	parent, err := loadConnectionParent()
	if err != nil {
		return err
	}
	if cfg.ConnectionID != "" {
		if err = validateConnectionParent(cfg, parent); err != nil {
			return err
		}
		current, err := readConnection(parent, cfg.ConnectionID)
		if err != nil {
			return err
		}
		if current != cfg {
			return errors.New("E_CONNECTION_INVALID")
		}
		return nil
	}
	if parent.InstallRoot != cfg.InstallRoot || parent.ExtensionID != cfg.ExtensionID || parent.ClientCredential != cfg.ClientCredential {
		return errors.New("E_CONNECTION_REVOKED")
	}
	return nil
}

// A scope is a one-use random name; once its publication is retired, it is
// never reopened. Remove only known private artifacts, never recursive data.
func retireConnectionFiles(cfg Installation, expected os.FileInfo) {
	file := filepath.Join(cfg.InstallRoot, "connection.json")
	info, err := requireRegular(file, 0600)
	if err != nil || (expected != nil && !os.SameFile(info, expected)) {
		return
	}
	if err = os.Remove(file); err != nil {
		return
	}
	for _, name := range []string{projectStoreName, "project-grants.lock", workspaceStoreName, workspaceLockName, "revoked", "host-lifecycle.lock", connectionLockName} {
		p := filepath.Join(cfg.InstallRoot, name)
		if _, err := requireRegular(p, 0600); err == nil {
			_ = os.Remove(p)
		}
	}
	// A crashed Host may have left its owned socket; an active lifetime owner
	// can never reach this branch via discovery.
	p := filepath.Join(cfg.InstallRoot, "agent.sock")
	if info, err := os.Lstat(p); err == nil && info.Mode()&os.ModeSocket != 0 && userOwned(info) {
		_ = os.Remove(p)
	}
	_ = os.Remove(cfg.InstallRoot) // Preserve unknown entries rather than erase them.
}
func (h *Host) retireConnection() {
	if h.cfg.ConnectionID != "" && h.connectionInfo != nil {
		retireConnectionFiles(h.cfg, h.connectionInfo)
	}
}

const connectionLockName = "connection-lifetime.lock"

// Separate from the legacy socket-recovery implementation: a scoped Host
// owns this lock before publication, through socket shutdown and retirement.
func lockConnectionRoot(root string) (func(), error) {
	if err := requireDir(root); err != nil {
		return nil, err
	}
	p := filepath.Join(root, connectionLockName)
	fd, err := syscall.Open(p, syscall.O_CREAT|syscall.O_RDWR|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), p)
	fail := func(err error) (func(), error) { _ = f.Close(); return nil, err }
	info, err := f.Stat()
	if err != nil {
		return fail(err)
	}
	current, err := requireRegular(p, 0600)
	if err != nil || !os.SameFile(info, current) {
		return fail(errors.New("E_CONNECTION_INVALID"))
	}
	if err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return fail(errors.New("E_CONNECTION_BUSY"))
	}
	var once sync.Once
	return func() { once.Do(func() { _ = syscall.Flock(fd, syscall.LOCK_UN); _ = f.Close() }) }, nil
}

func (h *Host) watchConnectionAuthorization() {
	if h.cfg.ConnectionID == "" {
		return
	}
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-h.done:
			return
		case <-ticker.C:
			err := verifyClientInstallation(h.cfg)
			if err != nil && (err.Error() == "E_CONNECTION_REVOKED" || os.IsNotExist(err)) {
				h.Close()
				return
			}
		}
	}
}

// Installer publication is short and atomic. A legitimate in-flight frame must
// wait for that snapshot instead of interpreting lock contention as revocation.
func loadConnectionParent() (Installation, error) {
	end := time.Now().Add(2 * time.Second)
	for {
		cfg, err := Load()
		if err == nil || err.Error() != "E_INSTALL_BUSY" || time.Now().After(end) {
			return cfg, err
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// Re-registration cannot revive any old Port, even between watcher ticks.
// Called under the existing exclusive installation transaction lock.
func retireExtensionConnections(parent Installation, extensionID string) (int, error) {
	base, err := connectionDirectory()
	if err != nil {
		return 0, err
	}
	entries, err := os.ReadDir(base)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if err = requireDir(base); err != nil {
		return 0, err
	}
	retired := 0
	for _, entry := range entries {
		if !connectionIDPattern.MatchString(entry.Name()) {
			continue
		}
		cfg, err := readConnection(parent, entry.Name())
		if err != nil || cfg.ExtensionID != extensionID {
			continue
		}
		if err = writeAtomic(filepath.Join(cfg.InstallRoot, "revoked"), []byte("revoked\n"), 0600); err != nil {
			return retired, err
		}
		retired++
	}
	return retired, nil
}

func requireSocket(path string) (os.FileInfo, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSocket == 0 || !userOwned(info) || info.Mode().Perm() != 0600 {
		return nil, errors.New("E_CONNECTION_INVALID")
	}
	return info, nil
}
