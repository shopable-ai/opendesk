using System.Text.Json.Nodes;

namespace OpenDesk.UIHost;

internal sealed class Host : IDisposable
{
    internal readonly Dictionary<string, Surface> Windows = new();
    private readonly Dictionary<string, JsonObject> closed = new();
    private bool disposed;
    internal static string Key(string session,string id) => session+"/"+id;
    internal void Closed(Surface surface)
    {
        var key=Key(surface.Session,surface.ID);
        Windows.Remove(key);
        // Bounded tombstones make an expiry/update race harmless. No live GUI
        // resources, delegates, timers, or browser profiles are retained here.
        closed[key]=surface.State();
        while(closed.Count>64) closed.Remove(closed.Keys.First());
    }
    internal async Task Handle(JsonObject request)
    {
        string requestID=J.S(request,"requestId"), operation=J.S(request,"operation"),
            session=J.S(request,"sessionId"), id=J.S(request,"windowId");
        try {
            if(J.S(request,"version")!=Program.Protocol) throw new HostError("UI_DRIVER_FAILURE","custom UI protocol version mismatch");
            if(J.S(request,"kind")!="request") throw new HostError("UI_DRIVER_FAILURE","expected a request frame");
            JsonNode? result=null;
            if(operation=="shutdown") { Dispose(); }
            else if(operation=="closeSession") {
                var list=Windows.Values.Where(w=>w.Session==session).ToArray();
                foreach(var w in list) w.Close("session");
                result=new JsonArray(list.Select(w=>(JsonNode?)w.State()).ToArray());
            } else if(operation=="create") {
                if(Windows.ContainsKey(Key(session,id))) throw new HostError("DUPLICATE_ID","window already exists");
                var spec=J.O(request,"payload");
                if(string.IsNullOrWhiteSpace(session)||string.IsNullOrWhiteSpace(id)) throw new HostError("INVALID_SPEC","session and window id are required");
                if(Windows.Count>=64) throw new HostError("UI_BUSY","native window limit reached");
                Surface w = spec["notification"] is JsonObject
                    ? new NotificationSurface(this,session,id,spec)
                    : spec["toolbar"] is JsonObject ? new ToolbarSurface(this,session,id,spec)
                    : new WebSurface(this,session,id,spec);
                try { await w.Initialize(); Windows.Add(Key(session,id),w); result=w.State(); w.Registered=true; }
                catch { w.Dispose(); throw; }
            } else {
                if(!Windows.TryGetValue(Key(session,id),out var w)) {
                    if(closed.TryGetValue(Key(session,id),out var end) && operation is "close" or "getState" or "updateNotification") result=end.DeepClone();
                    else throw new HostError("NOT_FOUND","custom UI window was not found");
                } else result=await w.Apply(operation,J.O(request,"payload"));
            }
            Program.Emit(new JsonObject { ["version"]=Program.Protocol,["kind"]="response",["requestId"]=requestID,["ok"]=true,["result"]=result });
        } catch(Exception error) {
            Program.Emit(new JsonObject { ["version"]=Program.Protocol,["kind"]="response",["requestId"]=requestID,["ok"]=false,
                ["error"]=new JsonObject { ["code"]=(error as HostError)?.Code ?? "UI_DRIVER_FAILURE",["operation"]=operation,["windowId"]=id,["message"]=error.Message } });
        }
    }
    public void Dispose() { if(disposed)return; disposed=true; foreach(var w in Windows.Values.ToArray())w.Close("session"); Windows.Clear();closed.Clear(); }
}

internal abstract class Surface : IDisposable
{
    internal readonly Host Host;
    internal readonly string Session, ID;
    internal readonly JsonObject Spec;
    internal readonly NativeForm Form;
    internal bool Registered, Closed;
    internal string CloseReason="";
    internal long Revision=1,Sequence;
    internal Rectangle FinalBounds;
    internal nint NativeID;
    protected bool Mutating;
    protected Surface(Host host,string session,string id,JsonObject spec)
    {
        Host=host;Session=session;ID=id;Spec=J.Copy(spec);
        // centerOnActiveDisplay is reserved for host-owned Dialog surfaces. Keep
        // those above an always-on-top Custom UI window that requested them.
        string kind=J.S(spec,"kind");
        bool floating=kind=="floating", measurement=kind=="measurement", frameless=floating&&J.S(spec,"chrome","system")=="none";
        Form=new NativeForm { Text=measurement?"":J.S(spec,"title"),TopMost=J.B(spec,"alwaysOnTop")||J.B(spec,"centerOnActiveDisplay"),BackgroundDraggable=J.B(spec,"draggable"),ShowInTaskbar=!floating&&!measurement };
        if(frameless)Form.FormBorderStyle=FormBorderStyle.None;
        Form.BackColor=J.S(spec,"theme")=="dark"?Color.FromArgb(25,25,28):SystemColors.Window;
        Form.ForeColor=J.S(spec,"theme")=="dark"?Color.White:SystemColors.WindowText;
		// Measurement is a tool-window surface, not a click-through overlay: it
		// intentionally activates only long enough to receive Esc and arrow keys.
		Form.NonActivating=floating;
		Form.FormClosing+=(_,eventArgs)=>{
			// User close is the only origin eligible for App Mode hide. Script,
			// session, and shutdown paths set CloseReason before Form.Close and must
			// destroy the native window so teardown cannot retain it accidentally.
			if(!Closed&&CloseReason.Length==0&&J.S(Spec,"appCloseBehavior")=="hide") {
				eventArgs.Cancel=true;Form.Hide();Revision++;Native.DwmFlush();
			}
		};
        Form.FormClosed+=(_,_)=>OnClosed();
        Form.Move+=(_,_)=>{if(Registered&&!Closed){Revision++;Emit("move",null,null,null,J.Rect(Native.Bounds(Form.Handle)));}};
        Form.Resize+=(_,_)=>{if(Registered&&!Closed){Revision++;Emit("resize",null,null,null,J.Rect(Native.Bounds(Form.Handle)));}};
		Form.Deactivate+=(_,_)=>BeginInvokeInteractionOutside();
    }
    internal abstract Task Initialize();
    protected void InitializeFrame(Size? clientSize=null)
    {
        _=Form.Handle;NativeID=Form.Handle;
        var b=J.Rect(Spec["bounds"]);
        if(clientSize is Size content) { Form.ClientSize=content; b.Size=Form.Size; }
        Native.Place(Form,b);
        if(Spec["placement"] is JsonObject placement) Place(placement);
        if(J.B(Spec,"centerOnActiveDisplay")) {
            var area=Screen.FromPoint(Cursor.Position).WorkingArea;
            Native.Place(Form,new Rectangle(area.X+(area.Width-Form.Width)/2,area.Y+(area.Height-Form.Height)/2,Form.Width,Form.Height));
        }
    }
    internal virtual JsonObject State()
    {
        var bounds=Closed?FinalBounds:Native.Bounds(Form.Handle);
        return new JsonObject { ["id"]=ID,["sessionId"]=Session,["status"]=Closed?"closed":Form.Visible?"visible":"hidden",
            ["visible"]=!Closed&&Form.Visible,["bounds"]=J.Rect(bounds),["alwaysOnTop"]=Form.TopMost,["draggable"]=Form.BackgroundDraggable,
            ["hostPid"]=Environment.ProcessId,["nativeWindowId"]=NativeID.ToInt64(),["onScreen"]=!Closed&&Native.OnScreen(NativeID),
            ["layer"]=Form.TopMost?1:0,["alpha"]=Closed?0:Form.Opacity,["revision"]=Revision,["lastSequence"]=Sequence };
    }
    internal void Emit(string type,string? target=null,JsonNode? value=null,bool? check=null,JsonObject? bounds=null,string? reason=null,JsonObject? fields=null)
    {
        if(!Registered || (Closed&&type!="close"))return;
        var e=new JsonObject { ["sessionId"]=Session,["windowId"]=ID,["type"]=type,["sequence"]=++Sequence,["timestamp"]=DateTimeOffset.UtcNow.ToString("O") };
        if(target is not null)e["targetId"]=target;
        if(value is not null)e["value"]=value.DeepClone();
        if(check.HasValue)e["checked"]=check.Value;
        if(bounds is not null)e["bounds"]=bounds;
        if(reason is not null)e["reason"]=reason;
        if(fields is not null)e["fields"]=fields.DeepClone();
        Program.Emit(new JsonObject { ["version"]=Program.Protocol,["kind"]="event",["event"]=e });
    }
    internal virtual async Task<JsonNode?> Apply(string operation,JsonObject payload)
    {
        switch(operation) {
            case "show":
                // Reopening a minimized normal page restores and activates it
                // once. This does not touch TopMost, so focus never becomes a
                // persistent Z-order policy.
                if(!Form.NonActivating&&Form.WindowState==FormWindowState.Minimized)Form.WindowState=FormWindowState.Normal;
                Form.Show(); if(!Form.NonActivating)Form.Activate(); Revision++; Native.DwmFlush(); OnShown(); break;
			case "hide": Form.Hide();if(J.S(Spec,"kind")=="floating")Form.RearmNonActivating();Revision++;Native.DwmFlush();break;
            case "close": Close("script");break;
            case "getState":break;
            case "setBounds":Native.Place(Form,J.Rect(payload));Revision++;break;
            case "setPlacement":Place(payload);Revision++;break;
			case "setRelativeTo":PlaceRelative(payload);Revision++;break;
            case "setAlwaysOnTop":Form.TopMost=J.B(payload,"enabled");Revision++;break;
            case "setDraggable":Form.BackgroundDraggable=J.B(payload,"enabled");Revision++;break;
            default: return await ApplyControl(operation,payload);
        }
        return State();
    }
    protected virtual void OnShown() { }
    protected virtual Task<JsonNode?> ApplyControl(string operation,JsonObject payload) => throw new HostError("UNSUPPORTED_CAPABILITY","operation is not supported by this surface: "+operation);
    internal void Place(JsonObject p)
    {
        var screen=J.S(p,"display","active") switch {"primary"=>Screen.PrimaryScreen!,"current"=>Screen.FromHandle(Form.Handle),_=>Screen.FromPoint(Cursor.Position)};
        var work=screen.WorkingArea;var b=Native.Bounds(Form.Handle);int margin=J.I(p,"margin");
        string h=J.S(p,"horizontal"),v=J.S(p,"vertical");
        int x=h switch {"left"=>work.Left+margin,"right"=>work.Right-b.Width-margin,"center"=>work.Left+(work.Width-b.Width)/2,_=>throw new HostError("INVALID_SPEC","invalid horizontal placement")};
        int y=v switch {"top"=>work.Top+margin,"bottom"=>work.Bottom-b.Height-margin,"center"=>work.Top+(work.Height-b.Height)/2,_=>throw new HostError("INVALID_SPEC","invalid vertical placement")};
        var r=new Rectangle(x,y,b.Width,b.Height);
        if(!work.Contains(r))throw new HostError("INVALID_SPEC","window does not fit display work area");
        Native.Place(Form,r);
    }
	private void PlaceRelative(JsonObject p)
	{
		var anchor=J.Rect(p["anchor"]);
		if(anchor.Width<=0||anchor.Height<=0)throw new HostError("INVALID_SPEC","relative anchor must contain positive bounds");
		var sides=J.A(p,"preferredSides").Select(value=>value?.GetValue<string>()??"").ToArray();
		if(sides.Length is <1 or >4||sides.Distinct().Count()!=sides.Length||sides.Any(side=>side is not("above" or "below" or "left" or "right")))throw new HostError("INVALID_SPEC","relative preferredSides is invalid");
		string align=J.S(p,"align","center");if(align is not("start" or "center" or "end"))throw new HostError("INVALID_SPEC","relative align is invalid");
		double rawGap=J.N(p,"gap");if(!double.IsFinite(rawGap)||rawGap<0||rawGap>int.MaxValue)throw new HostError("INVALID_SPEC","relative gap is invalid");int gap=(int)Math.Round(rawGap);
		var work=Screen.FromRectangle(anchor).WorkingArea;var size=Native.Bounds(Form.Handle).Size;
		if(size.Width>work.Width||size.Height>work.Height)throw new HostError("INVALID_SPEC","window must fit the anchor display work area");
		Rectangle Candidate(string side){
			int x,y;
			if(side is "above" or "below"){
				x=align=="start"?anchor.Left:align=="end"?anchor.Right-size.Width:anchor.Left+(anchor.Width-size.Width)/2;
				y=side=="above"?anchor.Top-size.Height-gap:anchor.Bottom+gap;
			}else{
				y=align=="start"?anchor.Top:align=="end"?anchor.Bottom-size.Height:anchor.Top+(anchor.Height-size.Height)/2;
				x=side=="left"?anchor.Left-size.Width-gap:anchor.Right+gap;
			}
			return new Rectangle(x,y,size.Width,size.Height);
		}
		var frame=Candidate(sides[0]);foreach(var side in sides){frame=Candidate(side);if(work.Contains(frame)){Native.Place(Form,frame);return;}}
		frame.X=Math.Clamp(frame.X,work.Left,work.Right-frame.Width);frame.Y=Math.Clamp(frame.Y,work.Top,work.Bottom-frame.Height);Native.Place(Form,frame);
	}
	private void BeginInvokeInteractionOutside()
	{
		if(Closed||!Form.Visible||string.IsNullOrWhiteSpace(J.S(Spec,"interactionGroup")))return;
		try { Form.BeginInvoke(new Action(()=>{
			if(Closed||Form.Focused||!Form.Visible)return;
			var next=Form.ActiveForm;
			bool grouped=next is not null&&Host.Windows.Values.Any(other=>other!=this&&other.Session==Session&&J.S(other.Spec,"interactionGroup")==J.S(Spec,"interactionGroup")&&other.Form==next);
			if(!grouped)Emit("interactionOutside",reason:next is null?"appDeactivated":"outsideGroup");
		})); } catch(InvalidOperationException) { }
	}
    protected virtual void Release() { }
    private void OnClosed()
    {
        if(Closed)return;
        FinalBounds=Native.Bounds(NativeID);if(FinalBounds.IsEmpty)FinalBounds=Form.Bounds;
        Closed=true;Revision++;if(CloseReason.Length==0)CloseReason="user";
        Release();Emit("close",reason:CloseReason);if(Registered)Host.Closed(this);
    }
    internal void Close(string reason) {if(Closed)return;FinalBounds=Native.Bounds(Form.Handle);CloseReason=reason;Form.Close();}
    public void Dispose() {if(!Closed){Close("session");}Form.Dispose();}
}
