package main

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const existingOpenDeskProbeTimeout = 750 * time.Millisecond

// openDeskHealth is intentionally small: it is only used to distinguish an
// already-running local OpenDesk from an unrelated process that owns a port.
type openDeskHealth struct {
	Service           string `json:"service"`
	Status            string `json:"status"`
	ExecutionCapacity *int   `json:"execution_capacity"`
	VisionEnabled     *bool  `json:"vision_enabled"`
	Scheduler         *bool  `json:"scheduler"`
}

func addressInUse(err error) bool {
	return errors.Is(err, syscall.EADDRINUSE)
}

func validLocalPort(port string) (string, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(port), 10, 16)
	if err != nil || value == 0 || value > 65535 {
		return "", false
	}
	return strconv.FormatUint(value, 10), true
}

func isOpenDeskHealth(health openDeskHealth) bool {
	if health.Service == "opendesk" && health.Status == "ok" {
		return true
	}

	// Builds released before the explicit service marker still expose these
	// three typed fields. Keeping this compatibility branch lets a freshly
	// installed App reuse an older, healthy OpenDesk during an upgrade.
	return health.Service == "" && health.Status == "ok" &&
		health.ExecutionCapacity != nil && health.VisionEnabled != nil && health.Scheduler != nil
}

func runningOpenDeskOnLocalPort(port string) bool {
	port, ok := validLocalPort(port)
	if !ok {
		return false
	}

	transport := &http.Transport{Proxy: nil, DisableKeepAlives: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Timeout:   existingOpenDeskProbeTimeout,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Get("http://" + net.JoinHostPort("127.0.0.1", port) + "/status")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false
	}

	var health openDeskHealth
	if err := json.NewDecoder(io.LimitReader(response.Body, 16<<10)).Decode(&health); err != nil {
		return false
	}
	return isOpenDeskHealth(health)
}

// reuseRunningOpenDesk is deliberately limited to a Finder-style App launch.
// Explicit CLI invocations retain their normal EADDRINUSE error so callers can
// distinguish a failed requested server from a reused desktop service.
func reuseRunningOpenDesk(err error, port string) bool {
	return isAutoRunJs && isOpenDeskAppBundle() && addressInUse(err) && runningOpenDeskOnLocalPort(port)
}
