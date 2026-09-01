package nativeextension

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type RootKind string

const (
	RootPortable    RootKind = "portable"
	RootAppBundled  RootKind = "app_bundled"
	RootCurrentUser RootKind = "current_user"
	RootTest        RootKind = "test"
)

type DiscoveryRoot struct {
	Kind RootKind
	Path string
}

type DiscoveryOptions struct {
	Roots          []DiscoveryRoot
	ExecutablePath string
	// UserDataDir overrides only the current-user data-directory base. It is
	// intended for Host tests and isolated proof profiles; normal JavaScript,
	// HTTP, and MCP callers cannot set discovery roots.
	UserDataDir string
}

type MethodBinding struct {
	Name       string `json:"name"`
	WireMethod string `json:"wireMethod"`
	TimeoutMS  int    `json:"timeoutMs"`
}

type Plugin struct {
	ID                 string                   `json:"id"`
	Version            string                   `json:"version"`
	Namespace          string                   `json:"namespace"`
	ProtocolName       string                   `json:"protocol"`
	ProtocolVersion    int                      `json:"protocolVersion"`
	RootKind           RootKind                 `json:"rootKind"`
	RootPath           string                   `json:"-"`
	BundlePath         string                   `json:"-"`
	ManifestPath       string                   `json:"-"`
	ExecutablePath     string                   `json:"-"`
	ExecutableRelative string                   `json:"executable"`
	ExecutableSHA256   string                   `json:"executableSha256"`
	ManifestSHA256     string                   `json:"-"`
	Methods            map[string]MethodBinding `json:"methods"`
}

type DiscoveryDiagnostic struct {
	RootKind         RootKind `json:"rootKind"`
	PluginID         string   `json:"pluginId,omitempty"`
	Namespace        string   `json:"namespace,omitempty"`
	SchemaVersion    int      `json:"schemaVersion,omitempty"`
	Executable       string   `json:"executable,omitempty"`
	ExecutableSHA256 string   `json:"executableSha256,omitempty"`
	Status           string   `json:"status"`
	ErrorCode        string   `json:"errorCode,omitempty"`
	DurationMS       int64    `json:"durationMs"`
}

type Registry struct {
	plugins     map[string]Plugin
	namespaces  map[string]string
	diagnostics []DiscoveryDiagnostic
}

type discoveryCandidate struct {
	plugin          Plugin
	diagnosticIndex int
}

type RegistryError struct {
	Code    string
	Message string
}

func (e *RegistryError) Error() string {
	if e == nil {
		return ""
	}
	return e.Code + ": " + e.Message
}

func DefaultDiscoveryRoots(options DiscoveryOptions) ([]DiscoveryRoot, error) {
	executable := strings.TrimSpace(options.ExecutablePath)
	if executable == "" {
		var err error
		executable, err = os.Executable()
		if err != nil {
			return nil, fmt.Errorf("resolve OpenDesk executable: %w", err)
		}
	}
	publisherRoot, err := publisherRootForExecutable(runtime.GOOS, executable)
	if err != nil {
		return nil, err
	}
	roots := make([]DiscoveryRoot, 0, 2)
	roots = append(roots, publisherRoot)

	userRoot, err := currentUserDiscoveryRoot(strings.TrimSpace(options.UserDataDir))
	if err != nil {
		// Keep the already resolved publisher root usable. Discover records a
		// privacy-minimized diagnostic for the unavailable user root.
		return roots, fmt.Errorf("resolve current-user native extension directory: %w", err)
	}
	roots = append(roots, DiscoveryRoot{Kind: RootCurrentUser, Path: userRoot})
	return roots, nil
}

func Discover(options DiscoveryOptions) (*Registry, error) {
	registry := &Registry{plugins: make(map[string]Plugin), namespaces: make(map[string]string)}
	roots := append([]DiscoveryRoot(nil), options.Roots...)
	userRootUnavailable := false
	if len(roots) == 0 {
		var err error
		roots, err = DefaultDiscoveryRoots(options)
		if err != nil {
			if len(roots) == 0 {
				return nil, err
			}
			userRootUnavailable = true
		}
	}
	candidates := make([]discoveryCandidate, 0)
	for _, root := range roots {
		candidates = append(candidates, registry.discoverRoot(root)...)
	}
	if userRootUnavailable {
		registry.diagnostics = append(registry.diagnostics, DiscoveryDiagnostic{
			RootKind:  RootCurrentUser,
			Status:    "rejected",
			ErrorCode: "user_root_unavailable",
		})
	}
	registry.resolveCandidates(candidates)
	return registry, nil
}

func (r *Registry) discoverRoot(root DiscoveryRoot) []discoveryCandidate {
	started := time.Now()
	if root.Kind == "" {
		root.Kind = RootTest
	}
	rootDiagnostic := DiscoveryDiagnostic{RootKind: root.Kind, Status: "skipped"}
	rootPath := strings.TrimSpace(root.Path)
	if rootPath == "" || !filepath.IsAbs(rootPath) {
		rootDiagnostic.Status = "rejected"
		rootDiagnostic.ErrorCode = "invalid_root"
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	root.Path = filepath.Clean(rootPath)
	info, err := os.Lstat(root.Path)
	if err != nil {
		rootDiagnostic.ErrorCode = discoveryPathErrorCode(err, "root_unavailable")
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	if err := validateAbsoluteNoSymlink(root.Path); err != nil {
		rootDiagnostic.Status = "rejected"
		rootDiagnostic.ErrorCode = "symlink_rejected"
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	if err := validateSecureDirectory(root.Path, info); err != nil {
		rootDiagnostic.Status = "rejected"
		rootDiagnostic.ErrorCode = "unsafe_root"
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	if err := validateTrustedAncestorDirectories(root.Path); err != nil {
		rootDiagnostic.Status = "rejected"
		rootDiagnostic.ErrorCode = "unsafe_root_ancestor"
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	entries, err := os.ReadDir(root.Path)
	if err != nil {
		rootDiagnostic.Status = "rejected"
		rootDiagnostic.ErrorCode = discoveryPathErrorCode(err, "root_unreadable")
		rootDiagnostic.DurationMS = time.Since(started).Milliseconds()
		r.diagnostics = append(r.diagnostics, rootDiagnostic)
		return nil
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	candidates := make([]discoveryCandidate, 0, len(entries))
	for _, entry := range entries {
		plugin, diagnostic, ok := discoverBundle(root, entry.Name())
		r.diagnostics = append(r.diagnostics, diagnostic)
		if ok {
			candidates = append(candidates, discoveryCandidate{plugin: plugin, diagnosticIndex: len(r.diagnostics) - 1})
		}
	}
	return candidates
}

func discoverBundle(root DiscoveryRoot, childName string) (Plugin, DiscoveryDiagnostic, bool) {
	started := time.Now()
	diagnostic := DiscoveryDiagnostic{RootKind: root.Kind, Status: "rejected"}
	finish := func(code string) (Plugin, DiscoveryDiagnostic, bool) {
		diagnostic.ErrorCode = code
		diagnostic.DurationMS = time.Since(started).Milliseconds()
		return Plugin{}, diagnostic, false
	}
	bundlePath := filepath.Join(root.Path, childName)
	bundleInfo, err := os.Lstat(bundlePath)
	if err != nil {
		return finish(discoveryPathErrorCode(err, "invalid_bundle"))
	}
	if err := validateSecureDirectory(bundlePath, bundleInfo); err != nil {
		return finish("unsafe_bundle")
	}
	manifestPath := filepath.Join(bundlePath, "extension.json")
	manifestInfo, err := os.Lstat(manifestPath)
	if err != nil {
		return finish(discoveryPathErrorCode(err, "manifest_unavailable"))
	}
	if err := validateNoSymlinkPath(root.Path, manifestPath); err != nil {
		return finish("symlink_rejected")
	}
	if err := validateSecureRegularFile(manifestPath, manifestInfo, false); err != nil {
		return finish("unsafe_manifest")
	}
	raw, err := readBoundedFile(manifestPath, ManifestMaxBytes)
	if err != nil {
		if errors.Is(err, errFileTooLarge) {
			return finish("manifest_too_large")
		}
		return finish(discoveryPathErrorCode(err, "manifest_unreadable"))
	}
	manifest, err := ParseManifest(raw)
	if err != nil {
		return finish("invalid_manifest")
	}
	diagnostic.PluginID = manifest.ID
	diagnostic.Namespace = manifest.JavaScript.Namespace
	diagnostic.SchemaVersion = manifest.SchemaVersion
	diagnostic.Executable = manifest.Executable
	if childName != manifest.ID {
		return finish("bundle_id_mismatch")
	}
	executablePath := filepath.Join(bundlePath, filepath.FromSlash(manifest.Executable))
	executableInfo, err := os.Lstat(executablePath)
	if err != nil {
		return finish(discoveryPathErrorCode(err, "executable_unavailable"))
	}
	if err := validateNoSymlinkPath(bundlePath, executablePath); err != nil {
		return finish("symlink_rejected")
	}
	if err := validateContainedPath(bundlePath, executablePath); err != nil {
		return finish("path_escape")
	}
	if err := validateSecureParentDirectories(bundlePath, executablePath); err != nil {
		return finish("unsafe_executable_path")
	}
	if err := validateSecureRegularFile(executablePath, executableInfo, true); err != nil {
		return finish("unsafe_executable")
	}
	executableDigest, err := sha256File(executablePath)
	if err != nil {
		return finish(discoveryPathErrorCode(err, "executable_unreadable"))
	}
	if manifest.ExecutableSHA256 != "" && manifest.ExecutableSHA256 != executableDigest {
		return finish("digest_mismatch")
	}
	manifestDigest := fmt.Sprintf("%x", sha256.Sum256(raw))
	methods := make(map[string]MethodBinding, len(manifest.Methods))
	for name, method := range manifest.Methods {
		methods[name] = MethodBinding{Name: name, WireMethod: method.WireMethod, TimeoutMS: method.TimeoutMS}
	}
	diagnostic.ExecutableSHA256 = executableDigest
	diagnostic.Status = "discovered"
	diagnostic.ErrorCode = ""
	diagnostic.DurationMS = time.Since(started).Milliseconds()
	return Plugin{
		ID: manifest.ID, Version: manifest.Version, Namespace: manifest.JavaScript.Namespace,
		ProtocolName: manifest.Protocol.Name, ProtocolVersion: manifest.Protocol.Version,
		RootKind: root.Kind, RootPath: root.Path, BundlePath: bundlePath,
		ManifestPath: manifestPath, ExecutablePath: executablePath,
		ExecutableRelative: manifest.Executable, ExecutableSHA256: executableDigest,
		ManifestSHA256: manifestDigest, Methods: methods,
	}, diagnostic, true
}

func (r *Registry) resolveCandidates(candidates []discoveryCandidate) {
	idGroups := make(map[string][]int)
	namespaceGroups := make(map[string][]int)
	for index, candidate := range candidates {
		plugin := candidate.plugin
		idGroups[strings.ToLower(plugin.ID)] = append(idGroups[strings.ToLower(plugin.ID)], index)
		namespaceGroups[strings.ToLower(plugin.Namespace)] = append(namespaceGroups[strings.ToLower(plugin.Namespace)], index)
	}
	quarantined := make(map[int]string)
	for _, indices := range idGroups {
		if len(indices) > 1 {
			for _, index := range indices {
				quarantined[index] = "duplicate_plugin_id"
			}
		}
	}
	for _, indices := range namespaceGroups {
		if len(indices) > 1 {
			for _, index := range indices {
				if quarantined[index] == "" {
					quarantined[index] = "duplicate_namespace"
				}
			}
		}
	}
	for index, candidate := range candidates {
		plugin := candidate.plugin
		if code := quarantined[index]; code != "" {
			diagnostic := &r.diagnostics[candidate.diagnosticIndex]
			diagnostic.Status = "quarantined"
			diagnostic.ErrorCode = code
			continue
		}
		r.plugins[plugin.ID] = plugin
		r.namespaces[plugin.Namespace] = plugin.ID
	}
}

func (r *Registry) Plugins() []Plugin {
	if r == nil {
		return nil
	}
	plugins := make([]Plugin, 0, len(r.plugins))
	for _, plugin := range r.plugins {
		plugins = append(plugins, clonePlugin(plugin))
	}
	sort.Slice(plugins, func(i, j int) bool { return plugins[i].ID < plugins[j].ID })
	return plugins
}

func (r *Registry) Diagnostics() []DiscoveryDiagnostic {
	if r == nil {
		return nil
	}
	return append([]DiscoveryDiagnostic(nil), r.diagnostics...)
}

func (r *Registry) Lookup(id string) (Plugin, bool) {
	if r == nil {
		return Plugin{}, false
	}
	plugin, ok := r.plugins[id]
	return clonePlugin(plugin), ok
}

func (r *Registry) LookupNamespace(namespace string) (Plugin, bool) {
	if r == nil {
		return Plugin{}, false
	}
	id, ok := r.namespaces[namespace]
	if !ok {
		return Plugin{}, false
	}
	return r.Lookup(id)
}

func (r *Registry) ValidateArtifact(pluginID string) (Plugin, error) {
	plugin, ok := r.Lookup(pluginID)
	if !ok {
		return Plugin{}, &RegistryError{Code: "unknown_plugin", Message: "native extension plugin is not registered"}
	}
	if err := validateNoSymlinkPath(plugin.RootPath, plugin.ManifestPath); err != nil {
		return Plugin{}, artifactChanged(err)
	}
	if err := validateNoSymlinkPath(plugin.BundlePath, plugin.ExecutablePath); err != nil {
		return Plugin{}, artifactChanged(err)
	}
	rootInfo, err := os.Lstat(plugin.RootPath)
	if err != nil || validateSecureDirectory(plugin.RootPath, rootInfo) != nil {
		return Plugin{}, artifactChanged(err)
	}
	if err := validateTrustedAncestorDirectories(plugin.RootPath); err != nil {
		return Plugin{}, artifactChanged(err)
	}
	bundleInfo, err := os.Lstat(plugin.BundlePath)
	if err != nil || validateSecureDirectory(plugin.BundlePath, bundleInfo) != nil {
		return Plugin{}, artifactChanged(err)
	}
	manifestInfo, err := os.Lstat(plugin.ManifestPath)
	if err != nil || validateSecureRegularFile(plugin.ManifestPath, manifestInfo, false) != nil {
		return Plugin{}, artifactChanged(err)
	}
	executableInfo, err := os.Lstat(plugin.ExecutablePath)
	if err != nil || validateSecureRegularFile(plugin.ExecutablePath, executableInfo, true) != nil {
		return Plugin{}, artifactChanged(err)
	}
	if err := validateContainedPath(plugin.BundlePath, plugin.ExecutablePath); err != nil {
		return Plugin{}, artifactChanged(err)
	}
	if err := validateSecureParentDirectories(plugin.BundlePath, plugin.ExecutablePath); err != nil {
		return Plugin{}, artifactChanged(err)
	}
	manifestDigest, err := sha256File(plugin.ManifestPath)
	if err != nil || manifestDigest != plugin.ManifestSHA256 {
		return Plugin{}, artifactChanged(err)
	}
	executableDigest, err := sha256File(plugin.ExecutablePath)
	if err != nil || executableDigest != plugin.ExecutableSHA256 {
		return Plugin{}, artifactChanged(err)
	}
	return plugin, nil
}

func clonePlugin(plugin Plugin) Plugin {
	methods := make(map[string]MethodBinding, len(plugin.Methods))
	for name, method := range plugin.Methods {
		methods[name] = method
	}
	plugin.Methods = methods
	return plugin
}

func artifactChanged(cause error) error {
	message := "native extension artifact changed after discovery"
	if cause != nil {
		message += ": " + cause.Error()
	}
	return &RegistryError{Code: "artifact_changed", Message: message}
}

var errFileTooLarge = errors.New("file exceeds size limit")

func readBoundedFile(path string, limit int) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > limit {
		return nil, errFileTooLarge
	}
	return raw, nil
}

func sha256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func validateNoSymlinkPath(base, target string) error {
	base = filepath.Clean(base)
	target = filepath.Clean(target)
	if err := validateAbsoluteNoSymlink(base); err != nil {
		return err
	}
	if err := validateContainedPath(base, target); err != nil {
		return err
	}
	relative, err := filepath.Rel(base, target)
	if err != nil {
		return err
	}
	current := base
	components := []string{"."}
	if relative != "." {
		components = append(components, strings.Split(relative, string(filepath.Separator))...)
	}
	for _, component := range components {
		if component != "." {
			current = filepath.Join(current, component)
		}
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink path component is not allowed")
		}
	}
	return nil
}

func validateAbsoluteNoSymlink(path string) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	chain := make([]string, 0, 16)
	for current := filepath.Clean(absolute); ; current = filepath.Dir(current) {
		chain = append(chain, current)
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	for index := len(chain) - 1; index >= 0; index-- {
		info, err := os.Lstat(chain[index])
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink path component is not allowed")
		}
	}
	return nil
}

func validateContainedPath(bundle, target string) error {
	realBundle, err := filepath.EvalSymlinks(bundle)
	if err != nil {
		return err
	}
	realTarget, err := filepath.EvalSymlinks(target)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(realBundle, realTarget)
	if err != nil {
		return err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return fmt.Errorf("artifact escapes plugin bundle")
	}
	return nil
}

func validateSecureParentDirectories(bundle, target string) error {
	if err := validateContainedPath(bundle, target); err != nil {
		return err
	}
	parent := filepath.Dir(filepath.Clean(target))
	relative, err := filepath.Rel(filepath.Clean(bundle), parent)
	if err != nil {
		return err
	}
	current := filepath.Clean(bundle)
	if info, err := os.Lstat(current); err != nil || validateSecureDirectory(current, info) != nil {
		return fmt.Errorf("unsafe executable parent directory %s", current)
	}
	if relative == "." {
		return nil
	}
	for _, component := range strings.Split(relative, string(filepath.Separator)) {
		if component == "" || component == "." || component == ".." {
			return fmt.Errorf("invalid executable parent component")
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if err := validateSecureDirectory(current, info); err != nil {
			return err
		}
	}
	return nil
}

func discoveryPathErrorCode(err error, fallback string) string {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return fallback
	case errors.Is(err, fs.ErrPermission):
		return "permission_denied"
	default:
		return fallback
	}
}
