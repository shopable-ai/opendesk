package measurement

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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
	WindowID = "measurement-session"
	previewID = "measurementPreview"
	overlayID = "measurementOverlay"
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
	driver customui.Driver
	capture CaptureAdapter
	clipboard ClipboardWriter
	baseDir string
	saveDir string
	now func() time.Time
	mu sync.Mutex
	active *activeSession
	opening chan struct{}
	assetID atomic.Uint64
	sessionID atomic.Uint64
}

type activeSession struct {
	service *Service
	session *customui.Session
	events chan customui.Event
	done chan struct{}
	surfaceMu sync.RWMutex
	window *customui.Window
	source string

	frame CaptureFrame
	image image.Image
	assetPath string
	overlayPath string
	restore func(context.Context) error

	reference Reference
	tool string
	outputFormat string
	status string
	selectedTarget string
	targetConfirmed bool
	result *Result

	dragStart *Point
	twoPointFirst *Point
	spacingFirst *Rect
	manualPending bool
	copyMenuOpen bool
	inspectorOpen bool
	snapSuspended bool
	regionHandle RegionEditHandle
	editAnchor *Point
	editOriginal *Rect
	lastPointerRender time.Time

	closeOnce sync.Once
	finishMu sync.Mutex
	finishErr error
}

type ServiceCounts struct { Sessions int; Listeners int }

func NewService(options ServiceOptions) (*Service,error) {
	if options.Driver==nil||options.Capture==nil||options.Clipboard==nil{return nil,errors.New("measurement requires UI, capture, and clipboard adapters")}
	baseDir:=strings.TrimSpace(options.BaseDir);if baseDir==""{return nil,errors.New("measurement base directory is required")}
	absolute,err:=filepath.Abs(baseDir);if err!=nil{return nil,fmt.Errorf("resolve measurement base directory: %w",err)}
	if err:=os.MkdirAll(absolute,0o755);err!=nil{return nil,fmt.Errorf("create measurement base directory: %w",err)}
	saveDir:=strings.TrimSpace(options.SaveDir);if saveDir==""{saveDir=filepath.Join(absolute,"results")}
	if options.Now==nil{options.Now=time.Now}
	return &Service{driver:options.Driver,capture:options.Capture,clipboard:options.Clipboard,baseDir:absolute,saveDir:saveDir,now:options.Now},nil
}

func (s *Service) Open(ctx context.Context,source string)error{
	if s==nil{return errors.New("measurement service is unavailable")};if ctx==nil{ctx=context.Background()}
	for{
		s.mu.Lock()
		if current:=s.active;current!=nil{s.mu.Unlock();w:=current.currentWindow();if w==nil{return errors.New("measurement session has no active surface")};_,err:=w.Show(ctx);return err}
		if opening:=s.opening;opening!=nil{s.mu.Unlock();select{case<-opening:continue;case<-ctx.Done():return ctx.Err()}}
		s.opening=make(chan struct{});opening:=s.opening;s.mu.Unlock()
		active,err:=s.openNew(ctx,source)
		s.mu.Lock();if err==nil{s.active=active};close(opening);s.opening=nil;s.mu.Unlock()
		if err!=nil{return err};go active.run();return nil
	}
}

func (s *Service) OpenAndWait(ctx context.Context,source string)error{if err:=s.Open(ctx,source);err!=nil{return err};s.mu.Lock();active:=s.active;s.mu.Unlock();if active==nil{return nil};select{case<-active.done:return active.finishResult();case<-ctx.Done():_=active.finish(context.Background(),true);return ctx.Err()}}

func (s *Service) openNew(ctx context.Context,source string)(*activeSession,error){
	frame,err:=s.capture.Capture(ctx,"");if err!=nil{return nil,fmt.Errorf("capture initial desktop snapshot: %w",err)}
	img,assetPath,err:=s.prepareFrame(frame);if err!=nil{return nil,err}
	a:=&activeSession{service:s,events:make(chan customui.Event,eventQueueSize),done:make(chan struct{}),frame:frame,image:img,assetPath:assetPath,restore:frame.Restore,reference:frame.Reference,tool:"point",outputFormat:"concise",status:targetConfirmationInstruction(frame),selectedTarget:frame.SelectedTargetID,targetConfirmed:frame.TargetConfirmed,source:strings.TrimSpace(source)}
	overlayPath,err:=a.writeOverlay();if err!=nil{_=os.Remove(assetPath);return nil,err};a.overlayPath=overlayPath
	sessionID:="measurement-"+s.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(s.sessionID.Add(1),10)
	session,err:=customui.NewSession(sessionID,s.baseDir,s.driver,a.enqueue);if err!=nil{_=os.Remove(assetPath);_=os.Remove(overlayPath);return nil,err};a.session=session
	if err:=a.createSurface(ctx);err!=nil{_=session.Close(context.Background());_=os.Remove(assetPath);_=os.Remove(overlayPath);return nil,err}
	return a,nil
}

func (s *Service) prepareFrame(frame CaptureFrame)(image.Image,string,error){
	if len(frame.PNG)==0{return nil,"",errors.New("measurement capture returned no PNG data")}
	img,format,err:=image.Decode(bytes.NewReader(frame.PNG));if err!=nil||format!="png"{if err==nil{err=errors.New("capture is not PNG")};return nil,"",fmt.Errorf("decode measurement PNG: %w",err)}
	if img.Bounds().Dx()!=frame.Snapshot.Mapping.ImageSize.Width||img.Bounds().Dy()!=frame.Snapshot.Mapping.ImageSize.Height{return nil,"",errors.New("measurement capture dimensions do not match capture mapping")}
	name:="snapshot-"+s.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(s.assetID.Add(1),10)+".png";path:=filepath.Join(s.baseDir,name)
	if err:=os.WriteFile(path,frame.PNG,0o600);err!=nil{return nil,"",fmt.Errorf("persist measurement snapshot: %w",err)}
	return img,path,nil
}

func(s *Service)Counts()ServiceCounts{s.mu.Lock();defer s.mu.Unlock();if s.active==nil{return ServiceCounts{}};return ServiceCounts{Sessions:1,Listeners:1}}
func(s *Service)Close(ctx context.Context)error{if s==nil{return nil};s.mu.Lock();a:=s.active;s.mu.Unlock();if a==nil{return nil};return a.finish(ctx,true)}
func(a *activeSession)finishResult()error{a.finishMu.Lock();defer a.finishMu.Unlock();return a.finishErr}
func(a *activeSession)currentWindow()*customui.Window{a.surfaceMu.RLock();defer a.surfaceMu.RUnlock();return a.window}
func(a *activeSession)setWindow(w *customui.Window){a.surfaceMu.Lock();a.window=w;a.surfaceMu.Unlock()}

func(a *activeSession)createSurface(ctx context.Context)error{if a.session==nil{return errors.New("measurement UI session is unavailable")};w,err:=a.session.Create(ctx,measurementWindowSpecProduct(a));if err!=nil{return err};if _,err=w.Show(ctx);err!=nil{_,_=w.Close(context.Background());return err};a.setWindow(w);return nil}
func(a *activeSession)enqueue(event customui.Event){if event.Type=="measurement.pointermove"{select{case a.events<-event:default:};return};select{case a.events<-event:case<-a.done:}}
func(a *activeSession)run(){for{select{case event:=<-a.events:if event.Type=="close"{w:=a.currentWindow();if w==nil||event.WindowID==w.ID(){_=a.finish(context.Background(),false);return};continue};ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);_=a.handle(ctx,event);cancel();case<-a.done:return}}}

func(a *activeSession)handle(ctx context.Context,event customui.Event)error{
	switch event.Type{
	case"click":return a.handleClick(ctx,event.TargetID)
	case"change","input":value,_:=event.Value.(string);return a.handleChange(ctx,event.TargetID,value)
	case"measurement.pointerdown":p,err:=a.logicalPoint(event.Fields);if err!=nil{return err};return a.pointerDown(ctx,p)
	case"measurement.pointermove":p,err:=a.logicalPoint(event.Fields);if err!=nil{return err};return a.pointerMove(ctx,p)
	case"measurement.pointerup":p,err:=a.logicalPoint(event.Fields);if err!=nil{return err};return a.pointerUp(ctx,p)
	case"measurement.key":return a.handleKey(ctx,event.Fields)
	};return nil
}

func(a *activeSession)handleClick(ctx context.Context,id string)error{
	switch id{
	case"toolPoint":setMeasurementTool(a,"point");return a.renderSurface(ctx)
	case"toolRegion":setMeasurementTool(a,"region");return a.renderSurface(ctx)
	case"toolTwoPoint":setMeasurementTool(a,"twoPoint");return a.renderSurface(ctx)
	case"toolSpacing":setMeasurementTool(a,"spacing");return a.renderSurface(ctx)
	case"referenceButton":return a.beginReferenceEdit(ctx)
	case"copyMenuButton":if a.result==nil{return a.updateStatus(ctx,"复制失败：尚无测量结果。")};a.copyMenuOpen=!a.copyMenuOpen;return a.renderSurface(ctx)
	case"copyConcise":return a.copyFormat(ctx,"concise")
	case"copyHuman":return a.copyFormat(ctx,"human")
	case"copyStructured":return a.copyFormat(ctx,"json")
	case"inspectorButton":a.inspectorOpen=!a.inspectorOpen;a.copyMenuOpen=false;return a.renderSurface(ctx)
	case"closeInspector":a.inspectorOpen=false;return a.renderSurface(ctx)
	case"confirmTarget":a.targetConfirmed=true;a.status="候选目标已确认：窗口外框作为锁定参照。";return a.renderSurface(ctx)
	case"previousTarget":return a.cycleTarget(ctx,-1)
	case"nextTarget":return a.cycleTarget(ctx,1)
	case"refreshSnapshot":return a.refresh(ctx,a.selectedTarget)
	case"saveResult":return a.save(ctx)
	case"exitMeasurement":return a.finish(ctx,true)
	}
	return nil
}

func(a *activeSession)handleChange(ctx context.Context,id,value string)error{
	switch id{
	case"targetWindow":if value!=""&&value!=a.selectedTarget{return a.refresh(ctx,value)}
	case"referenceType":if value==string(ReferenceManualRegion){return a.beginReferenceEdit(ctx)};return a.restoreWindowReference(ctx)
	case"outputFormat":if isOutputFormat(value){a.outputFormat=value;return a.renderSurface(ctx)}
	}
	return nil
}

func setMeasurementTool(a *activeSession,value string)bool{if value!="point"&&value!="region"&&value!="twoPoint"&&value!="spacing"{return false};a.tool=value;a.dragStart=nil;a.twoPointFirst=nil;a.spacingFirst=nil;a.regionHandle=RegionEditNone;a.editAnchor=nil;a.editOriginal=nil;a.copyMenuOpen=false;a.status=toolInstruction(value);return true}

func(a *activeSession)beginReferenceEdit(ctx context.Context)error{
	if a.manualPending{a.manualPending=false;a.status="已取消参照编辑。";return a.renderSurface(ctx)}
	a.manualPending=true;a.dragStart=nil;a.regionHandle=RegionEditNone;a.editAnchor=nil;a.editOriginal=nil;a.copyMenuOpen=false;a.status="参照编辑：拖拽一个区域作为锁定参照；Esc 只取消本层编辑。";return a.renderSurface(ctx)
}

func(a *activeSession)restoreWindowReference(ctx context.Context)error{if !a.targetConfirmed{a.status="请先确认当前候选窗口，或继续使用人工参照。";return a.updateStatus(ctx,a.status)};a.reference=a.frame.Reference;a.manualPending=false;a.regionHandle=RegionEditNone;a.status="参照已恢复为已确认目标窗口外边界。";return a.renderSurface(ctx)}

func(a *activeSession)logicalPoint(fields map[string]any)(Point,error){u,okU:=numberField(fields,"u");v,okV:=numberField(fields,"v");if !okU||!okV||u<0||u>1||v<0||v>1{return Point{},errors.New("measurement pointer coordinates are invalid")};p:=a.frame.Snapshot.Mapping.ImageSize;return a.frame.Snapshot.Mapping.ImageToLogical(Point{X:u*float64(p.Width),Y:v*float64(p.Height)}),nil}

func(a *activeSession)pointerDown(ctx context.Context,p Point)error{
	if !a.manualPending&&a.tool=="region"&&a.result!=nil&&a.result.Region!=nil{
		handle:=DetectRegionEditHandle(p,a.result.Region.Absolute,8)
		if handle!=RegionEditNone{original:=a.result.Region.Absolute;a.regionHandle=handle;a.editAnchor=&p;a.editOriginal=&original;a.status="区域编辑："+string(handle)+"；Esc 退出本层编辑。";return a.renderSurface(ctx)}
	}
	a.dragStart=&p;return nil
}

func(a *activeSession)pointerMove(ctx context.Context,p Point)error{
	if a.editAnchor==nil||a.editOriginal==nil||a.result==nil||a.result.Region==nil{return nil}
	dx,dy:=p.X-a.editAnchor.X,p.Y-a.editAnchor.Y
	region:=ApplyRegionEdit(*a.editOriginal,a.regionHandle,dx,dy,captureLogicalBounds(a.frame.Snapshot.Mapping),1)
	if region==a.result.Region.Absolute{return nil}
	r,err:=BuildRegionResult(a.frame.Snapshot,a.reference,region);if err!=nil{return err};a.result=&r
	now:=time.Now();if !a.lastPointerRender.IsZero()&&now.Sub(a.lastPointerRender)<16*time.Millisecond{return nil};a.lastPointerRender=now;return a.renderSurface(ctx)
}

func(a *activeSession)pointerUp(ctx context.Context,p Point)error{
	if a.editAnchor!=nil&&a.editOriginal!=nil{
		dx,dy:=p.X-a.editAnchor.X,p.Y-a.editAnchor.Y;region:=ApplyRegionEdit(*a.editOriginal,a.regionHandle,dx,dy,captureLogicalBounds(a.frame.Snapshot.Mapping),1)
		r,err:=BuildRegionResult(a.frame.Snapshot,a.reference,region);if err!=nil{return err};a.result=&r;a.editAnchor=nil;a.editOriginal=nil;a.status="区域编辑已应用；方向键继续按 1 logical unit 微调，Shift=10。";return a.renderSurface(ctx)
	}
	return a.completeSelection(ctx,p)
}

func(a *activeSession)completeSelection(ctx context.Context,end Point)error{
	start:=end;if a.dragStart!=nil{start=*a.dragStart};a.dragStart=nil;selection:=RectFromPoints(start,end)
	if a.manualPending{if selection.Width<=0||selection.Height<=0{a.status="参照区域必须同时具有正宽度和正高度，请重新拖拽。";return a.updateStatus(ctx,a.status)};a.reference=Reference{Type:ReferenceManualRegion,Bounds:selection};a.manualPending=false;a.result=nil;a.spacingFirst=nil;a.twoPointFirst=nil;a.status="人工参照已锁定；后续测量保持该参照，直到用户主动切换。";return a.renderSurface(ctx)}
	if !a.targetConfirmed&&a.reference.Type!=ReferenceManualRegion{a.status="请先确认当前候选窗口，或改用人工参照。";return a.updateStatus(ctx,a.status)}
	var result Result;var err error
	switch a.tool{
	case"point":result,err=BuildPointResult(a.frame.Snapshot,a.reference,end,a.image);a.regionHandle=RegionEditNone
	case"region":if selection.Width<=0||selection.Height<=0{a.status="区域测量需要拖拽出正宽高区域。";return a.updateStatus(ctx,a.status)};result,err=BuildRegionResult(a.frame.Snapshot,a.reference,selection);a.regionHandle=RegionEditBody
	case"twoPoint":if a.twoPointFirst==nil{first:=end;a.twoPointFirst=&first;a.status="第一点已锁定，请选择第二点。";return a.renderSurface(ctx)};result,err=BuildTwoPointResult(a.frame.Snapshot,a.reference,*a.twoPointFirst,end);a.twoPointFirst=nil;a.regionHandle=RegionEditNone
	case"spacing":if selection.Width<=0||selection.Height<=0{a.status="两区域测距需要分别拖拽两个正宽高区域。";return a.updateStatus(ctx,a.status)};if a.spacingFirst==nil{first:=selection;a.spacingFirst=&first;a.status="第一个区域已锁定，请拖拽第二个区域。";return a.renderSurface(ctx)};result,err=BuildSpacingResult(a.frame.Snapshot,a.reference,*a.spacingFirst,selection);a.spacingFirst=nil;a.regionHandle=RegionEditNone
	default:return errors.New("measurement tool is invalid")
	}
	if err!=nil{a.status="测量失败："+err.Error();return a.updateStatus(ctx,a.status)};a.result=&result;a.status="结果来自同一冻结快照；颜色读取自原始 Capture Pixel。";return a.renderSurface(ctx)
}

func(a *activeSession)handleKey(ctx context.Context,fields map[string]any)error{
	key,_:=fields["key"].(string);phase,_:=fields["phase"].(string);ctrl,_:=fields["ctrl"].(bool);meta,_:=fields["meta"].(bool);shift,_:=fields["shift"].(bool);alt,_:=fields["alt"].(bool);lower:=strings.ToLower(key)
	if key=="Alt"||key=="Option"{suspended:=phase!="up";if a.snapSuspended!=suspended{a.snapSuspended=suspended;if suspended{a.status="吸附已暂停；松开 Alt/Option 恢复。"}else{a.status="吸附已恢复。"};return a.renderSurface(ctx)};return nil}
	switch{
	case lower=="c"&&(ctrl||meta)&&alt:return a.copyFormat(ctx,"json")
	case lower=="c"&&(ctrl||meta)&&shift:return a.copyFormat(ctx,"human")
	case lower=="c"&&(ctrl||meta):return a.copyFormat(ctx,"concise")
	case key=="Escape":return a.handleEscape(ctx)
	case key=="Tab":d:=1;if shift{d=-1};return a.cycleTarget(ctx,d)
	case lower=="i":a.inspectorOpen=!a.inspectorOpen;a.copyMenuOpen=false;return a.renderSurface(ctx)
	case lower=="r":return a.beginReferenceEdit(ctx)
	case key=="1"||key=="2"||key=="3"||key=="4":tools:=map[string]string{"1":"point","2":"region","3":"twoPoint","4":"spacing"};if setMeasurementTool(a,tools[key]){return a.renderSurface(ctx)}
	case strings.HasPrefix(key,"Arrow"):step:=1.0;if shift{step=10};return a.nudge(ctx,key,step)
	case key=="Enter":if a.copyMenuOpen{return a.copyFormat(ctx,a.outputFormat)};if a.result!=nil{return a.copy(ctx)}
	}
	return nil
}

func(a *activeSession)handleEscape(ctx context.Context)error{
	switch{
	case a.copyMenuOpen:a.copyMenuOpen=false;a.status="已关闭复制菜单。";return a.renderSurface(ctx)
	case a.inspectorOpen:a.inspectorOpen=false;a.status="已关闭详情。";return a.renderSurface(ctx)
	case a.regionHandle!=RegionEditNone||a.editAnchor!=nil:a.regionHandle=RegionEditNone;a.editAnchor=nil;a.editOriginal=nil;a.status="已退出区域局部编辑。";return a.renderSurface(ctx)
	case a.manualPending:a.manualPending=false;a.dragStart=nil;a.status="已取消参照编辑。";return a.renderSurface(ctx)
	default:return a.finish(ctx,true)
	}
}

func(a *activeSession)nudge(ctx context.Context,key string,step float64)error{
	if a.result==nil{a.status="请先完成一个测量结果，再使用方向键微调。";return a.updateStatus(ctx,a.status)}
	dx,dy:=0.0,0.0;switch key{case"ArrowLeft":dx=-step;case"ArrowRight":dx=step;case"ArrowUp":dy=-step;case"ArrowDown":dy=step}
	var r Result;var err error
	switch{
	case a.result.Point!=nil:p:=a.result.Point.Absolute;p.X=clamp(p.X+dx,a.frame.Snapshot.Mapping.Origin.X,a.frame.Snapshot.Mapping.Origin.X+a.frame.Snapshot.Mapping.LogicalSize.Width);p.Y=clamp(p.Y+dy,a.frame.Snapshot.Mapping.Origin.Y,a.frame.Snapshot.Mapping.Origin.Y+a.frame.Snapshot.Mapping.LogicalSize.Height);r,err=BuildPointResult(a.frame.Snapshot,a.reference,p,a.image)
	case a.result.Region!=nil:handle:=a.regionHandle;if handle==RegionEditNone{handle=RegionEditBody};region:=ApplyRegionEdit(a.result.Region.Absolute,handle,dx,dy,captureLogicalBounds(a.frame.Snapshot.Mapping),1);r,err=BuildRegionResult(a.frame.Snapshot,a.reference,region)
	case a.result.TwoPoint!=nil:f,s:=a.result.TwoPoint.First,a.result.TwoPoint.Second;s.X+=dx;s.Y+=dy;r,err=BuildTwoPointResult(a.frame.Snapshot,a.reference,f,s)
	case a.result.Spacing!=nil:f,s:=a.result.Spacing.First,a.result.Spacing.Second;s=ApplyRegionEdit(s,RegionEditBody,dx,dy,captureLogicalBounds(a.frame.Snapshot.Mapping),1);r,err=BuildSpacingResult(a.frame.Snapshot,a.reference,f,s)
	}
	if err!=nil{a.status="微调失败："+err.Error();return a.updateStatus(ctx,a.status)};a.result=&r;a.status=fmt.Sprintf("已按屏幕逻辑坐标微调 %.0f logical unit。",step);return a.renderSurface(ctx)
}

func(a *activeSession)refresh(ctx context.Context,targetID string)error{
	w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};oldState,err:=w.State(ctx);if err!=nil{return err};_,_=w.Hide(ctx)
	frame,err:=a.service.capture.Capture(ctx,targetID);if err!=nil{_,_=w.Show(context.Background());a.status="刷新快照失败："+err.Error();return err}
	img,assetPath,err:=a.service.prepareFrame(frame);if err!=nil{_,_=w.Show(context.Background());return err}
	oldFrame,oldImage,oldAsset:=a.frame,a.image,a.assetPath;oldReference,oldTarget:=a.reference,a.selectedTarget;oldResult:=a.result;oldConfirmed,oldStatus:=a.targetConfirmed,a.status;oldManual,oldCopy,oldInspector,oldSnap:=a.manualPending,a.copyMenuOpen,a.inspectorOpen,a.snapSuspended;oldHandle:=a.regionHandle;oldDrag,oldTwo,oldSpacing:=a.dragStart,a.twoPointFirst,a.spacingFirst
	a.frame,a.image,a.assetPath=frame,img,assetPath;a.reference,a.selectedTarget=frame.Reference,frame.SelectedTargetID;a.result=nil;a.dragStart=nil;a.twoPointFirst=nil;a.spacingFirst=nil;a.manualPending=false;a.copyMenuOpen=false;a.regionHandle=RegionEditNone;a.editAnchor=nil;a.editOriginal=nil;a.targetConfirmed=frame.TargetConfirmed;a.status="已冻结新的干净快照；此前结果已清除。"+targetConfirmationInstruction(frame)
	m:=frame.Snapshot.Mapping;newBounds:=customui.Bounds{X:m.Origin.X,Y:m.Origin.Y,Width:m.LogicalSize.Width,Height:m.LogicalSize.Height};if _,err=w.SetBounds(ctx,newBounds);err==nil{err=a.renderSurface(ctx)}
	if err!=nil{a.frame,a.image,a.assetPath=oldFrame,oldImage,oldAsset;a.reference,a.selectedTarget=oldReference,oldTarget;a.result=oldResult;a.targetConfirmed,a.status=oldConfirmed,oldStatus;a.manualPending,a.copyMenuOpen,a.inspectorOpen,a.snapSuspended=oldManual,oldCopy,oldInspector,oldSnap;a.regionHandle=oldHandle;a.dragStart,a.twoPointFirst,a.spacingFirst=oldDrag,oldTwo,oldSpacing;_=os.Remove(assetPath);_,_=w.SetBounds(context.Background(),oldState.Bounds);_=a.renderSurface(context.Background());_,_=w.Show(context.Background());return err}
	_=os.Remove(oldAsset);_,err=w.Show(ctx);return err
}

func(a *activeSession)cycleTarget(ctx context.Context,direction int)error{if len(a.frame.Targets)<2{a.status="当前没有可切换的其他真实候选窗口；不会伪造候选。";return a.updateStatus(ctx,a.status)};current:=0;for i,t:=range a.frame.Targets{if t.ID==a.selectedTarget{current=i;break}};next:=(current+direction)%len(a.frame.Targets);if next<0{next+=len(a.frame.Targets)};return a.refresh(ctx,a.frame.Targets[next].ID)}

func(a *activeSession)renderSurface(ctx context.Context)error{
	w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};newOverlay,err:=a.writeOverlay();if err!=nil{return err};oldOverlay:=a.overlayPath
	hud:=ChooseHUDPlacement(a.frame.Snapshot.Mapping,a.reference,a.result);microTarget:=a.reference.Bounds;if r,ok:=resultBounds(a.result);ok{microTarget=r};micro:=MicroPlacement(a.frame.Snapshot.Mapping,microTarget)
	patches:=[]struct{id string;patch customui.ControlPatch}{
		{previewID,customui.ControlPatch{Source:stringPtr(filepath.Base(a.assetPath))}},{overlayID,customui.ControlPatch{Source:stringPtr(filepath.Base(newOverlay))}},
		{"toolPoint",customui.ControlPatch{Active:boolPtr(a.tool=="point")}},{"toolRegion",customui.ControlPatch{Active:boolPtr(a.tool=="region")}},{"toolTwoPoint",customui.ControlPatch{Active:boolPtr(a.tool=="twoPoint")}},{"toolSpacing",customui.ControlPatch{Active:boolPtr(a.tool=="spacing")}},
		{"referenceButton",customui.ControlPatch{Active:boolPtr(a.manualPending)}},{"copyMenuButton",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"inspectorButton",customui.ControlPatch{Active:boolPtr(a.inspectorOpen)}},
		{"measurementCopyMenu",customui.ControlPatch{Visible:boolPtr(a.copyMenuOpen)}},{"measurementInspector",customui.ControlPatch{Visible:boolPtr(a.inspectorOpen)}},
		{"copyConcise",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"copyHuman",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"copyStructured",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},{"saveResult",customui.ControlPatch{Disabled:boolPtr(a.result==nil)}},
		{"targetWindow",customui.ControlPatch{Value:a.selectedTarget,Options:targetOptions(a.frame.Targets)}},{"confirmTarget",customui.ControlPatch{Visible:boolPtr(!a.targetConfirmed)}},{"targetConfirmed",customui.ControlPatch{Visible:boolPtr(a.targetConfirmed)}},{"referenceType",customui.ControlPatch{Value:referenceValue(a)}},{"outputFormat",customui.ControlPatch{Value:a.outputFormat}},
		{"measurementHUD",customui.ControlPatch{Classes:hud.Classes}},{"measurementMicro",customui.ControlPatch{Classes:micro.Classes}},{"measurementHUDValue",customui.ControlPatch{Text:stringPtr(a.conciseResult())}},{"measurementMicroValue",customui.ControlPatch{Text:stringPtr(microText(a))}},{"measurementStatus",customui.ControlPatch{Text:stringPtr(a.status)}},{"referenceInfo",customui.ControlPatch{Text:stringPtr(referenceSummary(a.reference))}},{"snapInfo",customui.ControlPatch{Text:stringPtr(snapSummary(a))}},{"snapshotInfo",customui.ControlPatch{Text:stringPtr(snapshotSummary(a.frame))}},{"measurementInspectorResult",customui.ControlPatch{Text:stringPtr(a.selectedResult())}},{"measurementHint",customui.ControlPatch{Text:stringPtr(measurementHint(a.source))}},
	}
	for _,p:=range patches{if _,err:=w.UpdateControl(ctx,p.id,p.patch);err!=nil{_=os.Remove(newOverlay);a.status="Measurement surface update failed: "+err.Error();return err}}
	a.overlayPath=newOverlay;if oldOverlay!=""&&oldOverlay!=newOverlay{_=os.Remove(oldOverlay)};return nil
}

func(a *activeSession)writeOverlay()(string,error){name:="overlay-"+a.service.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(a.service.assetID.Add(1),10)+".png";path:=filepath.Join(a.service.baseDir,name);if err:=RenderOverlayPNG(path,a.frame.Snapshot.Mapping,a.frame.Reference,a.reference,a.result,a.twoPointFirst,a.spacingFirst);err!=nil{return"",err};return path,nil}
func(a *activeSession)updateStatus(ctx context.Context,message string)error{a.status=message;w:=a.currentWindow();if w==nil{return errors.New("measurement surface is unavailable")};_,err:=w.UpdateControl(ctx,"measurementStatus",customui.ControlPatch{Text:&message});return err}
func(a *activeSession)copy(ctx context.Context)error{return a.copyFormat(ctx,a.outputFormat)}
func(a *activeSession)copyFormat(ctx context.Context,format string)error{if a.result==nil{return a.updateStatus(ctx,"复制失败：尚无测量结果。")};if !isOutputFormat(format){return a.updateStatus(ctx,"复制失败：未知导出格式。")};outputs,err:=a.result.Outputs();if err!=nil{return a.updateStatus(ctx,"复制失败："+err.Error())};if err:=a.service.clipboard.Copy(outputValue(outputs,format));err!=nil{return a.updateStatus(ctx,"复制失败："+err.Error())};a.copyMenuOpen=false;a.status="已复制"+outputFormatLabel(format)+"结果。";return a.renderSurface(ctx)}
func(a *activeSession)save(ctx context.Context)error{if a.result==nil{return a.updateStatus(ctx,"保存失败：尚无测量结果。")};outputs,err:=a.result.Outputs();if err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};if err:=os.MkdirAll(a.service.saveDir,0o755);err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};stamp:=a.service.now().UTC().Format("20060102T150405.000000000Z")+"-"+strconv.FormatUint(a.service.assetID.Add(1),10);ext:=".txt";if a.outputFormat=="json"{ext=".json"};path:=filepath.Join(a.service.saveDir,"measurement-"+stamp+"-"+a.outputFormat+ext);if err:=os.WriteFile(path,[]byte(outputValue(outputs,a.outputFormat)+"\n"),0o600);err!=nil{return a.updateStatus(ctx,"保存失败："+err.Error())};return a.updateStatus(ctx,"已保存"+outputFormatLabel(a.outputFormat)+"结果："+path)}

func(a *activeSession)finish(ctx context.Context,closeWindow bool)error{var result error;a.closeOnce.Do(func(){a.copyMenuOpen=false;a.inspectorOpen=false;a.manualPending=false;a.regionHandle=RegionEditNone;a.editAnchor=nil;a.editOriginal=nil;a.snapSuspended=false;if closeWindow{if w:=a.currentWindow();w!=nil{_,result=w.Close(ctx)}};if a.session!=nil{if err:=a.session.Close(ctx);result==nil{result=err}};if a.restore!=nil{if err:=a.restore(ctx);err!=nil&&result==nil{result=fmt.Errorf("measurement recovery limited: %w",err)}};a.finishMu.Lock();a.finishErr=result;a.finishMu.Unlock();a.service.mu.Lock();if a.service.active==a{a.service.active=nil};a.service.mu.Unlock();close(a.done);_=os.Remove(a.assetPath);_=os.Remove(a.overlayPath)});return result}

func numberField(fields map[string]any,name string)(float64,bool){v,ok:=fields[name];if !ok{return 0,false};switch n:=v.(type){case float64:return n,true;case float32:return float64(n),true;case int:return float64(n),true;case int64:return float64(n),true;default:return 0,false}}
func stringPtr(v string)*string{return &v}
func boolPtr(v bool)*bool{return &v}
