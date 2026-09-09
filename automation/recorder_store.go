package automation

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"
)

const (
	recorderRecordingFormatVersion       = "opendesk.recorder.recording/v2"
	recorderLegacyRecordingFormatVersion = "opendesk.recorder.recording/v1"
	recorderRawEventFormatVersion        = "opendesk.recorder.raw-event/v2"
	recorderLegacyRawEventFormatVersion  = "opendesk.recorder.raw-event/v1"
	recorderWriterFlushInterval          = 250 * time.Millisecond
)

type recorderFile interface {
	io.Writer
	Sync() error
	Close() error
}

type recorderFileFactory func(string, int, os.FileMode) (recorderFile, error)
type recorderManifestWriter func(string, any) error

type recorderWriter struct {
	recordingID  string
	recordingDir string
	rawPath      string
	manifestPath string
	rawRelative  string

	file          recorderFile
	buffer        *bufio.Writer
	manifest      recorderManifest
	writeManifest recorderManifestWriter
}

type recorderWriterResult struct {
	State     string
	RawFile   string
	RawSHA256 string
	RawBytes  int64
	Err       error
}

type recorderManifestFinal struct {
	State           string
	StoppedAt       time.Time
	CutoffSequence  uint64
	Counts          map[string]uint64
	Storage         recorderWriterResult
	InputContexts   []recorderInputContext
	TextEdits       []recorderTextEdit
	KeyStatesAtStop []recorderKeyStateAtStop
	Issues          []recorderIssue
}

func newRecorderID() string {
	var suffix [6]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return fmt.Sprintf("rec-%s-%d", time.Now().UTC().Format("20060102T150405.000000000Z"), time.Now().UnixNano())
	}
	return fmt.Sprintf("rec-%s-%s", time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(suffix[:]))
}

func newRecorderWriter(workDir, outputDir string, manifest recorderManifest, factory recorderFileFactory) (*recorderWriter, error) {
	const operation = "Recorder.start"
	root := filepath.Join(workDir, ".runtime", "recordings")
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, recorderError(RecorderStorageFailed, operation, "could not create the Recorder storage root", err)
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, recorderError(RecorderStorageFailed, operation, "could not normalize the Recorder storage root", err)
	}
	parent := root
	if strings.TrimSpace(outputDir) != "" {
		parent = outputDir
		if !filepath.IsAbs(parent) {
			parent = filepath.Join(workDir, parent)
		}
		parent, err = filepath.Abs(filepath.Clean(parent))
		if err != nil {
			return nil, recorderError(RecorderInvalidArgument, operation, "outputDir could not be normalized", err)
		}
		if !recorderPathWithin(root, parent) {
			return nil, recorderError(RecorderInvalidArgument, operation, "outputDir must stay within .runtime/recordings", nil)
		}
		if err := recorderRejectSymlinkPath(root, parent); err != nil {
			return nil, recorderError(RecorderInvalidArgument, operation, "outputDir contains a symbolic link", err)
		}
		if err := os.MkdirAll(parent, 0700); err != nil {
			return nil, recorderError(RecorderStorageFailed, operation, "could not create outputDir", err)
		}
	}
	recordingDir := filepath.Join(parent, manifest.RecordingID)
	if !recorderPathWithin(root, recordingDir) {
		return nil, recorderError(RecorderInvalidArgument, operation, "recording directory escaped the allowed root", nil)
	}
	if err := os.Mkdir(recordingDir, 0700); err != nil {
		return nil, recorderError(RecorderStorageFailed, operation, "could not create a unique recording directory", err)
	}
	rawDir := filepath.Join(recordingDir, "raw")
	if err := os.Mkdir(rawDir, 0700); err != nil {
		return nil, recorderError(RecorderStorageFailed, operation, "could not create the raw recording directory", err)
	}
	rawPath := filepath.Join(rawDir, "events.ndjson")
	if factory == nil {
		factory = func(path string, flags int, mode os.FileMode) (recorderFile, error) {
			return os.OpenFile(path, flags, mode)
		}
	}
	file, err := factory(rawPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, recorderError(RecorderStorageFailed, operation, "could not create raw/events.ndjson", err)
	}
	writer := &recorderWriter{
		recordingID: manifest.RecordingID, recordingDir: recordingDir,
		rawPath: rawPath, manifestPath: filepath.Join(recordingDir, "manifest.json"), rawRelative: filepath.Join("raw", "events.ndjson"),
		file: file, buffer: bufio.NewWriterSize(file, 64*1024),
		manifest: manifest, writeManifest: recorderWriteJSONAtomic,
	}
	if err := writer.writeManifest(writer.manifestPath, manifest); err != nil {
		_ = file.Close()
		return nil, recorderError(RecorderStorageFailed, operation, "could not create the initial manifest", err)
	}
	return writer, nil
}

func (w *recorderWriter) markRecording() error {
	if w == nil {
		return fmt.Errorf("recorder writer is nil")
	}
	w.manifest.State = "recording"
	return w.writeManifest(w.manifestPath, w.manifest)
}

func (w *recorderWriter) consume(events <-chan recorderRawEvent, persisted *atomic.Uint64) recorderWriterResult {
	result := recorderWriterResult{State: "saved", RawFile: w.rawPath}
	ticker := time.NewTicker(recorderWriterFlushInterval)
	defer ticker.Stop()
	var firstErr error
	var bufferedEvents uint64
	for {
		select {
		case event, ok := <-events:
			if !ok {
				if err := w.buffer.Flush(); err != nil {
					firstErr = errors.Join(firstErr, fmt.Errorf("flush raw events: %w", err))
				} else {
					persisted.Add(bufferedEvents)
					bufferedEvents = 0
				}
				if err := w.file.Sync(); err != nil {
					firstErr = errors.Join(firstErr, fmt.Errorf("sync raw events: %w", err))
				}
				if err := w.file.Close(); err != nil {
					firstErr = errors.Join(firstErr, fmt.Errorf("close raw events: %w", err))
				}
				result.Err = firstErr
				if firstErr != nil {
					result.State = "partial"
				}
				if info, err := os.Stat(w.rawPath); err != nil {
					result.RawFile = ""
					result.State = "failed"
					result.Err = errors.Join(result.Err, err)
				} else {
					result.RawBytes = info.Size()
					if payload, readErr := recorderReadRegular(w.rawPath, recorderMaxRawBytes); readErr != nil {
						result.State = "partial"
						result.Err = errors.Join(result.Err, readErr)
					} else {
						result.RawSHA256 = recorderSHA256(payload)
					}
				}
				return result
			}
			if firstErr != nil {
				continue
			}
			payload, err := json.Marshal(event)
			if err != nil {
				firstErr = fmt.Errorf("encode raw event: %w", err)
				continue
			}
			payload = append(payload, '\n')
			n, err := w.buffer.Write(payload)
			if err != nil || n != len(payload) {
				firstErr = errors.Join(firstErr, fmt.Errorf("write raw event: wrote %d of %d bytes: %w", n, len(payload), err))
				continue
			}
			bufferedEvents++
		case <-ticker.C:
			if firstErr == nil {
				if err := w.buffer.Flush(); err != nil {
					firstErr = fmt.Errorf("periodic raw flush: %w", err)
				} else {
					persisted.Add(bufferedEvents)
					bufferedEvents = 0
				}
			}
		}
	}
}

func (w *recorderWriter) finishManifest(final recorderManifestFinal) error {
	manifest := w.manifest
	manifest.State = final.State
	manifest.StoppedAt = final.StoppedAt.UTC().Format(time.RFC3339Nano)
	manifest.Cutoff.Sequence = fmt.Sprintf("%d", final.CutoffSequence)
	manifest.Cutoff.Time = final.StoppedAt.UTC().Format(time.RFC3339Nano)
	manifest.Counts.Observed = final.Counts["observed"]
	manifest.Counts.Accepted = final.Counts["accepted"]
	manifest.Counts.Persisted = final.Counts["persisted"]
	manifest.Counts.Filtered = final.Counts["filtered"]
	manifest.Counts.Paused = final.Counts["paused"]
	manifest.Counts.Dropped = final.Counts["dropped"]
	manifest.Counts.Late = final.Counts["late"]
	manifest.Storage.State = final.Storage.State
	manifest.Storage.RawSHA256 = final.Storage.RawSHA256
	manifest.Storage.RawBytes = final.Storage.RawBytes
	manifest.InputContexts = append(make([]recorderInputContext, 0, len(final.InputContexts)), final.InputContexts...)
	manifest.TextEdits = append(make([]recorderTextEdit, 0, len(final.TextEdits)), final.TextEdits...)
	manifest.KeyStatesAtStop = append(make([]recorderKeyStateAtStop, 0, len(final.KeyStatesAtStop)), final.KeyStatesAtStop...)
	if final.Storage.RawFile == "" {
		manifest.Storage.RawFile = ""
	}
	manifest.Issues = append(make([]recorderIssue, 0, len(final.Issues)), final.Issues...)
	return w.writeManifest(w.manifestPath, manifest)
}

func recorderWriteJSONAtomic(path string, value any) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	temp, err := os.CreateTemp(filepath.Dir(path), ".manifest-*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(tempPath)
		}
	}()
	if err := temp.Chmod(0600); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := temp.Write(payload); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	committed = true
	return recorderSyncDirectory(filepath.Dir(path))
}

func recorderSyncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func recorderPathWithin(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative))
}

func recorderRejectSymlinkPath(root, candidate string) error {
	if !recorderPathWithin(root, candidate) {
		return fmt.Errorf("path escaped root")
	}
	current := root
	relative, _ := filepath.Rel(root, candidate)
	if relative == "." {
		return nil
	}
	for _, component := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symbolic link at %s", component)
		}
	}
	return nil
}
