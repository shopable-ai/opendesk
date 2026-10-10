//go:build darwin || linux

package browsercli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/internal/browserbridge"
)

// Exercise the actual CLI/client EOF path with local IPC, without pretending
// that this server is Chrome or that it executed a browser mutation.
func TestUnknownAdmissionPreservesGeneratedRecoveryIdentityWithoutReplay(t *testing.T) {
	for _, method := range []string{"run.start", "page.preview"} {
		t.Run(method, func(t *testing.T) {
			home, err := os.MkdirTemp("/tmp", "od-cli-admission-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { os.RemoveAll(home) })
			t.Setenv("HOME", home)
			executable, _ := os.Executable()
			if _, err = browserbridge.Setup(cliTestExtensionID, "chrome", "", executable); err != nil {
				t.Fatal(err)
			}
			cfg, err := browserbridge.Load()
			if err != nil {
				t.Fatal(err)
			}
			listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: cfg.SocketPath, Net: "unix"})
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			if err = os.Chmod(cfg.SocketPath, 0600); err != nil {
				t.Fatal(err)
			}
			registration := "fixed-sidebar-registration"
		admitted := make(chan browserbridge.Fields, 1)
			serverDone := make(chan error, 1)
			go func() {
				for i := 0; i < 2; i++ {
					conn, err := listener.AcceptUnix()
					if err != nil {
						serverDone <- err
						return
					}
					reader := bufio.NewReader(conn)
					if _, err = browserbridge.ReadLine(reader); err != nil {
						conn.Close()
						serverDone <- err
						return
					}
					err = browserbridge.WriteLine(conn, browserbridge.MustEncode(map[string]any{"v": 1, "kind": "authenticated", "browserReady": true}))
					if err != nil {
						conn.Close()
						serverDone <- err
						return
					}
					line, err := browserbridge.ReadLine(reader)
					if err != nil {
						conn.Close()
						serverDone <- err
						return
					}
					frame, err := browserbridge.Decode(line)
					if err != nil {
						conn.Close()
						serverDone <- err
						return
					}
					if i == 0 {
						if browserbridge.String(frame, "method") != "bridge.status" {
							conn.Close()
							serverDone <- browserbridge.ErrSchema
							return
						}
						err = browserbridge.WriteLine(conn, browserbridge.MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": browserbridge.String(frame, "requestId"), "result": map[string]any{"hostRegistrations": []string{registration}}}))
						if err != nil {
							conn.Close()
							serverDone <- err
							return
						}
					} else {
						admitted <- frame
					}
					conn.Close()
				}
				listener.SetDeadline(time.Now().Add(150 * time.Millisecond))
				conn, err := listener.AcceptUnix()
				if err == nil {
					conn.Close()
					serverDone <- browserbridge.ErrSchema
					return
				}
				if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() {
					serverDone <- err
					return
				}
				serverDone <- nil
			}()
			file := filepath.Join(home, "request.json")
			raw := `{"source":"async function main(){return '中文😀';}","n":9007199254740993}`
			if err = os.WriteFile(file, []byte(raw), 0600); err != nil {
				t.Fatal(err)
			}
			var out, diagnostics bytes.Buffer
			if code := Execute([]string{"browser", method, "--file", file}, &out, &diagnostics); code != 1 || out.Len() != 0 {
				t.Fatalf("unexpected success: %d %s", code, out.String())
			}
			var problem struct {
				Code, Outcome, RequestID string
				Recovery                 admissionIdentity
			}
			if err = json.Unmarshal(diagnostics.Bytes(), &problem); err != nil {
				t.Fatal(err)
			}
			frame := <-admitted
			if problem.Code != "E_EFFECT_UNKNOWN" || problem.Outcome != "OUTCOME_UNKNOWN" || !browserbridge.RequestIDValid(problem.RequestID) || problem.RequestID != browserbridge.String(frame, "requestId") {
				t.Fatalf("lost original identity: %s", diagnostics.String())
			}
			params := frame["params"]
			digest, err := browserbridge.AdmissionDigest(method, params, registration)
			if err != nil {
				t.Fatal(err)
			}
			if problem.Recovery != (admissionIdentity{registration, problem.RequestID, method, digest}) {
				t.Fatalf("recovery mismatch: %s", diagnostics.String())
			}
			if err = <-serverDone; err != nil {
				t.Fatalf("unexpected additional dispatch/replay: %v", err)
			}
		})
	}
}
