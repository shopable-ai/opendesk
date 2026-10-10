//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// R17 never converts local directory intent into a permanent writable grant.
func TestR17TemporaryWorkspacesAreScopedReadOnlyAndIndependent(t *testing.T) {
	home, _ := projectFixture(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	f, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	folders := []string{filepath.Join(home, "one", "同名目录"), filepath.Join(home, "two", "同名目录")}
	ids := make([]string, 2)
	epochs := make([]string, 2)
	for i, d := range folders {
		if err := os.MkdirAll(d, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(d, "README.md"), []byte("content-"+string(rune('A'+i))), 0600); err != nil {
			t.Fatal(err)
		}
		grant, owned, err := f.attachDevWorkspace(d, "")
		if err != nil || !owned {
			t.Fatalf("attach %d: %+v, owned=%v, err=%v", i, grant, owned, err)
		}
		ids[i] = grant["workspaceId"].(string)
		epochs[i] = grant["leaseEpoch"].(string)
		if grant["sourceId"] == "" || grant["access"] != "read-only" {
			t.Fatalf("invalid scoped grant: %+v", grant)
		}
		if i == 1 && ids[0] == ids[1] {
			t.Fatal("same display name merged distinct directory identities")
		}
	}
	repeat, owned, err := f.attachDevWorkspace(folders[0], "")
	if err != nil || owned || repeat["workspaceId"] != ids[0] || repeat["alreadyActive"] != true {
		t.Fatalf("second launch stole directory lease: %+v (%t, %v)", repeat, owned, err)
	}
	list := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	if len(list["workspaces"].([]map[string]any)) != 2 {
		t.Fatalf("source list: %+v", list)
	}
	for i, id := range ids {
		got := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md"}))
		if got["content"] != "content-"+string(rune('A'+i)) {
			t.Fatalf("wrong source routed %d: %v", i, got)
		}
		requireFilesCode(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": id,
			"path": "README.md", "content": "forbidden", "expectedSha256": got["sha256"]}), "E_FILES_ACCESS")
		requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "../two/同名目录/README.md"}), "E_FILES_PATH")
	}
	if !f.releaseDevWorkspace(ids[0], epochs[0]) {
		t.Fatal("owner couldn't detach first temporary scope")
	}
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[0], "path": "README.md"}), "E_FILES_ACCESS")
	got := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[1], "path": "README.md"}))
	if got["content"] != "content-B" {
		t.Fatal("stopping A detached B")
	}
	if f.releaseDevWorkspace(ids[0], epochs[0]) {
		t.Fatal("replayed detach must not affect other sessions")
	}
}
func TestR17PermanentWorkspaceNeverBecomesTemporary(t *testing.T) {
	f, dir, existing := filesFixture(t)
	result, owned, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil || owned || result["workspaceId"] != existing || result["alreadyAuthorized"] != true {
		t.Fatalf("existing write grant replaced: %v, %v, %v", result, owned, err)
	}
	if !f.releaseDevWorkspace(existing, result["leaseEpoch"].(string)) {
		t.Fatal("permanent Workspace CLI epoch was not released")
	}
	grant := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	rows := grant["workspaces"].([]map[string]any)
	if len(rows) != 1 || rows[0]["access"] != "read-write" {
		t.Fatal("persistent permission disappeared")
	}
}

func TestR17WritableTemporaryDirectoryTwoRoundsAndEpochReplay(t *testing.T) {
	home, _ := projectFixture(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	f, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	dirs := []string{filepath.Join(home, "first", "same"), filepath.Join(home, "second", "same")}
	ids, epochs := make([]string, 2), make([]string, 2)
	for i, dir := range dirs {
		if err = os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dir, "README.md"), []byte("initial-"+string(rune('A'+i))), 0600); err != nil {
			t.Fatal(err)
		}
		row, owned, attachErr := f.attachDevWorkspace(dir, "read-write")
		if attachErr != nil || !owned || row["access"] != "read-write" || row["accessReason"] != "temporary-cli" {
			t.Fatalf("temporary read-write attach: %v %t %v", row, owned, attachErr)
		}
		ids[i], epochs[i] = row["workspaceId"].(string), row["leaseEpoch"].(string)
		if !RequestIDValid(epochs[i]) {
			t.Fatal("no public lease epoch")
		}
	}
	if ids[0] == ids[1] || epochs[0] == epochs[1] {
		t.Fatal("same-basename workspaces merged")
	}
	persisted, err := readWorkspaceStore(cfg)
	if err != nil || len(persisted.Workspaces) != 0 {
		t.Fatalf("temporary authorization persisted: %v %v", persisted, err)
	}
	var savedRequest filesRequest
	for round := 1; round <= 2; round++ {
		for i, id := range ids {
			params := map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": epochs[i]}
			before := requireFilesResult(t, callFiles(t, f, "files.read", params))
			disk, err := os.ReadFile(filepath.Join(dirs[i], "README.md"))
			if err != nil {
				t.Fatal(err)
			}
			if before["content"] != string(disk) || before["sha256"] != textHash(string(disk)) {
				t.Fatal("read was not based on independent disk bytes")
			}
			content := string(disk) + "\nround-" + string(rune('0'+round))
			savedRequest = filesTestRequest(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": epochs[i], "content": content, "expectedSha256": before["sha256"]})
			saved := requireFilesResult(t, f.Handle(savedRequest))
			disk, err = os.ReadFile(filepath.Join(dirs[i], "README.md"))
			if err != nil {
				t.Fatal(err)
			}
			if string(disk) != content || saved["sha256"] != textHash(string(disk)) || saved["saved"] != true {
				t.Fatal("Native receipt did not match independent disk read")
			}
			after := requireFilesResult(t, callFiles(t, f, "files.read", params))
			if after["sha256"] != saved["sha256"] {
				t.Fatal("post-save Native read mismatch")
			}
			requireFilesCode(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": epochs[i], "content": "stale", "expectedSha256": before["sha256"]}), "E_FILES_CONFLICT")
		}
	}
	// External edits conflict; cached request receipt may be inspected but
	// must never repeat the successful mutation over the newer disk content.
	pathB := filepath.Join(dirs[1], "README.md")
	if err = os.WriteFile(pathB, []byte("external-edit"), 0600); err != nil {
		t.Fatal(err)
	}
	requireFilesResult(t, f.Handle(savedRequest))
	disk, _ := os.ReadFile(pathB)
	if string(disk) != "external-edit" {
		t.Fatal("cached request replay overwrote external edit")
	}
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[0], "path": "README.md", "leaseEpoch": epochs[1]}), "E_FILES_SESSION")
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[0], "path": "../README.md", "leaseEpoch": epochs[0]}), "E_FILES_PATH")
	root := requireFilesResult(t, callFiles(t, f, "files.list", map[string]any{"workspaceId": ids[0], "path": "", "leaseEpoch": epochs[0]}))
	if root["path"] != "" {
		t.Fatal("root list expanded beyond explicit directory")
	}
	if !f.releaseDevWorkspace(ids[1], epochs[1]) {
		t.Fatal("B release failed")
	}
	requireFilesCode(t, f.Handle(savedRequest), "E_FILES_SESSION")
	requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[0], "path": "README.md", "leaseEpoch": epochs[0]}))
	next, owned, err := f.attachDevWorkspace(dirs[1], "read-write")
	if err != nil || !owned || next["workspaceId"] != ids[1] || next["leaseEpoch"] == epochs[1] {
		t.Fatalf("reattach identity/generation wrong: %v %t %v", next, owned, err)
	}
	if f.releaseDevWorkspace(ids[1], epochs[1]) {
		t.Fatal("old owner retired new lease")
	}
	requireFilesCode(t, f.Handle(savedRequest), "E_FILES_SESSION")
	requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": ids[1], "path": "README.md", "leaseEpoch": next["leaseEpoch"]}))
}

func TestR17EffectiveAccessAndReadOnlyConflicts(t *testing.T) {
	for _, tc := range []struct {
		name, initial, request, want, reason string
		permanent                            bool
		conflict                             bool
	}{
		{"temporary-ro-remains-ro", "read-only", "read-write", "read-only", "active-session", false, false},
		{"temporary-rw-refuses-ro", "read-write", "read-only", "", "", false, true},
		{"temporary-rw-duplicate", "read-write", "read-write", "read-write", "active-session", false, false},
		{"permanent-ro-default-rw", "read-only", "read-write", "read-only", "persistent-read-only", true, false},
		{"permanent-rw-refuses-ro", "read-write", "read-only", "", "", true, true},
		{"permanent-rw-legacy-reuse", "read-write", "", "read-write", "persistent-read-write", true, false},
		{"permanent-rw-explicit-reuse", "read-write", "read-write", "read-write", "persistent-read-write", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			home, _ := projectFixture(t)
			cfg, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			f, err := newNativeFiles(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			dir := filepath.Join(home, "access-scope")
			if err = os.Mkdir(dir, 0700); err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(filepath.Join(dir, "README.md"), []byte("original"), 0600); err != nil {
				t.Fatal(err)
			}
			var original map[string]any
			if tc.permanent {
				original, err = WorkspaceAdd(dir, tc.initial)
			} else {
				original, _, err = f.attachDevWorkspace(dir, tc.initial)
			}
			if err != nil {
				t.Fatal(err)
			}
			row, owned, err := f.attachDevWorkspace(dir, tc.request)
			if tc.conflict {
				if err == nil || err.Error() != "E_DEV_ACCESS_CONFLICT" || row != nil || owned {
					t.Fatalf("false read-only success: %v %v", row, err)
				}
				row = original
			} else if err != nil || owned || row["access"] != tc.want || row["accessReason"] != tc.reason || row["workspaceId"] != original["workspaceId"] {
				t.Fatalf("wrong effective access/reuse: %v %t %v", row, owned, err)
			}
			id := original["workspaceId"]
			read := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md"}))
			write := callFiles(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "content": "saved", "expectedSha256": read["sha256"]})
			create := callFiles(t, f, "files.create", map[string]any{"workspaceId": id, "path": "new.md", "content": "saved"})
			if tc.initial == "read-only" {
				requireFilesCode(t, write, "E_FILES_ACCESS")
				requireFilesCode(t, create, "E_FILES_ACCESS")
				disk, _ := os.ReadFile(filepath.Join(dir, "README.md"))
				if string(disk) != "original" {
					t.Fatal("read-only write reached disk")
				}
			} else {
				requireFilesResult(t, write)
				requireFilesResult(t, create)
			}
		})
	}
}

func TestR17PermanentGrantRevokeAndLeaseReleaseFence(t *testing.T) {
	f, dir, id := filesFixture(t)
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("persist"), 0600); err != nil {
		t.Fatal(err)
	}
	row, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	epoch := row["leaseEpoch"].(string)
	requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": epoch}))
	if !f.releaseDevWorkspace(id, epoch) {
		t.Fatal("permanent CLI binding not released")
	}
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": epoch}), "E_FILES_SESSION")
	requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md"}))
	listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	rows := listed["workspaces"].([]map[string]any)
	if len(rows) != 1 || rows[0]["leaseEpoch"] != nil || rows[0]["access"] != "read-write" {
		t.Fatal("persistent grant did not outlive CLI epoch")
	}
	next, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	if next["leaseEpoch"] == epoch {
		t.Fatal("permanent CLI reused a retired generation")
	}
	if _, err = WorkspaceRevoke(id); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": next["leaseEpoch"]}), "E_FILES_SESSION")
}

func TestR17PermanentChangeDoesNotLeaveTemporaryWriteOverride(t *testing.T) {
	home, _ := projectFixture(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	f, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	dir := filepath.Join(home, "changed-authorization")
	if err = os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "README.md"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	attached, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	permanent, err := WorkspaceAdd(dir, "read-only")
	if err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": attached["workspaceId"], "leaseEpoch": attached["leaseEpoch"], "path": "README.md", "content": "wrong", "expectedSha256": textHash("original")}), "E_FILES_SESSION")
	listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	rows := listed["workspaces"].([]map[string]any)
	if len(rows) != 1 || rows[0]["workspaceId"] != permanent["workspaceId"] || rows[0]["access"] != "read-only" {
		t.Fatalf("parallel permission overlay: %v", rows)
	}
	requireFilesCode(t, callFiles(t, f, "files.create", map[string]any{"workspaceId": permanent["workspaceId"], "path": "new.md", "content": "wrong"}), "E_FILES_ACCESS")
}

func TestR17ExplicitPermanentAccessChangeInvalidatesOldCLIView(t *testing.T) {
	f, dir, id := filesFixture(t)
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceAdd(dir, "read-only"); err != nil {
		t.Fatal(err)
	}
	row, _, err := f.attachDevWorkspace(dir, "read-only")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = WorkspaceAdd(dir, "read-write"); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": row["leaseEpoch"]}), "E_FILES_SESSION")
	requireFilesCode(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": row["leaseEpoch"], "content": "wrong", "expectedSha256": textHash("original")}), "E_FILES_SESSION")
	if _, _, err = f.attachDevWorkspace(dir, "read-only"); err == nil || err.Error() != "E_DEV_ACCESS_CONFLICT" {
		t.Fatalf("updated writable authority disguised as read-only: %v", err)
	}
	listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	rows := listed["workspaces"].([]map[string]any)
	if len(rows) != 1 || rows[0]["leaseEpoch"] != nil || rows[0]["access"] != "read-write" {
		t.Fatalf("stale CLI view retained after explicit permission change: %v", rows)
	}
}

func TestR17ExplicitAbsentLeaseFencesAttachBeforeSave(t *testing.T) {
	f, dir, id := filesFixture(t)
	file := filepath.Join(dir, "README.md")
	if err := os.WriteFile(file, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	read := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": ""}))
	// The browser checked a permanent directory without a CLI. A local attach
	// races that check before the old proposal reaches the real file service.
	attached, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	pending := filesTestRequest(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": "", "content": "stale-view", "expectedSha256": read["sha256"]})
	requireFilesCode(t, f.Handle(pending), "E_FILES_SESSION")
	requireFilesCode(t, callFiles(t, f, "files.create", map[string]any{"workspaceId": id, "path": "new.md", "leaseEpoch": "", "content": "stale-view"}), "E_FILES_SESSION")
	disk, _ := os.ReadFile(file)
	if string(disk) != "original" {
		t.Fatal("late CLI attach did not fence old permanent view")
	}
	// Omission remains the old protocol; it is not the new empty sentinel.
	requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md"}))
	if !f.releaseDevWorkspace(id, attached["leaseEpoch"].(string)) {
		t.Fatal("CLI exit did not release generation")
	}
	fresh := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": ""}))
	requireFilesResult(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": id, "path": "README.md", "leaseEpoch": "", "content": "fresh-view", "expectedSha256": fresh["sha256"]}))
	disk, _ = os.ReadFile(file)
	if string(disk) != "fresh-view" {
		t.Fatal("fresh no-CLI view could not save")
	}
}

func TestR17WorkspacePermissionABARejectsRetiredLease(t *testing.T) {
	// Exercise the same store from a separate CLI process. The Native service
	// must notice revocation even if neither intermediate access is observed.
	if mode := os.Getenv("OPENDESK_R17_ABA_CHILD"); mode != "" {
		dir := os.Getenv("OPENDESK_R17_ABA_DIRECTORY")
		ro, err := WorkspaceAdd(dir, "read-only")
		if err != nil {
			t.Fatal(err)
		}
		if mode == "permanent" {
			_, err = WorkspaceAdd(dir, "read-write")
		} else if mode == "temporary" {
			_, err = WorkspaceRevoke(ro["workspaceId"].(string))
		} else {
			t.Fatal("invalid child test mode")
		}
		if err != nil {
			t.Fatal(err)
		}
		return
	}
	for _, permanent := range []bool{true, false} {
		for _, observe := range []bool{true, false} {
			name := "temporary"
			if permanent {
				name = "permanent"
			}
			if observe {
				name += "/observed"
			} else {
				name += "/between-requests"
			}
			t.Run(name, func(t *testing.T) {
				home, _ := projectFixture(t)
				cfg, err := Load()
				if err != nil {
					t.Fatal(err)
				}
				f, err := newNativeFiles(cfg)
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				dirA, dirB := filepath.Join(home, "aba-a"), filepath.Join(home, "aba-b")
				for _, dir := range []string{dirA, dirB} {
					if err = os.Mkdir(dir, 0700); err != nil {
						t.Fatal(err)
					}
					if err = os.WriteFile(filepath.Join(dir, "README.md"), []byte("original"), 0600); err != nil {
						t.Fatal(err)
					}
				}
				if permanent {
					if _, err = WorkspaceAdd(dirA, "read-write"); err != nil {
						t.Fatal(err)
					}
				}
				a, _, err := f.attachDevWorkspace(dirA, "read-write")
				if err != nil {
					t.Fatal(err)
				}
				b, _, err := f.attachDevWorkspace(dirB, "read-write")
				if err != nil {
					t.Fatal(err)
				}
				old := filesTestRequest(t, f, "files.write", map[string]any{"workspaceId": a["workspaceId"], "leaseEpoch": a["leaseEpoch"], "path": "README.md", "content": "must-not-write", "expectedSha256": textHash("original")})
				receipt := filesTestRequest(t, f, "files.create", map[string]any{"workspaceId": a["workspaceId"], "leaseEpoch": a["leaseEpoch"], "path": "receipt.md", "content": "before-change"})
				requireFilesResult(t, f.Handle(receipt))
				if observe {
					ro, err := WorkspaceAdd(dirA, "read-only")
					if err != nil {
						t.Fatal(err)
					}
					requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
					rejected := callFiles(t, f, "files.write", map[string]any{"workspaceId": a["workspaceId"], "leaseEpoch": a["leaseEpoch"], "path": "README.md", "content": "refused", "expectedSha256": textHash("original")})
					if rejected.Error == nil {
						t.Fatal("intermediate read-only authority failed to fence write")
					}
					if permanent {
						_, err = WorkspaceAdd(dirA, "read-write")
					} else {
						_, err = WorkspaceRevoke(ro["workspaceId"].(string))
					}
					if err != nil {
						t.Fatal(err)
					}
				} else {
					mode := "temporary"
					if permanent {
						mode = "permanent"
					}
					cmd := exec.Command(os.Args[0], "-test.run=^TestR17WorkspacePermissionABARejectsRetiredLease$")
					cmd.Env = append(os.Environ(), "OPENDESK_R17_ABA_CHILD="+mode, "OPENDESK_R17_ABA_DIRECTORY="+dirA)
					if output, err := cmd.CombinedOutput(); err != nil {
						t.Fatalf("separate CLI access change: %v\n%s", err, output)
					}
				}
				// The first write carrying L1 after restoration must fail,
				// even when no Native request observed the intermediate state.
				requireFilesCode(t, f.Handle(old), "E_FILES_SESSION")
				requireFilesCode(t, f.Handle(receipt), "E_FILES_SESSION")
				disk, err := os.ReadFile(filepath.Join(dirA, "README.md"))
				if err != nil || string(disk) != "original" {
					t.Fatal("retired lease wrote to disk")
				}
				listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
				for _, row := range listed["workspaces"].([]map[string]any) {
					if row["workspaceId"] == a["workspaceId"] && row["leaseEpoch"] == a["leaseEpoch"] {
						t.Fatal("retired epoch reappeared in public list")
					}
				}
				// Retiring A must not touch a distinct live source B.
				freshB := requireFilesResult(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": b["workspaceId"], "leaseEpoch": b["leaseEpoch"], "path": "README.md"}))
				requireFilesResult(t, callFiles(t, f, "files.write", map[string]any{"workspaceId": b["workspaceId"], "leaseEpoch": b["leaseEpoch"], "path": "README.md", "content": "B survives", "expectedSha256": freshB["sha256"]}))
				if !f.releaseDevWorkspace(a["workspaceId"].(string), a["leaseEpoch"].(string)) {
					t.Fatal("retired owner could not release its binding")
				}
				next, _, err := f.attachDevWorkspace(dirA, "read-write")
				if err != nil {
					t.Fatal(err)
				}
				if next["leaseEpoch"] == a["leaseEpoch"] {
					t.Fatal("new explicit attach reused retired epoch")
				}
			})
		}
	}
}

func TestR17DevLeaseMetadataIsNotAuthorization(t *testing.T) {
	home, _ := projectFixture(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	f, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	dir := filepath.Join(home, "metadata-only")
	if err = os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "README.md"), []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	row, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	state, err := readWorkspaceStore(cfg)
	if err != nil || len(state.Workspaces) != 0 || len(state.DevLeaseFences) != 1 {
		t.Fatalf("unexpected durable authority: %+v %v", state, err)
	}
	fence, err := json.Marshal(state.DevLeaseFences[0])
	if err != nil || bytes.Contains(fence, []byte(dir)) || bytes.Contains(fence, []byte(cfg.ClientCredential)) ||
		bytes.Contains(fence, []byte(`"path"`)) || bytes.Contains(fence, []byte(`"access"`)) || bytes.Contains(fence, []byte(`"leaseId"`)) {
		t.Fatalf("lease fence persisted path/access/private authority: %s %v", fence, err)
	}
	// A new file session cannot reconstruct a temporary grant from metadata.
	f.Close()
	restarted, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	listed := requireFilesResult(t, callFiles(t, restarted, "workspaces.list", map[string]any{}))
	if len(listed["workspaces"].([]map[string]any)) != 0 {
		t.Fatal("restart restored temporary grant from metadata")
	}
	requireFilesCode(t, callFiles(t, restarted, "files.read", map[string]any{"workspaceId": row["workspaceId"], "path": "README.md"}), "E_FILES_ACCESS")
	requireFilesCode(t, callFiles(t, restarted, "files.read", map[string]any{"workspaceId": row["workspaceId"], "leaseEpoch": row["leaseEpoch"], "path": "README.md"}), "E_FILES_SESSION")
	// The next sole Host owner drops inert prior-session records, not grants.
	next, _, err := restarted.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	state, err = readWorkspaceStore(cfg)
	if err != nil || len(state.DevLeaseFences) != 1 || state.DevLeaseFences[0].SessionID != restarted.sessionID || next["leaseEpoch"] == row["leaseEpoch"] {
		t.Fatal("prior-session metadata was reused or accumulated")
	}
	// The pre-change strict schema rejects active metadata instead of dropping
	// its invalidation information; after owned cleanup its original shape works.
	var oldShape struct {
		Format           string           `json:"format"`
		ExtensionID      string           `json:"extensionId"`
		CredentialDigest string           `json:"credentialDigest"`
		Workspaces       []workspaceGrant `json:"workspaces"`
	}
	raw, err := os.ReadFile(workspaceStorePath(cfg))
	if err != nil || decodeFilesObject(raw, &oldShape) == nil {
		t.Fatal("legacy strict store silently discarded fence metadata")
	}
	if !restarted.releaseDevWorkspace(next["workspaceId"].(string), next["leaseEpoch"].(string)) {
		t.Fatal("current owner could not clean up its fence")
	}
	raw, err = os.ReadFile(workspaceStorePath(cfg))
	if err != nil || decodeFilesObject(raw, &oldShape) != nil {
		t.Fatal("owned cleanup retained active-only schema field")
	}
	state, err = readWorkspaceStore(cfg)
	if err != nil || len(state.DevLeaseFences) != 0 || len(state.Workspaces) != 0 {
		t.Fatal("release retained metadata or a temporary permanent grant")
	}
}

func TestR17DevLeaseMetadataFailureGrantsNoAccess(t *testing.T) {
	home, _ := projectFixture(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	f, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	dir := filepath.Join(home, "blocked-fence")
	if err = os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	obstacle := workspaceStorePath(cfg) + ".new"
	if err = os.WriteFile(obstacle, []byte("owned test obstacle"), 0600); err != nil {
		t.Fatal(err)
	}
	row, owned, err := f.attachDevWorkspace(dir, "read-write")
	if err == nil || err.Error() != "E_FILES_IO" || row != nil || owned || len(f.temporary) != 0 || len(f.devBindings) != 0 {
		t.Fatalf("metadata write failure granted access: %v %v %v", row, owned, err)
	}
	listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	if len(listed["workspaces"].([]map[string]any)) != 0 {
		t.Fatal("failed attachment appeared online")
	}
	if err = os.Remove(obstacle); err != nil {
		t.Fatal(err)
	}
	row, owned, err = f.attachDevWorkspace(dir, "read-write")
	if err != nil || !owned {
		t.Fatalf("fresh explicit attach after resolved store failure: %v %v", row, err)
	}
	// Failed cleanup still removes in-memory authority; its leftover public
	// identifiers cannot later be used to restore the lease or read the root.
	if err = os.WriteFile(obstacle, []byte("owned test cleanup obstacle"), 0600); err != nil {
		t.Fatal(err)
	}
	if !f.releaseDevWorkspace(row["workspaceId"].(string), row["leaseEpoch"].(string)) {
		t.Fatal("cleanup failure blocked authority release")
	}
	requireFilesCode(t, callFiles(t, f, "files.list", map[string]any{"workspaceId": row["workspaceId"], "leaseEpoch": row["leaseEpoch"], "path": ""}), "E_FILES_SESSION")
	requireFilesCode(t, callFiles(t, f, "files.list", map[string]any{"workspaceId": row["workspaceId"], "path": ""}), "E_FILES_ACCESS")
}

func TestR17UnchangedPermanentGrantKeepsActiveLease(t *testing.T) {
	f, dir, id := filesFixture(t)
	row, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	result, err := WorkspaceAdd(dir, "read-write")
	if err != nil || result["unchanged"] != true {
		t.Fatal("identical permanent grant changed")
	}
	requireFilesResult(t, callFiles(t, f, "files.create", map[string]any{"workspaceId": id, "leaseEpoch": row["leaseEpoch"], "path": "same.md", "content": "live"}))
	listed := requireFilesResult(t, callFiles(t, f, "workspaces.list", map[string]any{}))
	rows := listed["workspaces"].([]map[string]any)
	if len(rows) != 1 || rows[0]["leaseEpoch"] != row["leaseEpoch"] {
		t.Fatal("unchanged grant retired a live CLI")
	}
}
