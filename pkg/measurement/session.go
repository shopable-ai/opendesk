package measurement

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"opendesk/pkg/customui"
)

const (
	WindowID       = "measurement-session"
	previewID      = "measurementPreview"
	overlayID      = "measurementOverlay"
	eventQueueSize = 512
)

type TargetWindow struct { ID string; Title string; PID int64 }

type CaptureFrame struct {
	PNG []byte
	Snapshot Snapshot
	Reference Reference
	Targets []TargetWindow
	SelectedTargetID string
	TargetConfirmed bool
	Restore func(context.Context) error
}

type CaptureAdapter interface { Capture(context.Context, string) (CaptureFrame, error) }
type ClipboardWriter interface { Copy(string) error }

type ServiceOptions struct { Driver customui.Driver; Capture CaptureAdapter; Clipboard ClipboardWriter; BaseDir string; SaveDir string; Now func() time.Time }

type Service struct {
	driver customui.Driver; capture CaptureAdapter; clipboard ClipboardWriter; baseDir string; saveDir string; now func() time.Time
	mu sync.Mutex; active *activeSession; opening chan struct{}; assetID atomic.Uint64; sessionID atomic.Uint64
}

type activeSession struct {
	service *Service; session *customui.Session; events chan customui.Event; done chan struct{}
	surfaceMu sync.RWMutex; window *customui.Window; source string
	frame CaptureFrame; image image.Image; assetPath string; overlayPath string; restore func(context.Context) error
	reference Reference; tool string; outputFormat string; status string; dragStart *Point; twoPointFirst *Point; spacingFirst *Rect; result *Result
	manualPending bool; selectedTarget string; targetConfirmed bool
	closeOnce sync.Once; finishMu sync.Mutex; finishErr error
}

type ServiceCounts struct { Sessions int; Listeners int }

func NewService(options ServiceOptions) (*Service, error) {
	if options.Driver == nil || options.Capture == nil || options.Clipboard == nil { return nil, errors.New("measurement requires UI, capture, and clipboard adapters") }
	baseDir := strings.TrimSpace(options.BaseDir); if baseDir == "" { return nil, errors.New("measurement base directory is required") }
	absolute, err := filepath.Abs(baseDir); if err != nil { return nil, fmt.Errorf("resolve measurement base directory: %w", err) }
	if err := os.MkdirAll(absolute, 0o755); err != nil { return nil, fmt.Errorf("create measurement base directory: %w", err) }
	saveDir := strings.TrimSpace(options.SaveDir); if saveDir == "" { saveDir = filepath.Join(absolute, "results") }
	if options.Now == nil { options.Now = time.Now }
	return &Service{driver: options.Driver, capture: options.Capture, clipboard: options.Clipboard, baseDir: absolute, saveDir: saveDir, now: options.Now}, nil
}

func (s *Service) Open(ctx context.Context, source string) error {
	if s == nil { return errors.New("measurement service is unavailable") }
	if ctx == nil { ctx = context.Background() }
	for {
		s.mu.Lock()
		if current := s.active; current != nil { s.mu.Unlock(); window := current.currentWindow(); if window == nil { return errors.New("measurement session has no active surface") }; _, err := window.Show(ctx); return err }
		if opening := s.opening; opening != nil { s.mu.Unlock(); select { case <-opening: continue; case <-ctx.Done(): return ctx.Err() } }
		s.opening = make(chan struct{}); opening := s.opening; s.mu.Unlock()
		active, err := s.openNew(ctx, source)
		s.mu.Lock(); if err == nil { s.active = active }; close(opening); s.opening = nil; s.mu.Unlock()
		if err != nil { return err }; go active.run(); return nil
	}
}

func (s *Service) OpenAndWait(ctx context.Context, source string) error {
	if err := s.Open(ctx, source); err != nil { return err }
	s.mu.Lock(); active := s.active; s.mu.Unlock(); if active == nil { return nil }
	select { case <-active.done: return active.finishResult(); case <-ctx.Done(): _ = active.finish(context.Background(), true); return ctx.Err() }
}

func (s *Service) openNew(ctx context.Context, source string) (*activeSession, error) {
	frame, err := s.capture.Capture(ctx, ""); if err != nil { return nil, fmt.Errorf("capture initial desktop snapshot: %w", err) }
	img, assetPath, err := s.prepareFrame(frame); if err != nil { return nil, err }
	active := &activeSession{service:s, events:make(chan customui.Event,eventQueueSize), done:make(chan struct{}), frame:frame, image:img, assetPath:assetPath, restore:frame.Restore, reference:frame.Reference, tool:"point", outputFormat:"concise", status:targetConfirmationInstruction(frame), selectedTarget:frame.SelectedTargetID, targetConfirmed:frame.TargetConfirmed, source:strings.TrimSpace(source)}
	overlayPath, err := active.writeOverlay(); if err != nil { _ = os.Remove(assetPath); return nil, err }; active.overlayPath = overlayPath
	sessionID := "measurement-"+s.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(s.sessionID.Add(1),10)
	session, err := customui.NewSession(sessionID,s.baseDir,s.driver,active.enqueue); if err != nil { _=os.Remove(assetPath); _=os.Remove(overlayPath); return nil,err }; active.session=session
	if err := active.createSurface(ctx); err != nil { _=session.Close(context.Background()); _=os.Remove(assetPath); _=os.Remove(overlayPath); return nil,err }
	return active,nil
}

func (s *Service) prepareFrame(frame CaptureFrame) (image.Image,string,error) {
	if len(frame.PNG)==0 { return nil,"",errors.New("measurement capture returned no PNG data") }
	img,format,err:=image.Decode(bytes.NewReader(frame.PNG)); if err!=nil || format!="png" { return nil,"",fmt.Errorf("decode measurement PNG: %w",err) }
	if img.Bounds().Dx()!=frame.Snapshot.Mapping.ImageSize.Width || img.Bounds().Dy()!=frame.Snapshot.Mapping.ImageSize.Height { return nil,"",errors.New("measurement capture dimensions do not match capture mapping") }
	name:="snapshot-"+s.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(s.assetID.Add(1),10)+".png"; path:=filepath.Join(s.baseDir,name)
	if err:=os.WriteFile(path,frame.PNG,0o600); err!=nil { return nil,"",fmt.Errorf("persist measurement snapshot: %w",err) }; return img,path,nil
}

func (s *Service) Counts() ServiceCounts { s.mu.Lock(); defer s.mu.Unlock(); if s.active==nil { return ServiceCounts{} }; return ServiceCounts{Sessions:1,Listeners:1} }
func (s *Service) Close(ctx context.Context) error { if s==nil{return nil}; s.mu.Lock(); active:=s.active; s.mu.Unlock(); if active==nil{return nil}; return active.finish(ctx,true) }
func (a *activeSession) finishResult() error { a.finishMu.Lock(); defer a.finishMu.Unlock(); return a.finishErr }
func (a *activeSession) currentWindow()*customui.Window{a.surfaceMu.RLock();defer a.surfaceMu.RUnlock();return a.window}
func (a *activeSession) setWindow(w *customui.Window){a.surfaceMu.Lock();a.window=w;a.surfaceMu.Unlock()}

func (a *activeSession) createSurface(ctx context.Context) error { if a.session==nil{return errors.New("measurement UI session is unavailable")}; w,err:=a.session.Create(ctx,measurementWindowSpecState(a));if err!=nil{return err};if _,err=w.Show(ctx);err!=nil{_,_=w.Close(context.Background());return err};a.setWindow(w);return nil }

func (a *activeSession) enqueue(event customui.Event){if event.Type=="measurement.pointermove"{select{case a.events<-event:default:};return};select{case a.events<-event:case <-a.done:}}
func (a *activeSession) run(){for{select{case event:=<-a.events:if event.Type=="close"{current:=a.currentWindow();if current==nil||event.WindowID==current.ID(){_=a.finish(context.Background(),false);return};continue};ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);_=a.handle(ctx,event);cancel();case <-a.done:return}}}

func (a *activeSession) handle(ctx context.Context,event customui.Event) error {
	switch event.Type {
	case "click":
		switch event.TargetID {case "confirmTarget":a.targetConfirmed=true;a.status="候选目标已确认：窗口外框作为锁定参照；不会把 Content Bounds 猜作外框。";return a.renderSurface(ctx);case "previousTarget":return a.cycleTarget(ctx,-1);case "nextTarget":return a.cycleTarget(ctx,1);case "refreshSnapshot":return a.refresh(ctx,a.selectedTarget);case "copyResult":return a.copy(ctx);case "saveResult":return a.save(ctx);case "exitMeasurement":return a.finish(ctx,true)}
	case "change","input":
		value,_:=event.Value.(string);switch event.TargetID{case "targetWindow":if value!=""&&value!=a.selectedTarget{return a.refresh(ctx,value)};case "referenceType":if value==string(ReferenceManualRegion){a.manualPending,a.result,a.spacingFirst,a.twoPointFirst=true,nil,nil,nil;a.status="请拖拽一个区域作为锁定参照；不会自动猜测 Content Bounds。";return a.renderSurface(ctx)};return a.restoreWindowReference(ctx);case "measurementTool":if setMeasurementTool(a,value){return a.renderSurface(ctx)};case "outputFormat":if isOutputFormat(value){a.outputFormat=value;return a.renderSurface(ctx)}}
	case "measurement.pointerdown":p,err:=a.logicalPoint(event.Fields);if err!=nil{return err};a.dragStart=&p
	case "measurement.pointerup":p,err:=a.logicalPoint(event.Fields);if err!=nil{return err};return a.completeSelection(ctx,p)
	case "measurement.key":return a.handleKey(ctx,event.Fields)
	};return nil
}

func setMeasurementTool(a *activeSession,value string)bool{if value!="point"&&value!="region"&&value!="twoPoint"&&value!="spacing"{return false};a.tool,a.dragStart,a.twoPointFirst,a.spacingFirst=value,nil,nil,nil;a.status=toolInstruction(value);return true}
func (a *activeSession) restoreWindowReference(ctx context.Context)error{if !a.targetConfirmed{a.status="请先确认当前候选窗口，或继续使用人工参照；不会静默猜测目标。";return a.updateStatus(ctx,a.status)};a.reference,a.manualPending,a.result,a.spacingFirst,a.twoPointFirst=a.frame.Reference,false,nil,nil,nil;a.status="参照已恢复为已确认目标窗口外边界。";return a.renderSurface(ctx)}
func (a *activeSession) logicalPoint(fields map[string]any)(Point,error){u,okU:=numberField(fields,"u");v,okV:=numberField(fields,"v");if !okU||!okV||u<0||u>1||v<0||v>1{return Point{},errors.New("measurement pointer coordinates are invalid")};p:=a.frame.Snapshot.Mapping.ImageSize;return a.frame.Snapshot.Mapping.ImageToLogical(Point{X:u*float64(p.Width),Y:v*float64(p.Height)}),nil}

func (a *activeSession) completeSelection(ctx context.Context,end Point)error{
	start:=end;if a.dragStart!=nil{start=*a.dragStart};a.dragStart=nil;selection:=RectFromPoints(start,end)
	if a.manualPending{if selection.Width<=0||selection.Height<=0{a.status="参照区域必须同时具有正宽度和正高度，请重新拖拽。";return a.updateStatus(ctx,a.status)};a.reference=Reference{Type:ReferenceManualRegion,Bounds:selection};a.manualPending,a.result,a.spacingFirst,a.twoPointFirst=false,nil,nil,nil;a.status="人工参照已锁定；后续测量都使用同一参照，直到用户主动切换。";return a.renderSurface(ctx)}
	if !a.targetConfirmed{a.status="请先确认当前候选窗口，或改用人工参照；不会静默猜测目标。";return a.updateStatus(ctx,a.status)}
	var result Result;var err error
	switch a.tool{case "point":result,err=BuildPointResult(a.frame.Snapshot,a.reference,end,a.image);case "region":if selection.Width<=0||selection.Height<=0{a.status="区域测量需要拖拽出正宽高区域。";return a.updateStatus(ctx,a.status)};result,err=BuildRegionResult(a.frame.Snapshot,a.reference,selection);case "twoPoint":if a.twoPointFirst==nil{first:=end;a.twoPointFirst=&first;a.status="第一点已锁定，请选择第二点。";return a.renderSurface(ctx)};result,err=BuildTwoPointResult(a.frame.Snapshot,a.reference,*a.twoPointFirst,end);a.twoPointFirst=nil;case "spacing":if selection.Width<=0||selection.Height<=0{a.status="两区域测距需要分别拖拽两个正宽高区域。";return a.updateStatus(ctx,a.status)};if a.spacingFirst==nil{first:=selection;a.spacingFirst=&first;a.status="第一个区域已锁定，请拖拽第二个区域。";return a.renderSurface(ctx)};result,err=BuildSpacingResult(a.frame.Snapshot,a.reference,*a.spacingFirst,selection);a.spacingFirst=nil;default:return errors.New("measurement tool is invalid")}
	if err!=nil{a.status="测量失败："+err.Error();return a.updateStatus(ctx,a.status)};a.result=&result;a.status="结果来自同一冻结快照；颜色读取自原始 Capture Pixel。";return a.renderSurface(ctx)
}

func (a *activeSession) handleKey(ctx context.Context,fields map[string]any)error{key,_:=fields["key"].(string);ctrl,_:=fields["ctrl"].(bool);meta,_:=fields["meta"].(bool);shift,_:=fields["shift"].(bool);alt,_:=fields["alt"].(bool);lower:=strings.ToLower(key);switch{case lower=="c"&&(ctrl||meta)&&alt:return a.copyFormat(ctx,"json");case lower=="c"&&(ctrl||meta)&&shift:return a.copyFormat(ctx,"human");case lower=="c"&&(ctrl||meta):return a.copyFormat(ctx,"concise");case key=="Escape":return a.finish(ctx,true);case key=="Tab":d:=1;if shift{d=-1};return a.cycleTarget(ctx,d);case lower=="r":if a.reference.Type==ReferenceManualRegion||a.manualPending{return a.restoreWindowReference(ctx)};a.manualPending,a.result,a.spacingFirst,a.twoPointFirst=true,nil,nil,nil;a.status="请拖拽一个区域作为锁定参照。";return a.renderSurface(ctx);case key=="1"||key=="2"||key=="3"||key=="4":tools:=map[string]string{"1":"point","2":"region","3":"twoPoint","4":"spacing"};if setMeasurementTool(a,tools[key]){return a.renderSurface(ctx)};case strings.HasPrefix(key,"Arrow"):step:=1.0;if shift{step=10};return a.nudge(ctx,key,step);case key=="Enter":if err:=a.copy(ctx);err!=nil{return err};return a.finish(ctx,true)};return nil}

func (a *activeSession) nudge(ctx context.Context,key string,step float64)error{if a.result==nil{a.status="请先完成一个测量结果，再使用方向键微调。";return a.updateStatus(ctx,a.status)};dx,dy:=0.0,0.0;switch key{case "ArrowLeft":dx=-step;case "ArrowRight":dx=step;case "ArrowUp":dy=-step;case "ArrowDown":dy=step};var r Result;var err error;switch{case a.result.Point!=nil:p:=a.result.Point.Absolute;p.X+=dx;p.Y+=dy;r,err=BuildPointResult(a.frame.Snapshot,a.reference,p,a.image);case a.result.Region!=nil:x:=a.result.Region.Absolute;x.X+=dx;x.Y+=dy;r,err=BuildRegionResult(a.frame.Snapshot,a.reference,x);case a.result.TwoPoint!=nil:f,s:=a.result.TwoPoint.First,a.result.TwoPoint.Second;s.X+=dx;s.Y+=dy;r,err=BuildTwoPointResult(a.frame.Snapshot,a.reference,f,s);case a.result.Spacing!=nil:f,s:=a.result.Spacing.First,a.result.Spacing.Second;s.X+=dx;s.Y+=dy;r,err=BuildSpacingResult(a.frame.Snapshot,a.reference,f,s)};if err!=nil{a.status="微调失败："+err.Error();return a.updateStatus(ctx,a.status)};a.result=&r;a.status=fmt.Sprintf("已按屏幕逻辑坐标微调 %.0f logical unit。",step);return a.renderSurface(ctx)}

func (a *activeSession) refresh(ctx context.Context,targetID string)error{w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};oldState,err:=w.State(ctx);if err!=nil{return err};_,_=w.Hide(ctx);frame,err:=a.service.capture.Capture(ctx,targetID);if err!=nil{_,_=w.Show(context.Background());a.status="刷新快照失败："+err.Error();return err};img,assetPath,err:=a.service.prepareFrame(frame);if err!=nil{_,_=w.Show(context.Background());return err};oldFrame,oldImage,oldAsset:=a.frame,a.image,a.assetPath;oldReference,oldTarget:=a.reference,a.selectedTarget;oldResult,oldDrag:=a.result,a.dragStart;oldTwoPoint,oldSpacing,oldManual:=a.twoPointFirst,a.spacingFirst,a.manualPending;oldConfirmed,oldStatus:=a.targetConfirmed,a.status;a.frame,a.image,a.assetPath=frame,img,assetPath;a.reference,a.selectedTarget=frame.Reference,frame.SelectedTargetID;a.result,a.dragStart,a.twoPointFirst,a.spacingFirst,a.manualPending=nil,nil,nil,nil,false;a.targetConfirmed=frame.TargetConfirmed;a.status="已冻结新的干净快照；此前结果已清除。"+targetConfirmationInstruction(frame);m:=frame.Snapshot.Mapping;newBounds:=customui.Bounds{X:m.Origin.X,Y:m.Origin.Y,Width:m.LogicalSize.Width,Height:m.LogicalSize.Height};if _,err=w.SetBounds(ctx,newBounds);err==nil{err=a.renderSurface(ctx)};if err!=nil{a.frame,a.image,a.assetPath=oldFrame,oldImage,oldAsset;a.reference,a.selectedTarget=oldReference,oldTarget;a.result,a.dragStart,a.twoPointFirst,a.spacingFirst,a.manualPending=oldResult,oldDrag,oldTwoPoint,oldSpacing,oldManual;a.targetConfirmed,a.status=oldConfirmed,oldStatus;_=os.Remove(assetPath);_,_=w.SetBounds(context.Background(),oldState.Bounds);_=a.renderSurface(context.Background());_,_=w.Show(context.Background());return err};_=os.Remove(oldAsset);_,err=w.Show(ctx);return err}
func (a *activeSession) cycleTarget(ctx context.Context,direction int)error{if len(a.frame.Targets)<2{a.status="当前没有可切换的其他候选窗口；可选择人工参照。";return a.updateStatus(ctx,a.status)};current:=0;for i,t:=range a.frame.Targets{if t.ID==a.selectedTarget{current=i;break}};next:=(current+direction)%len(a.frame.Targets);if next<0{next+=len(a.frame.Targets)};return a.refresh(ctx,a.frame.Targets[next].ID)}

func (a *activeSession) renderSurface(ctx context.Context)error{w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};newOverlay,err:=a.writeOverlay();if err!=nil{return err};oldOverlay:=a.overlayPath;patches:=[]struct{id string;patch customui.ControlPatch}{{previewID,customui.ControlPatch{Source:stringPtr(filepath.Base(a.assetPath))}},{overlayID,customui.ControlPatch{Source:stringPtr(filepath.Base(newOverlay))}},{"candidateTitle",customui.ControlPatch{Text:stringPtr(selectedTargetTitle(a.frame.Targets,a.selectedTarget))}},{"confirmTarget",customui.ControlPatch{Visible:boolPtr(!a.targetConfirmed)}},{"targetConfirmed",customui.ControlPatch{Visible:boolPtr(a.targetConfirmed)}},{"measurementTool",customui.ControlPatch{Value:a.tool}},{"referenceType",customui.ControlPatch{Value:referenceValue(a)}},{"outputFormat",customui.ControlPatch{Value:a.outputFormat}},{"targetWindow",customui.ControlPatch{Value:a.selectedTarget,Options:targetOptions(a.frame.Targets)}},{"copyResult",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"saveResult",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"measurementHUDValue",customui.ControlPatch{Text:stringPtr(a.conciseResult())}},{"measurementStatus",customui.ControlPatch{Text:stringPtr(a.status)}},{"referenceInfo",customui.ControlPatch{Text:stringPtr(referenceSummary(a.reference))}},{"snapshotInfo",customui.ControlPatch{Text:stringPtr(snapshotSummary(a.frame))}},{"measurementInspectorResult",customui.ControlPatch{Text:stringPtr(a.selectedResult())}},{"measurementHint",customui.ControlPatch{Text:stringPtr(measurementHint(a.source))}}};for _,p:=range patches{if _,err:=w.UpdateControl(ctx,p.id,p.patch);err!=nil{_=os.Remove(newOverlay);return err}};a.overlayPath=newOverlay;if oldOverlay!=""&&oldOverlay!=newOverlay{_=os.Remove(oldOverlay)};return nil}
func (a *activeSession) writeOverlay()(string,error){name:="overlay-"+a.service.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(a.service.assetID.Add(1),10)+".png";path:=filepath.Join(a.service.baseDir,name);if err:=RenderOverlayPNG(path,a.frame.Snapshot.Mapping,a.frame.Reference,a.reference,a.result,a.twoPointFirst,a.spacingFirst);err!=nil{return "",err};return path,nil}
func (a *activeSession) updateStatus(ctx context.Context,message string)error{a.status=message;w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};_,err:=w.UpdateControl(ctx,"measurementStatus",customui.ControlPatch{Text:&message});return err}
func (a *activeSession) copy(ctx context.Context)error{return a.copyFormat(ctx,a.outputFormat)}
func (a *activeSession) copyFormat(ctx context.Context,format string)error{if a.result==nil{return a.updateStatus(ctx,"复制失败：尚无测量结果。")};if !isOutputFormat(format){return a.updateStatus(ctx,"复制失败：未知导出格式。")};outputs,err:=a.result.Outputs();if err!=nil{return a.updateStatus(ctx,"复制失败："+err.Error())};if err:=a.service.clipboard.Copy(outputValue(outputs,format));err!=nil{return a.updateStatus(ctx,"复制失败："+err.Error())};return a.updateStatus(ctx,"已复制"+outputFormatLabel(format)+"结果。")}
func (a *activeSession) save(ctx context.Context)error{if a.result==nil{return a.updateStatus(ctx,"保存失败：尚无测量结果。")};outputs,err:=a.result.Outputs();if err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};if err:=os.MkdirAll(a.service.saveDir,0o755);err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};stamp:=a.service.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(a.service.assetID.Add(1),10);ext:=".txt";if a.outputFormat=="json"{ext=".json"};path:=filepath.Join(a.service.saveDir,"measurement-"+stamp+"-"+a.outputFormat+ext);if err:=os.WriteFile(path,[]byte(outputValue(outputs,a.outputFormat)+"\n"),0o600);err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};return a.updateStatus(ctx,"已保存"+outputFormatLabel(a.outputFormat)+"结果："+path)}
func outputValue(o Outputs,f string)string{switch f{case "human":return o.Human;case "json":return o.JSON;default:return o.Concise}}
func outputFormatLabel(f string)string{switch f{case "human":return "完整中文";case "json":return "结构化 JSON";default:return "简明数值"}}
func isOutputFormat(f string)bool{return f=="concise"||f=="human"||f=="json"}

func (a *activeSession) finish(ctx context.Context,closeWindow bool)error{var result error;a.closeOnce.Do(func(){if closeWindow{if w:=a.currentWindow();w!=nil{_,result=w.Close(ctx)}};if err:=a.session.Close(ctx);result==nil{result=err};if a.restore!=nil{if err:=a.restore(ctx);err!=nil&&result==nil{result=fmt.Errorf("measurement recovery limited: %w",err)}};a.finishMu.Lock();a.finishErr=result;a.finishMu.Unlock();a.service.mu.Lock();if a.service.active==a{a.service.active=nil};a.service.mu.Unlock();close(a.done);_=os.Remove(a.assetPath);_=os.Remove(a.overlayPath)});return result}

func measurementWindowSpec(frame CaptureFrame,assetName,source string)customui.WindowSpec{a:=&activeSession{frame:frame,reference:frame.Reference,assetPath:assetName,overlayPath:"measurement-overlay.png",tool:"point",outputFormat:"concise",status:targetConfirmationInstruction(frame),selectedTarget:frame.SelectedTargetID,targetConfirmed:frame.TargetConfirmed,source:strings.TrimSpace(source)};return measurementWindowSpecState(a)}
func measurementWindowSpecState(a *activeSession)customui.WindowSpec{m:=a.frame.Snapshot.Mapping;return customui.WindowSpec{ID:WindowID,Kind:"measurement",Title:"",Bounds:customui.Bounds{X:m.Origin.X,Y:m.Origin.Y,Width:m.LogicalSize.Width,Height:m.LogicalSize.Height},AlwaysOnTop:true,Theme:"dark",Content:customui.ContentSpec{HTML:measurementHTML(a),CSS:measurementCSS(),BasePath:"."},Measurement:&customui.MeasurementSurfaceSpec{TargetID:previewID}}}

func measurementHTML(a *activeSession)string{disabled:=" disabled";if a.result!=nil{disabled=""};confirmHidden,confirmedHidden:=""," hidden";if a.targetConfirmed{confirmHidden,confirmedHidden=" hidden",""};return `<main id="measurementRoot"><img id="measurementPreview" src="`+html.EscapeString(filepath.Base(a.assetPath))+`"><img id="measurementOverlay" src="`+html.EscapeString(filepath.Base(a.overlayPath))+`"><section id="measurementToolbar"><button id="previousTarget" aria-label="上一个候选">‹</button><span id="candidateTitle">`+html.EscapeString(selectedTargetTitle(a.frame.Targets,a.selectedTarget))+`</span><button id="nextTarget" aria-label="下一个候选">›</button><button id="confirmTarget"`+confirmHidden+`>确认候选</button><span id="targetConfirmed"`+confirmedHidden+`>已确认窗口参照</span><select id="measurementTool" aria-label="测量工具">`+toolOptions(a.tool)+`</select><select id="referenceType" aria-label="参照">`+referenceOptions(a)+`</select><button id="copyResult"`+disabled+`>复制</button><button id="saveResult"`+disabled+`>保存</button><button id="exitMeasurement">退出</button></section><section id="measurementHUD"><strong>桌面测量</strong><p id="measurementHUDValue">`+html.EscapeString(a.conciseResult())+`</p><p id="measurementStatus">`+html.EscapeString(a.status)+`</p><p id="referenceInfo">`+html.EscapeString(referenceSummary(a.reference))+`</p><details><summary>详情</summary><div class="detailsBody"><label>目标<select id="targetWindow">`+targetOptionsHTML(a.frame.Targets,a.selectedTarget)+`</select></label><button id="refreshSnapshot">重新冻结</button><label>导出<select id="outputFormat">`+outputOptions(a.outputFormat)+`</select></label><p id="snapshotInfo">`+html.EscapeString(snapshotSummary(a.frame))+`</p><p id="measurementInspectorResult" class="inspectorResult">`+html.EscapeString(a.selectedResult())+`</p><p id="measurementHint" class="hint">`+html.EscapeString(measurementHint(a.source))+`</p></div></details></section></main>`}
func (a *activeSession) conciseResult()string{if a.result==nil{return "尚无结果"};return a.result.ConciseText()}
func (a *activeSession) selectedResult()string{if a.result==nil{return "尚无结果"};o,err:=a.result.Outputs();if err!=nil{return "结果编码失败："+err.Error()};return outputValue(o,a.outputFormat)}
func selectedTargetTitle(ts []TargetWindow,id string)string{for _,t:=range ts{if t.ID==id{return t.Title}};return "候选窗口不可用"}
func targetConfirmationInstruction(f CaptureFrame)string{if f.TargetConfirmed{return "当前窗口参照已由入口确认："+selectedTargetTitle(f.Targets,f.SelectedTargetID)+"。"};return "当前候选："+selectedTargetTitle(f.Targets,f.SelectedTargetID)+"。请确认窗口外框，或选择人工参照；不会静默猜测 Content Bounds。"}
func toolInstruction(t string)string{switch t{case "region":return "区域：拖拽得到矩形；结果使用冻结快照与当前锁定参照。";case "twoPoint":return "两点距离：依次选择两个点。";case "spacing":return "两区域间距：依次拖拽两个区域。";default:return "取点/取色：点击冻结画面读取绝对、相对与原始 Capture Pixel。"}}
func toolOptions(s string)string{v:=[]struct{value,label string}{{"point","取点/取色"},{"region","区域"},{"twoPoint","两点距离"},{"spacing","两区域间距"}};var b strings.Builder;for _,i:=range v{m:="";if i.value==s{m=" selected"};fmt.Fprintf(&b,`<option value="%s"%s>%s</option>`,i.value,m,i.label)};return b.String()}
func referenceOptions(a *activeSession)string{o,m:="","";if a.reference.Type==ReferenceManualRegion||a.manualPending{m=" selected"}else{o=" selected"};return `<option value="windowOuterBounds"`+o+`>窗口参照</option><option value="manualRegion"`+m+`>人工参照</option>`}
func referenceValue(a *activeSession)string{if a.reference.Type==ReferenceManualRegion||a.manualPending{return string(ReferenceManualRegion)};return string(ReferenceWindowOuter)}
func outputOptions(s string)string{v:=[]struct{value,label string}{{"concise","简明数值"},{"human","完整中文"},{"json","结构化 JSON"}};var b strings.Builder;for _,i:=range v{m:="";if i.value==s{m=" selected"};fmt.Fprintf(&b,`<option value="%s"%s>%s</option>`,i.value,m,i.label)};return b.String()}
func targetOptionsHTML(ts []TargetWindow,s string)string{var b strings.Builder;for _,t:=range ts{m:="";if t.ID==s{m=" selected"};fmt.Fprintf(&b,`<option value="%s"%s>%s</option>`,html.EscapeString(t.ID),m,html.EscapeString(t.Title))};return b.String()}
func targetOptions(ts []TargetWindow)[]customui.SelectOption{o:=make([]customui.SelectOption,0,len(ts));for _,t:=range ts{o=append(o,customui.SelectOption{Value:t.ID,Label:t.Title})};return o}
func measurementCSS()string{return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview,#measurementOverlay{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}#measurementOverlay{pointer-events:none;z-index:4}#measurementToolbar{position:absolute;z-index:12;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;max-width:calc(100vw - 24px);padding:6px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88)}#candidateTitle{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c9d5e2;font-size:11px}#targetConfirmed{color:#9ee9c2;font-size:11px;white-space:nowrap}select,button{height:30px;max-width:190px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px}button{cursor:pointer}button:disabled{opacity:.42;cursor:default}#measurementHUD{position:absolute;z-index:11;right:12px;bottom:12px;width:min(280px,calc(100vw - 24px));max-height:calc(100vh - 78px);padding:10px 11px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);overflow:auto}#measurementHUD strong{font-size:13px}#measurementHUD p{margin:6px 0 0;font-size:11px;line-height:1.42;white-space:pre-wrap}#measurementHUDValue{color:#fff}#measurementStatus{color:#92d2ff}#referenceInfo{color:#ffd479}details{margin-top:8px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px}summary{cursor:pointer;color:#c9d5e2;font-size:11px}.detailsBody{display:flex;flex-direction:column;gap:7px;padding-top:8px}.detailsBody label{display:flex;flex-direction:column;gap:4px;color:#aebccc;font-size:10px}.detailsBody select{width:100%;max-width:none}.inspectorResult{max-height:200px;overflow:auto;white-space:pre-wrap;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#e2ebf5;background:rgba(0,0,0,.28);padding:7px;border-radius:6px}.hint{color:#8290a1!important}`}
func overlayRectStyle(m CaptureMapping,r Rect)string{l:=(r.X-m.Origin.X)/m.LogicalSize.Width*100;t:=(r.Y-m.Origin.Y)/m.LogicalSize.Height*100;rr:=(r.Right()-m.Origin.X)/m.LogicalSize.Width*100;b:=(r.Bottom()-m.Origin.Y)/m.LogicalSize.Height*100;l,t,rr,b=clampPercent(l),clampPercent(t),clampPercent(rr),clampPercent(b);if rr<l{l,rr=rr,l};if b<t{t,b=b,t};return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4f%%;height:%.4f%%",l,t,rr-l,b-t)}
func clampPercent(v float64)float64{if v<0{return 0};if v>100{return 100};return v}
func hudPlacement(m CaptureMapping,r Rect)(string,bool){c:=r.Center();h:="right";if c.X>=m.Origin.X+m.LogicalSize.Width/2{h="left"};v:="bottom";if c.Y>=m.Origin.Y+m.LogicalSize.Height/2{v="top"};limited:=r.Width>=m.LogicalSize.Width*.7||r.Height>=m.LogicalSize.Height*.7;return v+"-"+h,limited}
func referenceSummary(r Reference)string{return fmt.Sprintf("参照 %s · x=%.2f y=%.2f w=%.2f h=%.2f logical",r.Type,r.Bounds.X,r.Bounds.Y,r.Bounds.Width,r.Bounds.Height)}
func snapshotSummary(f CaptureFrame)string{m:=f.Snapshot.Mapping;return fmt.Sprintf("冻结 %s · display=%s/%d · logical %.0fx%.0f · capture %dx%d px · scale %.3fx%.3f",f.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano),m.DisplayID,m.DisplayIndex,m.LogicalSize.Width,m.LogicalSize.Height,m.ImageSize.Width,m.ImageSize.Height,m.ScaleX,m.ScaleY)}
func measurementHint(s string)string{return "入口："+strings.TrimSpace(s)+" · 1/2/3/4 工具 · Tab 候选 · R 参照 · 方向键微调 · Shift=10 · Cmd/Ctrl+C 简明 · +Shift 完整 · +Alt JSON · Esc 退出"}
func numberField(fields map[string]any,name string)(float64,bool){v,ok:=fields[name];if !ok{return 0,false};switch n:=v.(type){case float64:return n,true;case float32:return float64(n),true;case int:return float64(n),true;case int64:return float64(n),true;default:return 0,false}}
func stringPtr(v string)*string{return &v};func boolPtr(v bool)*bool{return &v}
