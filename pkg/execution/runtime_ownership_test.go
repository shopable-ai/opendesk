package execution

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRuntimeOwnershipStaticContract protects the event-loop ownership rule at
// source level. Container/runtime/main may not carry a Goja runtime handle, and
// a plain worker goroutine may not call Runtime methods. The sole documented
// cross-goroutine method is Interrupt, used by the execution context watcher.
func TestRuntimeOwnershipStaticContract(t *testing.T) {
	root := repositoryRoot(t)
	for _, relative := range []string{"pkg/container", "pkg/runtime", "main.go"} {
		paths, err := goFilesUnder(filepath.Join(root, relative))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range paths {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(data), "goja.Runtime") || strings.Contains(string(data), "github.com/dop251/goja") {
				t.Fatalf("runtime ownership leak in %s", path)
			}
		}
	}

	for _, relative := range []string{"automation", "pkg/execution"} {
		paths, err := goFilesUnder(filepath.Join(root, relative))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range paths {
			if err := assertWorkerDoesNotCallRuntime(path); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Clean(filepath.Join(wd, "..", ".."))
}

func goFilesUnder(path string) ([]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return []string{path}, nil
	}
	var paths []string
	err = filepath.WalkDir(path, func(entry string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || strings.HasSuffix(entry, "_test.go") || !strings.HasSuffix(entry, ".go") {
			return nil
		}
		paths = append(paths, entry)
		return nil
	})
	return paths, err
}

func assertWorkerDoesNotCallRuntime(path string) error {
	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		return err
	}
	var violation string
	ast.Inspect(file, func(node ast.Node) bool {
		if violation != "" {
			return false
		}
		goStatement, ok := node.(*ast.GoStmt)
		if !ok {
			return true
		}
		literal, ok := goStatement.Call.Fun.(*ast.FuncLit)
		if !ok {
			return true
		}
		ast.Inspect(literal.Body, func(inner ast.Node) bool {
			if inner == nil || inner == literal {
				return true
			}
			// Nested callbacks such as EventLoop.RunOnLoop execute on the owner,
			// not on this worker. Do not attribute their Runtime use to the worker.
			if _, nested := inner.(*ast.FuncLit); nested {
				return false
			}
			selector, ok := inner.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			receiver, ok := selector.X.(*ast.Ident)
			if !ok || (receiver.Name != "rt" && receiver.Name != "runtime" && receiver.Name != "vm") {
				return true
			}
			if selector.Sel.Name != "Interrupt" {
				violation = path + ": worker goroutine calls Runtime." + selector.Sel.Name
			}
			return true
		})
		return violation == ""
	})
	if violation != "" {
		return &ownershipError{message: violation}
	}
	return nil
}

type ownershipError struct{ message string }

func (e *ownershipError) Error() string { return e.message }
