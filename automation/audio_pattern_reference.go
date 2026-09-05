package automation

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
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
	audioPatternReferenceReadBytes  = 64 << 10
	audioPatternMaxEmptyReads       = 100
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
	seenIDs := make(map[string]struct{}, len(specs))
	for index, spec := range specs {
		spec.id = strings.TrimSpace(spec.id)
		if spec.id == "" || len(spec.id) > 128 || strings.ContainsRune(spec.id, '\x00') {
			return nil, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("references[%d].id must be a non-empty string of at most 128 characters", index), nil)
		}
		if _, exists := seenIDs[spec.id]; exists {
			return nil, audioOperationError(operation, AudioInvalidArgument, "reference ids must be unique", nil)
		}
		seenIDs[spec.id] = struct{}{}
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
	if contextErr := ctx.Err(); contextErr != nil {
		return audioPatternReference{}, audioPatternContextError(operation, contextErr)
	}
	file, err := openAudioPatternReference(path)
	if err != nil {
		if contextErr := ctx.Err(); contextErr != nil {
			return audioPatternReference{}, audioPatternContextError(operation, contextErr)
		}
		if os.IsNotExist(err) {
			return audioPatternReference{}, audioOperationError(operation, AudioPatternNotFound, "reference audio file was not found", nil)
		}
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to open reference audio file", nil)
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil {
		if contextErr := ctx.Err(); contextErr != nil {
			return audioPatternReference{}, audioPatternContextError(operation, contextErr)
		}
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to inspect the opened reference audio file", nil)
	}
	if !openedInfo.Mode().IsRegular() {
		return audioPatternReference{}, audioOperationError(operation, AudioInvalidArgument, "reference path must name a regular file", nil)
	}
	if openedInfo.Size() > audioPatternMaxReferenceBytes {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternResourceLimit, "reference audio file exceeds the 16 MiB limit", nil)
	}
	content, err := readAudioPatternReferenceSnapshot(ctx, file, audioPatternMaxReferenceBytes)
	if err != nil {
		if contextErr := ctx.Err(); contextErr != nil {
			return audioPatternReference{}, audioPatternContextError(operation, contextErr)
		}
		return audioPatternReference{}, audioOperationError(operation, AudioBackendFailed, "failed to read reference audio file", nil)
	}
	if err := ctx.Err(); err != nil {
		return audioPatternReference{}, audioPatternContextError(operation, err)
	}
	if int64(len(content)) > audioPatternMaxReferenceBytes {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternResourceLimit, "reference audio file exceeds the configured byte limit", nil)
	}
	if len(content) == 0 {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio file is empty", nil)
	}

	extension := strings.ToLower(filepath.Ext(path))
	reader := bytes.NewReader(content)
	switch extension {
	case ".wav":
		if err := validateAudioPatternWAV(ctx, reader, int64(len(content))); err != nil {
			if contextErr := ctx.Err(); contextErr != nil {
				return audioPatternReference{}, audioPatternContextError(operation, contextErr)
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return audioPatternReference{}, audioPatternContextError(operation, err)
			}
			return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference WAV structure is invalid", nil)
		}
	case ".mp3":
		if err := validateAudioPatternMP3(ctx, content); err != nil {
			if contextErr := ctx.Err(); contextErr != nil {
				return audioPatternReference{}, audioPatternContextError(operation, contextErr)
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return audioPatternReference{}, audioPatternContextError(operation, err)
			}
			return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference MP3 structure is invalid", nil)
		}
	default:
		return audioPatternReference{}, audioOperationError(operation, AudioPatternUnsupportedFormat, "reference audio must be an MP3 or WAV file", nil)
	}

	samples, err := decodeAudioPatternSnapshot(ctx, operation, extension, content)
	if err != nil {
		return audioPatternReference{}, err
	}
	if len(samples) < audioPatternMinReferenceSamples {
		return audioPatternReference{}, audioOperationError(operation, AudioPatternInvalidReference, "reference audio must be at least 100 milliseconds", nil)
	}
	digest := sha256.Sum256(content)

	return audioPatternReference{
		id:         spec.id,
		digest:     "sha256:" + hex.EncodeToString(digest[:]),
		durationMS: int64(math.Round(float64(len(samples)) * float64(time.Second/time.Millisecond) / audioPatternCanonicalSampleRate)),
		samples:    samples,
	}, nil
}

// readAudioPatternReferenceSnapshot bounds memory and checks cancellation at
// every successful read boundary. A context cannot interrupt an individual
// blocking filesystem syscall, so startupTimeoutMs remains a cooperative
// deadline for arbitrary NFS/FUSE paths.
func readAudioPatternReferenceSnapshot(ctx context.Context, reader io.Reader, limit int64) ([]byte, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if reader == nil {
		return nil, errors.New("audio pattern reference reader is nil")
	}
	if limit < 0 || limit == math.MaxInt64 {
		return nil, errors.New("audio pattern reference byte limit is invalid")
	}
	maximum := limit + 1
	initialCapacity := maximum
	if initialCapacity > audioPatternReferenceReadBytes {
		initialCapacity = audioPatternReferenceReadBytes
	}
	content := make([]byte, 0, int(initialCapacity))
	buffer := make([]byte, audioPatternReferenceReadBytes)
	emptyReads := 0
	for int64(len(content)) < maximum {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		remaining := maximum - int64(len(content))
		chunk := buffer
		if remaining < int64(len(chunk)) {
			chunk = chunk[:int(remaining)]
		}
		read, readErr := reader.Read(chunk)
		if read < 0 || read > len(chunk) {
			return nil, errors.New("audio pattern reference reader returned an invalid byte count")
		}
		if read > 0 {
			content = append(content, chunk[:read]...)
			emptyReads = 0
		} else {
			emptyReads++
		}
		// Give cancellation priority when a read returns together with an error.
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return content, nil
			}
			return nil, readErr
		}
		if emptyReads >= audioPatternMaxEmptyReads {
			return nil, io.ErrNoProgress
		}
	}
	return content, nil
}

type audioPatternSnapshotReader struct {
	ctx context.Context
	*bytes.Reader
}

func (r *audioPatternSnapshotReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.Reader.Read(buffer)
}

func (*audioPatternSnapshotReader) Close() error { return nil }

type audioPatternSnapshotReadCloser struct {
	ctx    context.Context
	reader *bytes.Reader
}

func (r *audioPatternSnapshotReadCloser) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

func (*audioPatternSnapshotReadCloser) Close() error { return nil }

func decodeAudioPatternSnapshot(ctx context.Context, operation, extension string, content []byte) (samples []float32, err error) {
	defer func() {
		if recover() != nil {
			samples = nil
			if contextErr := ctx.Err(); contextErr != nil {
				err = audioPatternContextError(operation, contextErr)
			} else {
				err = audioOperationError(operation, AudioPatternInvalidReference, "reference audio decoder rejected malformed input", nil)
			}
		}
	}()
	if contextErr := ctx.Err(); contextErr != nil {
		return nil, audioPatternContextError(operation, contextErr)
	}

	var streamer beep.StreamSeekCloser
	var format beep.Format
	switch extension {
	case ".wav":
		streamer, format, err = wav.Decode(&audioPatternSnapshotReader{ctx: ctx, Reader: bytes.NewReader(content)})
	case ".mp3":
		// Deliberately hide Seek from go-mp3. A seekable input makes that
		// dependency eagerly rescan and index the complete file during startup.
		streamer, format, err = mp3.Decode(&audioPatternSnapshotReadCloser{ctx: ctx, reader: bytes.NewReader(content)})
	default:
		return nil, audioOperationError(operation, AudioPatternUnsupportedFormat, "reference audio must be an MP3 or WAV file", nil)
	}
	if err != nil {
		if contextErr := ctx.Err(); contextErr != nil {
			return nil, audioPatternContextError(operation, contextErr)
		}
		return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio could not be decoded", nil)
	}
	defer streamer.Close()
	if contextErr := ctx.Err(); contextErr != nil {
		return nil, audioPatternContextError(operation, contextErr)
	}
	if format.SampleRate <= 0 {
		return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio has an invalid sample rate", nil)
	}
	var decoded beep.Streamer = streamer
	if int(format.SampleRate) != audioPatternCanonicalSampleRate {
		decoded = beep.Resample(4, format.SampleRate, beep.SampleRate(audioPatternCanonicalSampleRate), decoded)
	}

	samples = make([]float32, 0, minAudioPatternReferenceCapacity(streamer.Len(), int(format.SampleRate)))
	buffer := make([][2]float64, audioPatternDecodeChunkSamples)
	for {
		if err := ctx.Err(); err != nil {
			return nil, audioPatternContextError(operation, err)
		}
		count, ok := decoded.Stream(buffer)
		if contextErr := ctx.Err(); contextErr != nil {
			return nil, audioPatternContextError(operation, contextErr)
		}
		if count < 0 || count > len(buffer) {
			return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference decoder returned an invalid sample count", nil)
		}
		if len(samples)+count > audioPatternMaxReferenceSamples {
			return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio must be at most 10000 milliseconds", nil)
		}
		for index := 0; index < count; index++ {
			mono := (buffer[index][0] + buffer[index][1]) / 2
			if math.IsNaN(mono) || math.IsInf(mono, 0) {
				return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio contains non-finite samples", nil)
			}
			samples = append(samples, float32(mono))
		}
		if !ok {
			break
		}
		if count == 0 {
			return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference decoder made no progress", nil)
		}
	}
	decodeErr := decoded.Err()
	if contextErr := ctx.Err(); contextErr != nil {
		return nil, audioPatternContextError(operation, contextErr)
	}
	if decodeErr != nil {
		return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio decode failed", nil)
	}
	return samples, nil
}

// validateAudioPatternWAV bounds every chunk against the already-bounded file
// before handing it to beep/wav. That decoder allocates unknown and extended
// chunks from header-declared sizes, so malformed sizes must be rejected first.
func validateAudioPatternWAV(ctx context.Context, file io.ReadSeeker, fileSize int64) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if file == nil || fileSize < 12 || fileSize > audioPatternMaxReferenceBytes {
		return errors.New("invalid WAV size")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	defer func() { _, _ = file.Seek(0, io.SeekStart) }()

	var header [12]byte
	if _, err := io.ReadFull(file, header[:]); err != nil {
		return err
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return errors.New("missing RIFF/WAVE header")
	}
	declaredEnd := int64(binary.LittleEndian.Uint32(header[4:8])) + 8
	if declaredEnd < 12 || declaredEnd > fileSize {
		return errors.New("RIFF size exceeds file")
	}

	foundFormat, foundData := false, false
	var blockAlign uint16
	position := int64(12)
	for position+8 <= declaredEnd {
		if err := ctx.Err(); err != nil {
			return err
		}
		var chunkHeader [8]byte
		if _, err := io.ReadFull(file, chunkHeader[:]); err != nil {
			return err
		}
		chunkSize := int64(binary.LittleEndian.Uint32(chunkHeader[4:8]))
		paddedSize := chunkSize
		if paddedSize%2 != 0 {
			paddedSize++
		}
		if chunkSize < 0 || paddedSize < chunkSize || paddedSize > declaredEnd-position-8 {
			return errors.New("WAV chunk exceeds file")
		}
		switch string(chunkHeader[0:4]) {
		case "fmt ":
			// beep/wav supports PCM (16 bytes) and extensible PCM (40 bytes).
			// Keep this deliberately narrow so its decoder never allocates an
			// attacker-controlled extended-format buffer.
			if foundFormat || chunkSize < 16 || chunkSize > 64 {
				return errors.New("invalid WAV format chunk")
			}
			var format [64]byte
			if _, err := io.ReadFull(file, format[:chunkSize]); err != nil {
				return err
			}
			formatType := binary.LittleEndian.Uint16(format[0:2])
			channels := binary.LittleEndian.Uint16(format[2:4])
			sampleRate := binary.LittleEndian.Uint32(format[4:8])
			byteRate := binary.LittleEndian.Uint32(format[8:12])
			blockAlign = binary.LittleEndian.Uint16(format[12:14])
			bitsPerSample := binary.LittleEndian.Uint16(format[14:16])
			if formatType != 1 && formatType != 0xfffe {
				return errors.New("unsupported WAV format")
			}
			if formatType == 0xfffe {
				pcmGUID := [16]byte{1, 0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71}
				if chunkSize < 40 || binary.LittleEndian.Uint16(format[16:18]) < 22 || !bytes.Equal(format[24:40], pcmGUID[:]) {
					return errors.New("invalid extensible PCM format")
				}
			}
			if channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 384000 {
				return errors.New("unsupported WAV channel or sample rate")
			}
			if bitsPerSample != 8 && bitsPerSample != 16 && bitsPerSample != 24 {
				return errors.New("unsupported WAV sample width")
			}
			expectedBlockAlign := channels * (bitsPerSample / 8)
			if blockAlign == 0 || blockAlign != expectedBlockAlign || byteRate != sampleRate*uint32(blockAlign) {
				return errors.New("invalid WAV frame alignment")
			}
			foundFormat = true
		case "data":
			if !foundFormat || foundData {
				return errors.New("invalid WAV data chunk order")
			}
			if blockAlign == 0 || chunkSize%int64(blockAlign) != 0 {
				return errors.New("WAV data is not frame aligned")
			}
			foundData = true
		}
		consumed := int64(0)
		if string(chunkHeader[0:4]) == "fmt " {
			consumed = chunkSize
		}
		if _, err := file.Seek(paddedSize-consumed, io.SeekCurrent); err != nil {
			return err
		}
		position += 8 + paddedSize
		if foundData {
			break
		}
	}
	if !foundFormat || !foundData {
		return errors.New("required WAV chunks are missing")
	}
	return nil
}

// validateAudioPatternMP3 bounds an optional leading ID3v2 tag and requires a
// contiguous chain of Layer III frames. go-mp3 otherwise scans malformed bytes
// one at a time with an allocation per byte, which defeats the startup timeout.
func validateAudioPatternMP3(ctx context.Context, content []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if len(content) == 0 || int64(len(content)) > audioPatternMaxReferenceBytes {
		return errors.New("invalid MP3 size")
	}
	position := 0
	if len(content) >= 3 && string(content[:3]) == "ID3" {
		if len(content) < 10 || content[5]&0x10 != 0 {
			return errors.New("invalid ID3 header")
		}
		for _, value := range content[6:10] {
			if value&0x80 != 0 {
				return errors.New("invalid ID3 synchsafe size")
			}
		}
		tagSize := int64(content[6])<<21 | int64(content[7])<<14 | int64(content[8])<<7 | int64(content[9])
		declaredEnd := int64(10) + tagSize
		if declaredEnd > int64(len(content)) || declaredEnd > audioPatternMaxReferenceBytes {
			return errors.New("ID3 tag exceeds MP3 file")
		}
		position = int(declaredEnd)
	}

	frames := 0
	var streamSignature uint32
	for position < len(content) {
		if err := ctx.Err(); err != nil {
			return err
		}
		remaining := len(content) - position
		if remaining == 128 && string(content[position:position+3]) == "TAG" {
			position = len(content)
			break
		}
		if remaining < 4 {
			return errors.New("truncated MP3 frame header")
		}
		header := binary.BigEndian.Uint32(content[position : position+4])
		frameSize, signature, ok := audioPatternMP3FrameSize(header)
		if !ok || frameSize > remaining {
			return errors.New("invalid MP3 frame chain")
		}
		if frames == 0 {
			streamSignature = signature
		} else if signature != streamSignature {
			return errors.New("MP3 stream format changes between frames")
		}
		position += frameSize
		frames++
	}
	if frames == 0 || position != len(content) {
		return errors.New("MP3 contains no complete audio frames")
	}
	return nil
}

func audioPatternMP3FrameSize(header uint32) (frameSize int, streamSignature uint32, ok bool) {
	if header&0xffe00000 != 0xffe00000 {
		return 0, 0, false
	}
	version := (header >> 19) & 0x3
	layer := (header >> 17) & 0x3
	bitrateIndex := int((header >> 12) & 0xf)
	sampleRateIndex := int((header >> 10) & 0x3)
	emphasis := header & 0x3
	if version == 1 || layer != 1 || bitrateIndex == 0 || bitrateIndex == 15 || sampleRateIndex == 3 || emphasis == 2 {
		return 0, 0, false
	}
	bitrates := [2][16]int{
		{0, 32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000, 160000, 192000, 224000, 256000, 320000},
		{0, 8000, 16000, 24000, 32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000, 144000, 160000},
	}
	sampleRates := [3]int{44100, 48000, 32000}
	bitrateTable := 0
	sampleRateDivisor := 1
	frameCoefficient := 144
	switch version {
	case 3: // MPEG-1
	case 2: // MPEG-2
		bitrateTable = 1
		sampleRateDivisor = 2
		frameCoefficient = 72
	case 0: // MPEG-2.5
		bitrateTable = 1
		sampleRateDivisor = 4
		frameCoefficient = 72
	default:
		return 0, 0, false
	}
	bitrate := bitrates[bitrateTable][bitrateIndex]
	sampleRate := sampleRates[sampleRateIndex] / sampleRateDivisor
	padding := int((header >> 9) & 1)
	// Layer III uses 144 bytes per bit-rate/sample-rate unit for MPEG-1 and
	// 72 for MPEG-2/2.5. Padding is one complete byte and therefore must be
	// added after the division; shifting the whole expression can discard it.
	frameSize = frameCoefficient*bitrate/sampleRate + padding
	if frameSize < 4 {
		return 0, 0, false
	}
	// A VBR stream may change its bit-rate index, padding, channel mode, and
	// ancillary flags from frame to frame. Only the decoding clock/version and
	// layer must remain stable across the contiguous chain.
	streamSignature = header & 0x001e0c00 // version, layer, and sample-rate index
	return frameSize, streamSignature, true
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
				return "", audioOperationError(operation, AudioBackendFailed, "failed to resolve the execution working directory", nil)
			}
			workDir = current
		}
		path = filepath.Join(workDir, path)
	}
	path = filepath.Clean(path)
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
	// Clamp before multiplication so a malformed decoder length cannot overflow
	// this allocation hint. Decode still enforces the hard sample limit.
	if int64(sourceSamples) > int64(audioPatternMaxReferenceSamples)*int64(sourceRate)/audioPatternCanonicalSampleRate {
		return audioPatternMaxReferenceSamples
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
