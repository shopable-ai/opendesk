package mcpserver

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"reflect"
	"runtime"
	"runtime/debug"
	"strings"
	"testing"
	"time"
)

func TestBuildIdentitySnapshotAndPrivacy(t *testing.T) {
	const private = "/Users/private-owner/secret-key"
	info := &debug.BuildInfo{
		Path: private,
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "abc123"},
			{Key: "vcs.modified", Value: "true"},
			{Key: "-ldflags", Value: private},
		},
	}
	reads, paths, opens, closes := 0, 0, 0, 0
	identity := collectBuildIdentity(func() (*debug.BuildInfo, bool) {
		reads++
		return info, true
	}, func() (string, error) {
		paths++
		return private + "/opendesk-mcp", nil
	}, func(path string) (io.ReadCloser, error) {
		opens++
		if path != private+"/opendesk-mcp" {
			t.Fatalf("wrong file opened: %q", path)
		}
		return &identityTestReader{Reader: strings.NewReader("abc"), onClose: func() { closes++ }}, nil
	})
	if identity.PID != os.Getpid() || identity.GOOS != runtime.GOOS || identity.GOARCH != runtime.GOARCH || identity.GoVersion != runtime.Version() {
		t.Fatalf("incorrect process identity: %+v", identity)
	}
	if !identity.VCS.Available || identity.VCS.Revision != "abc123" || identity.VCS.Modified == nil || !*identity.VCS.Modified {
		t.Fatalf("incorrect VCS identity: %+v", identity.VCS)
	}
	if identity.Executable.Basename != "opendesk-mcp" || identity.Executable.SHA256 != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" || identity.Executable.Error != "" {
		t.Fatalf("incorrect file observation: %+v", identity.Executable)
	}
	if _, err := time.Parse(time.RFC3339Nano, identity.Executable.ObservedAt); err != nil {
		t.Fatal(err)
	}
	if identity.Executable.Evidence != "disk_file_at_instance_initialization_not_loaded_memory" {
		t.Fatal("missing disk-only evidence boundary")
	}
	// Status uses the captured identity even if the metadata source changes.
	info.Settings[0].Value = "replacement"
	r := &AutomationRuntime{buildIdentity: identity}
	for range 2 {
		status, err := r.Status()
		if err != nil || status["status"] != "ok" || !reflect.DeepEqual(status["buildIdentity"], identity) {
			t.Fatalf("snapshot changed or status failed: %v, %v", status, err)
		}
		encoded, err := json.Marshal(status)
		if err != nil {
			t.Fatal(err)
		}
		for _, forbidden := range []string{private, "-ldflags", "replacement", "argv", "env"} {
			if strings.Contains(string(encoded), forbidden) {
				t.Fatalf("status leaked %q", forbidden)
			}
		}
	}
	if reads != 1 || paths != 1 || opens != 1 || closes != 1 {
		t.Fatalf("capture must happen once and close file: %d/%d/%d/%d", reads, paths, opens, closes)
	}
}

func TestBuildIdentityFailuresDoNotFailStatus(t *testing.T) {
	privateErr := errors.New("/Users/private-owner/secret-key: access denied")
	for _, stage := range []string{"path", "open", "read", "close"} {
		t.Run(stage, func(t *testing.T) {
			closed := false
			identity := collectBuildIdentity(func() (*debug.BuildInfo, bool) { return nil, false }, func() (string, error) {
				if stage == "path" {
					return "", privateErr
				}
				return "/Users/private-owner/opendesk-mcp", nil
			}, func(string) (io.ReadCloser, error) {
				if stage == "path" {
					t.Fatal("open called after path failure")
				}
				if stage == "open" {
					return nil, privateErr
				}
				file := &identityTestReader{Reader: strings.NewReader("partial"), onClose: func() { closed = true }}
				if stage == "read" {
					file.readErr = privateErr
				} else {
					file.closeErr = privateErr
				}
				return file, nil
			})
			wantError := map[string]string{"path": "executable_path_unavailable", "open": "executable_open_failed", "read": "executable_read_failed", "close": "executable_read_failed"}[stage]
			if identity.Executable.Error != wantError || identity.Executable.SHA256 != "" || identity.VCS.Available || identity.VCS.Modified != nil {
				t.Fatalf("incorrect failure snapshot: %+v", identity)
			}
			if (stage == "read" || stage == "close") && !closed {
				t.Fatal("file not closed after hash failure")
			}
			status, err := (&AutomationRuntime{buildIdentity: identity}).Status()
			if err != nil || status["status"] != "ok" {
				t.Fatalf("diagnostics broke status: %v, %v", status, err)
			}
			encoded, err := json.Marshal(status)
			if err != nil || strings.Contains(string(encoded), "private-owner") || strings.Contains(string(encoded), "access denied") {
				t.Fatalf("error not safely serialized: %s, %v", encoded, err)
			}
		})
	}
}

func TestBuildIdentityMissingAndCleanVCS(t *testing.T) {
	for _, value := range []string{"", "false", "invalid"} {
		t.Run(value, func(t *testing.T) {
			identity := collectBuildIdentity(func() (*debug.BuildInfo, bool) {
				return &debug.BuildInfo{Settings: []debug.BuildSetting{{Key: "vcs.modified", Value: value}}}, true
			}, func() (string, error) { return "", errors.New("unavailable") }, func(string) (io.ReadCloser, error) {
				t.Fatal("unexpected file access")
				return nil, nil
			})
			if !identity.VCS.Available || identity.VCS.Revision != "" {
				t.Fatalf("incorrect missing VCS metadata: %+v", identity.VCS)
			}
			if value == "false" {
				if identity.VCS.Modified == nil || *identity.VCS.Modified {
					t.Fatal("clean build not represented as false")
				}
			} else if identity.VCS.Modified != nil {
				t.Fatal("unknown modified state represented as clean")
			}
		})
	}
}

type identityTestReader struct {
	io.Reader
	readErr  error
	closeErr error
	onClose  func()
}

func (r *identityTestReader) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if r.readErr != nil {
		return n, r.readErr
	}
	return n, err
}

func (r *identityTestReader) Close() error {
	if r.onClose != nil {
		r.onClose()
	}
	return r.closeErr
}
