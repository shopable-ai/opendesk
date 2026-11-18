//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const filesMCPControlTestGrant = "11111111-1111-4111-8111-111111111111"

// These endpoints are temporary Unix sockets, never live Native hosts. The
// first scoped connection is discovery; only the next carries the operation.
func filesMCPControlTestSocket(t *testing.T, cfg Installation, actualAuth func(map[string]any)) func() []string {
	t.Helper()
	listener, err := net.Listen("unix", cfg.SocketPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cfg.SocketPath, 0600); err != nil {
		t.Fatal(err)
	}
	var frames []string
	done := make(chan struct{})
	go func() {
		defer close(done)
		for n := 0; ; n++ {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			func() {
				defer conn.Close()
				_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
				reader := bufio.NewReader(conn)
				raw, err := ReadLine(reader)
				auth, de := Decode(raw)
				if err != nil || de != nil || Int(auth, "v") != 1 || String(auth, "kind") != "auth" || String(auth, "credential") != cfg.ClientCredential {
					t.Error("invalid client authentication on temporary socket")
					return
				}
				reply := map[string]any{"v": 1, "kind": "authenticated", "browserReady": true}
				if cfg.ConnectionID != "" {
					reply["connectionId"], reply["extensionId"] = cfg.ConnectionID, cfg.ExtensionID
				}
				if actualAuth != nil && (cfg.ConnectionID == "" || n > 0) {
					actualAuth(reply)
				}
				if err := WriteLine(conn, MustEncode(reply)); err != nil {
					t.Errorf("auth reply: %v", err)
					return
				}
				raw, err = ReadLine(reader)
				if err == io.EOF {
					frames = append(frames, "") // probe or rejected actual auth
					return
				}
				if err != nil {
					t.Errorf("read control: %v", err)
					return
				}
				fields, err := Decode(raw)
				if err != nil {
					t.Errorf("decode control: %v", err)
					return
				}
				frames = append(frames, String(fields, "kind"))
				result := map[string]any{"ok": true}
				if String(fields, "kind") == "files-mcp.grant" {
					result["credential"] = filesMCPCredential{Purpose: filesMCPPurpose, GrantID: filesMCPControlTestGrant}
				}
				_ = WriteLine(conn, MustEncode(result))
			}()
		}
	}()
	var once sync.Once
	stop := func() []string {
		once.Do(func() { _ = listener.Close(); <-done })
		return frames
	}
	t.Cleanup(func() { stop() })
	return stop
}

func filesMCPControlTestScope(t *testing.T, parent Installation, id string) Installation {
	t.Helper()
	base, err := connectionDirectory()
	if err != nil {
		t.Fatal(err)
	}
	cfg := parent
	cfg.ConnectionID = id
	cfg.ParentRoot = parent.InstallRoot
	cfg.ParentCredentialDigest = digestCredential(parent.ClientCredential)
	cfg.InstallRoot = filepath.Join(base, id)
	cfg.SocketPath = filepath.Join(cfg.InstallRoot, "agent.sock")
	cfg.ClientCredential = strings.Repeat("b", 64)
	if err := os.MkdirAll(cfg.InstallRoot, 0700); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfg.InstallRoot, "connection.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	release, err := lockConnectionRoot(cfg.InstallRoot)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(release)
	return cfg
}

func filesMCPControlTestRun(t *testing.T, operation string) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if operation == "revoke" {
		return RevokeFilesMCP(ctx, filesMCPControlTestGrant)
	}
	// Private synthetic approval and output stay within the isolated test HOME.
	home, err := filepath.EvalSymlinks(os.Getenv("HOME"))
	if err != nil {
		t.Fatal(err)
	}
	approval := filepath.Join(home, "approval.json")
	if err := os.WriteFile(approval, []byte(`{"purpose":"opendesk.files-mcp.v1"}`), 0600); err != nil {
		t.Fatal(err)
	}
	lease, err := GrantFilesMCP(ctx, approval, filepath.Join(home, "files-credential.json"))
	if lease != nil {
		_ = lease.Close()
		<-lease.Done()
	}
	return err
}

func TestFilesMCPControlSelectorRouting(t *testing.T) {
	for _, operation := range []string{"grant", "revoke"} {
		for _, selector := range []string{"scoped", "automatic", "legacy", "unset-legacy"} {
			t.Run(operation+"/"+selector, func(t *testing.T) {
				parent := connectionInstallation(t)
				t.Setenv(ConnectionEnvironment, "")
				if err := os.Unsetenv(ConnectionEnvironment); err != nil {
					t.Fatal(err)
				}
				var selected func() []string
				var other func() []string
				if selector == "scoped" || selector == "automatic" {
					cfg := filesMCPControlTestScope(t, parent, strings.Repeat("1", 32))
					selected = filesMCPControlTestSocket(t, cfg, nil)
					if selector == "scoped" {
						t.Setenv(ConnectionEnvironment, cfg.ConnectionID)
						other = filesMCPControlTestSocket(t, parent, nil)
					}
				} else {
					selected = filesMCPControlTestSocket(t, parent, nil)
					if selector == "legacy" {
						t.Setenv(ConnectionEnvironment, "legacy")
					}
				}
				if err := filesMCPControlTestRun(t, operation); err != nil {
					t.Errorf("operation: %v", err)
				}
				want := "files-mcp." + operation
				frames := selected()
				expected := want
				if selector == "scoped" || selector == "automatic" {
					expected = "," + want
				}
				if strings.Join(frames, ",") != expected {
					t.Errorf("selected frames = %q, want %q", frames, expected)
				}
				if other != nil && len(other()) != 0 {
					t.Error("control reached legacy socket")
				}
			})
		}
	}
}

func TestFilesMCPConnectionSelectorErrorsDoNotFallback(t *testing.T) {
	for _, operation := range []string{"grant", "revoke"} {
		for _, scenario := range []string{"invalid", "gone", "unready", "ambiguous"} {
			t.Run(operation+"/"+scenario, func(t *testing.T) {
				parent := connectionInstallation(t)
				legacy := filesMCPControlTestSocket(t, parent, nil)
				t.Setenv(ConnectionEnvironment, "bad")
				want := "E_CONNECTION_INVALID"
				if scenario == "gone" {
					t.Setenv(ConnectionEnvironment, strings.Repeat("1", 32))
					want = "E_CONNECTION_GONE"
				}
				if scenario == "unready" || scenario == "ambiguous" {
					cfg := filesMCPControlTestScope(t, parent, strings.Repeat("1", 32))
					t.Setenv(ConnectionEnvironment, cfg.ConnectionID)
					want = "E_CONNECTION_GONE" // explicit dead socket
					if scenario == "ambiguous" {
						if err := os.Unsetenv(ConnectionEnvironment); err != nil {
							t.Fatal(err)
						}
						want = "E_CONNECTION_REQUIRED"
					}
				}
				if err := filesMCPControlTestRun(t, operation); err == nil || err.Error() != want {
					t.Errorf("got %v, want %s", err, want)
				}
				if frames := legacy(); len(frames) != 0 {
					t.Errorf("legacy fallback frames: %q", frames)
				}
			})
		}
	}
}

func TestFilesMCPControlActualConnectionAuthentication(t *testing.T) {
	for _, operation := range []string{"grant", "revoke"} {
		for _, field := range []string{"v", "kind", "browserReady", "connectionId", "extensionId", "missingConnectionId", "missingExtensionId"} {
			t.Run(operation+"/"+field, func(t *testing.T) {
				parent := connectionInstallation(t)
				cfg := filesMCPControlTestScope(t, parent, strings.Repeat("1", 32))
				t.Setenv(ConnectionEnvironment, cfg.ConnectionID)
				legacy := filesMCPControlTestSocket(t, parent, nil)
				selected := filesMCPControlTestSocket(t, cfg, func(auth map[string]any) {
					switch field {
					case "v":
						auth[field] = 2
					case "browserReady":
						auth[field] = false
					case "missingConnectionId":
						delete(auth, "connectionId")
					case "missingExtensionId":
						delete(auth, "extensionId")
					default:
						auth[field] = "wrong"
					}
				})
				want := "E_AUTH"
				if strings.Contains(strings.ToLower(field), "id") {
					want = "E_CONNECTION_IDENTITY"
				}
				if err := filesMCPControlTestRun(t, operation); err == nil || err.Error() != want {
					t.Errorf("got %v, want %s", err, want)
				}
				if frames := selected(); len(frames) != 2 || frames[0] != "" || frames[1] != "" {
					t.Errorf("expected discovery and rejected control auth without control frames: %q", frames)
				}
				if frames := legacy(); len(frames) != 0 {
					t.Errorf("legacy fallback: %q", frames)
				}
			})
		}
	}
}
