package measurement

import (
	"fmt"
	"html"
	"path/filepath"
	"strings"
	"time"

	"opendesk/pkg/customui"
)

func measurementWindowSpecProduct(a *activeSession) customui.WindowSpec {
	m:=a.frame.Snapshot.Mapping
	return customui.WindowSpec{ID:WindowID,Kind:"measurement",Title:"",Bounds:customui.Bounds{X:m.Origin.X,Y:m.Origin.Y,Width:m.LogicalSize.Width,Height:m.LogicalSize.Height},AlwaysOnTop:true,Theme:"dark",Content:customui.ContentSpec{HTML:measurementHTMLProduct(a),CSS:measurementCSSProduct(),BasePath:"."},Measurement:&customui.MeasurementSurfaceSpec{TargetID:previewID}}
}

func measurementWindowSpec(frame CaptureFrame,assetName,source string)customui.WindowSpec{
	a:=&activeSession{frame:frame,reference:frame.Reference,assetPath:assetName,overlayPath:"measurement-overlay.png",tool:"point",outputFormat:"concise",status:targetConfirmationInstruction(frame),selectedTarget:frame.SelectedTargetID,targetConfirmed:frame.TargetConfirmed,source:strings.TrimSpace(source)}
	return measurementWindowSpecProduct(a)
}

func measurementHTMLProduct(a *activeSession) string {
	disabled:=" disabled";if a.result!=nil{disabled=""}
	confirmHidden,confirmedHidden:=""," hidden";if a.targetConfirmed{confirmHidden,confirmedHidden=" hidden",""}
	hud:=ChooseHUDPlacement(a.frame.Snapshot.Mapping,a.reference,a.result)
	microTarget:=a.reference.Bounds;if r,ok:=resultBounds(a.result);ok{microTarget=r};micro:=MicroPlacement(a.frame.Snapshot.Mapping,microTarget)
	return `<main id="measurementRoot">`+
		`<img id="measurementPreview" src="`+html.EscapeString(filepath.Base(a.assetPath))+`">`+
		`<img id="measurementOverlay" src="`+html.EscapeString(filepath.Base(a.overlayPath))+`">`+
		`<section id="measurementMicro" class="`+strings.Join(micro.Classes," ")+`"><span id="measurementMicroValue">`+html.EscapeString(microText(a))+`</span></section>`+
		`<section id="measurementHUD" class="`+strings.Join(hud.Classes," ")+`"><strong>桌面测量</strong><p id="measurementHUDValue">`+html.EscapeString(a.conciseResult())+`</p><p id="measurementStatus">`+html.EscapeString(a.status)+`</p><p id="referenceInfo">`+html.EscapeString(referenceSummary(a.reference))+`</p><p id="snapInfo">`+html.EscapeString(snapSummary(a))+`</p></section>`+
		`<section id="measurementCopyMenu" hidden><button id="copyConcise"`+disabled+`>① 简明数值</button><button id="copyHuman"`+disabled+`>② 完整中文说明</button><button id="copyStructured"`+disabled+`>③ 结构化数据</button></section>`+
		`<section id="measurementInspector" hidden><header><strong>测量详情</strong><button id="closeInspector">关闭</button></header><label>目标<select id="targetWindow">`+targetOptionsHTML(a.frame.Targets,a.selectedTarget)+`</select></label><div class="row"><button id="previousTarget">上一个候选</button><button id="nextTarget">下一个候选</button><button id="confirmTarget"`+confirmHidden+`>确认候选</button><span id="targetConfirmed"`+confirmedHidden+`>已确认</span></div><button id="refreshSnapshot">重新冻结</button><label>参照<select id="referenceType">`+referenceOptions(a)+`</select></label><label>保存格式<select id="outputFormat">`+outputOptions(a.outputFormat)+`</select></label><button id="saveResult"`+disabled+`>保存结果</button><p id="snapshotInfo">`+html.EscapeString(snapshotSummary(a.frame))+`</p><p id="measurementInspectorResult" class="inspectorResult">`+html.EscapeString(a.selectedResult())+`</p><p id="measurementHint">`+html.EscapeString(measurementHint(a.source))+`</p></section>`+
		`<section id="measurementToolbar"><button id="toolPoint" aria-pressed="`+boolString(a.tool=="point")+`">点</button><button id="toolRegion" aria-pressed="`+boolString(a.tool=="region")+`">区域</button><button id="toolTwoPoint" aria-pressed="`+boolString(a.tool=="twoPoint")+`">两点</button><button id="toolSpacing" aria-pressed="`+boolString(a.tool=="spacing")+`">两区域</button><span class="separator"></span><button id="referenceButton">参照</button><button id="copyMenuButton"`+disabled+`>复制 ▾</button><button id="inspectorButton">详情</button><button id="exitMeasurement">退出</button></section>`+
		`</main>`
}

func measurementCSSProduct()string{return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview,#measurementOverlay{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}#measurementOverlay{pointer-events:none;z-index:4}button,select{height:30px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px}button{cursor:pointer}button[aria-pressed=true]{background:#1677b8;border-color:#58baff}button:disabled{opacity:.42;cursor:default}#measurementToolbar{position:absolute;z-index:20;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(14,18,24,.92);box-shadow:0 5px 22px rgba(0,0,0,.35)}#measurementToolbar .separator{width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 2px}.hud{position:absolute;z-index:12;width:min(280px,calc(100vw - 24px));padding:9px 10px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);pointer-events:none}.hud.top-left{left:12px;top:12px}.hud.top-right{right:12px;top:12px}.hud.bottom-left{left:12px;bottom:64px}.hud.bottom-right{right:12px;bottom:64px}.hud strong{font-size:13px}.hud p{margin:5px 0 0;font-size:11px;line-height:1.35;white-space:pre-wrap}#measurementHUDValue{color:#fff}#measurementStatus{color:#92d2ff}#referenceInfo{color:#ffd479}#snapInfo{color:#9ee9c2}.micro{position:absolute;z-index:13;max-width:230px;padding:4px 7px;border-radius:6px;background:rgba(10,13,18,.82);font:10px ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none}.micro.top-left{left:14px;top:14px}.micro.top-right{right:14px;top:14px}.micro.bottom-left{left:14px;bottom:64px}.micro.bottom-right{right:14px;bottom:64px}#measurementCopyMenu{position:absolute;z-index:30;left:50%;bottom:58px;transform:translateX(44px);display:flex;flex-direction:column;gap:4px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#151b23}#measurementCopyMenu[hidden],#measurementInspector[hidden]{display:none}#measurementInspector{position:absolute;z-index:25;right:14px;top:14px;width:min(360px,calc(100vw - 28px));max-height:calc(100vh - 86px);overflow:auto;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(14,18,24,.96);box-shadow:0 8px 30px rgba(0,0,0,.45)}#measurementInspector header,#measurementInspector .row{display:flex;align-items:center;justify-content:space-between;gap:6px}#measurementInspector label{display:flex;flex-direction:column;gap:4px;margin-top:8px;color:#aebccc;font-size:10px}#measurementInspector select{width:100%}.inspectorResult{max-height:220px;overflow:auto;white-space:pre-wrap;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;background:rgba(0,0,0,.3);padding:7px;border-radius:6px}#measurementHint,#snapshotInfo{font-size:10px;color:#8290a1;white-space:pre-wrap}`}

func (a *activeSession) conciseResult()string{if a.result==nil{return "尚无结果"};return a.result.ConciseText()}
func (a *activeSession) selectedResult()string{if a.result==nil{return "尚无结果"};o,err:=a.result.Outputs();if err!=nil{return "结果编码失败："+err.Error()};return outputValue(o,a.outputFormat)}
func selectedTargetTitle(ts []TargetWindow,id string)string{for _,t:=range ts{if t.ID==id{return t.Title}};return "候选窗口不可用"}
func targetConfirmationInstruction(f CaptureFrame)string{if f.TargetConfirmed{return "当前窗口参照已由入口确认："+selectedTargetTitle(f.Targets,f.SelectedTargetID)+"。"};return "当前候选："+selectedTargetTitle(f.Targets,f.SelectedTargetID)+"。请确认窗口外框，或选择人工参照。"}
func toolInstruction(t string)string{switch t{case"region":return"区域：拖拽创建；点击区域本体或八向控制点可编辑。";case"twoPoint":return"两点：依次选择两个点。";case"spacing":return"两区域：依次拖拽两个区域。";default:return"点：点击冻结画面读取坐标与原始 Capture Pixel 色值。"}}
func referenceOptions(a *activeSession)string{o,m:="","";if a.reference.Type==ReferenceManualRegion||a.manualPending{m=" selected"}else{o=" selected"};return `<option value="windowOuterBounds"`+o+`>窗口参照</option><option value="manualRegion"`+m+`>人工参照</option>`}
func referenceValue(a *activeSession)string{if a.reference.Type==ReferenceManualRegion||a.manualPending{return string(ReferenceManualRegion)};return string(ReferenceWindowOuter)}
func outputOptions(s string)string{v:=[]struct{value,label string}{{"concise","简明数值"},{"human","完整中文说明"},{"json","结构化数据"}};var b strings.Builder;for _,i:=range v{m:="";if i.value==s{m=" selected"};fmt.Fprintf(&b,`<option value="%s"%s>%s</option>`,i.value,m,i.label)};return b.String()}
func targetOptionsHTML(ts []TargetWindow,s string)string{var b strings.Builder;for _,t:=range ts{m:="";if t.ID==s{m=" selected"};fmt.Fprintf(&b,`<option value="%s"%s>%s</option>`,html.EscapeString(t.ID),m,html.EscapeString(t.Title))};return b.String()}
func targetOptions(ts []TargetWindow)[]customui.SelectOption{o:=make([]customui.SelectOption,0,len(ts));for _,t:=range ts{o=append(o,customui.SelectOption{Value:t.ID,Label:t.Title})};return o}
func referenceSummary(r Reference)string{return fmt.Sprintf("参照 %s · x=%.2f y=%.2f w=%.2f h=%.2f logical",r.Type,r.Bounds.X,r.Bounds.Y,r.Bounds.Width,r.Bounds.Height)}
func snapshotSummary(f CaptureFrame)string{m:=f.Snapshot.Mapping;return fmt.Sprintf("冻结 %s · display=%s/%d · logical %.0fx%.0f · capture %dx%d px · scale %.3fx%.3f",f.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano),m.DisplayID,m.DisplayIndex,m.LogicalSize.Width,m.LogicalSize.Height,m.ImageSize.Width,m.ImageSize.Height,m.ScaleX,m.ScaleY)}
func measurementHint(s string)string{return "入口："+strings.TrimSpace(s)+" · 1/2/3/4 · Tab/Shift+Tab · Alt 暂停吸附 · R 参照 · I 详情 · Arrow/Shift+Arrow · 三档复制 · Esc 分层退出"}
func snapSummary(a *activeSession)string{if a.snapSuspended{return"吸附：暂停（松开 Alt/Option 恢复）"};if len(a.frame.Targets)==0{return"吸附：无真实候选"};return fmt.Sprintf("候选：%d · Tab 切换",len(a.frame.Targets))}
func microText(a *activeSession)string{if a.result==nil{return toolInstruction(a.tool)};switch{case a.result.Point!=nil:c:="";if a.result.Point.Color!=nil{c=" · "+a.result.Point.Color.Hex};return fmt.Sprintf("x %.1f · y %.1f%s",a.result.Point.Absolute.X,a.result.Point.Absolute.Y,c);case a.result.Region!=nil:r:=a.result.Region;return fmt.Sprintf("%.1f × %.1f · L %.1f T %.1f R %.1f B %.1f",r.Absolute.Width,r.Absolute.Height,r.EdgeDistances.Left,r.EdgeDistances.Top,r.EdgeDistances.Right,r.EdgeDistances.Bottom);case a.result.TwoPoint!=nil:return fmt.Sprintf("dx %.1f · dy %.1f · d %.1f",a.result.TwoPoint.DeltaX,a.result.TwoPoint.DeltaY,a.result.TwoPoint.Distance);case a.result.Spacing!=nil:return fmt.Sprintf("H %.1f · V %.1f",a.result.Spacing.Spacing.Horizontal.Gap,a.result.Spacing.Spacing.Vertical.Gap)};return""}
func outputValue(o Outputs,f string)string{switch f{case"human":return o.Human;case"json":return o.JSON;default:return o.Concise}}
func outputFormatLabel(f string)string{switch f{case"human":return"完整中文说明";case"json":return"结构化数据";default:return"简明数值"}}
func isOutputFormat(f string)bool{return f=="concise"||f=="human"||f=="json"}
func boolString(v bool)string{if v{return"true"};return"false"}

// Backward-compatible helpers retained for deterministic prototype/native parity tests.
func overlayRectStyle(m CaptureMapping,r Rect)string{l:=(r.X-m.Origin.X)/m.LogicalSize.Width*100;t:=(r.Y-m.Origin.Y)/m.LogicalSize.Height*100;rr:=(r.Right()-m.Origin.X)/m.LogicalSize.Width*100;b:=(r.Bottom()-m.Origin.Y)/m.LogicalSize.Height*100;l,t,rr,b=clampPercent(l),clampPercent(t),clampPercent(rr),clampPercent(b);if rr<l{l,rr=rr,l};if b<t{t,b=b,t};return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4f%%;height:%.4f%%",l,t,rr-l,b-t)}
func clampPercent(v float64)float64{if v<0{return 0};if v>100{return 100};return v}
func hudPlacement(m CaptureMapping,r Rect)(string,bool){ref:=Reference{Type:ReferenceManualRegion,Bounds:r};p:=ChooseHUDPlacement(m,ref,nil);limited:=r.Width>=m.LogicalSize.Width*.7||r.Height>=m.LogicalSize.Height*.7;return p.Corner,limited}
