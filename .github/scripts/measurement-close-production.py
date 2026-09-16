from pathlib import Path
import json, re
ROOT=Path.cwd()
changed=[]
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s):
    (ROOT/p).write_text(s,encoding='utf-8'); changed.append(p)
def repl(s,a,b,n=1):
    c=s.count(a)
    if c!=n: raise RuntimeError(f'{a[:100]!r}: expected {n} got {c}')
    return s.replace(a,b,n)

# Production surface and state semantics
p='pkg/measurement/surface_product.go'; s=read(p)
s=repl(s,'tool: "point"','tool: "region"')
s=repl(s,'区域：拖拽创建；点击区域本体或八向控制点可编辑。','区域：单击锁定磁吸候选，或拖拽至少 5×5 logical px 创建区域；再次拖拽开始新的区域测量。')
s=repl(s,'Esc 分层退出','Esc 先关闭详情，否则退出测量')
s=s.replace('a.selectedResult()','a.inspectorEvidence()')
s=repl(s,'<button id="copyStructured"` + disabled + `>','<button id="copyStructured">')
write(p,s)

p='pkg/measurement/session.go'; s=read(p)
s=repl(s,'case "copyStructured":\n\t\treturn a.copyFormat(ctx, "json")','case "copyStructured":\n\t\treturn a.copyEvidence(ctx)')
s=repl(s,'case "inspectorButton":\n\t\ta.inspectorOpen = !a.inspectorOpen','case "inspectorButton":\n\t\ta.inspectorOpen = true')
s=repl(s,'{"copyStructured", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}}','{"copyStructured", customui.ControlPatch{Disabled: boolPtr(false)}}')
s=repl(s,'{"measurementInspectorResult", customui.ControlPatch{Text: stringPtr(a.selectedResult())}}','{"measurementInspectorResult", customui.ControlPatch{Text: stringPtr(a.inspectorEvidence())}}')
s=repl(s,'\t\ta.snapSuspended = false\n\t\ta.pointer = nil\n\t\ta.stateMu.Lock()','\t\ta.snapSuspended = false\n\t\ta.pointer = nil\n\t\ta.result = nil\n\t\ta.dragStart = nil\n\t\ta.twoPointFirst = nil\n\t\ta.spacingFirst = nil\n\t\ta.stateMu.Lock()')
s=repl(s,'if selection.Width <= 0 || selection.Height <= 0 {\n\t\t\ta.status = "两区域测距','if selection.Width < 5 || selection.Height < 5 {\n\t\t\ta.status = "两区域测距')
s=repl(s,'两区域测距需要分别拖拽两个正宽高区域。','两区域测距需要分别拖拽两个至少 5×5 logical px 的区域。')
s=s.replace('''\tif a.editAnchor != nil && a.editOriginal != nil && a.result != nil && a.result.Region != nil {
\t\tdx, dy := p.X-a.editAnchor.X, p.Y-a.editAnchor.Y
\t\tregion := ApplyRegionEdit(*a.editOriginal, a.regionHandle, dx, dy, captureLogicalBounds(a.frame.Snapshot.Mapping), 1)
\t\tif region != a.result.Region.Absolute {
\t\t\tr, err := BuildRegionResult(a.frame.Snapshot, a.reference, region)
\t\t\tif err != nil { return err }
\t\t\ta.result = &r
\t\t}
\t}
''','')
s=s.replace('''\tif a.editAnchor != nil {
\t\treturn a.renderSurface(ctx)
\t}
''','')
s=s.replace('''\tif a.editAnchor != nil && a.editOriginal != nil {
\t\tdx, dy := p.X-a.editAnchor.X, p.Y-a.editAnchor.Y
\t\tregion := ApplyRegionEdit(*a.editOriginal, a.regionHandle, dx, dy, captureLogicalBounds(a.frame.Snapshot.Mapping), 1)
\t\tr, err := BuildRegionResult(a.frame.Snapshot, a.reference, region)
\t\tif err != nil { return err }
\t\ta.result = &r
\t\ta.editAnchor = nil
\t\ta.editOriginal = nil
\t\ta.status = "区域编辑已应用。"
\t\treturn a.renderSurface(ctx)
\t}
''','')
s=re.sub(r'\nfunc \(a \*activeSession\) nudge\(ctx context\.Context, key string, step float64\) error \{.*?\n\}\n\nfunc \(a \*activeSession\) beginAdjusting', '\nfunc (a *activeSession) beginAdjusting', s, flags=re.S)
write(p,s)

p='pkg/measurement/oracle_alignment.go'; s=read(p)
s=s.replace('import "os"','import (\n\t"context"\n\t"encoding/json"\n\t"os"\n)')
s += '''

func (a *activeSession) copyEvidence(ctx context.Context) error {
\tif err := a.service.clipboard.Copy(a.inspectorEvidence()); err != nil {
\t\treturn a.updateStatus(ctx, "复制失败："+err.Error())
\t}
\ta.copyMenuOpen = false
\ta.status = "已复制当前 Measurement Evidence。"
\treturn a.renderSurface(ctx)
}

func (a *activeSession) inspectorEvidence() string {
\tview := map[string]any{
\t\t"schemaVersion": "desktop-measurement-session/v1",
\t\t"phase": a.phaseValue(),
\t\t"snapshot": a.snapshotToken(),
\t\t"captureMapping": a.frame.Snapshot.Mapping,
\t\t"windowReference": a.frame.Reference,
\t\t"localReference": nil,
\t\t"pointer": nil,
\t\t"candidateStack": a.service.SnapshotCandidates(),
\t\t"result": a.result,
\t\t"runtimeEvidence": map[string]bool{"absoluteGeometryIsRuntimeEvidenceOnly": true, "sourcePixelsAreFrozenSnapshotOnly": true},
\t}
\tif hasLocalReference(a) { view["localReference"] = a.reference }
\tif a.pointer != nil {
\t\tpoint, err := BuildPointResult(a.frame.Snapshot, a.frame.Reference, *a.pointer, a.image)
\t\tif err == nil { view["pointer"] = point.Point }
\t}
\tencoded, err := json.MarshalIndent(view, "", "  ")
\tif err != nil { return "Measurement Evidence unavailable: " + err.Error() }
\treturn string(encoded)
}
'''
write(p,s)

p='pkg/measurement/candidate_stack.go'; s=read(p)
s=repl(s,'\td.state = snapshotCandidateRuntime{epoch: d.state.epoch, request: d.state.request, magnet: true}','\td.state.token = SnapshotToken{}\n\td.state.candidates = nil\n\td.state.failures = nil\n\td.state.index = 0\n\td.state.magnet = true\n\td.state.suspended = false\n\td.state.preview = ""')
s=repl(s,'\tif inspector != "" {\n\t\t_, _ = w.UpdateControl(ctx, "measurementInspectorResult", customui.ControlPatch{Text: &inspector})\n\t}','\tif a.inspectorOpen {\n\t\tcomplete := a.inspectorEvidence()\n\t\t_, _ = w.UpdateControl(ctx, "measurementInspectorResult", customui.ControlPatch{Text: &complete})\n\t}')
needle='''\tfields["u"] = clamp(imagePoint.X/width, 0, 1)
\tfields["v"] = clamp(imagePoint.Y/height, 0, 1)
\tevent.Fields = fields
'''
insert='''\tfields["u"] = clamp(imagePoint.X/width, 0, 1)
\tfields["v"] = clamp(imagePoint.Y/height, 0, 1)
\tif event.Type == "measurement.pointerup" && a.tool == "region" && candidate.Semantic {
\t\tfields["snapCandidateSemantic"] = true
\t\tfields["snapCandidateId"] = candidate.ID
\t\tfields["snapCandidateLabel"] = candidate.Label
\t\tif local, ok := d.localReferenceFor(candidate, a.snapshotToken()); ok {
\t\t\tfields["snapLocalLabel"] = local.Label
\t\t\tfields["snapLocalSource"] = local.Source
\t\t\tfields["snapLocalReliability"] = string(local.Reliability)
\t\t\tfields["snapLocalX"], fields["snapLocalY"] = local.Bounds.X, local.Bounds.Y
\t\t\tfields["snapLocalWidth"], fields["snapLocalHeight"] = local.Bounds.Width, local.Bounds.Height
\t\t}
\t}
\tevent.Fields = fields
'''
s=repl(s,needle,insert)
marker='func (d *snapshotCandidateDriver) patchPreview(a *activeSession) {'
helper='''func (d *snapshotCandidateDriver) localReferenceFor(target SnapshotCandidate, token SnapshotToken) (SnapshotCandidate, bool) {
\tif !target.Semantic { return SnapshotCandidate{}, false }
\td.state.mu.Lock()
\tdefer d.state.mu.Unlock()
\tbestArea := 0.0
\tvar best SnapshotCandidate
\tfound := false
\tfor _, candidate := range d.state.candidates {
\t\tif !candidate.Semantic || !candidate.Token.Matches(token) || candidate.Role == "window" || candidate.ID == target.ID { continue }
\t\tif !rectWithin(target.Bounds, candidate.Bounds, 1) { continue }
\t\tarea := candidate.Bounds.Width * candidate.Bounds.Height
\t\ttargetArea := target.Bounds.Width * target.Bounds.Height
\t\tif area <= targetArea+0.01 { continue }
\t\tif !found || area < bestArea { best, bestArea, found = candidate, area, true }
\t}
\treturn best, found
}

'''+marker
s=repl(s,marker,helper)
write(p,s)

p='pkg/measurement/session.go'; s=read(p)
old='''\tcase "measurement.pointerup":
\t\tp, err := a.logicalPoint(event.Fields)
\t\tif err != nil {
\t\t\treturn err
\t\t}
\t\treturn a.pointerUp(ctx, p)
'''
new='''\tcase "measurement.pointerup":
\t\tp, err := a.logicalPoint(event.Fields)
\t\tif err != nil { return err }
\t\tif err := a.pointerUp(ctx, p); err != nil { return err }
\t\treturn a.applyCandidateLocalReference(ctx, event.Fields)
'''
s=repl(s,old,new)
marker='func (a *activeSession) handleClick(ctx context.Context, id string) error {'
helper='''func (a *activeSession) applyCandidateLocalReference(ctx context.Context, fields map[string]any) error {
\tsemantic, _ := fields["snapCandidateSemantic"].(bool)
\tif !semantic || a.tool != "region" || a.result == nil || a.result.Region == nil { return nil }
\tx, okX := numberField(fields, "snapLocalX"); y, okY := numberField(fields, "snapLocalY")
\tw, okW := numberField(fields, "snapLocalWidth"); h, okH := numberField(fields, "snapLocalHeight")
\tif !(okX && okY && okW && okH) || w <= 0 || h <= 0 { return nil }
\tlabel, _ := fields["snapLocalLabel"].(string)
\tif strings.TrimSpace(label) == "" { label = "局部参照" }
\ta.reference = Reference{Type: ReferenceManualRegion, Bounds: Rect{X:x,Y:y,Width:w,Height:h}}
\ta.marginView = "window"
\ta.status = "已锁定语义 Target；派生唯一 Local Reference：" + label
\treturn a.renderSurface(ctx)
}

'''+marker
s=repl(s,marker,helper)
write(p,s)

p='pkg/customui/winhost/bridge.js'; s=read(p)
old="const measurementOverlay = (() => {if(!config.measurementTarget)return null;const el=document.getElementById(config.measurementTarget);if(!el)return null;el.style.touchAction='none';el.style.userSelect='none';const box=document.createElement('div');"
new="const measurementOverlay = (() => {if(!config.measurementTarget)return null;const el=document.getElementById(config.measurementTarget);if(!el)return null;el.style.touchAction='none';el.style.userSelect='none';const micro=document.getElementById('measurementMicro');const placeMicro=event=>{if(!micro)return;const inset=8,gap=16,r=micro.getBoundingClientRect();let left=event.clientX+gap,top=event.clientY+gap;if(left+r.width>window.innerWidth-inset)left=event.clientX-r.width-gap;if(top+r.height>window.innerHeight-inset)top=event.clientY-r.height-gap;micro.style.left=Math.max(inset,left)+'px';micro.style.top=Math.max(inset,top)+'px';micro.style.right='auto';micro.style.bottom='auto';};const box=document.createElement('div');"
s=repl(s,old,new)
s=repl(s,"const paint=(event,p)=>{const x=", "const paint=(event,p)=>{placeMicro(event);const x=")
s=repl(s,"el.addEventListener('pointermove',event=>{if(event.buttons===1){event.preventDefault();emit('pointermove',event);}else{const p=measurementPoint(event,el);if(p.u>=0&&p.v>=0&&p.u<=1&&p.v<=1)paint(event,p);}});", "el.addEventListener('pointermove',event=>{if(event.buttons===1)event.preventDefault();emit('pointermove',event);});")
s=s.replace("||key.startsWith('Arrow')","")
write(p,s)

p='pkg/customui/machost/native_darwin.m'; s=read(p)
old="const measurementOverlay = (() => { if (!config.measurementTarget) return null; const el=document.getElementById(config.measurementTarget); if (!el) return null; el.style.touchAction='none'; el.style.userSelect='none'; const box=document.createElement('div');"
new="const measurementOverlay = (() => { if (!config.measurementTarget) return null; const el=document.getElementById(config.measurementTarget); if (!el) return null; el.style.touchAction='none'; el.style.userSelect='none'; const micro=document.getElementById('measurementMicro'); const placeMicro=event=>{if(!micro)return;const inset=8,gap=16,r=micro.getBoundingClientRect();let left=event.clientX+gap,top=event.clientY+gap;if(left+r.width>window.innerWidth-inset)left=event.clientX-r.width-gap;if(top+r.height>window.innerHeight-inset)top=event.clientY-r.height-gap;micro.style.left=Math.max(inset,left)+'px';micro.style.top=Math.max(inset,top)+'px';micro.style.right='auto';micro.style.bottom='auto';}; const box=document.createElement('div');"
s=repl(s,old,new)
s=repl(s,"const paint=(event,p) => { const x=", "const paint=(event,p) => { placeMicro(event); const x=")
s=repl(s,"el.addEventListener('pointermove',event=>{if(event.buttons===1){event.preventDefault();emit('pointermove',event);}else{const p=measurementPoint(event,el);if(p.u>=0&&p.v>=0&&p.u<=1&&p.v<=1)paint(event,p);}});", "el.addEventListener('pointermove',event=>{if(event.buttons===1)event.preventDefault();emit('pointermove',event);});")
s=s.replace("||key.startsWith('Arrow')","")
s=s.replace('''\t\tcase 123: return @"ArrowLeft";
\t\tcase 124: return @"ArrowRight";
\t\tcase 125: return @"ArrowDown";
\t\tcase 126: return @"ArrowUp";
''','')
write(p,s)

p='pkg/customui/measurement_host_contract_test.go'; s=read(p)
s=repl(s,'\tif !strings.Contains(string(windows), "keyup") || !strings.Contains(string(mac), "FlagsChanged") {\n\t\tt.Fatal("measurement Alt/Option release must be observable on both platforms")\n\t}\n','''\tif !strings.Contains(string(windows), "keyup") || !strings.Contains(string(mac), "FlagsChanged") {
\t\tt.Fatal("measurement Alt/Option release must be observable on both platforms")
\t}
\tif !strings.Contains(string(windows), "emit('pointermove',event)") {
\t\tt.Fatal("Windows Measurement hover must emit pointermove so HUD/candidates follow the pointer")
\t}
\tif strings.Contains(string(windows), "key.startsWith('Arrow')") || strings.Contains(string(mac), "ArrowLeft") {
\t\tt.Fatal("Arrow nudge is not part of the frozen Measurement session contract")
\t}
''')
write(p,s)

print(json.dumps(changed,ensure_ascii=False))
