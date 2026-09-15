package measurement

import (
	"errors"
	"fmt"
	"math"
)

type QualificationPolicy struct {
	ReferenceDriftRatio float64 `json:"referenceDriftRatio"`
	TargetDriftRatio    float64 `json:"targetDriftRatio"`
	PixelChannelDelta   uint8   `json:"pixelChannelDelta"`
}

type QualificationObservation struct {
	Reference   *Reference `json:"reference,omitempty"`
	TargetBounds *Rect     `json:"targetBounds,omitempty"`
	PixelColor  *RGB       `json:"pixelColor,omitempty"`
}

type QualificationCheck struct {
	Name    string `json:"name"`
	Pass    bool   `json:"pass"`
	Message string `json:"message"`
}

type QualificationReport struct {
	Pass   bool                 `json:"pass"`
	Checks []QualificationCheck `json:"checks"`
}

func DefaultQualificationPolicy() QualificationPolicy {
	return QualificationPolicy{ReferenceDriftRatio: 0.08, TargetDriftRatio: 0.12, PixelChannelDelta: 24}
}

func QualifyEvidence(ev MeasurementEvidence, observation QualificationObservation, policy QualificationPolicy) (QualificationReport, error) {
	if err := ValidateEvidence(ev); err != nil { return QualificationReport{}, err }
	if policy.ReferenceDriftRatio < 0 || policy.TargetDriftRatio < 0 || policy.ReferenceDriftRatio > 1 || policy.TargetDriftRatio > 1 { return QualificationReport{}, errors.New("qualification drift ratios must be within 0..1") }
	checks := make([]QualificationCheck, 0, 3)
	if observation.Reference != nil {
		checks = append(checks, qualifyReference(ev.Reference, *observation.Reference, policy.ReferenceDriftRatio))
	}
	if observation.TargetBounds != nil {
		if expected, ok := evidenceTargetBounds(ev.Result); ok { checks = append(checks, qualifyRect("target-geometry", expected, *observation.TargetBounds, ev.Reference.Bounds, policy.TargetDriftRatio)) }
	}
	if observation.PixelColor != nil && ev.Result.Point != nil && ev.Result.Point.Color != nil {
		checks = append(checks, qualifyPixel(*ev.Result.Point.Color, *observation.PixelColor, policy.PixelChannelDelta))
	}
	if len(checks) == 0 { return QualificationReport{}, errors.New("qualification observation does not contain evidence-compatible checks") }
	report := QualificationReport{Pass:true, Checks:checks}; for _, check := range checks { if !check.Pass { report.Pass=false } }
	return report,nil
}

func qualifyReference(expected, actual Reference, tolerance float64) QualificationCheck {
	if expected.Type != actual.Type { return QualificationCheck{Name:"reference",Pass:false,Message:fmt.Sprintf("reference type changed from %s to %s",expected.Type,actual.Type)} }
	if expected.Window != nil {
		if actual.Window == nil { return QualificationCheck{Name:"reference",Pass:false,Message:"window reference disappeared"} }
		if expected.Window.ID != "" && actual.Window.ID != expected.Window.ID { return QualificationCheck{Name:"reference",Pass:false,Message:"window identity changed"} }
		if expected.Window.PID != 0 && actual.Window.PID != expected.Window.PID { return QualificationCheck{Name:"reference",Pass:false,Message:"window process changed"} }
	}
	check:=qualifyRect("reference",expected.Bounds,actual.Bounds,expected.Bounds,tolerance); if check.Pass { check.Message="reference identity and geometry remain plausible" }; return check
}

func qualifyRect(name string, expected, actual, basis Rect, tolerance float64) QualificationCheck {
	if !validRect(actual) || actual.Width < 0 || actual.Height < 0 { return QualificationCheck{Name:name,Pass:false,Message:"observed geometry is invalid"} }
	bw,bh:=math.Max(1,math.Abs(basis.Width)),math.Max(1,math.Abs(basis.Height))
	drift:=math.Max(math.Max(math.Abs(expected.X-actual.X)/bw,math.Abs(expected.Y-actual.Y)/bh),math.Max(math.Abs(expected.Width-actual.Width)/bw,math.Abs(expected.Height-actual.Height)/bh))
	if drift > tolerance { return QualificationCheck{Name:name,Pass:false,Message:fmt.Sprintf("geometry drift %.4f exceeds tolerance %.4f",drift,tolerance)} }
	return QualificationCheck{Name:name,Pass:true,Message:fmt.Sprintf("geometry drift %.4f within tolerance %.4f",drift,tolerance)}
}

func qualifyPixel(expected, actual RGB, tolerance uint8) QualificationCheck {
	maxDelta:=maxInt(absInt(int(expected.R)-int(actual.R)),maxInt(absInt(int(expected.G)-int(actual.G)),absInt(int(expected.B)-int(actual.B))))
	pass:=maxDelta<=int(tolerance); message:=fmt.Sprintf("pixel channel delta %d within tolerance %d",maxDelta,tolerance); if !pass { message=fmt.Sprintf("pixel channel delta %d exceeds tolerance %d",maxDelta,tolerance) }
	return QualificationCheck{Name:"pixel",Pass:pass,Message:message}
}

func evidenceTargetBounds(result Result) (Rect,bool) {
	switch { case result.Region!=nil:return result.Region.Absolute,true; case result.Spacing!=nil:return result.Spacing.Second,true; default:return Rect{},false }
}
func absInt(v int)int{if v<0{return -v};return v}
func maxInt(a,b int)int{if a>b{return a};return b}
