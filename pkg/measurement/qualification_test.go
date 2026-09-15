package measurement

import (
	"testing"
)

func TestQualifyEvidenceUsesReferenceGeometryAndPixelAsEvidence(t *testing.T){
	frame,result,pngBytes:=evidenceFixture(t)
	ev,err:=BuildEvidence("qualify-task","recorder",frame,result,pngBytes,EvidenceConfidence{Target:1,Geometry:1,Pixel:1,Overall:1});if err!=nil{t.Fatal(err)}
	actualRef:=ev.Reference
	color:=NewRGB(12,10,8)
	report,err:=QualifyEvidence(ev,QualificationObservation{Reference:&actualRef,PixelColor:&color},DefaultQualificationPolicy());if err!=nil{t.Fatal(err)}
	if !report.Pass||len(report.Checks)!=2{t.Fatalf("report=%+v",report)}
}

func TestQualifyEvidenceRejectsReferenceIdentityAndPixelDrift(t *testing.T){
	frame,result,pngBytes:=evidenceFixture(t)
	ev,err:=BuildEvidence("qualify-drift","agent",frame,result,pngBytes,EvidenceConfidence{Target:1,Geometry:1,Pixel:1,Overall:1});if err!=nil{t.Fatal(err)}
	actualRef:=ev.Reference
	actualRef.Window=&WindowIdentity{ID:"different",PID:99,Title:"Other"}
	color:=NewRGB(255,255,255)
	report,err:=QualifyEvidence(ev,QualificationObservation{Reference:&actualRef,PixelColor:&color},DefaultQualificationPolicy());if err!=nil{t.Fatal(err)}
	if report.Pass{t.Fatalf("drift unexpectedly passed: %+v",report)}
}

func TestQualifyRegionGeometryUsesReferenceRelativeTolerance(t *testing.T){
	frame,_,pngBytes:=evidenceFixture(t)
	result,err:=BuildRegionResult(frame.Snapshot,frame.Reference,Rect{X:30,Y:30,Width:20,Height:10});if err!=nil{t.Fatal(err)}
	ev,err:=BuildEvidence("qualify-region","manual",frame,result,pngBytes,EvidenceConfidence{Target:1,Geometry:1,Pixel:0,Overall:.9});if err!=nil{t.Fatal(err)}
	within:=Rect{X:31,Y:30,Width:20,Height:10}
	report,err:=QualifyEvidence(ev,QualificationObservation{TargetBounds:&within},QualificationPolicy{ReferenceDriftRatio:.08,TargetDriftRatio:.05,PixelChannelDelta:24});if err!=nil{t.Fatal(err)}
	if !report.Pass{t.Fatalf("small drift should pass: %+v",report)}
	outside:=Rect{X:45,Y:30,Width:20,Height:10}
	report,err=QualifyEvidence(ev,QualificationObservation{TargetBounds:&outside},QualificationPolicy{ReferenceDriftRatio:.08,TargetDriftRatio:.05,PixelChannelDelta:24});if err!=nil{t.Fatal(err)}
	if report.Pass{t.Fatalf("large drift should fail: %+v",report)}
}
