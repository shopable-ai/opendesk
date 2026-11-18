package mcpserver

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"time"
)

type processBuildIdentity struct {
	PID        int                   `json:"pid"`
	GOOS       string                `json:"goos"`
	GOARCH     string                `json:"goarch"`
	GoVersion  string                `json:"goVersion"`
	VCS        vcsBuildIdentity      `json:"vcs"`
	Executable executableObservation `json:"executable"`
}

type vcsBuildIdentity struct {
	// Build info may exist without VCS settings (for example, -buildvcs=false).
	Available bool   `json:"buildInfoAvailable"`
	Revision  string `json:"revision,omitempty"`
	// nil means absent or invalid, rather than a falsely clean build.
	Modified *bool `json:"modified"`
}

type executableObservation struct {
	Basename   string `json:"basename,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
	ObservedAt string `json:"observedAt"`
	Evidence   string `json:"evidence"`
	Error      string `json:"error,omitempty"`
}

func currentBuildIdentity() processBuildIdentity {
	return collectBuildIdentity(debug.ReadBuildInfo, os.Executable, func(path string) (io.ReadCloser, error) { return os.Open(path) })
}

// Capture once per AutomationRuntime construction. Only allowlisted metadata is
// retained: never serialize BuildInfo wholesale, argv, env, paths or raw errors.
// The file may have been replaced since process launch; this is not a hash of
// the loaded process image, nor proof that the on-disk file stayed unchanged.
func collectBuildIdentity(readInfo func() (*debug.BuildInfo, bool), executable func() (string, error), open func(string) (io.ReadCloser, error)) processBuildIdentity {
	identity := processBuildIdentity{
		PID: os.Getpid(), GOOS: runtime.GOOS, GOARCH: runtime.GOARCH, GoVersion: runtime.Version(),
		Executable: executableObservation{
			ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
			Evidence:   "disk_file_at_instance_initialization_not_loaded_memory",
		},
	}
	if info, ok := readInfo(); ok && info != nil {
		identity.VCS.Available = true
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				identity.VCS.Revision = setting.Value
			case "vcs.modified":
				if modified, err := strconv.ParseBool(setting.Value); err == nil {
					identity.VCS.Modified = &modified
				}
			}
		}
	}
	path, err := executable()
	if err != nil {
		identity.Executable.Error = "executable_path_unavailable"
		return identity
	}
	identity.Executable.Basename = filepath.Base(path)
	file, err := open(path)
	if err != nil {
		identity.Executable.Error = "executable_open_failed"
		return identity
	}
	hash := sha256.New()
	_, readErr := io.Copy(hash, file)
	closeErr := file.Close()
	if readErr != nil || closeErr != nil {
		identity.Executable.Error = "executable_read_failed"
		return identity
	}
	identity.Executable.SHA256 = hex.EncodeToString(hash.Sum(nil))
	return identity
}
