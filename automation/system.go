package automation

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/denisbrodbeck/machineid"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net" // Aliased to avoid conflict
	"github.com/shirou/gopsutil/v3/process"
)

// System provides methods for accessing system information and hardware details
type System struct{}

// NewSystem creates a new System instance
func NewSystem() *System {
	return &System{}
}

// Process Management
// ----------------

// GetProcessList returns a list of running processes
func (s *System) GetProcessList() ([]map[string]interface{}, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var processList []map[string]interface{}
	for _, p := range processes {
		name, _ := p.Name()
		cmdline, _ := p.Cmdline()
		username, _ := p.Username()
		cpuPercent, _ := p.CPUPercent()
		memPercent, _ := p.MemoryPercent()

		processInfo := map[string]interface{}{
			"pid":        p.Pid,
			"name":       name,
			"cmdline":    cmdline,
			"username":   username,
			"cpuPercent": cpuPercent,
			"memPercent": memPercent,
		}
		processList = append(processList, processInfo)
	}
	return processList, nil
}

// KillProcess terminates a process by PID
func (s *System) KillProcess(pid int32) error {
	p, err := process.NewProcess(pid)
	if err != nil {
		return err
	}
	return p.Kill()
}

// Network Information
// ----------------

// GetNetworkInterfaces returns information about network interfaces
func (s *System) GetNetworkInterfaces() ([]map[string]interface{}, error) {
	interfaces, err := psnet.IOCounters(true) // Using aliased import
	if err != nil {
		return nil, err
	}

	var networkInfo []map[string]interface{}
	for _, netInterface := range interfaces {
		info := map[string]interface{}{
			"name":        netInterface.Name,
			"bytesSent":   netInterface.BytesSent,
			"bytesRecv":   netInterface.BytesRecv,
			"packetsSent": netInterface.PacketsSent,
			"packetsRecv": netInterface.PacketsRecv,
			"errors":      netInterface.Errin + netInterface.Errout,
			"drops":       netInterface.Dropin + netInterface.Dropout,
		}
		networkInfo = append(networkInfo, info)
	}
	return networkInfo, nil
}

// GetNetworkConnections returns active network connections
func (s *System) GetNetworkConnections() ([]map[string]interface{}, error) {
	conns, err := psnet.Connections("all") // Using aliased import
	if err != nil {
		return nil, err
	}

	var connections []map[string]interface{}
	for _, conn := range conns {
		connInfo := map[string]interface{}{
			"fd":        conn.Fd,
			"family":    conn.Family,
			"type":      conn.Type,
			"localAddr": fmt.Sprintf("%s:%d", conn.Laddr.IP, conn.Laddr.Port),
			"remAddr":   fmt.Sprintf("%s:%d", conn.Raddr.IP, conn.Raddr.Port),
			"status":    conn.Status,
			"pid":       conn.Pid,
		}
		connections = append(connections, connInfo)
	}
	return connections, nil
}

// Power Management
// ----------------

// GetPowerInfo returns power and battery information
func (s *System) GetPowerInfo() (map[string]interface{}, error) {
	// Implementation depends on OS
	// This is a basic implementation
	info := make(map[string]interface{})

	if runtime.GOOS == "windows" {
		out, err := exec.Command("WMIC", "Path", "Win32_Battery", "Get", "EstimatedChargeRemaining,BatteryStatus").Output()
		if err == nil {
			info["batteryData"] = string(out)
		}
	} else if runtime.GOOS == "darwin" {
		out, err := exec.Command("pmset", "-g", "batt").Output()
		if err == nil {
			info["batteryData"] = string(out)
		}
	} else if runtime.GOOS == "linux" {
		out, err := exec.Command("upower", "-i", "/org/freedesktop/UPower/devices/battery_BAT0").Output()
		if err == nil {
			info["batteryData"] = string(out)
		}
	}

	return info, nil
}

// System Control
// ----------------

// Shutdown initiates system shutdown
func (s *System) Shutdown(delay int) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("shutdown", "/s", "/t", fmt.Sprintf("%d", delay)).Run()
	case "linux", "darwin":
		return exec.Command("shutdown", "-h", fmt.Sprintf("+%d", delay/60)).Run()
	default:
		return fmt.Errorf("unsupported operating system")
	}
}

// Restart initiates system restart
func (s *System) Restart(delay int) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("shutdown", "/r", "/t", fmt.Sprintf("%d", delay)).Run()
	case "linux", "darwin":
		return exec.Command("shutdown", "-r", fmt.Sprintf("+%d", delay/60)).Run()
	default:
		return fmt.Errorf("unsupported operating system")
	}
}

// Sleep puts the system to sleep
func (s *System) Sleep() error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0").Run()
	case "darwin":
		return exec.Command("pmset", "sleepnow").Run()
	case "linux":
		return exec.Command("systemctl", "suspend").Run()
	default:
		return fmt.Errorf("unsupported operating system")
	}
}

// File System Operations
// ----------------

// GetDirectoryContents returns contents of a directory
func (s *System) GetDirectoryContents(path string) ([]map[string]interface{}, error) {
	files, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	var contents []map[string]interface{}
	for _, file := range files {
		info, err := file.Info()
		if err != nil {
			continue
		}

		fileInfo := map[string]interface{}{
			"name":    file.Name(),
			"size":    info.Size(),
			"mode":    info.Mode().String(),
			"modTime": info.ModTime(),
			"isDir":   file.IsDir(),
		}
		contents = append(contents, fileInfo)
	}
	return contents, nil
}

// GetExecutablePath returns the path of the current executable
func (s *System) GetExecutablePath() (string, error) {
	return os.Executable()
}

// GetWorkingDirectory returns the current working directory
func (s *System) GetWorkingDirectory() (string, error) {
	return os.Getwd()
}

// Security and Access Control
// ----------------

// GetUserInfo returns information about the current user
func (s *System) GetUserInfo() map[string]interface{} {
	info := make(map[string]interface{})

	info["username"] = os.Getenv("USERNAME")
	info["userDomain"] = os.Getenv("USERDOMAIN")
	info["userProfile"] = os.Getenv("USERPROFILE")
	info["homePath"] = os.Getenv("HOME")

	hostname, err := os.Hostname()
	if err == nil {
		info["hostname"] = hostname
	}

	return info
}

// IsAdministrator checks if the current process has administrator privileges
func (s *System) IsAdministrator() bool {
	if runtime.GOOS == "windows" {
		_, err := os.Open("\\\\.\\PHYSICALDRIVE0")
		return err == nil
	}
	return os.Getuid() == 0
}

// System Metrics and Performance
// ----------------

// GetSystemMetrics returns various system metrics
func (s *System) GetSystemMetrics() (map[string]interface{}, error) {
	metrics := make(map[string]interface{})

	// CPU usage
	cpuPercent, err := cpu.Percent(time.Second, false)
	if err == nil && len(cpuPercent) > 0 {
		metrics["cpuUsage"] = cpuPercent[0]
	}

	// Memory usage
	memInfo, err := mem.VirtualMemory()
	if err == nil {
		metrics["memoryUsage"] = memInfo.UsedPercent
		metrics["availableMemory"] = memInfo.Available
	}

	// Disk usage
	diskInfo, err := disk.Usage("/")
	if err == nil {
		metrics["diskUsage"] = diskInfo.UsedPercent
		metrics["availableDisk"] = diskInfo.Free
	}

	return metrics, nil
}

// Legacy methods (keeping for compatibility)
// ----------------

func (s *System) GetFingerprint() (string, error) {
	id, err := machineid.ProtectedID("testMonkey")
	if err != nil {
		return "", fmt.Errorf("failed to generate hardware fingerprint: %v", err)
	}
	return id, nil
}

func (s *System) GetSystemInfo() (map[string]interface{}, error) {
	info := make(map[string]interface{})

	hostInfo, err := host.Info()
	if err == nil {
		info["hostname"] = hostInfo.Hostname
		info["os"] = hostInfo.OS
		info["platform"] = hostInfo.Platform
		info["platformVersion"] = hostInfo.PlatformVersion
		info["kernelVersion"] = hostInfo.KernelVersion
		info["uptime"] = hostInfo.Uptime
	}

	if cpuInfo, err := cpu.Info(); err == nil && len(cpuInfo) > 0 {
		info["cpuModel"] = cpuInfo[0].ModelName
		info["cpuCores"] = cpuInfo[0].Cores
		info["cpuMHz"] = cpuInfo[0].Mhz
	}

	if memInfo, err := mem.VirtualMemory(); err == nil {
		info["totalMemory"] = memInfo.Total
		info["freeMemory"] = memInfo.Free
		info["usedMemory"] = memInfo.Used
		info["memoryUsage"] = memInfo.UsedPercent
	}

	return info, nil
}

// Helper functions
// ----------------

func (s *System) ToJSON(data interface{}) (string, error) {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}
