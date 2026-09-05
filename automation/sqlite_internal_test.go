package automation

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// These are native-owner seam tests. Public Runtime behavior belongs in the
// JavaScript Runtime API suite; these tests pin only URI/canonicalization and
// lexical checks that JavaScript cannot observe before native I/O starts.

func TestSQLiteDSNEncodesHostFidelityAndWindowsURIs(t *testing.T) {
	tests := []struct {
		name string
		path string
		mode string
		goos string
		want string
	}{
		{
			name: "POSIX path escapes unicode and URI delimiters",
			path: "/tmp/数据库 space #?.db",
			mode: "rwc",
			goos: "darwin",
			want: "file:///tmp/%E6%95%B0%E6%8D%AE%E5%BA%93%20space%20%23%3F.db?_pragma=busy_timeout%28600000%29&mode=rwc",
		},
		{
			name: "POSIX literal backslash remains part of filename",
			path: "/tmp/literal\\name.db",
			mode: "rwc",
			goos: "linux",
			want: "file:///tmp/literal%5Cname.db?_pragma=busy_timeout%28600000%29&mode=rwc",
		},
		{
			name: "Windows drive remains a local file URI",
			path: `C:\Program Files\SQLite\测试 #?.db`,
			mode: "rw",
			goos: "windows",
			want: "file:///C:/Program%20Files/SQLite/%E6%B5%8B%E8%AF%95%20%23%3F.db?_pragma=busy_timeout%28600000%29&mode=rw",
		},
		{
			name: "UNC host is preserved and path is escaped",
			path: `\\server\share\folder with space\测试#.db`,
			mode: "ro",
			goos: "windows",
			want: "file://server/share/folder%20with%20space/%E6%B5%8B%E8%AF%95%23.db?_pragma=busy_timeout%28600000%29&mode=ro",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := sqliteDSNForOS(test.path, test.mode, test.goos); got != test.want {
				t.Fatalf("sqliteDSNForOS(%q, %q, %q) = %q, want %q", test.path, test.mode, test.goos, got, test.want)
			}
		})
	}

	if got := sqliteDSN(":memory:", "rwc"); got != ":memory:" {
		t.Fatalf("sqliteDSN(:memory:) = %q, want :memory:", got)
	}
}

func TestAnalyzeSQLiteSQLInternalLexicalGuards(t *testing.T) {
	const operation = "SQLiteDatabase.exec"

	t.Run("rejects quoted second top-level token after terminator", func(t *testing.T) {
		_, err := analyzeSQLiteSQL("INSERT INTO items(value) VALUES ('first'); 'second statement'", operation)
		assertSQLiteErrorCode(t, err, SQLiteMultipleStatements)
	})

	t.Run("accepts semicolons inside strings and comments", func(t *testing.T) {
		analysis, err := analyzeSQLiteSQL("SELECT 'literal; value', ? /* comment ; */ -- trailing ;\n", operation)
		if err != nil {
			t.Fatalf("analyzeSQLiteSQL rejected protected semicolons: %v", err)
		}
		if analysis.positional != 1 || len(analysis.named) != 0 {
			t.Fatalf("analysis = %#v, want one positional parameter and no named parameters", analysis)
		}
	})

	const triggerSQL = `CREATE TRIGGER audit_after_insert
AFTER INSERT ON items
BEGIN
  INSERT INTO audit_log(message)
  VALUES (CASE WHEN NEW.value IS NULL THEN 'missing; value' ELSE NEW.value END);
END;`

	t.Run("accepts one CREATE TRIGGER body with internal statement terminators", func(t *testing.T) {
		analysis, err := analyzeSQLiteSQL(triggerSQL, operation)
		if err != nil {
			t.Fatalf("analyzeSQLiteSQL rejected one CREATE TRIGGER statement: %v", err)
		}
		if analysis.positional != 0 || len(analysis.named) != 0 {
			t.Fatalf("analysis = %#v, want no parameters", analysis)
		}
	})

	t.Run("rejects SQL after a complete CREATE TRIGGER", func(t *testing.T) {
		_, err := analyzeSQLiteSQL(triggerSQL+" DROP TABLE audit_log", operation)
		assertSQLiteErrorCode(t, err, SQLiteMultipleStatements)
	})

	t.Run("rejects numbered parameters", func(t *testing.T) {
		_, err := analyzeSQLiteSQL("SELECT ?1", operation)
		assertSQLiteErrorCode(t, err, SQLiteInvalidArgument)
	})

	t.Run("materializes only a WITH statement whose outer command is SELECT", func(t *testing.T) {
		selectAnalysis, err := analyzeSQLiteSQL("WITH c(value) AS (SELECT 1) SELECT value FROM c", operation)
		if err != nil {
			t.Fatal(err)
		}
		if !selectAnalysis.materializeSelect || !selectAnalysis.readOnlyResult {
			t.Fatalf("WITH SELECT analysis = %#v, want materialized read-only query", selectAnalysis)
		}

		writeAnalysis, err := analyzeSQLiteSQL("WITH c(value) AS (SELECT 1) INSERT INTO items(value) SELECT value FROM c RETURNING value", operation)
		if err != nil {
			t.Fatal(err)
		}
		if writeAnalysis.materializeSelect || writeAnalysis.readOnlyResult {
			t.Fatalf("WITH INSERT RETURNING analysis = %#v, must retain direct write-result path", writeAnalysis)
		}
	})

	for _, sqlText := range []string{
		"BEGIN",
		"COMMIT",
		"END",
		"ROLLBACK",
		"SAVEPOINT runtime_user_transaction",
		"RELEASE runtime_user_transaction",
	} {
		t.Run("rejects raw transaction control: "+sqlText, func(t *testing.T) {
			_, err := analyzeSQLiteSQL(sqlText, operation)
			assertSQLiteErrorCode(t, err, SQLiteTransactionControlForbidden)
		})
	}
}

func TestSQLitePathKeysIncludeCanonicalSymlinkParent(t *testing.T) {
	root := t.TempDir()
	realParent := filepath.Join(root, "real")
	if err := os.Mkdir(realParent, 0o755); err != nil {
		t.Fatal(err)
	}
	aliasParent := filepath.Join(root, "alias")
	if runtime.GOOS == "windows" {
		t.Skip("Windows symlink creation can require elevated developer privileges")
	}
	if err := os.Symlink(realParent, aliasParent); err != nil {
		t.Fatal(err)
	}

	canonicalParent, err := filepath.EvalSymlinks(realParent)
	if err != nil {
		t.Fatal(err)
	}
	canonicalPath := filepath.Join(canonicalParent, "scheduler.db")
	aliasedPath := filepath.Join(aliasParent, "scheduler.db")
	canonicalKey := sqlitePathKey(canonicalPath)
	keys := sqlitePathKeys(aliasedPath)
	if !containsSQLitePathKey(keys, canonicalKey) {
		t.Fatalf("sqlitePathKeys(%q) = %#v, missing canonical key %q", aliasedPath, keys, canonicalKey)
	}

	owner := &SQLiteRuntime{protectedPaths: map[string]struct{}{canonicalKey: {}}}
	if !owner.isProtectedPath(aliasedPath) {
		t.Fatalf("protected path did not match symlink alias %q", aliasedPath)
	}
}

func assertSQLiteErrorCode(t *testing.T, err error, want SQLiteErrorCode) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want SQLiteError{%s}", want)
	}
	sqliteErr, ok := err.(*SQLiteError)
	if !ok {
		t.Fatalf("error type = %T (%v), want *SQLiteError", err, err)
	}
	if sqliteErr.Code != want {
		t.Fatalf("SQLite error code = %s, want %s (error: %v)", sqliteErr.Code, want, err)
	}
}

func containsSQLitePathKey(keys []string, want string) bool {
	for _, key := range keys {
		if key == want {
			return true
		}
	}
	return false
}
