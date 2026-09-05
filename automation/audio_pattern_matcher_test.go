package automation

import (
	"context"
	"errors"
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

func TestAudioPatternMatcherRejectsReferenceBelowMinimumActiveRatio(t *testing.T) {
	reference := make([]float32, audioMatcherTestSampleRate)
	toneSamples := samplesForMilliseconds(audioMatcherTestSampleRate, 40)
	for index := 0; index < toneSamples; index++ {
		sample := float32(math.Sin(2 * math.Pi * 660 * float64(index) / audioMatcherTestSampleRate))
		reference[index] = sample
		reference[len(reference)-toneSamples+index] = sample
	}

	_, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{
		SampleRate:         audioMatcherTestSampleRate,
		Patterns:           []AudioPattern{{ID: "sparse", Samples: reference}},
		Threshold:          0.4,
		MaxPatternSamples:  len(reference),
		MaxBufferedSamples: len(reference),
	})
	if err == nil {
		t.Fatal("matcher accepted a reference below the minimum active-frame ratio")
	}
}

func TestAudioPatternMatcherDoesNotTreatReferenceSilenceAsPositiveEvidence(t *testing.T) {
	reference := make([]float32, samplesForMilliseconds(audioMatcherTestSampleRate, 900))
	toneSamples := samplesForMilliseconds(audioMatcherTestSampleRate, 100)
	for index := 0; index < toneSamples; index++ {
		sample := float32(math.Sin(2 * math.Pi * 660 * float64(index) / audioMatcherTestSampleRate))
		reference[index] = sample
		reference[len(reference)-toneSamples+index] = sample
	}
	matcher := newAudioMatcherForTest(t, reference, 0.4, 0)

	if matches := matcher.Push(make([]float32, len(reference))); len(matches) != 0 {
		t.Fatalf("silent input matched a reference with silent spacing: %#v", matches)
	}
}

func TestAudioPatternMatcherTreatsLowEnergyReferenceDitherAsSilence(t *testing.T) {
	reference := make([]float32, samplesForMilliseconds(audioMatcherTestSampleRate, 900))
	input := make([]float32, len(reference))
	toneSamples := samplesForMilliseconds(audioMatcherTestSampleRate, 120)
	for index := range reference {
		if index < toneSamples || index >= len(reference)-toneSamples {
			seconds := float64(index) / audioMatcherTestSampleRate
			sample := float32(0.7*math.Sin(2*math.Pi*660*seconds) + 0.2*math.Sin(2*math.Pi*990*seconds+0.2))
			reference[index] = sample
			input[index] = sample
			continue
		}
		// This is far below the cue energy but still has a well-formed spectral
		// shape. It must not receive the same weight as an audible frame.
		reference[index] = float32(1e-5 * math.Sin(2*math.Pi*1234*float64(index)/audioMatcherTestSampleRate))
	}

	matcher := newAudioMatcherForTest(t, reference, 0.95, 0)
	matches := matcher.Push(input)
	if len(matches) != 1 || matches[0].Confidence < 0.95 {
		t.Fatalf("low-energy dither dominated reference similarity: %#v", matches)
	}
}

func TestAudioPatternMatcherRejectsShortUsablePatternSpan(t *testing.T) {
	reference := make([]float32, samplesForMilliseconds(audioMatcherTestSampleRate, 200))
	start := samplesForMilliseconds(audioMatcherTestSampleRate, 90)
	end := start + samplesForMilliseconds(audioMatcherTestSampleRate, 20)
	for index := start; index < end; index++ {
		reference[index] = float32(math.Sin(2 * math.Pi * 660 * float64(index) / audioMatcherTestSampleRate))
	}

	_, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{
		SampleRate:         audioMatcherTestSampleRate,
		Patterns:           []AudioPattern{{ID: "burst", Samples: reference}},
		Threshold:          0.8,
		MaxPatternSamples:  len(reference),
		MaxBufferedSamples: len(reference),
	})
	if err == nil {
		t.Fatal("matcher accepted a reference with less than 100ms of usable span")
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

func TestAudioPatternMatcherUsesHysteresisForSustainedCue(t *testing.T) {
	toneSamples := audioMatcherTestSampleRate / 5
	tone := make([]float32, toneSamples)
	for index := range tone {
		tone[index] = float32(math.Sin(2 * math.Pi * 660 * float64(index) / audioMatcherTestSampleRate))
	}
	matcher := newAudioMatcherForTest(t, tone, 0.99, 0)

	continuous := make([]float32, audioMatcherTestSampleRate)
	for index := range continuous {
		continuous[index] = float32(math.Sin(2 * math.Pi * 660 * float64(index) / audioMatcherTestSampleRate))
	}
	if matches := matcher.Push(continuous); len(matches) != 1 {
		t.Fatalf("sustained cue produced %d matches, want one rising-edge match: %#v", len(matches), matches)
	}

	matcher.Push(make([]float32, audioMatcherTestSampleRate/2))
	if matches := matcher.Push(tone); len(matches) != 1 {
		t.Fatalf("cue after release produced %d matches, want 1: %#v", len(matches), matches)
	}
}

func TestSelectAudioPatternMatchesUsesStableWinner(t *testing.T) {
	matches := []AudioPatternMatch{
		{PatternID: "lower", Confidence: 0.91, EndSample: 100},
		{PatternID: "zeta", Confidence: 0.97, EndSample: 100},
		{PatternID: "alpha", Confidence: 0.97, EndSample: 100},
		{PatternID: "later", Confidence: 0.92, EndSample: 200},
	}
	selected := selectAudioPatternMatches(matches)
	if len(selected) != 2 || selected[0].PatternID != "alpha" || selected[1].PatternID != "later" {
		t.Fatalf("unexpected deterministic winners: %#v", selected)
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

func TestAudioPatternMatcherHonorsCanceledPreparationContext(t *testing.T) {
	contextValue, cancel := context.WithCancel(context.Background())
	cancel()
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	_, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{
		Context:            contextValue,
		SampleRate:         audioMatcherTestSampleRate,
		Patterns:           []AudioPattern{{ID: "order", Samples: cue}},
		Threshold:          0.9,
		MaxPatternSamples:  len(cue),
		MaxBufferedSamples: len(cue),
	})
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("matcher preparation error = %v, want context.Canceled", err)
	}
}

func TestAudioPatternMatcherOffsetsRemainMonotonicAfterReset(t *testing.T) {
	cue := synthesizeAudioMatcherCue(audioMatcherTestSampleRate)
	matcher := newAudioMatcherForTest(t, cue, 0.999999, 0)
	prefix := make([]float32, audioMatcherTestSampleRate/2)
	matcher.Push(prefix)
	matcher.Reset()
	matches := matcher.Push(cue)
	if len(matches) != 1 {
		t.Fatalf("got %d matches after reset, want 1: %#v", len(matches), matches)
	}
	if matches[0].StartSample != int64(len(prefix)) || matches[0].EndSample != int64(len(prefix)+len(cue)) {
		t.Fatalf("non-monotonic offsets after reset: %#v", matches[0])
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
