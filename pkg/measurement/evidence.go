package measurement

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"time"
)

const EvidenceVersion = "measurement-evidence/v1"

var evidenceTaskIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

type EvidenceOrigin string
const(
	EvidenceOriginManual EvidenceOrigin="manual"
	EvidenceOriginRecorder EvidenceOrigin="recorder"
	EvidenceOriginAccessibility EvidenceOrigin="accessibility"
	EvidenceOriginUIA EvidenceOrigin="uia"
	EvidenceOriginWindow EvidenceOrigin="window"
	EvidenceOriginCapture EvidenceOrigin="capture"
	EvidenceOriginMeasurement EvidenceOrigin="measurement"
	EvidenceOriginAgent EvidenceOrigin="agent"
)

type EvidenceProvenance struct{
	Measurement EvidenceOrigin `json:"measurement"`
	Reference EvidenceOrigin `json:"reference"`
	Capture EvidenceOrigin `json:"capture"`
	Pixel EvidenceOrigin `json:"pixel,omitempty"`
	Candidate EvidenceOrigin `json:"candidate,omitempty"`
}

type CandidateEvidence struct {ID string `json:"id"`;Title string `json:"title,omitempty"`;PID int64 `json:"pid,omitempty"`;Source string `json:"source"`;Selected bool `json:"selected,omitempty"`;Confirmed bool `json:"confirmed,omitempty"`}
type FrozenPixelEvidence struct {SHA256 string `json:"sha256"`;ImageSize PixelSize `json:"imageSize"`;SnapshotFile string `json:"snapshotFile"`}
type EvidenceConfidence struct {Target float64 `json:"target"`;Geometry float64 `json:"geometry"`;Pixel float64 `json:"pixel"`;Overall float64 `json:"overall"`;Notes []string `json:"notes,omitempty"`}
type MeasurementEvidence struct {Version string `json:"version"`;TaskID string `json:"taskId"`;Source string `json:"source"`;CapturedAt time.Time `json:"capturedAt"`;Result Result `json:"result"`;Mapping CaptureMapping `json:"mapping"`;Reference Reference `json:"reference"`;Candidates []CandidateEvidence `json:"candidates,omitempty"`;FrozenPixels FrozenPixelEvidence `json:"frozenPixels"`;Confidence EvidenceConfidence `json:"confidence"`;Provenance EvidenceProvenance `json:"provenance"`}
type EvidencePaths struct {Directory string;Evidence string;Snapshot string}

func BuildEvidence(taskID,source string,frame CaptureFrame,result Result,frozenPNG []byte,confidence EvidenceConfidence)(MeasurementEvidence,error){
	if err:=validateEvidenceTaskID(taskID);err!=nil{return MeasurementEvidence{},err};if len(frozenPNG)==0{return MeasurementEvidence{},errors.New("measurement evidence requires frozen PNG bytes")}
	hash:=sha256.Sum256(frozenPNG);candidates:=make([]CandidateEvidence,0,len(frame.Targets));for _,target:=range frame.Targets{selected:=target.ID==frame.SelectedTargetID;candidates=append(candidates,CandidateEvidence{ID:target.ID,Title:target.Title,PID:target.PID,Source:"window-enumeration",Selected:selected,Confirmed:selected&&frame.TargetConfirmed})}
	ev:=MeasurementEvidence{Version:EvidenceVersion,TaskID:taskID,Source:strings.TrimSpace(source),CapturedAt:frame.Snapshot.SampledAt,Result:result,Mapping:frame.Snapshot.Mapping,Reference:result.Reference,Candidates:candidates,FrozenPixels:FrozenPixelEvidence{SHA256:hex.EncodeToString(hash[:]),ImageSize:frame.Snapshot.Mapping.ImageSize,SnapshotFile:"snapshot.png"},Confidence:confidence}
	ev.Provenance=deriveEvidenceProvenance(ev)
	if err:=ValidateEvidence(ev);err!=nil{return MeasurementEvidence{},err};return ev,nil
}

func deriveEvidenceProvenance(ev MeasurementEvidence)EvidenceProvenance{
	measurement:=EvidenceOriginMeasurement;source:=strings.ToLower(ev.Source);switch{case strings.Contains(source,"recorder"):measurement=EvidenceOriginRecorder;case strings.Contains(source,"agent"):measurement=EvidenceOriginAgent;case strings.Contains(source,"manual")||strings.Contains(source,"menu")||strings.Contains(source,"human")||strings.Contains(source,"developer"):measurement=EvidenceOriginManual}
	reference:=EvidenceOriginManual;if ev.Reference.Window!=nil{reference=EvidenceOriginWindow};pixel:=EvidenceOrigin("");if ev.Result.Point!=nil&&ev.Result.Point.Color!=nil{pixel=EvidenceOriginCapture};candidate:=EvidenceOrigin("");if len(ev.Candidates)>0{candidate=EvidenceOriginWindow}
	return EvidenceProvenance{Measurement:measurement,Reference:reference,Capture:EvidenceOriginCapture,Pixel:pixel,Candidate:candidate}
}

func ValidateEvidence(ev MeasurementEvidence)error{
	if ev.Version!=EvidenceVersion{return fmt.Errorf("unsupported measurement evidence version %q",ev.Version)};if err:=validateEvidenceTaskID(ev.TaskID);err!=nil{return err};if ev.CapturedAt.IsZero(){return errors.New("measurement evidence capturedAt is required")};if ev.Result.Version!=ResultVersion{return fmt.Errorf("measurement evidence result version = %d, want %d",ev.Result.Version,ResultVersion)}
	if !ev.Result.Snapshot.SampledAt.Equal(ev.CapturedAt){return errors.New("measurement evidence capturedAt diverges from canonical result snapshot")};if !reflect.DeepEqual(ev.Result.Snapshot.Mapping,ev.Mapping){return errors.New("measurement evidence mapping diverges from canonical result mapping")};if !reflect.DeepEqual(ev.Result.Reference,ev.Reference){return errors.New("measurement evidence reference diverges from canonical result reference")};if err:=ev.Reference.Validate();err!=nil{return fmt.Errorf("measurement evidence reference: %w",err)}
	if ev.FrozenPixels.SnapshotFile!="snapshot.png"{return errors.New("measurement evidence snapshot file must be snapshot.png")};if len(ev.FrozenPixels.SHA256)!=64{return errors.New("measurement evidence snapshot SHA-256 is invalid")};if ev.FrozenPixels.ImageSize!=ev.Mapping.ImageSize{return errors.New("measurement evidence frozen image size diverges from capture mapping")}
	for _,score:=range []float64{ev.Confidence.Target,ev.Confidence.Geometry,ev.Confidence.Pixel,ev.Confidence.Overall}{if score<0||score>1{return errors.New("measurement evidence confidence values must be within 0..1")}}
	selected,confirmed:=0,0;for _,candidate:=range ev.Candidates{if strings.TrimSpace(candidate.ID)==""||strings.TrimSpace(candidate.Source)==""{return errors.New("measurement evidence candidate requires id and source")};if candidate.Selected{selected++};if candidate.Confirmed{confirmed++;if !candidate.Selected{return errors.New("measurement evidence confirmed candidate must also be selected")}}};if selected>1||confirmed>1{return errors.New("measurement evidence may contain at most one selected and confirmed candidate")}
	if ev.Provenance.Measurement!=""{if ev.Provenance.Capture!=EvidenceOriginCapture{return errors.New("measurement evidence capture provenance must be capture")};if ev.Reference.Window!=nil&&ev.Provenance.Reference!=EvidenceOriginWindow{return errors.New("window reference provenance must be window")};if ev.Reference.Window==nil&&ev.Provenance.Reference!=EvidenceOriginManual{return errors.New("manual reference provenance must be manual")};if ev.Result.Point!=nil&&ev.Result.Point.Color!=nil&&ev.Provenance.Pixel!=EvidenceOriginCapture{return errors.New("frozen pixel provenance must be capture")}}
	return nil
}

func EvidencePathsForTask(repoRoot,taskID string)(EvidencePaths,error){if err:=validateEvidenceTaskID(taskID);err!=nil{return EvidencePaths{},err};root,err:=filepath.Abs(strings.TrimSpace(repoRoot));if err!=nil||strings.TrimSpace(repoRoot)==""{return EvidencePaths{},errors.New("repository root is required")};dir:=filepath.Join(root,".runtime","automation-authoring",taskID,"measurement");return EvidencePaths{Directory:dir,Evidence:filepath.Join(dir,"evidence.json"),Snapshot:filepath.Join(dir,"snapshot.png")},nil}
func SaveEvidence(repoRoot string,ev MeasurementEvidence,frozenPNG []byte)(EvidencePaths,error){if ev.Provenance.Measurement==""{ev.Provenance=deriveEvidenceProvenance(ev)};if err:=ValidateEvidence(ev);err!=nil{return EvidencePaths{},err};if err:=verifyFrozenPNG(ev,frozenPNG);err!=nil{return EvidencePaths{},err};paths,err:=EvidencePathsForTask(repoRoot,ev.TaskID);if err!=nil{return EvidencePaths{},err};if err:=os.MkdirAll(paths.Directory,0o755);err!=nil{return EvidencePaths{},fmt.Errorf("create measurement evidence directory: %w",err)};data,err:=json.MarshalIndent(ev,"","  ");if err!=nil{return EvidencePaths{},fmt.Errorf("encode measurement evidence: %w",err)};if err:=atomicWrite(paths.Snapshot,frozenPNG,0o600);err!=nil{return EvidencePaths{},err};if err:=atomicWrite(paths.Evidence,append(data,'\n'),0o600);err!=nil{return EvidencePaths{},err};return paths,nil}
func LoadEvidence(repoRoot,taskID string)(MeasurementEvidence,EvidencePaths,error){paths,err:=EvidencePathsForTask(repoRoot,taskID);if err!=nil{return MeasurementEvidence{},EvidencePaths{},err};data,err:=os.ReadFile(paths.Evidence);if err!=nil{return MeasurementEvidence{},paths,fmt.Errorf("read measurement evidence: %w",err)};var ev MeasurementEvidence;if err:=json.Unmarshal(data,&ev);err!=nil{return MeasurementEvidence{},paths,fmt.Errorf("decode measurement evidence: %w",err)};if ev.TaskID!=taskID{return MeasurementEvidence{},paths,errors.New("measurement evidence task id does not match requested task")};if ev.Provenance.Measurement==""{ev.Provenance=deriveEvidenceProvenance(ev)};if err:=ValidateEvidence(ev);err!=nil{return MeasurementEvidence{},paths,err};pngBytes,err:=os.ReadFile(paths.Snapshot);if err!=nil{return MeasurementEvidence{},paths,fmt.Errorf("read measurement evidence snapshot: %w",err)};if err:=verifyFrozenPNG(ev,pngBytes);err!=nil{return MeasurementEvidence{},paths,err};return ev,paths,nil}
func verifyFrozenPNG(ev MeasurementEvidence,frozenPNG []byte)error{hash:=sha256.Sum256(frozenPNG);if hex.EncodeToString(hash[:])!=ev.FrozenPixels.SHA256{return errors.New("measurement evidence snapshot hash mismatch")};img,format,err:=image.Decode(bytes.NewReader(frozenPNG));if err!=nil||format!="png"{return errors.New("measurement evidence snapshot is not a valid PNG")};if img.Bounds().Dx()!=ev.FrozenPixels.ImageSize.Width||img.Bounds().Dy()!=ev.FrozenPixels.ImageSize.Height{return errors.New("measurement evidence snapshot dimensions do not match frozen image size")};return nil}
func validateEvidenceTaskID(taskID string)error{if !evidenceTaskIDPattern.MatchString(strings.TrimSpace(taskID)){return errors.New("measurement evidence task id must be a safe single path segment")};return nil}
func atomicWrite(path string,data []byte,mode os.FileMode)error{tmp:=path+".tmp";if err:=os.WriteFile(tmp,data,mode);err!=nil{return err};if err:=os.Rename(tmp,path);err!=nil{_=os.Remove(tmp);return err};return nil}
