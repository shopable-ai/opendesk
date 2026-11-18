package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"strings"
	"time"
)

// APIDocs binds discovery to a host-selected checkout. Clients cannot choose
// an executable, documentation root, or maintenance command.
type APIDocs struct {
	root, node      string
	runtimeRevision string
	runtimeModified *bool
}

func NewAPIDocs(root string) (*APIDocs, error) {
	if !filepath.IsAbs(root) {
		return nil, fmt.Errorf("api-docs-root must be an absolute trusted checkout path")
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	for _, name := range []string{"scripts/api-docs-mcp.js", "scripts/api-docs.js", "scripts/api-docs-map.js", "docs/api/agent/README.md"} {
		info, err := os.Stat(filepath.Join(root, name))
		if err != nil || !info.Mode().IsRegular() {
			return nil, fmt.Errorf("api-docs-root is missing %s", name)
		}
	}
	node, err := exec.LookPath("node")
	if err != nil {
		return nil, fmt.Errorf("API discovery requires Node.js: %w", err)
	}
	docs := &APIDocs{root: root, node: node}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				docs.runtimeRevision = setting.Value
			case "vcs.modified":
				if setting.Value == "true" || setting.Value == "false" {
					modified := setting.Value == "true"
					docs.runtimeModified = &modified
				}
			}
		}
	}
	return docs, nil
}

type boundedDocOutput struct {
	// Do not embed bytes.Buffer: its promoted ReadFrom lets io.Copy bypass
	// Write and therefore the subprocess output budget.
	buffer bytes.Buffer
	limit  int
}

func (b *boundedDocOutput) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.buffer.Len() {
		return 0, fmt.Errorf("API documentation response exceeds budget; no partial contract returned")
	}
	return b.buffer.Write(p)
}

var apiDocID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)

func runAPIDocCommand(ctx context.Context, cmd *exec.Cmd, out, diagnostic io.Writer) error {
	// Retain the unreaped leader until output draining finishes or is aborted.
	// Signalling a saved PGID after Cmd.Wait would permit numeric ID reuse to
	// target an unrelated group. Never call terminateGroup after Wait begins.
	cmd.WaitDelay = 250 * time.Millisecond
	terminateGroup := ownAPIDocProcess(cmd)
	if err := ctx.Err(); err != nil {
		return err
	}
	stdout, stdoutWriter, err := os.Pipe()
	if err != nil {
		return err
	}
	defer stdout.Close()
	defer stdoutWriter.Close()
	stderr, stderrWriter, err := os.Pipe()
	if err != nil {
		return err
	}
	defer stderr.Close()
	defer stderrWriter.Close()
	cmd.Stdout, cmd.Stderr = stdoutWriter, stderrWriter
	if err := cmd.Start(); err != nil {
		return err
	}
	_ = stdoutWriter.Close()
	_ = stderrWriter.Close()
	copied := make(chan error, 2)
	for _, stream := range []struct {
		reader io.Reader
		writer io.Writer
	}{{stdout, out}, {stderr, diagnostic}} {
		go func() {
			_, err := io.Copy(stream.writer, stream.reader)
			copied <- err
		}()
	}
	remaining := 2
	var drainErr error
	for remaining > 0 && drainErr == nil {
		select {
		case err := <-copied:
			remaining--
			drainErr = err
		case <-ctx.Done():
			drainErr = ctx.Err()
		}
	}
	if drainErr != nil {
		// No Wait has run: the leader still reserves this command's ID even
		// when it has exited and only a descendant retains an output pipe.
		if err := terminateGroup(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			drainErr = fmt.Errorf("%w; documentation process cleanup: %v", drainErr, err)
		}
		_ = cmd.Process.Kill()
		_ = stdout.Close()
		_ = stderr.Close()
		for ; remaining > 0; remaining-- {
			<-copied
		}
	}
	// Once both pipes reached EOF, only the direct child can still delay
	// Wait. os.Process.Kill protects its identity while Wait may reap it.
	stop := context.AfterFunc(ctx, func() { _ = cmd.Process.Kill() })
	waitErr := cmd.Wait()
	stop()
	if drainErr != nil {
		return drainErr
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return waitErr
}

func (d *APIDocs) provenance() map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.Command("git", "-C", d.root, "rev-parse", "HEAD")
	output, diagnostic := &boundedDocOutput{limit: 256}, &boundedDocOutput{limit: 16 * 1024}
	err := runAPIDocCommand(ctx, cmd, output, diagnostic)
	checkoutRevision := ""
	if err == nil {
		checkoutRevision = strings.TrimSpace(output.buffer.String())
	}
	var mismatch *bool
	if checkoutRevision != "" && d.runtimeRevision != "" {
		different := checkoutRevision != d.runtimeRevision
		mismatch = &different
	}
	provenance := map[string]any{
		"checkoutRoot":          d.root,
		"checkoutRevision":      checkoutRevision,
		"runtimeRevision":       d.runtimeRevision,
		"runtimeModified":       d.runtimeModified,
		"knownRevisionMismatch": mismatch,
		"runtimeMatchVerified":  false,
		"warning":               "Documentation checkout hashes/revision do not establish the running binary's source or API compatibility; verify Runtime provenance and capabilities independently before execution.",
	}
	if mismatch != nil && *mismatch {
		provenance["warning"] = "Documentation checkout and running binary have different VCS revisions. " + provenance["warning"].(string)
	}
	return provenance
}

func (d *APIDocs) query(action string, args map[string]any) (map[string]any, error) {
	request := map[string]any{"action": action}
	if action == "catalog" {
		group := serverStringArg(args, "group")
		if group != "" && !apiDocID.MatchString(group) {
			return nil, fmt.Errorf("invalid API group")
		}
		request["group"] = group
	} else {
		doc, selector := serverStringArg(args, "doc"), serverStringArg(args, "selector")
		if !apiDocID.MatchString(doc) || strings.TrimSpace(selector) == "" || len(selector) > 1024 {
			return nil, fmt.Errorf("invalid API selection")
		}
		request["doc"], request["selector"], request["withTypes"] = doc, selector, serverBoolArg(args, "withTypes")
	}
	input, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.Command(d.node, filepath.Join(d.root, "scripts/api-docs-mcp.js"))
	cmd.Dir, cmd.Stdin = d.root, bytes.NewReader(input)
	out, diagnostic := &boundedDocOutput{limit: 768 * 1024}, &boundedDocOutput{limit: 16 * 1024}
	if err := runAPIDocCommand(ctx, cmd, out, diagnostic); err != nil {
		return nil, fmt.Errorf("API documentation unavailable: %v: %s", err, strings.TrimSpace(diagnostic.buffer.String()))
	}
	var result map[string]any
	if err := json.Unmarshal(out.buffer.Bytes(), &result); err != nil || result == nil {
		return nil, fmt.Errorf("invalid API documentation response")
	}
	result["ok"] = true
	result["provenance"] = d.provenance()
	return result, nil
}

func advancedTools() []Tool {
	str := func() map[string]any { return map[string]any{"type": "string"} }
	obj := func(p map[string]any, required ...string) map[string]any {
		schema := map[string]any{"type": "object", "properties": p, "additionalProperties": false}
		if len(required) > 0 {
			schema["required"] = required
		}
		return schema
	}
	return []Tool{
		{Name: "tm_runtime_capabilities", Description: "Discover this MCP host's script authorization, documentation connection and conditional Runtime boundaries. Authorization does not prove platform/provider availability. No execution.", InputSchema: obj(map[string]any{})},
		{Name: "tm_api_catalog", Description: "Discover current canonical API groups; pass a group to compare its methods. Documentation is data, not execution or authority. Requires host --api-docs-root.", InputSchema: obj(map[string]any{"group": str()})},
		{Name: "tm_api_read", Description: "Read a complete canonical method/section and required shared contracts with source hashes and packet report; never execute examples. Select doc ID and exact method or #anchor from catalog.", InputSchema: obj(map[string]any{"doc": str(), "selector": str(), "withTypes": map[string]any{"type": "boolean"}}, "doc", "selector")},
		{Name: "tm_script_start", Description: "Run trusted ordinary OpenDesk JavaScript asynchronously in a fresh Runtime. Returns an executionId, not completion. Host must enable scripts; capability flags cannot be supplied by clients. May access files, network and desktop; not a sandbox. Observe console logs with tm_script_status; JS return values are not exported. No automatic retry.", InputSchema: obj(map[string]any{"script": str(), "input": map[string]any{"description": "JSON input exposed as Execution.input; null is preserved"}, "timeoutMs": map[string]any{"type": "integer", "minimum": 1, "maximum": 300000, "default": 30000}}, "script")},
		{Name: "tm_script_status", Description: "Read this server session's execution result and console summary. failed/timed_out/canceled are terminal tool errors; running is not completion. Oversized output returns an error and artifact paths, never a partial success.", InputSchema: obj(map[string]any{"executionId": str()}, "executionId")},
		{Name: "tm_script_cancel", Description: "Request cancellation of this session's script; query status until terminal. Cancellation is not rollback and may not interrupt an already issued native action; never replay actions with unknown outcome.", InputSchema: obj(map[string]any{"executionId": str()}, "executionId")},
	}
}

func (s *Server) callAdvancedTool(name string, args map[string]any) (map[string]any, error) {
	switch name {
	case "tm_runtime_capabilities":
		capabilities := map[string]any{"enabled": false, "reason": "host has not enabled script execution"}
		if s.scripts != nil && !s.readOnly {
			capabilities = s.scripts.Capabilities()
		}
		documentation := map[string]any{"configured": s.apiDocs != nil, "reason": "canonical docs require a trusted checkout and Node.js via host --api-docs-root"}
		if s.apiDocs != nil {
			documentation["provenance"] = s.apiDocs.provenance()
		}
		return map[string]any{"ok": true, "scripts": capabilities, "documentation": documentation, "boundaries": []string{"Ordinary script execution is not a filesystem, network or desktop sandbox", "App Mode automation.app and installed Flow context require their owning entrypoints", "BrowserDOM uses dedicated host origin/tab policy and specialized tools", "System permissions, platform support, provider credentials and plugins require independent checks", "No ordinary JavaScript return value is exported; use console.log for results", "Cancellation is not rollback; do not retry unknown actions"}}, nil
	case "tm_api_catalog", "tm_api_read":
		if s.apiDocs == nil {
			return nil, fmt.Errorf("API documentation is not configured")
		}
		if name == "tm_api_catalog" {
			return s.apiDocs.query("catalog", args)
		}
		return s.apiDocs.query("read", args)
	case "tm_script_start", "tm_script_status", "tm_script_cancel":
		if s.scripts == nil || s.readOnly {
			return nil, fmt.Errorf("script execution is not enabled")
		}
		switch name {
		case "tm_script_start":
			return s.scripts.Start(args)
		case "tm_script_status":
			return s.scripts.Status(args)
		default:
			return s.scripts.Cancel(args)
		}
	}
	return nil, fmt.Errorf("unsupported advanced tool")
}
