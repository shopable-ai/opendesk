package automation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/faiface/beep"
	"github.com/faiface/beep/mp3"
	"github.com/faiface/beep/wav"
)

const (
	audioPatternCanonicalSampleRate = 48000
	audioPatternMaxReferences       = 16
	audioPatternMaxReferenceBytes   = int64(16 << 20)
	audioPatternMinReferenceSamples = audioPatternCanonicalSampleRate / 10
	audioPatternMaxReferenceSamples = audioPatternCanonicalSampleRate * 10
	audioPatternDecodeChunkSamples  = 4096
)

type audioPatternReferenceSpec struct {
	id   string
	path string
}

type audioPatternReference struct {
	id         string
	digest     string
	durationMS int64
	samples    []float32
}

func loadAudioPatternReferences(ctx context.Context, workDir, operation string, specs []audioPatternReferenceSpec) ([]audioPatternReference, error) {
	if len(specs) == 0 || len(specs) > audioPatternMaxReferences {
		return nil, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("references must contain between 1 and %d items", audioPatternMaxReferences), nil)
	}
	result := make([]audioPatternReference, 0, len(specs))
	for _, spec := range specs {
		if err := ctx.Err(); err != nil {
			return nil, audioPatternContextError(operation, err)
		}
		reference, err := loadAudioPatternReference(ctx, workDir, operation, spec)
		if err != nil {
			return nil, err
		}
		result = append(result, reference)
	}
	return result, nil
}

func loadAudioPatternReference(ctx context.Context, workDir, operation string, spec audioPatternReferenceSpec) (audioPatternReference, error) {
	path, err := resolveAudioPatternReferencePath(workDir, operation, spec.path)
	if err != nil {
		return audioPatternReference{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return audioPatternReference{}, audioOperationError(operation, AudioPatternNotFound, "reference audio file was not found", nil)
		}
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to open reference audio file", err)
	}

	hash := sha256.New()
	if _, err := io.Copy(hash, io.LimitReader(file, audioPatternMaxReferenceBytes+1)); err != nil {
		_ = file.Close()
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to hash reference audio file", err)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		_ = file.Close()
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to rewind reference audio file", err)
	}

	var streamer beep.StreamSeekCloser
	var format beep.Format
	switch strings.ToLower(filepath.Ext(path)) {
	case ".wav":
		streamer, format, err = wav.Decode(file)
	case ".mp3":
		streamer, format, err = mp3.Decode(file)
	default:
		_ = file.Close()
		return audioPatternReference{}, audioOperationError(operation, AudioPatternUnsupportedFormat, "reference audio must be an MP3 or WAV file", nil)
	}
	if err != nil {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio could not be decoded", err)
	}
	defer streamer.Close()

	if format.SampleRate <= 0 {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio has an invalid sample rate", nil)
	}
	var decoded beep.Streamer = streamer
	if int(format.SampleRate) != audioPatternCanonicalSampleRate {
		decoded = beep.Resample(4, format.SampleRate, beep.SampleRate(audioPatternCanonicalSampleRate), decoded)
	}

	samples := make([]float32, 0, minAudioPatternReferenceCapacity(streamer.Len(), int(format.SampleRate)))
	buffer := make([][2]float64, audioPatternDecodeChunkSamples)
	for {
		if err := ctx.Err(); err != nil {
			return audioPatternReference{}, audioPatternContextError(operation, err)
		}
		count, ok := decoded.Stream(buffer)
		if count < 0 || count > len(buffer) {
			return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference decoder returned an invalid sample count", nil)
		}
		if len(samples)+count > audioPatternMaxReferenceSamples {
			return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio must be at most 10000 milliseconds", nil)
		}
		for index := 0; index < count; index++ {
			mono := (buffer[index][0] + buffer[index][1]) / 2
			if math.IsNaN(mono) || math.IsInf(mono, 0) {
				return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio contains non-finite samples", nil)
			}
			samples = append(samples, float32(mono))
		}
		if !ok {
			break
		}
		if count == 0 {
			return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference decoder made no progress", nil)
		}
	}
	if err := decoded.Err(); err != nil {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio decode failed", err)
	}
	if len(samples) < audioPatternMinReferenceSamples {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio must be at least 100 milliseconds", nil)
	}

	return audioPatternReference{
		id:         spec.id,
		digest:     "sha256:" + hex.EncodeToString(hash.Sum(nil)),
		durationMS: int64(math.Round(float64(len(samples)) * float64(time.Second/time.Millisecond) / audioPatternCanonicalSampleRate)),
		samples:    samples,
	}, nil
}

func resolveAudioPatternReferencePath(workDir, operation, input string) (string, error) {
	if input == "" || strings.TrimSpace(input) == "" || strings.ContainsRune(input, '\x00') || len(input) > 4096 {
		return "", audioOperationError(operation, AudioInvalidArgument, "reference path must be a non-empty string without NUL", nil)
	}
	path := input
	if !filepath.IsAbs(path) {
		if workDir == "" {
			current, err := os.Getwd()
			if err != nil {
				return "", audioOperationError(operation, AudioBackendFailed, "failed to resolve the execution working directory", err)
			}
			workDir = current
		}
		path = filepath.Join(workDir, path)
	}
	path = filepath.Clean(path)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", audioOperationError(operation, AudioPatternNotFound, "reference audio file was not found", nil)
		}
		return "", audioOperationError(operation, AudioBackendFailed, "failed to inspect reference audio file", err)
	}
	if info.IsDir() {
		return "", audioOperationError(operation, AudioInvalidArgument, "reference path must name a file", nil)
	}
	if info.Size() > audioPatternMaxReferenceBytes {
		return "", audioOperationError(operation, AudioPatternInvalidReference, "reference audio file exceeds the 16 MiB limit", nil)
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".wav", ".mp3":
		return path, nil
	default:
		return "", audioOperationError(operation, AudioPatternUnsupportedFormat, "reference audio must be an MP3 or WAV file", nil)
	}
}

func minAudioPatternReferenceCapacity(sourceSamples, sourceRate int) int {
	if sourceSamples <= 0 || sourceRate <= 0 {
		return 0
	}
	capacity := int64(sourceSamples) * audioPatternCanonicalSampleRate / int64(sourceRate)
	if capacity <= 0 {
		return 0
	}
	if capacity > audioPatternMaxReferenceSamples {
		return audioPatternMaxReferenceSamples
	}
	return int(capacity)
}
