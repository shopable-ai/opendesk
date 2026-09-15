package measurement

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestResultStructuredJSONContainsP0P3Contract(t *testing.T){snapshot,reference:=testContext(t);result,err:=BuildRegionResult(snapshot,reference,Rect{X:-1190,Y:50,Width:100,Height:80});if err!=nil{t.Fatal(err)};data,err:=json.MarshalIndent(result,"","  ");if err!=nil{t.Fatal(err)};text:=string(data);for _,token:=range []string{`"schemaVersion": "desktop-measurement/v1"`,`"measurementKind": "region"`,`"reference"`,`"coordinateSpace"`,`"unit": "logical-unit"`,`"captureMapping"`,`"result"`,`"evidence"`}{if !strings.Contains(text,token){t.Fatalf("structured output missing %s: %s",token,text)}}}

func TestStructuredResultRoundTripRestoresCanonicalGeometry(t *testing.T){snapshot,reference:=testContext(t);original,err:=BuildTwoPointResult(snapshot,reference,Point{X:-1200,Y:40},Point{X:-1197,Y:44});if err!=nil{t.Fatal(err)};data,err:=json.Marshal(original);if err!=nil{t.Fatal(err)};var restored Result;if err:=json.Unmarshal(data,&restored);err!=nil{t.Fatal(err)};if restored.Version!=original.Version||restored.Kind!=original.Kind||restored.TwoPoint==nil||restored.TwoPoint.Distance!=original.TwoPoint.Distance||restored.Snapshot.Mapping!=original.Snapshot.Mapping{t.Fatalf("round trip changed result original=%+v restored=%+v",original,restored)}}

func TestResultUnmarshalAcceptsLegacyRawJSON(t *testing.T){legacy:=`{"version":2,"kind":"region","coordinateSpace":{"screen":"screen-logical","relative":"reference-relative-logical","image":"capture-pixel","ratio":"ratio-0-1"},"snapshot":{"sampledAt":"2026-09-15T00:00:00Z","mapping":{"origin":{"x":0,"y":0},"logicalSize":{"width":100,"height":100},"imageSize":{"width":100,"height":100},"scaleX":1,"scaleY":1,"displayId":"d","displayIndex":1}},"reference":{"type":"manualRegion","bounds":{"x":0,"y":0,"width":100,"height":100}},"region":{"absolute":{"x":10,"y":10,"width":20,"height":20},"center":{"x":20,"y":20},"relative":{"x":10,"y":10,"width":20,"height":20},"edgeDistances":{"left":10,"top":10,"right":70,"bottom":70}}}`;var result Result;if err:=json.Unmarshal([]byte(legacy),&result);err!=nil{t.Fatal(err)};if result.Kind!="region"||result.Region==nil||result.Region.Absolute.Width!=20{t.Fatalf("legacy result=%+v",result)}}
