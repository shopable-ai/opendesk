package http

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net"
	stdhttp "net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"opendesk/pkg/inspector"
)

const (
	accessibilityWorkbenchPagePath            = "/accessibility-workbench"
	accessibilityWorkbenchControlPath         = "/api/accessibility-workbench/v1/launch"
	accessibilityWorkbenchControlMark         = "X-OpenDesk-Workbench-Control"
	accessibilityWorkbenchInternalLANPath     = "/api/accessibility-workbench/v1/internal/lan"
	accessibilityWorkbenchInternalControlMark = "X-OpenDesk-Inspector-Control"
	accessibilityWorkbenchPairShutdownGrace   = 250 * time.Millisecond
)

type accessibilityWorkbenchLaunchRequest struct{}

type accessibilityWorkbenchLaunch struct {
	URL      string `json:"url"`
	Listener string `json:"listener"`
	Mode     string `json:"mode"`
	Boundary string `json:"boundary"`
}

type accessibilityWorkbenchLANRequest struct {
	Allow bool `json:"allow"`
}

type accessibilityWorkbenchLANStatus struct {
	AllowLAN bool   `json:"allowLAN"`
	Mode     string `json:"mode"`
	LocalURL string `json:"localUrl"`
	LANURL   string `json:"lanUrl,omitempty"`
	Warning  string `json:"warning,omitempty"`
}

// inspectorNetworkPolicy is the explicit network boundary for Workbench-only
// routes. It does not wrap or modify any other route on the owner-provided
// Framework listener.
type inspectorNetworkPolicy struct {
	mu                   sync.RWMutex
	port                 string
	allowLAN             bool
	privateHosts         map[netip.Addr]struct{}
	primaryLAN           netip.Addr
	discoverPrivateHosts func() []netip.Addr
}

func newInspectorNetworkPolicy(port string) *inspectorNetworkPolicy {
	policy := &inspectorNetworkPolicy{port: strings.TrimSpace(port), discoverPrivateHosts: localPrivateInspectorAddresses}
	policy.refreshPrivateHosts()
	return policy
}

func localPrivateInspectorAddresses() []netip.Addr {
	var result []netip.Addr
	addresses, _ := net.InterfaceAddrs()
	for _, value := range addresses {
		prefix, err := netip.ParsePrefix(value.String())
		if err != nil {
			continue
		}
		address := prefix.Addr().Unmap()
		if address.IsPrivate() {
			result = append(result, address)
		}
	}
	return result
}

func (p *inspectorNetworkPolicy) setPort(port string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	p.port = strings.TrimSpace(port)
	p.mu.Unlock()
}

func (p *inspectorNetworkPolicy) refreshPrivateHosts() {
	if p == nil {
		return
	}
	p.mu.RLock()
	discover := p.discoverPrivateHosts
	p.mu.RUnlock()
	hosts := make(map[netip.Addr]struct{})
	if discover == nil {
		discover = localPrivateInspectorAddresses
	}
	for _, address := range discover() {
		address = address.Unmap()
		if address.IsPrivate() {
			hosts[address] = struct{}{}
		}
	}
	ordered := make([]netip.Addr, 0, len(hosts))
	for address := range hosts {
		ordered = append(ordered, address)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Is4() != ordered[j].Is4() {
			return ordered[i].Is4()
		}
		return ordered[i].Less(ordered[j])
	})
	p.mu.Lock()
	p.privateHosts = hosts
	p.primaryLAN = netip.Addr{}
	if len(ordered) > 0 {
		p.primaryLAN = ordered[0]
	}
	p.mu.Unlock()
}

func (p *inspectorNetworkPolicy) setLAN(allow bool) accessibilityWorkbenchLANStatus {
	if p == nil {
		return accessibilityWorkbenchLANStatus{}
	}
	if allow {
		p.refreshPrivateHosts()
	}
	p.mu.Lock()
	p.allowLAN = allow
	p.mu.Unlock()
	return p.status()
}

func (p *inspectorNetworkPolicy) status() accessibilityWorkbenchLANStatus {
	if p == nil {
		return accessibilityWorkbenchLANStatus{}
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	port := p.port
	if port == "" {
		return accessibilityWorkbenchLANStatus{Mode: "unavailable"}
	}
	status := accessibilityWorkbenchLANStatus{
		AllowLAN: p.allowLAN,
		Mode:     "local-only",
		LocalURL: "http://" + net.JoinHostPort("127.0.0.1", port) + accessibilityWorkbenchPagePath + "/",
	}
	if p.allowLAN {
		status.Mode = "trusted-lan"
		status.Warning = "Trusted-LAN Inspector traffic uses plaintext HTTP. Enable it only on a private developer network."
	}
	if p.allowLAN && p.primaryLAN.IsValid() {
		status.LANURL = "http://" + net.JoinHostPort(p.primaryLAN.String(), port) + accessibilityWorkbenchPagePath + "/"
	}
	return status
}

func inspectorSocketAddress(value string) (netip.Addr, error) {
	host, _, err := net.SplitHostPort(strings.TrimSpace(value))
	if err != nil {
		return netip.Addr{}, err
	}
	address, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return netip.Addr{}, err
	}
	return address.Unmap(), nil
}

func hasForwardedHeaders(header stdhttp.Header) bool {
	for name := range header {
		if strings.HasPrefix(strings.ToLower(name), "x-forwarded-") || strings.EqualFold(name, "Forwarded") {
			return true
		}
	}
	return false
}

func (p *inspectorNetworkPolicy) authorizeNetwork(r *stdhttp.Request) error {
	if p == nil || r == nil {
		return errors.New("accessibility workbench network policy is unavailable")
	}
	if hasForwardedHeaders(r.Header) {
		return errors.New("forwarded Workbench requests are not allowed")
	}
	remote, err := inspectorSocketAddress(r.RemoteAddr)
	if err != nil {
		return errors.New("Workbench request has an invalid socket source")
	}
	host, port, err := net.SplitHostPort(strings.TrimSpace(r.Host))
	if err != nil {
		return errors.New("Workbench Host must be an exact IP address and port")
	}
	hostAddress, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return errors.New("Workbench Host must be an exact IP address")
	}
	hostAddress = hostAddress.Unmap()

	p.mu.RLock()
	configuredPort := p.port
	allowLAN := p.allowLAN
	_, localPrivateHost := p.privateHosts[hostAddress]
	p.mu.RUnlock()
	if configuredPort == "" {
		return errors.New("Workbench listener port is unavailable")
	}
	if port != configuredPort {
		return errors.New("Workbench Host does not match the OpenDesk listener")
	}
	if remote.IsLoopback() && hostAddress.IsLoopback() {
		return nil
	}
	if !allowLAN {
		return errors.New("Inspector trusted-LAN access is disabled")
	}
	if (!remote.IsLoopback() && !remote.IsPrivate()) || !hostAddress.IsPrivate() || !localPrivateHost {
		return errors.New("Workbench socket source or Host is outside the trusted private network boundary")
	}
	return nil
}

func (p *inspectorNetworkPolicy) authorizeSameOrigin(r *stdhttp.Request, requireOrigin bool) error {
	if err := p.authorizeNetwork(r); err != nil {
		return err
	}
	if site := strings.TrimSpace(r.Header.Get("Sec-Fetch-Site")); site != "" && site != "same-origin" {
		return errors.New("cross-site Workbench requests are not allowed")
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "null" {
		return errors.New("null Origin is not allowed")
	}
	if origin == "" {
		if requireOrigin {
			return errors.New("Workbench control requires a same-origin browser request")
		}
		return nil
	}
	expected := "http://" + strings.TrimSpace(r.Host)
	parsed, err := url.Parse(origin)
	if err != nil || origin != expected || parsed.Scheme != "http" || parsed.User != nil || parsed.Host != r.Host ||
		parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("Workbench request Origin does not exactly match Host")
	}
	return nil
}

func (p *inspectorNetworkPolicy) authorizeInternal(r *stdhttp.Request) error {
	if p == nil || r == nil || hasForwardedHeaders(r.Header) {
		return errors.New("internal Inspector control is local-only")
	}
	remote, err := inspectorSocketAddress(r.RemoteAddr)
	if err != nil || !remote.IsLoopback() {
		return errors.New("internal Inspector control requires a loopback socket peer")
	}
	host, port, err := net.SplitHostPort(strings.TrimSpace(r.Host))
	if err != nil {
		return errors.New("internal Inspector control requires an exact loopback Host")
	}
	address, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil || !address.Unmap().IsLoopback() {
		return errors.New("internal Inspector control requires an exact loopback Host")
	}
	p.mu.RLock()
	configuredPort := p.port
	p.mu.RUnlock()
	if configuredPort == "" {
		return errors.New("internal Inspector control listener port is unavailable")
	}
	if port != configuredPort || strings.TrimSpace(r.Header.Get("Origin")) != "" {
		return errors.New("internal Inspector control Host or Origin is not allowed")
	}
	return nil
}

// accessibilityWorkbenchController owns the short-lived authorization state,
// but never creates another listener. Page, control, and data stay on the
// owner-provided Framework listener.
type accessibilityWorkbenchController struct {
	operationMu     sync.Mutex
	mu              sync.Mutex
	service         *inspectorService
	policy          *inspectorNetworkPolicy
	frontendRoot    string
	controlHash     [32]byte
	hasControlToken bool
	pairTTL         time.Duration
	clientTTL       time.Duration
	generation      uint64
	active          bool
	timer           *time.Timer
}

func newAccessibilityWorkbenchInspectorService(artifactRoot string) *inspectorService {
	return newInspectorService(inspector.NewRuntimeRunner(), artifactRoot)
}

func newAccessibilityWorkbenchController(service *inspectorService, policy *inspectorNetworkPolicy, frontendRoot, controlToken string) *accessibilityWorkbenchController {
	controller := &accessibilityWorkbenchController{
		service: service, policy: policy, frontendRoot: strings.TrimSpace(frontendRoot),
		pairTTL: inspectorPairTTL, clientTTL: inspectorClientTTL,
	}
	if controlToken = strings.TrimSpace(controlToken); controlToken != "" {
		controller.controlHash = sha256.Sum256([]byte(controlToken))
		controller.hasControlToken = true
	}
	return controller
}

func (c *accessibilityWorkbenchController) launch(authority string) (accessibilityWorkbenchLaunch, error) {
	if c == nil || c.service == nil || c.policy == nil {
		return accessibilityWorkbenchLaunch{}, errors.New("Accessibility Workbench control is unavailable")
	}
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	if c.hasActive() {
		return accessibilityWorkbenchLaunch{}, errors.New("Accessibility Workbench is already active; close its browser page before opening another session")
	}
	if err := c.service.resetPairing(c.pairTTL); err != nil {
		return accessibilityWorkbenchLaunch{}, err
	}
	pairURL, err := c.service.pairingURL(authority)
	if err != nil {
		return accessibilityWorkbenchLaunch{}, err
	}
	parsed, err := url.Parse(pairURL)
	if err != nil {
		return accessibilityWorkbenchLaunch{}, err
	}
	parsed.Path = accessibilityWorkbenchPagePath + "/"

	c.mu.Lock()
	c.generation++
	generation := c.generation
	c.active = true
	c.timer = time.AfterFunc(c.pairTTL+accessibilityWorkbenchPairShutdownGrace, func() { c.stopGeneration(generation) })
	c.mu.Unlock()

	status := c.policy.status()
	boundary := "loopback socket and exact loopback Host/Origin"
	if status.AllowLAN {
		boundary = "loopback or private socket, exact local private Host/Origin, single client"
	}
	return accessibilityWorkbenchLaunch{
		URL: parsed.String(), Listener: authority, Mode: status.Mode, Boundary: boundary,
	}, nil
}

func (c *accessibilityWorkbenchController) hasActive() bool {
	if c == nil {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.active
}

func (c *accessibilityWorkbenchController) onPaired() {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.active && c.timer != nil {
		c.timer.Reset(c.clientTTL)
	}
}

func (c *accessibilityWorkbenchController) onIdle() {
	if c == nil {
		return
	}
	c.mu.Lock()
	generation := c.generation
	c.mu.Unlock()
	c.stopGeneration(generation)
}

func (c *accessibilityWorkbenchController) stopGeneration(generation uint64) {
	if c == nil {
		return
	}
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	if c.generation != generation || !c.active {
		c.mu.Unlock()
		return
	}
	c.active = false
	if c.timer != nil {
		c.timer.Stop()
	}
	c.timer = nil
	c.mu.Unlock()
	c.service.invalidateAuthorization()
}

func (c *accessibilityWorkbenchController) shutdown(context.Context) error {
	if c == nil {
		return nil
	}
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	c.active = false
	if c.timer != nil {
		c.timer.Stop()
	}
	c.timer = nil
	c.mu.Unlock()
	return nil
}

func (c *accessibilityWorkbenchController) authorizeInternalToken(value string) bool {
	if c == nil || !c.hasControlToken {
		return false
	}
	presented := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return subtle.ConstantTimeCompare(presented[:], c.controlHash[:]) == 1
}

func (h *Handler) handleAccessibilityWorkbenchPage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h == nil || h.workbench == nil || h.inspectorPolicy == nil {
		stdhttp.NotFound(w, r)
		return
	}
	setAccessibilityWorkbenchPageHeaders(w)
	if err := h.inspectorPolicy.authorizeSameOrigin(r, false); err != nil {
		h.sendError(w, stdhttp.StatusForbidden, err.Error())
		return
	}
	if r.Method != stdhttp.MethodGet && r.Method != stdhttp.MethodHead {
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if r.URL.Path == accessibilityWorkbenchPagePath {
		location := accessibilityWorkbenchPagePath + "/"
		if r.URL.RawQuery != "" {
			location += "?" + r.URL.RawQuery
		}
		stdhttp.Redirect(w, r, location, stdhttp.StatusTemporaryRedirect)
		return
	}
	files := map[string]string{
		accessibilityWorkbenchPagePath + "/":                "index.html",
		accessibilityWorkbenchPagePath + "/assets/app.css":  filepath.Join("assets", "app.css"),
		accessibilityWorkbenchPagePath + "/assets/app.js":   filepath.Join("assets", "app.js"),
		accessibilityWorkbenchPagePath + "/assets/model.js": filepath.Join("assets", "model.js"),
	}
	relative, ok := files[r.URL.Path]
	if !ok || h.workbench.frontendRoot == "" {
		stdhttp.NotFound(w, r)
		return
	}
	path := filepath.Join(h.workbench.frontendRoot, relative)
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		stdhttp.NotFound(w, r)
		return
	}
	stdhttp.ServeFile(w, r, path)
}

func setAccessibilityWorkbenchPageHeaders(w stdhttp.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}

func (h *Handler) handleAccessibilityWorkbenchControl(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setInspectorSecurityHeaders(w)
	if h == nil || h.workbench == nil || h.inspectorPolicy == nil {
		h.sendError(w, stdhttp.StatusNotFound, "Accessibility Workbench control is not enabled")
		return
	}
	if err := h.inspectorPolicy.authorizeSameOrigin(r, true); err != nil {
		h.sendError(w, stdhttp.StatusForbidden, err.Error())
		return
	}
	if r.Method != stdhttp.MethodPost {
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if r.Header.Get(accessibilityWorkbenchControlMark) != "1" {
		h.sendError(w, stdhttp.StatusForbidden, "explicit OpenDesk control marker is required")
		return
	}
	var input accessibilityWorkbenchLaunchRequest
	if err := decodeInspectorJSON(w, r, &input); err != nil {
		h.sendError(w, stdhttp.StatusBadRequest, err.Error())
		return
	}
	launch, err := h.workbench.launch(strings.TrimSpace(r.Host))
	if err != nil {
		h.sendError(w, stdhttp.StatusConflict, err.Error())
		return
	}
	h.sendSuccess(w, launch)
}

func (h *Handler) handleAccessibilityWorkbenchInternalLAN(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setInspectorSecurityHeaders(w)
	if h == nil || h.workbench == nil || h.inspectorPolicy == nil || !h.workbench.hasControlToken {
		h.sendError(w, stdhttp.StatusNotFound, "Inspector internal control is not enabled")
		return
	}
	if err := h.inspectorPolicy.authorizeInternal(r); err != nil ||
		!h.workbench.authorizeInternalToken(r.Header.Get(accessibilityWorkbenchInternalControlMark)) {
		h.sendError(w, stdhttp.StatusForbidden, "Inspector internal control authorization failed")
		return
	}
	switch r.Method {
	case stdhttp.MethodGet:
		h.sendSuccess(w, h.inspectorPolicy.status())
	case stdhttp.MethodPost:
		var input accessibilityWorkbenchLANRequest
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, stdhttp.StatusBadRequest, err.Error())
			return
		}
		h.sendSuccess(w, h.inspectorPolicy.setLAN(input.Allow))
	default:
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
	}
}
