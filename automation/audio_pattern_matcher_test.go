package automation

import (
	"math"
	"math/rand"
	"testing"
	"time"
)

const audioMatcherTestSampleRate = 8000

func TestAudioPatternMatcherDetectsOneSecondCue(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999999, 0)
	matches := matcher.Push(cue)
	if len(matches) != 1 {
		t.Fatalf("got %d matches, want 1: %#v", len(matches), matches)
	}
	match := matches[0]
	if match.PatternID != "order" || match.StartSample != 0 || match.EndSample != int64(len(cue)) {
		t.Fatalf("unexpected match: %#v", match)
	}
	if match.Confidence < 0.999999 {
		t.Fatalf("confidence = %.9f, want an exact match", match.Confidence)
	}
}

func TestAudioPatternMatcherNormalizesVolumeAndDCOffset(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999, 0)
	scaled := make([]float32, len(cue))
	for index, sample := range cue {
		scaled[index] = sample*0.23 + 0.11
	}
	matches := matcher.Push(scaled)
	if len(matches) != 1 || matches[0].Confidence < 0.999 {
		t.Fatalf("scaled cue mismatch: %#v", matches)
	}
}

func TestAudioPatternMatcherDoesNotMatchNoise(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.90, 0)
	random := rand.New(rand.NewSource(42))
	noise := make([]float32, audioMatcherTestSampleRate*3)
	for index := range noise {
		noise[index] = float32(random.Float64()*2 - 1)
	}
	if matches := matcher.Push(noise); len(matches) != 0 {
		t.Fatalf("noise produced false matches: %#v", matches)
	}
}

func TestAudioPatternMatcherFindsCueAcrossArbitraryChunks(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999999, 0)
	prefix := make([]float32, samplesForMilliseconds(audioMatcherTestSampleRate, audioPatternHopMilliseconds)*2)
	input := append(prefix, cue...)
	chunkSizes := []int{17, 503, 29, 997, 3, 1601, 71, 211}
	position := 0
	var matches []AudioPatternMatch
	for chunk := 0; position < len(input); chunk++ {
		end := min(len(input), position+chunkSizes[chunk%len(chunkSizes)])
		matches = append(matches, matcher.Push(input[position:end])...)
		position = end
	}
	if len(matches) != 1 || matches[0].EndSample != int64(len(input)) {
		t.Fatalf("chunked cue mismatch: %#v", matches)
	}
}

func TestAudioPatternMatcherAppliesPerPatternCooldown(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999999, 1500*time.Millisecond)
	input := append([]float32{}, cue...)
	input = append(input, make([]float32, audioMatcherTestSampleRate/10)...)
	input = append(input, cue...)
	input = append(input, make([]float32, audioMatcherTestSampleRate*6/10)...)
	input = append(input, cue...)
	matches := matcher.Push(input)
	if len(matches) != 2 {
		t.Fatalf("got %d cooldown-filtered matches, want 2: %#v", len(matches), matches)
	}
	if delta := matches[1].EndSample - matches[0].EndSample; delta < int64(audioMatcherTestSampleRate*3/2) {
		t.Fatalf("cooldown delta = %d samples", delta)
	}
}

func TestAudioPatternMatcherStateStaysBounded(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999999, 0)
	matcher.Push(make([]float32, audioMatcherTestSampleRate*10))
	wantFrameSize := samplesForMilliseconds(audioMatcherTestSampleRate, audioPatternFrameMilliseconds)
	if len(matcher.sampleBuffer) != wantFrameSize {
		t.Fatalf("sample ring length = %d, want %d", len(matcher.sampleBuffer), wantFrameSize)
	}
	wantFeatures := 1 + (len(cue)-wantFrameSize)/matcher.extractor.hopSize
	if len(matcher.featureBuffer) != wantFeatures || matcher.totalFeatures < int64(wantFeatures) {
		t.Fatalf("feature ring is not bounded/wrapped: len=%d total=%d", len(matcher.featureBuffer), matcher.totalFeatures)
	}
}

func TestAudioPatternMatcherRejectsPatternBeyondLimits(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	_, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{SampleRate: audioMatcherTestSampleRate, Patterns: []AudioPattern{{ID: "order", Samples: cue}}, Threshold: 0.9, MaxPatternSamples: len(cue) - 1, MaxBufferedSamples: len(cue)})
	if err == nil {
		t.Fatal("matcher accepted a template beyond MaxPatternSamples")
	}
}

func BenchmarkAudioPatternMatcherOneSecondCue48k(b *testing.B) {
	const sampleRate = 48000
	cue := synthesizeAudioMatcherCue(sampleRate)
	matcher, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{SampleRate: sampleRate, Patterns: []AudioPattern{{ID: "order", Samples: cue}}, Threshold: 0.9, Cooldown: time.Second, MaxPatternSamples: len(cue), MaxBufferedSamples: len(cue)})
	if err != nil {
		b.Fatal(err)
	}
	b.SetBytes(int64(len(cue) * 4))
	b.ReportAllocs()
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		matcher.Reset()
		if matches := matcher.Push(cue); len(matches) != 1 {
			b.Fatalf("got %d matches, want 1", len(matches))
		}
	}
}

func newAudioMatcherForTest(t *testing.T, cue []float32, threshold float64, cooldown time.Duration) *AudioPatternMatcher {
	t.Helper()
	matcher, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{SampleRate: audioMatcherTestSampleRate, Patterns: []AudioPattern{{ID: "order", Samples: cue}}, Threshold: threshold, Cooldown: cooldown, MaxPatternSamples: len(cue), MaxBufferedSamples: len(cue)})
	if err != nil {
		t.Fatal(err)
	}
	return matcher
}

func synthesizeAudioMatcherCue(sampleRate int) []float32 {
	frequencies := [...]float64{440, 660, 523.25, 880, 587.33, 783.99, 493.88, 698.46}
	samples := make([]float32, sampleRate)
	fadeSamples := sampleRate / 200
	for index := range samples {
		segment := index * len(frequencies) / len(samples)
		frequency := frequencies[segment]
		timeSeconds := float64(index) / float64(sampleRate)
		envelope := 1.0
		segmentStart := segment * len(samples) / len(frequencies)
		segmentEnd := (segment + 1) * len(samples) / len(frequencies)
		if within := index - segmentStart; within < fadeSamples {
			envelope *= float64(within) / float64(fadeSamples)
		}
		if remaining := segmentEnd - index - 1; remaining < fadeSamples {
			envelope *= float64(remaining) / float64(fadeSamples)
		}
		fundamental := math.Sin(2 * math.Pi * frequency * timeSeconds)
		harmonic := math.Sin(2*math.Pi*frequency*1.5*timeSeconds + 0.37)
		samples[index] = float32(envelope * (0.62*fundamental + 0.24*harmonic))
	}
	return samples
}
