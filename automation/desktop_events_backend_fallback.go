package automation

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/shirou/gopsutil/v3/process"
)

func listProcessApplicationsFallback() ([]desktopApplicationState, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}
	result := make([]desktopApplicationState, 0, len(processes))
	for _, item := range processes {
		name, _ := item.Name()
		path, _ := item.Exe()
		createdMS, _ := item.CreateTime()
		result = append(result, desktopApplicationState{
			PID: int64(item.Pid), Name: name, Path: path, ExecutablePath: path,
			LaunchTimeMS: createdMS,
		})
	}
	return result, nil
}

func clipboardTextRevisionFallback() (desktopClipboardRevision, error) {
	text, err := NewClipboard().Paste()
	if err != nil {
		return desktopClipboardRevision{}, err
	}
	sum := sha256.Sum256([]byte(text))
	return desktopClipboardRevision{Revision: hex.EncodeToString(sum[:]), ChangeCount: -1}, nil
}
