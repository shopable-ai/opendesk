//go:build darwin || linux

package automation

import (
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestOpenAudioPatternReferenceSymlinkToFIFOWithoutBlocking(t *testing.T) {
	workDir := t.TempDir()
	fifoPath := filepath.Join(workDir, "audio-fifo")
	if err := syscall.Mkfifo(fifoPath, 0o600); err != nil {
		t.Fatal(err)
	}
	referencePath := filepath.Join(workDir, "order.wav")
	if err := os.Symlink(fifoPath, referencePath); err != nil {
		t.Fatal(err)
	}

	type openResult struct {
		file *os.File
		err  error
	}
	result := make(chan openResult, 1)
	go func() {
		file, err := openAudioPatternReference(referencePath)
		result <- openResult{file: file, err: err}
	}()

	select {
	case opened := <-result:
		if opened.err != nil {
			t.Fatal(opened.err)
		}
		defer opened.file.Close()
		info, err := opened.file.Stat()
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode()&os.ModeNamedPipe == 0 {
			t.Fatalf("opened mode = %v, want ModeNamedPipe", info.Mode())
		}
	case <-time.After(2 * time.Second):
		releaseAudioPatternTestFIFOReader(fifoPath)
		t.Fatal("opening a symlink that targets a FIFO blocked")
	}
}

func TestLoadAudioPatternReferenceRejectsSymlinkToFIFOWithoutBlocking(t *testing.T) {
	workDir := t.TempDir()
	fifoPath := filepath.Join(workDir, "audio-fifo")
	if err := syscall.Mkfifo(fifoPath, 0o600); err != nil {
		t.Fatal(err)
	}
	referencePath := filepath.Join(workDir, "order.wav")
	if err := os.Symlink(fifoPath, referencePath); err != nil {
		t.Fatal(err)
	}

	result := make(chan error, 1)
	go func() {
		_, err := loadAudioPatternReference(context.Background(), workDir, "Audio.watchSound", audioPatternReferenceSpec{
			id:   "order",
			path: filepath.Base(referencePath),
		})
		result <- err
	}()

	select {
	case err := <-result:
		assertAudioPatternTestError(t, err, AudioInvalidArgument, workDir)
	case <-time.After(2 * time.Second):
		// Release a reader stuck in a regressed blocking open before failing.
		releaseAudioPatternTestFIFOReader(fifoPath)
		t.Fatal("opening a symlink that now targets a FIFO blocked")
	}
}

func releaseAudioPatternTestFIFOReader(path string) {
	if writer, err := os.OpenFile(path, os.O_WRONLY|syscall.O_NONBLOCK, 0); err == nil {
		_ = writer.Close()
	}
}
