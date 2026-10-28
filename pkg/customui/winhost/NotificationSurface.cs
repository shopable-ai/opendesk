using System.Diagnostics;
using System.Text.Json.Nodes;

namespace OpenDesk.UIHost;

internal sealed class NotificationSurface : Surface
{
    private JsonObject notice;
    private JsonObject position;
    private readonly NoticeView view;
    private readonly Button dismiss;
    private readonly System.Windows.Forms.Timer timer = new() { Interval=100 };
    private double deadline;
    private bool started;
    private Screen monitor;
    private string? target;
    private string adjustment="";
    private readonly int slot;
    private NoticeLayout layout;
    private static double Now => Stopwatch.GetTimestamp()/(double)Stopwatch.Frequency;
    internal NotificationSurface(Host host,string session,string id,JsonObject spec) : base(host,session,id,spec)
    {
        notice=J.Copy(J.O(spec,"notification"));position=J.Copy(J.O(notice,"position"));
        monitor=Screen.FromPoint(Cursor.Position);
        var occupied=host.Windows.Values.OfType<NotificationSurface>().Where(n=>n.Session==session).Select(n=>n.slot).ToHashSet();
        slot=Enumerable.Range(0,3).FirstOrDefault(i=>!occupied.Contains(i),-1);
        if(slot<0)throw new HostError("UI_BUSY","at most three notifications may be open");
        Form.NonActivating=true;Form.Passive=!J.B(notice,"closable");
        Form.FormBorderStyle=FormBorderStyle.None;Form.TopMost=true;Form.BackgroundDraggable=false;
        Form.Opacity=0.97;Form.BackColor=Color.FromArgb(28,28,32);
        view=new NoticeView(()=>notice,()=>Remaining(),()=>layout) { Dock=DockStyle.Fill,AccessibleRole=AccessibleRole.StaticText };
        dismiss=new Button { Text="×",FlatStyle=FlatStyle.Flat,TabStop=false,AccessibleName="Close notification",ForeColor=Color.White,BackColor=Form.BackColor };
        dismiss.FlatAppearance.BorderSize=0;dismiss.Click+=(_,_)=>Close("user");
        Form.Controls.Add(view);Form.Controls.Add(dismiss);
        timer.Tick+=(_,_)=>{
            if(deadline>0&&Now>=deadline){Close("timeout");return;}
            try {
                if(IsBottomAnchor(position) || J.S(position,"mode")=="auto" || (J.S(position,"mode")=="relative"&&J.B(position,"follow",true)))PlaceNotice(false);
            } catch(HostError error) {Console.Error.WriteLine(error.Message);Close("placement-unavailable");return;}
            view.Invalidate();
        };
        Form.DpiChanged+=(_,_)=> {LayoutNotice();PlaceNotice(false,layout.ClientSize);};
    }
    internal override Task Initialize()
    {
        _=Form.Handle;NativeID=Form.Handle;
        view.SetImage(DecodeImage(notice));
        LayoutNotice();ApplyVisuals();PlaceNotice(true,layout.ClientSize);return Task.CompletedTask;
    }
    private void LayoutNotice()
    {
        layout=NoticeLayout.Measure(Form,notice);
        Form.ClientSize=layout.ClientSize;
        dismiss.Bounds=layout.CloseButton;
        dismiss.BringToFront();
    }
    private void ApplyVisuals()
    {
        bool closable=J.B(notice,"closable");dismiss.Visible=closable;Form.Passive=!closable;
        Native.PassThrough(Form,!closable);
        view.AccessibleName=J.S(notice,"message");view.Invalidate();
    }
    private long Remaining()=>deadline>0?(long)Math.Max(0,Math.Ceiling((deadline-Now)*1000)):0;
    protected override void OnShown()
    {
        if(started)return;started=true;ResetTimeout();timer.Start();
    }
    private void ResetTimeout(){deadline=started&&J.N(notice,"timeoutMs")>0?Now+J.N(notice,"timeoutMs")/1000.0:0;}
    internal override JsonObject State()
    {
        var state=base.State();var n=J.Copy(notice);
        n.Remove("imageAsset");
        n["remainingMs"]=Remaining();if(adjustment.Length>0)n["positionAdjustment"]=adjustment;
        if(CloseReason.Length>0)n["closeReason"]=CloseReason;
        state["notification"]=n;return state;
    }
    protected override Task<JsonNode?> ApplyControl(string operation,JsonObject p)
    {
        if(operation!="updateNotification")return base.ApplyControl(operation,p);
        var next=J.Copy(J.O(p,"spec"));
        using var decoded=DecodeImage(next);
        // Position failure must not commit the text, timer, or saved mode.
        bool reposition=J.B(p,"reposition");
        var previous=position;var previousTarget=target;var previousMonitor=monitor;
        if(reposition){
            position=J.Copy(J.O(next,"position"));
        }
        var nextLayout=NoticeLayout.Measure(Form,next);
        try{PlaceNotice(reposition,nextLayout.ClientSize);}
        catch{position=previous;target=previousTarget;monitor=previousMonitor;throw;}
        view.SetImage(decoded is null?null:new Bitmap(decoded));
        notice=next;ApplyVisuals();if(J.B(p,"resetTimeout"))ResetTimeout();Revision++;
        LayoutNotice();if(reposition)ReflowBottomNotices();
        return Task.FromResult<JsonNode?>(State());
    }
    private void PlaceNotice(bool resolve,Size? proposedSize=null)
    {
        string mode=J.S(position,"mode","auto");
        if(resolve){
            monitor=J.S(position,"display")=="primary"?Screen.PrimaryScreen!:Screen.FromPoint(Cursor.Position);target=null;
            if(mode=="relative")target=J.S(position,"target");
            if(mode=="auto"){
                var candidates=Host.Windows.Values.Where(w=>w.Session==Session&&w is ToolbarSurface&&!w.Closed&&w.Form.Visible).ToArray();
                if(candidates.Length==1)target=candidates[0].ID;
            }
        }
        Surface? parent=null;
        if(target!=null&&Host.Windows.TryGetValue(Host.Key(Session,target),out var found)&&!found.Closed&&found.Form.Visible){parent=found;monitor=Screen.FromHandle(found.Form.Handle);}
        if(!Screen.AllScreens.Any(s=>s.DeviceName==monitor.DeviceName))monitor=Screen.PrimaryScreen!;
        var work=monitor.WorkingArea;var size=proposedSize??Form.Size;
        if(IsBottomAnchor(position)){PlaceBottomStack(work,size);return;}
        int spacing=(int)Math.Ceiling(8*Form.DeviceDpi/96.0),offset=0;
        if(mode=="auto"){
            offset=Host.Windows.Values.OfType<NotificationSurface>()
                .Where(n=>n!=this&&n.Session==Session&&!n.Closed&&n.slot<slot&&J.S(n.position,"mode","auto")=="auto")
                .Sum(n=>n.Form.Height+spacing);
        }
        var frame=new Rectangle(work.Left+(work.Width-size.Width)/2,work.Bottom-size.Height-24-offset,size.Width,size.Height);
        adjustment="";
        if(mode=="absolute"){
            frame.Location=new Point(J.I(position,"x"),J.I(position,"y"));
            var selected=Screen.AllScreens.FirstOrDefault(s=>s.WorkingArea.Contains(frame));
            if(selected==null)throw new HostError("INVALID_SPEC","absolute notification does not fit a display work area");
            monitor=selected;work=monitor.WorkingArea;
        } else if(mode=="anchor"){
            int margin=J.I(position,"margin",24);string h=J.S(position,"horizontal"),v=J.S(position,"vertical");
            frame.X=h=="left"?work.Left+margin:h=="right"?work.Right-size.Width-margin:work.Left+(work.Width-size.Width)/2;
            frame.Y=v=="top"?work.Top+margin:v=="bottom"?work.Bottom-size.Height-margin:work.Top+(work.Height-size.Height)/2;
        } else if(parent!=null){
            var b=Native.Bounds(parent.Form.Handle);int gap=J.I(position,"gap",8);string align=J.S(position,"align","center"),side=J.S(position,"side","bottom");
            Rectangle PlaceSide(string direction){
                var r=new Rectangle(b.X+(b.Width-size.Width)/2,b.Y+(b.Height-size.Height)/2,size.Width,size.Height);
                if(direction is "top" or "bottom"){
                    r.X=align=="start"?b.Left:align=="end"?b.Right-size.Width:r.X;
                    r.Y=direction=="bottom"?b.Bottom+gap+offset:b.Top-gap-size.Height-offset;
                }else{
                    r.Y=align=="start"?b.Top:align=="end"?b.Bottom-size.Height:r.Y;
                    r.X=direction=="right"?b.Right+gap:b.Left-gap-size.Width;
                }return r;
            }
            var proposed=PlaceSide(side);
            if(!work.Contains(proposed)){
                string opposite=side switch{"bottom"=>"top","top"=>"bottom","left"=>"right",_=>"left"};
                proposed=PlaceSide(opposite);adjustment="flipped-"+opposite;
            }
            if(work.Contains(proposed))frame=proposed;else adjustment="work-area-fallback";
        } else if(target!=null)adjustment="target-unavailable";
        if(!work.Contains(frame))throw new HostError("INVALID_SPEC","notification does not fit display work area");
        if(Native.Bounds(Form.Handle)!=frame)Native.Place(Form,frame);
    }
    private static bool IsBottomAnchor(JsonObject p)=>J.S(p,"mode")=="anchor"&&J.S(p,"vertical")=="bottom";
    private void PlaceBottomStack(Rectangle work,Size size)
    {
        var group=Host.Windows.Values.OfType<NotificationSurface>()
            .Where(n=>n!=this&&!n.Closed&&n.Session==Session&&n.monitor.DeviceName==monitor.DeviceName&&JsonNode.DeepEquals(n.position,position))
            .Append(this).OrderBy(n=>n.slot).ToArray();
        var frames=new List<Rectangle>();int offset=0,margin=J.I(position,"margin",24);
        string horizontal=J.S(position,"horizontal");
        foreach(var member in group){
            var measured=member==this?size:member.Form.Size;
            int x=horizontal=="left"?work.Left+margin:horizontal=="right"?work.Right-measured.Width-margin:work.Left+(work.Width-measured.Width)/2;
            var frame=new Rectangle(x,work.Bottom-margin-offset-measured.Height,measured.Width,measured.Height);
            if(!work.Contains(frame))throw new HostError("INVALID_SPEC","notification stack cannot fit display work area");
            frames.Add(frame);offset+=measured.Height+(int)Math.Ceiling(8*Form.DeviceDpi/96.0);
        }
        for(int i=0;i<group.Length;i++){
            group[i].adjustment="";
            if(Native.Bounds(group[i].Form.Handle)!=frames[i])Native.Place(group[i].Form,frames[i]);
        }
    }
    private void ReflowBottomNotices()
    {
        foreach(var member in Host.Windows.Values.OfType<NotificationSurface>().Where(n=>!n.Closed&&n.Session==Session&&IsBottomAnchor(n.position)).ToArray()){
            try{member.PlaceNotice(false);}catch(HostError error){Console.Error.WriteLine(error.Message);}
        }
    }
    private static Bitmap? DecodeImage(JsonObject spec)
    {
        bool declared=spec["image"] is JsonObject;
        if(!declared&&spec["imageAsset"] is not JsonObject)return null;
        try{
            if(!declared||spec["imageAsset"] is not JsonObject asset)throw new InvalidDataException();
            string encoded=J.S(asset,"dataBase64");
            if(encoded.Length>699052)throw new InvalidDataException();
            var data=Convert.FromBase64String(encoded);
            if(data.Length<1||data.Length>512*1024||data.Length!=J.I(asset,"byteLength"))throw new InvalidDataException();
            using var stream=new MemoryStream(data);
            using var decoded=Image.FromStream(stream,false,true);
            if(decoded.Width<1||decoded.Height<1||decoded.Width>1024||decoded.Height>1024||decoded.Width!=J.I(asset,"pixelWidth")||decoded.Height!=J.I(asset,"pixelHeight"))throw new InvalidDataException();
            return new Bitmap(decoded);
        }catch(Exception error) when(error is ArgumentException or InvalidDataException or FormatException or OutOfMemoryException or System.Runtime.InteropServices.ExternalException){
            throw new HostError("INVALID_SPEC","notification image could not be decoded");
        }
    }
    protected override void Release(){timer.Stop();timer.Dispose();view.SetImage(null);ReflowBottomNotices();}
}

internal sealed class NoticeView : Control
{
    private readonly Func<JsonObject> spec;
    private readonly Func<long> remaining;
    private readonly Func<NoticeLayout> currentLayout;
    internal NoticeView(Func<JsonObject> spec,Func<long> remaining,Func<NoticeLayout> currentLayout){this.spec=spec;this.remaining=remaining;this.currentLayout=currentLayout;DoubleBuffered=true;}
    private Bitmap? image;
    internal void SetImage(Bitmap? next){image?.Dispose();image=next;Invalidate();}
    protected override void Dispose(bool disposing){if(disposing){image?.Dispose();image=null;}base.Dispose(disposing);}
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);var n=spec();float s=DeviceDpi/96f;var layout=currentLayout();
        e.Graphics.Clear(Color.FromArgb(28,28,32));
        Color tone=J.S(n,"level") switch{"success"=>Color.FromArgb(65,190,115),"error"=>Color.FromArgb(242,95,100),"warning"=>Color.FromArgb(240,175,60),_=>Color.FromArgb(82,160,255)};
        using var brush=new SolidBrush(tone);e.Graphics.FillRectangle(brush,0,0,4*s,Height);
        if(image is not null){
            var box=layout.Image;float ratio=Math.Min(box.Width/(float)image.Width,box.Height/(float)image.Height);
            float w=image.Width*ratio,h=image.Height*ratio;
            e.Graphics.DrawImage(image,box.X+(box.Width-w)/2,box.Y+(box.Height-h)/2,w,h);
        }
        using var main=new Font("Segoe UI",10.5f,FontStyle.Bold);
        using var small=new Font("Segoe UI",8.5f);
        var flags=TextFormatFlags.WordBreak|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix|TextFormatFlags.NoPadding;
        TextRenderer.DrawText(e.Graphics,J.S(n,"message"),main,layout.Message,Color.White,flags);
        TextRenderer.DrawText(e.Graphics,J.S(n,"caption"),small,layout.Caption,Color.LightGray,flags);
        if(n["progress"] is JsonObject p){
            double value=(J.N(p,"value")-J.N(p,"min"))/Math.Max(0.000001,J.N(p,"max",1)-J.N(p,"min"));
            bool busy=J.B(p,"indeterminate");float busyWidth=128*s;
            float left=busy?(float)(Stopwatch.GetTimestamp()/(double)Stopwatch.Frequency*140%Math.Max(1,layout.Progress.Width-busyWidth)):0;
            e.Graphics.FillRectangle(brush,layout.Progress.X+left,layout.Progress.Y,busy?busyWidth:(float)(layout.Progress.Width*Math.Clamp(value,0,1)),layout.Progress.Height);
        }
        if(J.B(n,"timeoutProgress")&&J.N(n,"timeoutMs")>0){using var countdown=new SolidBrush(Color.Gray);e.Graphics.FillRectangle(countdown,0,Height-layout.CountdownHeight,(float)(Width*Math.Clamp(remaining()/J.N(n,"timeoutMs"),0,1)),layout.CountdownHeight);}
    }
}

internal readonly record struct NoticeLayout(Size ClientSize,Rectangle Image,Rectangle Message,Rectangle Caption,Rectangle CloseButton,Rectangle Progress,int CountdownHeight)
{
    private const int MinimumWidth=280,MaximumWidth=480,MinimumHeight=52,MaximumHeight=124,MessageLines=3,CaptionLines=2;
    private static int Lines(Graphics graphics,string text,Font font,int width,int maximum)
    {
        int lineHeight=Math.Max(1,TextRenderer.MeasureText(graphics,"Ag",font,Size.Empty,TextFormatFlags.NoPadding).Height);
        if(string.IsNullOrEmpty(text))return lineHeight;
        var measured=TextRenderer.MeasureText(graphics,text,font,new Size(width,10000),TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix|TextFormatFlags.NoPadding);
        return lineHeight*Math.Min(maximum,Math.Max(1,(int)Math.Ceiling(measured.Height/(double)lineHeight)));
    }
    private static int TextWidth(Graphics graphics,string text,Font font)
    {
        int width=0;
        foreach(string line in text.Replace("\r\n","\n").Replace('\r','\n').Split('\n'))
            width=Math.Max(width,TextRenderer.MeasureText(graphics,line,font,Size.Empty,TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix|TextFormatFlags.NoPadding).Width);
        return width;
    }
    internal static NoticeLayout Measure(Control control,JsonObject notice)
    {
        float scale=control.DeviceDpi/96f;
        int P(double value)=>(int)Math.Ceiling(value*scale);
        using var main=new Font("Segoe UI",10.5f,FontStyle.Bold);
        using var small=new Font("Segoe UI",8.5f);
        using var graphics=control.CreateGraphics();
        bool closable=J.B(notice,"closable");
        bool hasImage=notice["imageAsset"] is JsonObject;
        int imageOffset=hasImage?P(68):0;
        int chromeWidth=P(closable?60:32)+imageOffset;
        int width=Math.Clamp(Math.Max(TextWidth(graphics,J.S(notice,"message"),main),TextWidth(graphics,J.S(notice,"caption"),small))+chromeWidth,P(MinimumWidth),P(MaximumWidth));
        int textWidth=width-chromeWidth;
        int messageHeight=Lines(graphics,J.S(notice,"message"),main,textWidth,MessageLines);
        string captionText=J.S(notice,"caption");
        int captionHeight=captionText.Length==0?0:Lines(graphics,captionText,small,textWidth,CaptionLines);
        bool hasProgress=notice["progress"] is JsonObject;
        int height=P(10)+messageHeight+P(10)+(captionHeight>0?P(3)+captionHeight:0)+(hasProgress?P(10):0);
        if(hasImage)height=Math.Max(height,P(76)+(hasProgress?P(10):0));
        height=Math.Clamp(height,P(MinimumHeight),P(MaximumHeight));
        int contentHeight=messageHeight+(captionHeight>0?P(3)+captionHeight:0);
        int contentAreaHeight=height-(hasProgress?P(10):0);
        int contentTop=Math.Max(P(10),(contentAreaHeight-contentHeight)/2);
        var message=new Rectangle(P(16)+imageOffset,contentTop,textWidth,messageHeight);
        var caption=new Rectangle(P(16)+imageOffset,message.Bottom+P(3),textWidth,captionHeight);
        var progress=new Rectangle(P(16),height-P(10),width-P(32),P(4));
        bool compactSingleLine=captionHeight==0&&!hasProgress&&contentTop>P(10);
        int closeTop=compactSingleLine?(height-P(26))/2:P(8);
        return new NoticeLayout(new Size(width,height),new Rectangle(P(16),(contentAreaHeight-P(56))/2,P(56),P(56)),message,caption,new Rectangle(width-P(36),closeTop,P(26),P(26)),progress,P(2));
    }
}
