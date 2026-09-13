//go:build windows

package customui

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

// PROC_THREAD_ATTRIBUTE_JOB_LIST is available on supported Windows 10+
// systems but is not currently exported by golang.org/x/sys/windows.
// Supplying the Job during CreateProcess removes the otherwise unavoidable
// parent-death race between process creation and AssignProcessToJobObject.
const procThreadAttributeJobList = uintptr(0x0002000D)

type windowsHostProcess struct {
	mu      sync.Mutex
	process windows.Handle
	job     windows.Handle
	pid     int
}

func (p *windowsHostProcess) PID() int {
	if p == nil {
		return 0
	}
	return p.pid
}

func (p *windowsHostProcess) Kill() error {
	if p == nil {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.job == 0 {
		return nil
	}
	// Terminate the dedicated Job instead of only the host process so any
	// Runtime-owned descendants are bounded by the same cleanup operation.
	return windows.TerminateJobObject(p.job, 1)
}

func (p *windowsHostProcess) Wait() error {
	if p == nil {
		return nil
	}
	p.mu.Lock()
	process := p.process
	p.mu.Unlock()
	if process == 0 {
		return nil
	}

	status, waitErr := windows.WaitForSingleObject(process, windows.INFINITE)
	var exitCode uint32
	exitErr := error(nil)
	if waitErr == nil {
		if status != windows.WAIT_OBJECT_0 {
			waitErr = fmt.Errorf("native UI host wait returned status 0x%X", status)
		} else {
			exitErr = windows.GetExitCodeProcess(process, &exitCode)
		}
	}
	p.closeHandles()
	if waitErr != nil {
		return waitErr
	}
	if exitErr != nil {
		return exitErr
	}
	if exitCode != 0 {
		return fmt.Errorf("native UI host exited with code %d", exitCode)
	}
	return nil
}

func (p *windowsHostProcess) closeHandles() {
	p.mu.Lock()
	process := p.process
	job := p.job
	p.process = 0
	p.job = 0
	p.mu.Unlock()
	if process != 0 {
		_ = windows.CloseHandle(process)
	}
	if job != 0 {
		// KILL_ON_JOB_CLOSE also bounds any descendants that outlive the host.
		_ = windows.CloseHandle(job)
	}
}

func startPlatformHostProcess(path string, stderr io.Writer) (hostProcess, io.WriteCloser, io.ReadCloser, error) {
	return startWindowsOwnedHostProcess(path, nil, stderr)
}

// startWindowsOwnedHostProcess creates the native UI host directly in a
// dedicated Job Object. The Job is attached through STARTUPINFOEX during
// CreateProcess, rather than assigned after Start(), so abnormal parent death
// cannot leave an unowned helper in the spawn-to-assign interval.
//
// args exists only for Windows lifecycle tests; production passes no args.
func startWindowsOwnedHostProcess(path string, args []string, stderr io.Writer) (hostProcess, io.WriteCloser, io.ReadCloser, error) {
	if stderr == nil {
		stderr = io.Discard
	}

	childStdin, parentStdin, err := os.Pipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create native UI stdin pipe: %w", err)
	}
	parentStdout, childStdout, err := os.Pipe()
	if err != nil {
		_ = childStdin.Close()
		_ = parentStdin.Close()
		return nil, nil, nil, fmt.Errorf("create native UI stdout pipe: %w", err)
	}
	parentStderr, childStderr, err := os.Pipe()
	if err != nil {
		_ = childStdin.Close()
		_ = parentStdin.Close()
		_ = parentStdout.Close()
		_ = childStdout.Close()
		return nil, nil, nil, fmt.Errorf("create native UI stderr pipe: %w", err)
	}

	allFiles := []*os.File{childStdin, parentStdin, parentStdout, childStdout, parentStderr, childStderr}
	cleanupFiles := func() {
		for _, file := range allFiles {
			if file != nil {
				_ = file.Close()
			}
		}
	}
	for _, file := range []*os.File{parentStdin, parentStdout, parentStderr} {
		if err := windows.SetHandleInformation(windows.Handle(file.Fd()), windows.HANDLE_FLAG_INHERIT, 0); err != nil {
			cleanupFiles()
			return nil, nil, nil, fmt.Errorf("make native UI parent pipe non-inheritable: %w", err)
		}
	}

	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("create native UI ownership job: %w", err)
	}
	jobOpen := true
	defer func() {
		if jobOpen {
			_ = windows.CloseHandle(job)
		}
	}()
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)),
	); err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("configure native UI ownership job: %w", err)
	}

	attributes, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("create native UI process attribute list: %w", err)
	}
	defer attributes.Delete()
	inheritedHandles := []windows.Handle{
		windows.Handle(childStdin.Fd()),
		windows.Handle(childStdout.Fd()),
		windows.Handle(childStderr.Fd()),
	}
	if err := attributes.Update(
		windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
		unsafe.Pointer(&inheritedHandles[0]),
		uintptr(len(inheritedHandles))*unsafe.Sizeof(inheritedHandles[0]),
	); err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("restrict native UI inherited handles: %w", err)
	}
	jobList := []windows.Handle{job}
	if err := attributes.Update(
		procThreadAttributeJobList,
		unsafe.Pointer(&jobList[0]),
		unsafe.Sizeof(jobList[0]),
	); err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("attach native UI process to ownership job: %w", err)
	}

	applicationName, err := windows.UTF16PtrFromString(path)
	if err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("encode native UI host path: %w", err)
	}
	argv := append([]string{path}, args...)
	commandLine, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(argv))
	if err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("encode native UI command line: %w", err)
	}

	startup := windows.StartupInfoEx{}
	startup.StartupInfo.Cb = uint32(unsafe.Sizeof(startup))
	startup.StartupInfo.Flags = windows.STARTF_USESTDHANDLES
	startup.StartupInfo.StdInput = inheritedHandles[0]
	startup.StartupInfo.StdOutput = inheritedHandles[1]
	startup.StartupInfo.StdErr = inheritedHandles[2]
	startup.ProcThreadAttributeList = attributes.List()
	processInfo := windows.ProcessInformation{}
	if err := windows.CreateProcess(
		applicationName,
		commandLine,
		nil,
		nil,
		true,
		windows.EXTENDED_STARTUPINFO_PRESENT,
		nil,
		nil,
		(*windows.StartupInfo)(unsafe.Pointer(&startup)),
		&processInfo,
	); err != nil {
		cleanupFiles()
		return nil, nil, nil, fmt.Errorf("start native UI host in ownership job: %w", err)
	}
	runtime.KeepAlive(inheritedHandles)
	runtime.KeepAlive(jobList)
	_ = windows.CloseHandle(processInfo.Thread)

	// The child owns these ends now. Closing the parent duplicates is required
	// for EOF to remain a reliable transport/lifetime signal.
	_ = childStdin.Close()
	_ = childStdout.Close()
	_ = childStderr.Close()
	allFiles[0], allFiles[3], allFiles[5] = nil, nil, nil

	process := &windowsHostProcess{
		process: processInfo.Process,
		job:     job,
		pid:     int(processInfo.ProcessId),
	}
	jobOpen = false
	go func() {
		_, _ = io.Copy(stderr, parentStderr)
		_ = parentStderr.Close()
	}()
	allFiles[1], allFiles[2], allFiles[4] = nil, nil, nil
	return process, parentStdin, parentStdout, nil
}
