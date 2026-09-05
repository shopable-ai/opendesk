package automation

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
)

const (
	audioPatternFrameMilliseconds           = 20
	audioPatternHopMilliseconds             = 10
	audioPatternBandCount                   = 12
	audioPatternMinimumFrequency            = 80.0
	audioPatternMaximumFrequency            = 12000.0
	audioPatternMinimumActiveRatio          = 0.20
	audioPatternMinimumTemplateMilliseconds = 100
)

// AudioPattern is a named mono PCM template. Samples are copied into spectral
// features by NewAudioPatternMatcher, so callers may reuse the input slice.
type AudioPattern struct {
	ID      string
	Samples []float32
}

// AudioPatternMatcherConfig defines a bounded streaming matcher. Threshold is
// an average frame-similarity value in the interval (0, 1].
// MaxPatternSamples and MaxBufferedSamples are required safety limits; every
// template must fit both.
type AudioPatternMatcherConfig struct {
	Context            context.Context
	SampleRate         int
	Patterns           []AudioPattern
	Threshold          float64
	Cooldown           time.Duration
	MaxPatternSamples  int
	MaxBufferedSamples int
}

// AudioPatternMatch describes a template occurrence in the stream. Sample
// offsets are absolute from the first sample pushed into the matcher and use a
// half-open interval: [StartSample, EndSample).
type AudioPatternMatch struct {
	PatternID   string
	Confidence  float64
	StartSample int64
	EndSample   int64
}

type audioPatternFeature struct {
	bands  [audioPatternBandCount]float64
	energy float64
	active bool
}

type preparedAudioPattern struct {
	id       string
	features []audioPatternFeature

	hasMatch       bool
	lastMatchEnd   int64
	aboveThreshold bool
}

// AudioPatternMatcher compares a stream with fixed spectral templates. PCM is
// reduced to 20 ms FFT log-band frames on a 10 ms hop, then feature sequences
// are compared using average cosine similarity. This avoids waveform phase
// sensitivity and the prohibitive sample-by-template cost of sliding raw PCM
// correlation. Its sample and feature ring buffers never grow with stream
// duration. A matcher is safe for concurrent use, though Push calls are
// processed serially.
type AudioPatternMatcher struct {
	mu sync.Mutex

	sampleRate      int
	threshold       float64
	cooldownSamples int64
	patterns        []preparedAudioPattern
	extractor       *audioPatternFeatureExtractor

	sampleBuffer  []float32
	featureBuffer []audioPatternFeature
	// segmentSamples resets after a capture discontinuity so frames are never
	// assembled across a gap. totalSamples remains monotonic and backs the
	// public offsets, which are measured from the first sample pushed.
	segmentSamples int64
	totalSamples   int64
	totalFeatures  int64
}

// NewAudioPatternMatcher validates and preprocesses reference templates.
// Templates must contain at least 100 ms between their first and last usable
// analysis frames. Constant, silent, and non-finite templates are rejected.
func NewAudioPatternMatcher(config AudioPatternMatcherConfig) (*AudioPatternMatcher, error) {
	ctx := config.Context
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("audio pattern matcher: %w", err)
	}
	if config.SampleRate <= 0 {
		return nil, fmt.Errorf("audio pattern matcher: sample rate must be positive")
	}
	if math.IsNaN(config.Threshold) || math.IsInf(config.Threshold, 0) || config.Threshold <= 0 || config.Threshold > 1 {
		return nil, fmt.Errorf("audio pattern matcher: threshold must be finite and in (0, 1]")
	}
	if config.Cooldown < 0 {
		return nil, fmt.Errorf("audio pattern matcher: cooldown must not be negative")
	}
	if config.MaxPatternSamples <= 0 || config.MaxBufferedSamples <= 0 {
		return nil, fmt.Errorf("audio pattern matcher: sample limits must be positive")
	}
	if len(config.Patterns) == 0 {
		return nil, fmt.Errorf("audio pattern matcher: at least one pattern is required")
	}

	cooldownSamples, err := audioDurationToSamples(config.Cooldown, config.SampleRate)
	if err != nil {
		return nil, fmt.Errorf("audio pattern matcher: %w", err)
	}
	extractor, err := newAudioPatternFeatureExtractor(config.SampleRate)
	if err != nil {
		return nil, fmt.Errorf("audio pattern matcher: %w", err)
	}
	if extractor.frameSize > config.MaxBufferedSamples {
		return nil, fmt.Errorf("audio pattern matcher: analysis frame has %d samples, exceeding max buffered samples %d", extractor.frameSize, config.MaxBufferedSamples)
	}

	patterns := make([]preparedAudioPattern, 0, len(config.Patterns))
	seenIDs := make(map[string]struct{}, len(config.Patterns))
	longestFeatureCount := 0
	for index, pattern := range config.Patterns {
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("audio pattern matcher: %w", err)
		}
		if strings.TrimSpace(pattern.ID) == "" {
			return nil, fmt.Errorf("audio pattern matcher: pattern %d has an empty id", index)
		}
		if _, exists := seenIDs[pattern.ID]; exists {
			return nil, fmt.Errorf("audio pattern matcher: duplicate pattern id %q", pattern.ID)
		}
		seenIDs[pattern.ID] = struct{}{}
		if len(pattern.Samples) < extractor.frameSize {
			return nil, fmt.Errorf("audio pattern matcher: pattern %q needs at least %d samples", pattern.ID, extractor.frameSize)
		}
		if len(pattern.Samples) > config.MaxPatternSamples || len(pattern.Samples) > config.MaxBufferedSamples {
			return nil, fmt.Errorf("audio pattern matcher: pattern %q exceeds configured sample limits", pattern.ID)
		}
		for _, sample := range pattern.Samples {
			value := float64(sample)
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, fmt.Errorf("audio pattern matcher: pattern %q samples must be finite", pattern.ID)
			}
		}
		features, err := extractor.templateFeatures(ctx, pattern.Samples)
		if err != nil {
			return nil, fmt.Errorf("audio pattern matcher: pattern %q: %w", pattern.ID, err)
		}
		patterns = append(patterns, preparedAudioPattern{id: pattern.ID, features: features})
		if len(features) > longestFeatureCount {
			longestFeatureCount = len(features)
		}
	}

	return &AudioPatternMatcher{
		sampleRate:      config.SampleRate,
		threshold:       config.Threshold,
		cooldownSamples: cooldownSamples,
		patterns:        patterns,
		extractor:       extractor,
		sampleBuffer:    make([]float32, extractor.frameSize),
		featureBuffer:   make([]audioPatternFeature, longestFeatureCount),
	}, nil
}

// Push consumes an arbitrary-sized mono float32 PCM chunk and returns matches
// in stream order. Non-finite input samples make their frames ineligible.
func (m *AudioPatternMatcher) Push(samples []float32) []AudioPatternMatch {
	if m == nil || len(samples) == 0 {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	var matches []AudioPatternMatch
	for _, sample := range samples {
		m.sampleBuffer[m.segmentSamples%int64(len(m.sampleBuffer))] = sample
		m.segmentSamples++
		m.totalSamples++
		frameSize, hopSize := int64(m.extractor.frameSize), int64(m.extractor.hopSize)
		if m.segmentSamples < frameSize || (m.segmentSamples-frameSize)%hopSize != 0 {
			continue
		}
		feature := m.extractor.featureFromRing(m.sampleBuffer, m.segmentSamples-frameSize)
		m.featureBuffer[m.totalFeatures%int64(len(m.featureBuffer))] = feature
		m.totalFeatures++

		for index := range m.patterns {
			pattern := &m.patterns[index]
			patternFrames := int64(len(pattern.features))
			if m.totalFeatures < patternFrames {
				continue
			}
			confidence := m.latestFeatureSimilarity(pattern.features)
			if pattern.aboveThreshold {
				// A release threshold prevents one sustained cue from producing a
				// match on every 10 ms analysis hop when cooldown is zero.
				if confidence < m.threshold*0.9 {
					pattern.aboveThreshold = false
				}
				continue
			}
			if confidence < m.threshold {
				continue
			}
			pattern.aboveThreshold = true
			if pattern.hasMatch && m.totalSamples-pattern.lastMatchEnd < m.cooldownSamples {
				continue
			}
			pattern.hasMatch = true
			pattern.lastMatchEnd = m.totalSamples
			span := frameSize + (patternFrames-1)*hopSize
			matches = append(matches, AudioPatternMatch{PatternID: pattern.id, Confidence: confidence, StartSample: m.totalSamples - span, EndSample: m.totalSamples})
		}
	}
	return matches
}

// Reset discards buffered stream data and cooldown state while preserving the
// monotonic public sample offset. Capture backends should call it after a
// dropped-buffer discontinuity.
func (m *AudioPatternMatcher) Reset() {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	clear(m.sampleBuffer)
	clear(m.featureBuffer)
	m.segmentSamples, m.totalFeatures = 0, 0
	for index := range m.patterns {
		m.patterns[index].hasMatch = false
		m.patterns[index].lastMatchEnd = 0
		m.patterns[index].aboveThreshold = false
	}
}

// SampleRate returns the mono PCM sample rate configured for this matcher.
func (m *AudioPatternMatcher) SampleRate() int {
	if m == nil {
		return 0
	}
	return m.sampleRate
}

func (m *AudioPatternMatcher) latestFeatureSimilarity(reference []audioPatternFeature) float64 {
	windowStart := m.totalFeatures - int64(len(reference))
	weightedSimilarity, totalWeight := 0.0, 0.0
	for index, referenceFrame := range reference {
		inputFrame := m.featureBuffer[(windowStart+int64(index))%int64(len(m.featureBuffer))]
		if !referenceFrame.active {
			// Silence is temporal spacing, not positive matching evidence. In
			// particular, long silent references must never match a silent stream.
			continue
		}
		totalWeight++
		if !inputFrame.active {
			continue
		}
		cosine := 0.0
		for band := range referenceFrame.bands {
			cosine += referenceFrame.bands[band] * inputFrame.bands[band]
		}
		if cosine > 1 {
			cosine = 1
		}
		if cosine > 0 {
			weightedSimilarity += cosine
		}
	}
	if totalWeight == 0 {
		return 0
	}
	return math.Min(1, weightedSimilarity/totalWeight)
}

type audioPatternFeatureExtractor struct {
	sampleRate int
	frameSize  int
	hopSize    int
	window     []float64
	bandStart  [audioPatternBandCount]int
	bandEnd    [audioPatternBandCount]int
	real       []float64
	imaginary  []float64
}

func newAudioPatternFeatureExtractor(sampleRate int) (*audioPatternFeatureExtractor, error) {
	frameSize := samplesForMilliseconds(sampleRate, audioPatternFrameMilliseconds)
	hopSize := samplesForMilliseconds(sampleRate, audioPatternHopMilliseconds)
	if frameSize < 16 {
		return nil, fmt.Errorf("sample rate %d is too low for spectral analysis", sampleRate)
	}
	fftSize, err := nextPowerOfTwo(frameSize)
	if err != nil {
		return nil, err
	}
	e := &audioPatternFeatureExtractor{sampleRate: sampleRate, frameSize: frameSize, hopSize: hopSize, window: make([]float64, frameSize), real: make([]float64, fftSize), imaginary: make([]float64, fftSize)}
	for index := range e.window {
		e.window[index] = 0.5 - 0.5*math.Cos(2*math.Pi*float64(index)/float64(frameSize-1))
	}
	minimumBin := max(1, int(math.Ceil(audioPatternMinimumFrequency*float64(fftSize)/float64(sampleRate))))
	maximumFrequency := math.Min(audioPatternMaximumFrequency, float64(sampleRate)*0.5)
	maximumBin := min(fftSize/2, int(math.Floor(maximumFrequency*float64(fftSize)/float64(sampleRate))))
	if maximumBin-minimumBin+1 < audioPatternBandCount {
		return nil, fmt.Errorf("sample rate %d provides too few FFT bins", sampleRate)
	}
	edges := make([]int, audioPatternBandCount+1)
	edges[0], edges[audioPatternBandCount] = minimumBin, maximumBin+1
	logMinimum, logMaximum := math.Log(float64(minimumBin)), math.Log(float64(maximumBin+1))
	for index := 1; index < audioPatternBandCount; index++ {
		edge := int(math.Round(math.Exp(logMinimum + float64(index)/audioPatternBandCount*(logMaximum-logMinimum))))
		edge = max(edge, edges[index-1]+1)
		edge = min(edge, maximumBin+1-(audioPatternBandCount-index))
		edges[index] = edge
	}
	for band := 0; band < audioPatternBandCount; band++ {
		e.bandStart[band], e.bandEnd[band] = edges[band], edges[band+1]
	}
	return e, nil
}

func (e *audioPatternFeatureExtractor) templateFeatures(ctx context.Context, samples []float32) ([]audioPatternFeature, error) {
	features := make([]audioPatternFeature, 0, 1+(len(samples)-e.frameSize)/e.hopSize)
	maximumEnergy := 0.0
	for start := 0; start+e.frameSize <= len(samples); start += e.hopSize {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		feature := e.featureFromSlice(samples[start : start+e.frameSize])
		features = append(features, feature)
		maximumEnergy = math.Max(maximumEnergy, feature.energy)
	}
	if maximumEnergy == 0 || math.IsInf(maximumEnergy, 0) || math.IsNaN(maximumEnergy) {
		return nil, fmt.Errorf("samples contain no usable spectral energy")
	}
	cutoff, firstActive, lastActive := maximumEnergy*1e-8, -1, -1
	activeFrames := 0
	for index := range features {
		feature := &features[index]
		if !feature.active || feature.energy < cutoff {
			// Decoder dither and quantization noise can have a valid spectral
			// shape while carrying negligible energy. Treat it as temporal
			// spacing rather than equal-weight positive matching evidence.
			feature.active = false
			continue
		}
		activeFrames++
		if firstActive < 0 {
			firstActive = index
		}
		lastActive = index
	}
	if firstActive < 0 {
		return nil, fmt.Errorf("samples contain no usable non-silent frames")
	}
	trimmed := make([]audioPatternFeature, lastActive-firstActive+1)
	copy(trimmed, features[firstActive:lastActive+1])
	trimmedSamples := e.frameSize + (len(trimmed)-1)*e.hopSize
	if trimmedSamples < samplesForMilliseconds(e.sampleRate, audioPatternMinimumTemplateMilliseconds) {
		return nil, fmt.Errorf("samples contain less than %d milliseconds of usable pattern span", audioPatternMinimumTemplateMilliseconds)
	}
	if float64(activeFrames)/float64(len(trimmed)) < audioPatternMinimumActiveRatio {
		return nil, fmt.Errorf("samples contain too little active audio for reliable matching")
	}
	return trimmed, nil
}

func (e *audioPatternFeatureExtractor) featureFromSlice(samples []float32) audioPatternFeature {
	mean, valid := 0.0, true
	for index := 0; index < e.frameSize; index++ {
		value := float64(samples[index])
		e.real[index] = value
		if math.IsNaN(value) || math.IsInf(value, 0) {
			valid = false
		} else {
			mean += (value - mean) / float64(index+1)
		}
	}
	return e.finishFeature(mean, valid)
}

func (e *audioPatternFeatureExtractor) featureFromRing(samples []float32, startSample int64) audioPatternFeature {
	mean, valid := 0.0, true
	for index := 0; index < e.frameSize; index++ {
		value := float64(samples[(startSample+int64(index))%int64(len(samples))])
		e.real[index] = value
		if math.IsNaN(value) || math.IsInf(value, 0) {
			valid = false
		} else {
			mean += (value - mean) / float64(index+1)
		}
	}
	return e.finishFeature(mean, valid)
}

func (e *audioPatternFeatureExtractor) finishFeature(mean float64, valid bool) audioPatternFeature {
	for index := 0; index < e.frameSize; index++ {
		e.real[index] = (e.real[index] - mean) * e.window[index]
	}
	clear(e.real[e.frameSize:])
	clear(e.imaginary)
	if !valid {
		return audioPatternFeature{}
	}
	fft(e.real, e.imaginary)
	var powers [audioPatternBandCount]float64
	totalPower := 0.0
	for band := range powers {
		for bin := e.bandStart[band]; bin < e.bandEnd[band]; bin++ {
			powers[band] += e.real[bin]*e.real[bin] + e.imaginary[bin]*e.imaginary[bin]
		}
		powers[band] /= float64(e.bandEnd[band] - e.bandStart[band])
		totalPower += powers[band]
	}
	if totalPower == 0 || math.IsNaN(totalPower) || math.IsInf(totalPower, 0) {
		return audioPatternFeature{}
	}
	feature := audioPatternFeature{energy: totalPower}
	meanLogPower := 0.0
	for band, power := range powers {
		feature.bands[band] = math.Log(power/totalPower + 1e-12)
		meanLogPower += feature.bands[band] / audioPatternBandCount
	}
	normSquared := 0.0
	for band := range feature.bands {
		feature.bands[band] -= meanLogPower
		normSquared += feature.bands[band] * feature.bands[band]
	}
	if normSquared <= 1e-24 || math.IsNaN(normSquared) || math.IsInf(normSquared, 0) {
		return audioPatternFeature{energy: totalPower}
	}
	inverseNorm := 1 / math.Sqrt(normSquared)
	for band := range feature.bands {
		feature.bands[band] *= inverseNorm
	}
	feature.active = true
	return feature
}

func fft(real, imaginary []float64) {
	length := len(real)
	for index, reversed := 1, 0; index < length; index++ {
		bit := length >> 1
		for ; reversed&bit != 0; bit >>= 1 {
			reversed &^= bit
		}
		reversed |= bit
		if index < reversed {
			real[index], real[reversed] = real[reversed], real[index]
			imaginary[index], imaginary[reversed] = imaginary[reversed], imaginary[index]
		}
	}
	for width := 2; width <= length; width <<= 1 {
		angle := -2 * math.Pi / float64(width)
		stepReal, stepImaginary := math.Cos(angle), math.Sin(angle)
		half := width / 2
		for start := 0; start < length; start += width {
			weightReal, weightImaginary := 1.0, 0.0
			for offset := 0; offset < half; offset++ {
				even, odd := start+offset, start+offset+half
				oddReal := weightReal*real[odd] - weightImaginary*imaginary[odd]
				oddImaginary := weightReal*imaginary[odd] + weightImaginary*real[odd]
				real[odd], imaginary[odd] = real[even]-oddReal, imaginary[even]-oddImaginary
				real[even], imaginary[even] = real[even]+oddReal, imaginary[even]+oddImaginary
				nextWeightReal := weightReal*stepReal - weightImaginary*stepImaginary
				weightImaginary = weightReal*stepImaginary + weightImaginary*stepReal
				weightReal = nextWeightReal
			}
		}
	}
}

func samplesForMilliseconds(sampleRate, milliseconds int) int {
	divisor := 1000 / milliseconds
	samples := sampleRate / divisor
	if sampleRate%divisor != 0 {
		samples++
	}
	return samples
}

func nextPowerOfTwo(value int) (int, error) {
	result, maximumInt := 1, int(^uint(0)>>1)
	for result < value {
		if result > maximumInt/2 {
			return 0, fmt.Errorf("analysis frame is too large")
		}
		result <<= 1
	}
	return result, nil
}

func audioDurationToSamples(duration time.Duration, sampleRate int) (int64, error) {
	seconds, remainder, rate := int64(duration/time.Second), int64(duration%time.Second), int64(sampleRate)
	if seconds > math.MaxInt64/rate {
		return 0, fmt.Errorf("cooldown is too large for the sample rate")
	}
	samples := seconds * rate
	if remainder > 0 {
		if rate > math.MaxInt64/remainder {
			return 0, fmt.Errorf("sample rate is too large to convert cooldown")
		}
		fractional := remainder * rate
		fractionalSamples := fractional / int64(time.Second)
		if fractional%int64(time.Second) != 0 {
			fractionalSamples++
		}
		if samples > math.MaxInt64-fractionalSamples {
			return 0, fmt.Errorf("cooldown is too large for the sample rate")
		}
		samples += fractionalSamples
	}
	return samples, nil
}
