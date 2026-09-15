package measurement

import(
	"context"
	"reflect"
	"testing"
	"time"
)

type calculatorRepairFixture struct{actualTarget Rect;expectedDisplay string}
func(f *calculatorRepairFixture)RetryFailedStep(_ context.Context,c RepairCandidate)(RepairAttemptOutcome,error){region,ok:=c.ProposedChange.Constraint["region"].(Rect);if !ok{return RepairAttemptOutcome{Pass:false,Message:"repair has no measured region"},nil};inside:=f.actualTarget.X>=region.X&&f.actualTarget.Y>=region.Y&&f.actualTarget.Right()<=region.Right()&&f.actualTarget.Bottom()<=region.Bottom();return RepairAttemptOutcome{Pass:inside,Message:"calculator target resolved inside measured constraint"},nil}
func(f *calculatorRepairFixture)VerifyBusinessResult(_ context.Context,_ RepairCandidate)(RepairAttemptOutcome,error){return RepairAttemptOutcome{Pass:f.expectedDisplay=="660",Message:"calculator display read from UI equals 660"},nil}

func TestCalculatorMeasurementAssistedRepairDoesNotMutateGoldenRecipeBeforeQualification(t *testing.T){
	goldenRecipe:=map[string]any{"stepId":"tap-equals","locator":map[string]any{"text":"=","region":Rect{X:300,Y:500,Width:40,Height:40}},"qualified":true}
	original:=deepCopyMap(goldenRecipe)
	fixture:=&calculatorRepairFixture{actualTarget:Rect{X:360,Y:520,Width:38,Height:38},expectedDisplay:"660"}
	failure:=AutomationFailure{Class:FailureGeometryDrift,StepID:"tap-equals",Message:"semantic target remained '=' but old constrained region no longer contains it",EvidenceRefs:[]string{"measurement/old-evidence.json"}}
	request,err:=NewRepairRequest("calculator-repair",failure,failure.EvidenceRefs,time.Date(2026,9,15,10,0,0,0,time.UTC));if err!=nil{t.Fatal(err)}
	if !reflect.DeepEqual(goldenRecipe,original){t.Fatal("creating repair request mutated golden recipe")}
	newRegion:=Rect{X:350,Y:510,Width:60,Height:60}
	candidate,err:=NewRepairCandidate(request,[]string{"measurement/evidence.json"},ProposedChange{Kind:"constrained-region",Target:"=",Constraint:map[string]any{"region":newRegion},Reason:"new measurement confirms calculator geometry drift while preserving semantic target"},time.Date(2026,9,15,10,1,0,0,time.UTC));if err!=nil{t.Fatal(err)}
	if candidate.Status!=RepairProposed||!reflect.DeepEqual(goldenRecipe,original){t.Fatal("proposed repair must not overwrite golden recipe")}
	qualified,err:=ExecuteRepair(context.Background(),candidate,fixture,fixture,time.Date(2026,9,15,10,2,0,0,time.UTC));if err!=nil{t.Fatal(err)}
	if qualified.Status!=RepairQualified||qualified.Execution==nil||!qualified.Execution.Pass||qualified.Verification==nil||!qualified.Verification.Pass{t.Fatalf("repair=%+v",qualified)}
	if !reflect.DeepEqual(goldenRecipe,original){t.Fatal("qualification API silently mutated golden recipe")}
	// Promotion is an explicit later authoring decision. The workflow only
	// produces a qualified candidate with evidence/history; it never edits JS.
}

func deepCopyMap(input map[string]any)map[string]any{out:=make(map[string]any,len(input));for k,v:=range input{if nested,ok:=v.(map[string]any);ok{out[k]=deepCopyMap(nested)}else{out[k]=v}};return out}
