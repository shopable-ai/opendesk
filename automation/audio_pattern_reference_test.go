package automation

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReadAudioPatternReferenceSnapshotBoundsAndObservesContext(t *testing.T) {
	t.Run("limit plus one", func(t *testing.T) {
		content, err := readAudioPatternReferenceSnapshot(context.Background(), strings.NewReader("12345"), 4)
		if err != nil {
			t.Fatal(err)
		}
		if string(content) != "12345" {
			t.Fatalf("bounded snapshot = %q, want limit plus one byte", content)
		}
	})

	t.Run("cancel after a read boundary", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		reader := &audioPatternCancelingReader{cancel: cancel, content: []byte("reference")}
		content, err := readAudioPatternReferenceSnapshot(ctx, reader, 1024)
		if !errors.Is(err, context.Canceled) || content != nil {
			t.Fatalf("canceled snapshot = content:%q error:%v, want nil/context canceled", content, err)
		}
	})

	t.Run("context wins over read error", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		reader := audioPatternReaderFunc(func([]byte) (int, error) {
			cancel()
			return 0, errors.New("private read detail")
		})
		_, err := readAudioPatternReferenceSnapshot(ctx, reader, 1024)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("simultaneous cancellation error = %v, want context canceled", err)
		}
	})

	t.Run("empty reader makes bounded progress failure", func(t *testing.T) {
		reader := audioPatternReaderFunc(func([]byte) (int, error) { return 0, nil })
		_, err := readAudioPatternReferenceSnapshot(context.Background(), reader, 1024)
		if !errors.Is(err, io.ErrNoProgress) {
			t.Fatalf("empty-reader error = %v, want io.ErrNoProgress", err)
		}
	})
}

type audioPatternReaderFunc func([]byte) (int, error)

func (reader audioPatternReaderFunc) Read(buffer []byte) (int, error) { return reader(buffer) }

type audioPatternCancelingReader struct {
	cancel  context.CancelFunc
	content []byte
}

func (reader *audioPatternCancelingReader) Read(buffer []byte) (int, error) {
	read := copy(buffer, reader.content)
	reader.cancel()
	return read, nil
}

func TestLoadAudioPatternReferenceWAVResamplesAndMixesStereo(t *testing.T) {
	workDir := t.TempDir()
	const (
		sourceRate = 24000
		durationMS = 250
	)
	sourceSamples := sourceRate * durationMS / 1000
	left := make([]float64, sourceSamples)
	right := make([]float64, sourceSamples)
	for index := range left {
		phase := 2 * math.Pi * 440 * float64(index) / sourceRate
		left[index] = 0.8 * math.Sin(phase)
		right[index] = -0.2 * math.Sin(phase)
	}
	relativePath := filepath.Join("fixtures", "order.wav")
	writeAudioPatternTestWAV(t, filepath.Join(workDir, relativePath), sourceRate, left, right)

	reference, err := loadAudioPatternReference(context.Background(), workDir, "Audio.watchSound", audioPatternReferenceSpec{
		id:   "order",
		path: relativePath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if reference.id != "order" {
		t.Fatalf("id = %q, want order", reference.id)
	}
	if reference.durationMS != durationMS {
		t.Fatalf("duration = %dms, want %dms", reference.durationMS, durationMS)
	}
	wantSamples := audioPatternCanonicalSampleRate * durationMS / 1000
	if delta := len(reference.samples) - wantSamples; delta < -2 || delta > 2 {
		t.Fatalf("resampled length = %d, want approximately %d", len(reference.samples), wantSamples)
	}
	if !strings.HasPrefix(reference.digest, "sha256:") || len(reference.digest) != len("sha256:")+64 {
		t.Fatalf("digest = %q, want a prefixed SHA-256", reference.digest)
	}

	// The stereo channels are deliberately opposite in polarity. After beep's
	// PCM normalization and channel averaging, the expected RMS is about 0.106;
	// retaining only the left channel would instead be about 0.283.
	var sumSquares float64
	for _, sample := range reference.samples {
		sumSquares += float64(sample) * float64(sample)
	}
	rms := math.Sqrt(sumSquares / float64(len(reference.samples)))
	if rms < 0.095 || rms > 0.115 {
		t.Fatalf("mono RMS = %.4f, want approximately 0.106", rms)
	}
}

func TestLoadAudioPatternReferenceRejectsInvalidInputsWithoutLeakingPaths(t *testing.T) {
	workDir := t.TempDir()
	validSamples := make([]float64, audioPatternMinReferenceSamples)
	validPath := filepath.Join(workDir, "valid.wav")
	writeAudioPatternTestWAV(t, validPath, audioPatternCanonicalSampleRate, validSamples)

	unsupportedPath := filepath.Join(workDir, "order.ogg")
	if err := os.WriteFile(unsupportedPath, []byte("not ogg"), 0o600); err != nil {
		t.Fatal(err)
	}
	corruptPath := filepath.Join(workDir, "corrupt.wav")
	if err := os.WriteFile(corruptPath, []byte("not a wave file"), 0o600); err != nil {
		t.Fatal(err)
	}
	maliciousPath := filepath.Join(workDir, "oversized-chunk.wav")
	malicious := []byte{'R', 'I', 'F', 'F', 12, 0, 0, 0, 'W', 'A', 'V', 'E', 'J', 'U', 'N', 'K', 0xff, 0xff, 0xff, 0xff}
	if err := os.WriteFile(maliciousPath, malicious, 0o600); err != nil {
		t.Fatal(err)
	}
	maliciousMP3Path := filepath.Join(workDir, "oversized-id3.mp3")
	maliciousMP3 := []byte{'I', 'D', '3', 4, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f}
	if err := os.WriteFile(maliciousMP3Path, maliciousMP3, 0o600); err != nil {
		t.Fatal(err)
	}
	validWAV, err := os.ReadFile(validPath)
	if err != nil {
		t.Fatal(err)
	}
	writeMalformedWAV := func(name string, mutate func([]byte)) string {
		t.Helper()
		content := append([]byte(nil), validWAV...)
		mutate(content)
		path := filepath.Join(workDir, name)
		if err := os.WriteFile(path, content, 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	zeroBlockAlignPath := writeMalformedWAV("zero-block-align.wav", func(content []byte) {
		binary.LittleEndian.PutUint16(content[32:34], 0)
	})
	shortBlockAlignPath := writeMalformedWAV("short-block-align.wav", func(content []byte) {
		binary.LittleEndian.PutUint16(content[22:24], 2)
		binary.LittleEndian.PutUint16(content[32:34], 2)
	})
	badByteRatePath := writeMalformedWAV("bad-byte-rate.wav", func(content []byte) {
		binary.LittleEndian.PutUint32(content[28:32], 1)
	})
	badFormatPath := writeMalformedWAV("float-format.wav", func(content []byte) {
		binary.LittleEndian.PutUint16(content[20:22], 3)
	})
	unalignedDataPath := writeMalformedWAV("unaligned-data.wav", func(content []byte) {
		binary.LittleEndian.PutUint32(content[40:44], binary.LittleEndian.Uint32(content[40:44])-1)
	})
	shortPath := filepath.Join(workDir, "short.wav")
	writeAudioPatternTestWAV(t, shortPath, audioPatternCanonicalSampleRate, make([]float64, audioPatternMinReferenceSamples-1))
	largePath := filepath.Join(workDir, "large.wav")
	largeFile, err := os.Create(largePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := largeFile.Truncate(audioPatternMaxReferenceBytes + 1); err != nil {
		_ = largeFile.Close()
		t.Fatal(err)
	}
	if err := largeFile.Close(); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name string
		path string
		code AudioErrorCode
	}{
		{name: "missing relative path", path: filepath.Join("private", "missing.wav"), code: AudioPatternNotFound},
		{name: "unsupported extension", path: filepath.Base(unsupportedPath), code: AudioPatternUnsupportedFormat},
		{name: "corrupt wave", path: filepath.Base(corruptPath), code: AudioPatternInvalidReference},
		{name: "oversized declared wave chunk", path: filepath.Base(maliciousPath), code: AudioPatternInvalidReference},
		{name: "oversized declared ID3 tag", path: filepath.Base(maliciousMP3Path), code: AudioPatternInvalidReference},
		{name: "zero wave block align", path: filepath.Base(zeroBlockAlignPath), code: AudioPatternInvalidReference},
		{name: "short wave block align", path: filepath.Base(shortBlockAlignPath), code: AudioPatternInvalidReference},
		{name: "inconsistent wave byte rate", path: filepath.Base(badByteRatePath), code: AudioPatternInvalidReference},
		{name: "unsupported wave format", path: filepath.Base(badFormatPath), code: AudioPatternInvalidReference},
		{name: "unaligned wave data", path: filepath.Base(unalignedDataPath), code: AudioPatternInvalidReference},
		{name: "too short", path: filepath.Base(shortPath), code: AudioPatternInvalidReference},
		{name: "byte limit", path: filepath.Base(largePath), code: AudioPatternResourceLimit},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := loadAudioPatternReference(context.Background(), workDir, "Audio.watchSound", audioPatternReferenceSpec{id: "order", path: test.path})
			assertAudioPatternTestError(t, err, test.code, workDir)
		})
	}
}

func TestDecodeAudioPatternSnapshotRecoversMalformedDecoderPanic(t *testing.T) {
	path := filepath.Join(t.TempDir(), "zero-block-align.wav")
	writeAudioPatternTestWAV(t, path, audioPatternCanonicalSampleRate, make([]float64, audioPatternMinReferenceSamples))
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	binary.LittleEndian.PutUint16(content[32:34], 0)

	_, err = decodeAudioPatternSnapshot(context.Background(), "Audio.watchSound", ".wav", content)
	assertAudioPatternTestError(t, err, AudioPatternInvalidReference, filepath.Dir(path))
}

func TestAudioPatternReferenceValidationChecksContextDuringFrameAndChunkScans(t *testing.T) {
	t.Run("MP3 frame chain", func(t *testing.T) {
		content := append(
			makeAudioPatternTestMP3Frame(t, audioPatternTestMP3Frame{version: 3, bitrateIndex: 9, size: 417}),
			makeAudioPatternTestMP3Frame(t, audioPatternTestMP3Frame{version: 3, bitrateIndex: 11, size: 626})...,
		)
		ctx := &audioPatternTestDelayedContext{remainingSuccessfulChecks: 1, err: context.Canceled}
		err := validateAudioPatternMP3(ctx, content)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("validation error = %v, want context.Canceled", err)
		}
		if ctx.checks < 2 {
			t.Fatalf("context checks = %d, want a check inside the frame loop", ctx.checks)
		}
	})

	t.Run("WAV chunk chain", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "chunks.wav")
		writeAudioPatternTestWAV(t, path, audioPatternCanonicalSampleRate, make([]float64, audioPatternMinReferenceSamples))
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		ctx := &audioPatternTestDelayedContext{remainingSuccessfulChecks: 1, err: context.DeadlineExceeded}
		err = validateAudioPatternWAV(ctx, bytes.NewReader(content), int64(len(content)))
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("validation error = %v, want context.DeadlineExceeded", err)
		}
		if ctx.checks < 2 {
			t.Fatalf("context checks = %d, want a check inside the chunk loop", ctx.checks)
		}
	})
}

func TestDecodeAudioPatternSnapshotPrioritizesContextErrors(t *testing.T) {
	t.Run("MP3 decode deadline", func(t *testing.T) {
		content, err := os.ReadFile(filepath.Join("..", "public", "ding.mp3"))
		if err != nil {
			t.Fatal(err)
		}
		ctx := &audioPatternTestDelayedContext{remainingSuccessfulChecks: 1, err: context.DeadlineExceeded}
		_, err = decodeAudioPatternSnapshot(ctx, "Audio.watchSound", ".mp3", content)
		assertAudioPatternTestError(t, err, AudioPatternTimeout, "/private/not-present")
	})

	t.Run("WAV decode cancellation", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "cancel.wav")
		writeAudioPatternTestWAV(t, path, audioPatternCanonicalSampleRate, make([]float64, audioPatternMinReferenceSamples))
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		ctx := &audioPatternTestDelayedContext{remainingSuccessfulChecks: 1, err: context.Canceled}
		_, err = decodeAudioPatternSnapshot(ctx, "Audio.watchSound", ".wav", content)
		assertAudioPatternTestError(t, err, AudioPatternCanceled, path)
	})
}

type audioPatternTestDelayedContext struct {
	remainingSuccessfulChecks int
	checks                    int
	err                       error
}

func (*audioPatternTestDelayedContext) Deadline() (time.Time, bool) { return time.Time{}, false }
func (*audioPatternTestDelayedContext) Done() <-chan struct{}       { return nil }
func (*audioPatternTestDelayedContext) Value(interface{}) interface{} {
	return nil
}

func (c *audioPatternTestDelayedContext) Err() error {
	c.checks++
	if c.remainingSuccessfulChecks > 0 {
		c.remainingSuccessfulChecks--
		return nil
	}
	return c.err
}

func TestValidateAudioPatternMP3AcceptsPackagedReferences(t *testing.T) {
	for _, name := range []string{"captcha.mp3", "ding.mp3", "success.mp3", "warn.mp3"} {
		path := filepath.Join("..", "public", name)
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if err := validateAudioPatternMP3(context.Background(), content); err != nil {
			t.Errorf("%s: %v", filepath.Base(path), err)
		}
	}
}

func TestAudioPatternMP3FrameSizeHandlesVersionsAndPadding(t *testing.T) {
	tests := []struct {
		name            string
		version         uint32
		bitrateIndex    int
		sampleRateIndex int
		padding         bool
		want            int
	}{
		{name: "mpeg1", version: 3, bitrateIndex: 9, sampleRateIndex: 0, want: 417},
		{name: "mpeg1 padded", version: 3, bitrateIndex: 9, sampleRateIndex: 0, padding: true, want: 418},
		{name: "mpeg2", version: 2, bitrateIndex: 4, sampleRateIndex: 1, want: 96},
		{name: "mpeg2 padded byte is retained", version: 2, bitrateIndex: 4, sampleRateIndex: 1, padding: true, want: 97},
		{name: "mpeg2.5", version: 0, bitrateIndex: 4, sampleRateIndex: 1, want: 192},
		{name: "mpeg2.5 padded", version: 0, bitrateIndex: 4, sampleRateIndex: 1, padding: true, want: 193},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			header := audioPatternTestMP3Header(test.version, test.bitrateIndex, test.sampleRateIndex, test.padding)
			got, _, ok := audioPatternMP3FrameSize(header)
			if !ok {
				t.Fatal("frame header was rejected")
			}
			if got != test.want {
				t.Fatalf("frame size = %d, want %d", got, test.want)
			}
		})
	}
}

func TestValidateAudioPatternMP3AcceptsPaddedAndVBRFrameChains(t *testing.T) {
	tests := []struct {
		name   string
		frames []audioPatternTestMP3Frame
	}{
		{
			name: "mpeg1 vbr",
			frames: []audioPatternTestMP3Frame{
				{version: 3, bitrateIndex: 9, size: 417},
				{version: 3, bitrateIndex: 11, padding: true, size: 627},
				{version: 3, bitrateIndex: 5, size: 208},
			},
		},
		{
			name: "mpeg2 padded vbr",
			frames: []audioPatternTestMP3Frame{
				{version: 2, bitrateIndex: 4, sampleRateIndex: 1, padding: true, size: 97},
				{version: 2, bitrateIndex: 7, sampleRateIndex: 1, size: 168},
			},
		},
		{
			name: "mpeg2.5 padded vbr",
			frames: []audioPatternTestMP3Frame{
				{version: 0, bitrateIndex: 4, sampleRateIndex: 1, padding: true, size: 193},
				{version: 0, bitrateIndex: 7, sampleRateIndex: 1, size: 336},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			content := make([]byte, 0)
			for _, frame := range test.frames {
				content = append(content, makeAudioPatternTestMP3Frame(t, frame)...)
			}
			if err := validateAudioPatternMP3(context.Background(), content); err != nil {
				t.Fatal(err)
			}
		})
	}
}

type audioPatternTestMP3Frame struct {
	version         uint32
	bitrateIndex    int
	sampleRateIndex int
	padding         bool
	size            int
}

func makeAudioPatternTestMP3Frame(t *testing.T, frame audioPatternTestMP3Frame) []byte {
	t.Helper()
	if frame.size < 4 {
		t.Fatalf("invalid test frame size %d", frame.size)
	}
	content := make([]byte, frame.size)
	binary.BigEndian.PutUint32(content, audioPatternTestMP3Header(frame.version, frame.bitrateIndex, frame.sampleRateIndex, frame.padding))
	return content
}

func audioPatternTestMP3Header(version uint32, bitrateIndex, sampleRateIndex int, padding bool) uint32 {
	header := uint32(0xffe00000) |
		(version&0x3)<<19 |
		uint32(1)<<17 | // Layer III
		uint32(1)<<16 | // no CRC
		uint32(bitrateIndex&0xf)<<12 |
		uint32(sampleRateIndex&0x3)<<10
	if padding {
		header |= uint32(1) << 9
	}
	return header
}

func TestValidateAudioPatternMP3RejectsJunkWithoutScanningForSync(t *testing.T) {
	content := make([]byte, 1<<20)
	if err := validateAudioPatternMP3(context.Background(), content); err == nil {
		t.Fatal("MP3 validator accepted a megabyte of non-frame junk")
	}
	allocations := testing.AllocsPerRun(20, func() { _ = validateAudioPatternMP3(context.Background(), content) })
	if allocations > 2 {
		t.Fatalf("junk MP3 validation allocations = %.1f, want constant allocation behavior", allocations)
	}
}

func TestLoadAudioPatternReferenceDecodesPackagedMP3Snapshot(t *testing.T) {
	workDir, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	reference, err := loadAudioPatternReference(context.Background(), workDir, "Audio.watchSound", audioPatternReferenceSpec{
		id:   "ding",
		path: filepath.Join("public", "ding.mp3"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(reference.samples) < audioPatternMinReferenceSamples || len(reference.samples) > audioPatternMaxReferenceSamples {
		t.Fatalf("decoded MP3 sample count = %d", len(reference.samples))
	}
	if !strings.HasPrefix(reference.digest, "sha256:") {
		t.Fatalf("decoded MP3 digest = %q", reference.digest)
	}
}

func TestLoadAudioPatternReferenceRejectsDurationBeyondLimit(t *testing.T) {
	workDir := t.TempDir()
	path := filepath.Join(workDir, "too-long.wav")
	writeAudioPatternTestWAV(t, path, audioPatternCanonicalSampleRate, make([]float64, audioPatternMaxReferenceSamples+1))

	_, err := loadAudioPatternReference(context.Background(), workDir, "Audio.watchSound", audioPatternReferenceSpec{id: "order", path: filepath.Base(path)})
	assertAudioPatternTestError(t, err, AudioPatternInvalidReference, workDir)
}

func TestLoadAudioPatternReferencesRejectsDuplicateIDsAndCountLimits(t *testing.T) {
	workDir := t.TempDir()
	path := filepath.Join(workDir, "order.wav")
	writeAudioPatternTestWAV(t, path, audioPatternCanonicalSampleRate, make([]float64, audioPatternMinReferenceSamples))

	t.Run("duplicate ids", func(t *testing.T) {
		_, err := loadAudioPatternReferences(context.Background(), workDir, "Audio.watchSound", []audioPatternReferenceSpec{
			{id: "order", path: filepath.Base(path)},
			{id: "order", path: filepath.Base(path)},
		})
		assertAudioPatternTestError(t, err, AudioInvalidArgument, workDir)
	})

	t.Run("empty", func(t *testing.T) {
		_, err := loadAudioPatternReferences(context.Background(), workDir, "Audio.watchSound", nil)
		assertAudioPatternTestError(t, err, AudioInvalidArgument, workDir)
	})

	t.Run("too many", func(t *testing.T) {
		specs := make([]audioPatternReferenceSpec, audioPatternMaxReferences+1)
		_, err := loadAudioPatternReferences(context.Background(), workDir, "Audio.watchSound", specs)
		assertAudioPatternTestError(t, err, AudioInvalidArgument, workDir)
	})
}

func TestMinAudioPatternReferenceCapacityClampsUntrustedLength(t *testing.T) {
	if got := minAudioPatternReferenceCapacity(math.MaxInt, 1); got != audioPatternMaxReferenceSamples {
		t.Fatalf("capacity = %d, want clamp %d", got, audioPatternMaxReferenceSamples)
	}
	if got := minAudioPatternReferenceCapacity(0, audioPatternCanonicalSampleRate); got != 0 {
		t.Fatalf("zero-length capacity = %d, want 0", got)
	}
}

func assertAudioPatternTestError(t *testing.T, err error, code AudioErrorCode, privatePath string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s error", code)
	}
	var audioErr *AudioError
	if !errors.As(err, &audioErr) {
		t.Fatalf("error type = %T, want *AudioError: %v", err, err)
	}
	if audioErr.Code != code {
		t.Fatalf("error code = %s, want %s: %v", audioErr.Code, code, err)
	}
	if audioErr.Operation != "Audio.watchSound" {
		t.Fatalf("operation = %q, want Audio.watchSound", audioErr.Operation)
	}
	if strings.Contains(err.Error(), privatePath) {
		t.Fatalf("error leaked private absolute path %q: %v", privatePath, err)
	}
}

func writeAudioPatternTestWAV(t *testing.T, path string, sampleRate int, channels ...[]float64) {
	t.Helper()
	if len(channels) == 0 {
		t.Fatal("at least one channel is required")
	}
	sampleCount := len(channels[0])
	for index, channel := range channels {
		if len(channel) != sampleCount {
			t.Fatalf("channel %d has %d samples, want %d", index, len(channel), sampleCount)
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := file.Close(); err != nil {
			t.Errorf("close WAV: %v", err)
		}
	}()

	channelCount := len(channels)
	dataBytes := sampleCount * channelCount * 2
	header := struct {
		RIFF          [4]byte
		FileSize      uint32
		WAVE          [4]byte
		FMT           [4]byte
		FMTSize       uint32
		Format        uint16
		Channels      uint16
		SampleRate    uint32
		ByteRate      uint32
		BlockAlign    uint16
		BitsPerSample uint16
		DATA          [4]byte
		DataSize      uint32
	}{
		RIFF: [4]byte{'R', 'I', 'F', 'F'}, FileSize: uint32(36 + dataBytes),
		WAVE: [4]byte{'W', 'A', 'V', 'E'}, FMT: [4]byte{'f', 'm', 't', ' '}, FMTSize: 16,
		Format: 1, Channels: uint16(channelCount), SampleRate: uint32(sampleRate),
		ByteRate: uint32(sampleRate * channelCount * 2), BlockAlign: uint16(channelCount * 2), BitsPerSample: 16,
		DATA: [4]byte{'d', 'a', 't', 'a'}, DataSize: uint32(dataBytes),
	}
	if err := binary.Write(file, binary.LittleEndian, header); err != nil {
		t.Fatal(err)
	}
	for sampleIndex := 0; sampleIndex < sampleCount; sampleIndex++ {
		for channelIndex := 0; channelIndex < channelCount; channelIndex++ {
			sample := math.Max(-1, math.Min(1, channels[channelIndex][sampleIndex]))
			if err := binary.Write(file, binary.LittleEndian, int16(math.Round(sample*32767))); err != nil {
				t.Fatal(err)
			}
		}
	}
}
