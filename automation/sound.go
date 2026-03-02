package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/faiface/beep"
	"github.com/faiface/beep/mp3"
	"github.com/faiface/beep/speaker"
	"github.com/faiface/beep/wav"
)

// Sound provides methods for playing various sound types
type Sound struct {
	defaultSoundsDir string
	publicDir        string
}

// NewSound creates a new Sound instance
// NewSound creates a new Sound instance
func NewSound() *Sound {
	// Get the current executable directory
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}

	// 直接使用 "public" 作为公共目录
	defaultSoundsDir := filepath.Join(filepath.Dir(exe), "sounds")
	publicDir := "public" // 简化公共目录路径

	return &Sound{
		defaultSoundsDir: defaultSoundsDir,
		publicDir:        publicDir,
	}
}

// resolveFilePath resolves the sound file path
func (s *Sound) resolveFilePath(soundPath string) (string, error) {
	// If an absolute path is provided, use it directly
	if filepath.IsAbs(soundPath) {
		return soundPath, nil
	}

	// Possible sound files
	predefinedSounds := map[string]string{
		"success": "public/done.mp3",
		"fail":    "public/fail.mp3",
		"warning": "public/warn.mp3",
		"error":   "public/error.mp3",
		"captcha": "public/captcha.mp3",
	}

	// Check if it's a predefined sound name
	if predefinedName, ok := predefinedSounds[soundPath]; ok {
		soundPath = predefinedName
	}

	// Possible locations to search for the sound file
	possiblePaths := []string{
		// Relative to current working directory
		soundPath,
		// Relative to executable directory
		filepath.Join(s.defaultSoundsDir, soundPath),
		// Relative to current directory
		filepath.Join(".", soundPath),
		// In the public directory
		filepath.Join(s.publicDir, soundPath),
	}

	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("sound file not found: %s", soundPath)
}

// playSound plays a sound file from the given path
func (s *Sound) playSound(soundPath string) error {
	// Resolve the full file path
	fullPath, err := s.resolveFilePath(soundPath)
	if err != nil {
		return err
	}

	// Open the file
	f, err := os.Open(fullPath)
	if err != nil {
		return fmt.Errorf("failed to open sound file: %v", err)
	}
	defer f.Close()

	// Determine file type and decode
	var streamer beep.StreamSeekCloser
	var format beep.Format

	// Decode based on file extension
	ext := filepath.Ext(fullPath)
	switch ext {
	case ".wav":
		streamer, format, err = wav.Decode(f)
	case ".mp3":
		streamer, format, err = mp3.Decode(f)
	default:
		return fmt.Errorf("unsupported sound file format: %s", ext)
	}

	if err != nil {
		return fmt.Errorf("failed to decode sound file: %v", err)
	}
	defer streamer.Close()

	// Initialize speaker (if not already initialized)
	// Note: Use speaker.Init only if it hasn't been initialized before
	if err := speaker.Init(format.SampleRate, format.SampleRate.N(time.Second/10)); err != nil {
		return fmt.Errorf("failed to initialize speaker: %v", err)
	}

	// Play the sound
	done := make(chan bool)
	speaker.Play(beep.Seq(streamer, beep.Callback(func() {
		done <- true
	})))

	// Wait for playback to complete
	<-done

	return nil
}

// PlaySuccess plays a success sound (uses done.mp3)
func (s *Sound) PlaySuccess() error {
	return s.playSound("success")
}

// PlayFail plays a fail sound (uses fail.mp3)
func (s *Sound) PlayFail() error {
	return s.playSound("fail")
}

// PlayWarning plays a warning sound (uses ding.mp3)
func (s *Sound) PlayWarning() error {
	return s.playSound("warning")
}

// PlayError plays an error sound (uses captcha.mp3)
func (s *Sound) PlayError() error {
	return s.playSound("error")
}

func (s *Sound) PlaySound(soundPath string) error {
	return s.playSound(soundPath)
}

func (s *Sound) PlayCaptcha() error {
	return s.playSound("public/captcha.mp3")
}

// Play is an alias for PlaySound
func (s *Sound) Play(soundPath string) error {
	return s.playSound(soundPath)
}
