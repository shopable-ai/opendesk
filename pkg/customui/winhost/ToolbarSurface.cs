using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;

namespace OpenDesk.UIHost;

internal sealed class ToolbarSurface : Surface
{
    private readonly Dictionary<string,Control> peers=new();
    private readonly Dictionary<string,JsonObject> declarations=new();
    private readonly Dictionary<string,string> kinds=new();
    private readonly Dictionary<string,RectangleF> boxes=new();
    private readonly ToolTip tips=new(){ShowAlways=true,InitialDelay=400,AutoPopDelay=6000};
    private readonly JsonObject toolbar;
    private Control? tooltipPeer;
    private SizeF desired;
    internal ToolbarSurface(Host host,string session,string id,JsonObject spec):base(host,session,id,spec)
    {
        toolbar=J.O(spec,"toolbar");
        tips.Popup+=(_,e)=>tooltipPeer=e.AssociatedControl;
        Form.FormBorderStyle=FormBorderStyle.FixedToolWindow;Form.MaximizeBox=false;Form.MinimizeBox=false;
        Form.BackColor=Color.FromArgb(24,24,27);Form.ForeColor=Color.White;
        // FloatingWindow show() is always non-activating. A real Input may
        // explicitly activate the form only after the user's own mouse action.
        Form.NonActivating=true;
        Form.DpiChanged+=(_,_)=>ApplyGeometry();
    }
    internal override Task Initialize()
    {
        if(J.I(toolbar,"schemaVersion")!=4)throw new HostError("INVALID_SPEC","unsupported toolbar schema");
        Plan();
        foreach(var item in J.A(toolbar,"items").OfType<JsonObject>()) {
            string id=J.S(item,"id"),kind=J.S(item,"type");
            if(!boxes.ContainsKey(id))continue; // structural boundary omitted by wrapping
            if(kind=="spacer")continue;
            if(kind=="separator") {
                var line=new Panel{BackColor=Color.FromArgb(85,85,88),TabStop=false};peers[id]=line;kinds[id]=kind;Form.Controls.Add(line);continue;
            }
            JsonObject declaration=J.Copy(J.O(item,kind=="button"?"button":kind=="label"?"label":"control"));
            declarations[id]=declaration;kinds[id]=kind;
            Control peer=CreatePeer(id,kind,declaration);peers[id]=peer;
            peer.AccessibleName=J.S(declaration,kind=="label"?"text":"label");
            Form.Controls.Add(peer);ApplyDeclaration(id,declaration);
        }
        _=Form.Handle;NativeID=Form.Handle;ApplyGeometry();
        InitializeFrame(Form.ClientSize);
        return Task.CompletedTask;
    }
    private void Plan()
    {
        var items=J.A(toolbar,"items").OfType<JsonObject>().ToArray();
        if(items.Length==0||items.Length>63)throw new HostError("INVALID_SPEC","toolbar item count invalid");
        bool vertical=J.S(toolbar,"orientation")=="vertical";
        float Width(JsonObject i)=>J.S(i,"type") switch{"button"=>40,"separator"=>vertical?40:1,"spacer"=>vertical?40:0,"label"=>(float)J.N(J.O(i,"label"),"width"),_=>(float)J.N(J.O(i,"control"),"width")};
        if(vertical){
            float y=8,max=40;string previous="";
            foreach(var item in items){if(y>8&&previous!="spacer")y+=8;float width=Width(item),height=J.S(item,"type") switch{"separator"=>1,"spacer"=>0,_=>40};boxes[J.S(item,"id")]=new RectangleF(10,y,width,height);y+=height;max=Math.Max(max,width);previous=J.S(item,"type");}
            desired=new SizeF(max+20,y+8);return;
        }
        float maxWidth=(float)J.N(toolbar,"maxWidth",960);if(maxWidth==0)maxWidth=960;
        int maxColumns=J.I(toolbar,"maxColumns",19),maxRows=J.I(toolbar,"maxRows");
        var rows=new List<List<JsonObject>>();var row=new List<JsonObject>();JsonObject? pending=null;int count=0;
        float RowWidth(IEnumerable<JsonObject> sequence){float width=0;string prev="";bool first=true;foreach(var i in sequence){if(!first&&prev!="spacer")width+=8;width+=Width(i);prev=J.S(i,"type");first=false;}return width;}
        void Flush(){if(row.Count>0){rows.Add(row);row=new();count=0;}}
        foreach(var item in items){
            string type=J.S(item,"type");if(type is "separator" or "spacer"){pending=item;continue;}
            var proposed=new List<JsonObject>(row);if(pending!=null)proposed.Add(pending);proposed.Add(item);
            if(count>=maxColumns||RowWidth(proposed)>maxWidth-20){Flush();pending=null;}
            if(Width(item)>maxWidth-20)throw new HostError("INVALID_SPEC","toolbar item exceeds maxWidth");
            if(pending!=null){row.Add(pending);pending=null;}row.Add(item);count++;
        }
        Flush();if(maxRows>0&&rows.Count>maxRows)throw new HostError("INVALID_SPEC","toolbar exceeds maxRows");
        float yRow=8,widest=40;
        foreach(var r in rows){float x=10;string prev="";foreach(var i in r){if(x>10&&prev!="spacer")x+=8;float w=Width(i);boxes[J.S(i,"id")]=new RectangleF(x,yRow,w,40);x+=w;prev=J.S(i,"type");}widest=Math.Max(widest,x-10);yRow+=48;}
        if(J.N(toolbar,"maxWidth")==0 && items.All(i=>J.S(i,"type")=="button") && items.Length>19)widest=940;
        desired=new SizeF(widest+20,yRow); // 8 top + rows*40 + gaps + 8 bottom
    }
    private void ApplyGeometry()
    {
        float scale=Form.DeviceDpi/96f;
        Form.ClientSize=new Size((int)Math.Ceiling(desired.Width*scale),(int)Math.Ceiling(desired.Height*scale));
        foreach(var (id,peer) in peers){var b=boxes[id];peer.Bounds=new Rectangle((int)Math.Round(b.X*scale),(int)Math.Round(b.Y*scale),(int)Math.Round(b.Width*scale),(int)Math.Round(b.Height*scale));}
    }
    private Control CreatePeer(string id,string kind,JsonObject d)
    {
        switch(kind){
            case "button":
                var button=new IconButton(()=>declarations[id]){TabStop=false};
                button.Click+=(_,_)=>{if(!Mutating&&!J.B(J.O(declarations[id],"state"),"disabled")&&!J.B(J.O(declarations[id],"state"),"busy"))Emit("click",id,bounds:J.Rect(button.RectangleToScreen(button.ClientRectangle)));};return button;
            case "label":return new Label{AutoSize=false,AutoEllipsis=true,UseMnemonic=false,BackColor=Form.BackColor,ForeColor=Color.White,AccessibleRole=AccessibleRole.StaticText};
            case "switch":case "checkbox":
                var check=new CheckBox{AutoSize=false,ForeColor=Color.White,BackColor=Form.BackColor,UseVisualStyleBackColor=false,TextAlign=ContentAlignment.MiddleLeft,Appearance=kind=="switch"?Appearance.Button:Appearance.Normal};
                check.CheckedChanged+=(_,_)=>{if(!Mutating){declarations[id]["checked"]=check.Checked;Emit("change",id,check:check.Checked);}};return check;
            case "input":
                var input=new TextBox{AutoSize=false,BorderStyle=BorderStyle.FixedSingle,MaxLength=checked(2*J.I(d,"maxLength",256)),PlaceholderText=J.S(d,"placeholder")};
                input.MouseDown+=(_,_)=>Form.AllowActivation(input);
                input.TextChanged+=(_,_)=>{if(!Mutating){
                    int limit=J.I(declarations[id],"maxLength",256);
                    var text=string.Concat(input.Text.EnumerateRunes().Take(limit).Select(r=>r.ToString()));
                    if(text!=input.Text){Mutating=true;try{input.Text=text;input.SelectionStart=text.Length;}finally{Mutating=false;}}
                    declarations[id]["text"]=input.Text;Emit("input",id,JsonValue.Create(input.Text));}};
                input.Validated+=(_,_)=>{if(!Mutating)Emit("change",id,JsonValue.Create(input.Text));};return input;
            case "select":
                var select=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,IntegralHeight=true};
                foreach(var o in J.A(d,"options").OfType<JsonObject>())select.Items.Add(new Choice(J.S(o,"value"),J.S(o,"label")));
                select.SelectedIndexChanged+=(_,_)=>{if(!Mutating&&select.SelectedItem is Choice option){declarations[id]["selected"]=option.Value;Emit("change",id,JsonValue.Create(option.Value));}};return select;
            case "slider":
                double min=J.N(d,"min"),max=J.N(d,"max"),step=J.N(d,"step",1);
                int steps=(int)Math.Min(100000,Math.Ceiling((max-min)/step));
                var slider=new TrackBar{Minimum=0,Maximum=Math.Max(1,steps),TickStyle=TickStyle.None,AutoSize=false,SmallChange=1,LargeChange=Math.Max(1,steps/10),BackColor=Form.BackColor};
                slider.ValueChanged+=(_,_)=>{if(!Mutating){double raw=min+(max-min)*slider.Value/slider.Maximum;double value=Math.Clamp(min+Math.Round((raw-min)/step)*step,min,max);declarations[id]["value"]=value;Emit("change",id,JsonValue.Create(value));}};return slider;
            case "segmentedControl":
                var segments=new TableLayoutPanel{ColumnCount=J.A(d,"options").Count,RowCount=1,Margin=Padding.Empty,Padding=Padding.Empty,BackColor=Form.BackColor,AccessibleRole=AccessibleRole.Grouping};
                int index=0;foreach(var o in J.A(d,"options").OfType<JsonObject>()){
                    string value=J.S(o,"value");var radio=new RadioButton{Appearance=Appearance.Button,Text=J.S(o,"label"),TextAlign=ContentAlignment.MiddleCenter,Dock=DockStyle.Fill,Margin=Padding.Empty,Tag=value,AccessibleRole=AccessibleRole.RadioButton,AutoSize=false};
                    segments.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100f/segments.ColumnCount));segments.Controls.Add(radio,index++,0);
                    radio.CheckedChanged+=(_,_)=>{if(!Mutating&&radio.Checked){declarations[id]["selected"]=value;Emit("change",id,JsonValue.Create(value));}};
                }return segments;
            case "progress":return new ProgressBar{Minimum=0,Maximum=10000,Style=ProgressBarStyle.Continuous,TabStop=false,MarqueeAnimationSpeed=80};
            default:throw new HostError("INVALID_SPEC","unknown toolbar item kind: "+kind);
        }
    }
    private void ApplyDeclaration(string id,JsonObject d)
    {
        Mutating=true;
        try{
            var peer=peers[id];string kind=kinds[id];
            peer.AccessibleName=J.S(d,kind=="label"?"text":"label");tips.SetToolTip(peer,peer.AccessibleName);
            switch(kind){
                case "button":peer.Enabled=!J.B(J.O(d,"state"),"disabled")&&!J.B(J.O(d,"state"),"busy");((IconButton)peer).Changed();break;
                case "label":
                    var label=(Label)peer;label.Text=J.S(d,"text");
                    string h=J.S(d,"alignment"),v=J.S(d,"verticalAlignment");
                    label.TextAlign=(v,h) switch{("top","leading")=>ContentAlignment.TopLeft,("top","center")=>ContentAlignment.TopCenter,("top",_)=>ContentAlignment.TopRight,("bottom","leading")=>ContentAlignment.BottomLeft,("bottom","center")=>ContentAlignment.BottomCenter,("bottom",_)=>ContentAlignment.BottomRight,(_,"leading")=>ContentAlignment.MiddleLeft,(_,"center")=>ContentAlignment.MiddleCenter,_=>ContentAlignment.MiddleRight};
                    label.ForeColor=J.S(d,"tone") switch{"success"=>Color.LightGreen,"warning"=>Color.Orange,"error"=>Color.LightCoral,"secondary"=>Color.LightGray,_=>Color.White};break;
                default:
                    peer.Enabled=!J.B(d,"disabled");
                    switch(peer){
                        case CheckBox check:
                            bool compactSwitch=kind=="switch"&&J.N(d,"width")<80;
                            check.Text=compactSwitch?"":J.S(d,"label");check.Checked=J.B(d,"checked");
                            if(kind=="switch")check.BackColor=check.Checked?Color.FromArgb(10,132,255):Color.FromArgb(85,85,90);
                            break;
                        case TextBox input:input.Text=J.S(d,"text");input.PlaceholderText=J.S(d,"placeholder");break;
                        case ComboBox select:for(int i=0;i<select.Items.Count;i++)if(select.Items[i] is Choice choice&&choice.Value==J.S(d,"selected"))select.SelectedIndex=i;break;
                        case TrackBar slider:slider.Value=Math.Clamp((int)Math.Round((J.N(d,"value")-J.N(d,"min"))/(J.N(d,"max")-J.N(d,"min"))*slider.Maximum),0,slider.Maximum);break;
                        case TableLayoutPanel segments:foreach(RadioButton radio in segments.Controls)radio.Checked=(string?)radio.Tag==J.S(d,"selected");break;
                        case ProgressBar progress:progress.Style=J.B(d,"indeterminate")?ProgressBarStyle.Marquee:ProgressBarStyle.Continuous;progress.Value=Math.Clamp((int)((J.N(d,"value")-J.N(d,"min"))/(J.N(d,"max",1)-J.N(d,"min"))*10000),0,10000);break;
                    }break;
            }
        }finally{Mutating=false;}
    }
    private JsonObject Readback(string id)
    {
        if(!declarations.TryGetValue(id,out var d))throw new HostError("NOT_FOUND","toolbar item was not found");
        var result=J.Copy(d);var peer=peers[id];string kind=kinds[id];
        result["localBounds"]=new JsonObject { ["x"]=boxes[id].X,["y"]=boxes[id].Y,["width"]=boxes[id].Width,["height"]=boxes[id].Height };
        result["screenBounds"]=J.Rect(peer.RectangleToScreen(peer.ClientRectangle));
        result["accessibilityName"]=peer.AccessibleName??"";
        if(kind=="button"){
            result.Remove("iconImage");result["renderedText"]="";result["tooltip"]=tips.GetToolTip(peer);result["tooltipVisible"]=ReferenceEquals(tooltipPeer,peer)&&Native.VisibleTooltip();
            result["iconPresentation"]=Icons.Presentation(d);
            result["accessibilityValue"]=J.S(d,"badge");
        }else if(kind=="label"){
            result["renderedText"]=peer.Text;result["accessibilityRole"]="staticText";result["accessibilityValue"]=peer.Text;
            var measured=TextRenderer.MeasureText(peer.Text,peer.Font,new Size(int.MaxValue,int.MaxValue),TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix);
            result["truncated"]=measured.Width>peer.ClientSize.Width;
            float scale=Form.DeviceDpi/96f;float width=Math.Min(peer.Width,measured.Width)/scale,height=Math.Min(peer.Height,measured.Height)/scale;
            var box=boxes[id];string h=J.S(d,"alignment"),v=J.S(d,"verticalAlignment");
            result["renderedTextBounds"]=new JsonObject { ["x"]=box.X+(h=="center"?(box.Width-width)/2:h=="trailing"?box.Width-width:0),["y"]=box.Y+(v=="center"?(box.Height-height)/2:v=="bottom"?box.Height-height:0),["width"]=width,["height"]=height };
        }else{
            result["focused"]=peer.ContainsFocus;
            JsonNode? value=peer switch{CheckBox check=>JsonValue.Create(check.Checked),TextBox input=>JsonValue.Create(input.Text),ComboBox select=>JsonValue.Create((select.SelectedItem as Choice)?.Value??""),TrackBar=>d["value"]?.DeepClone(),TableLayoutPanel=>d["selected"]?.DeepClone(),ProgressBar=>d["value"]?.DeepClone(),_=>null};
            result["renderedValue"]=value?.DeepClone();result["accessibilityValue"]=value;
            result["accessibilityRole"]=kind switch{"switch"=>"switch","checkbox"=>"checkbox","input"=>"textField","select"=>"popUpButton","slider"=>"slider","segmentedControl"=>"radioGroup",_=>"progressIndicator"};
            result["accessibilitySubrole"]="";
        }
        return result;
    }
    protected override Task<JsonNode?> ApplyControl(string operation,JsonObject payload)
    {
        string family=operation.Contains("Button")?"button":operation.Contains("Label")?"label":operation.Contains("ToolbarControl")?"control":"";
        if(family=="")return base.ApplyControl(operation,payload);
        string id=operation.StartsWith("get")?J.S(payload,"id"):J.S(J.O(payload,family),"id");
        if(!declarations.TryGetValue(id,out var current))throw new HostError("NOT_FOUND","toolbar item was not found");
        if((family=="button"&&kinds[id]!="button")||(family=="label"&&kinds[id]!="label")||(family=="control"&&kinds[id] is "button" or "label"))throw new HostError("INVALID_SPEC","toolbar item family mismatch");
        if(operation.StartsWith("apply")){
            var next=J.Copy(J.O(payload,family));double rev=family=="button"?J.N(J.O(next,"state"),"revision"):J.N(next,"revision");
            double previous=family=="button"?J.N(J.O(current,"state"),"revision"):J.N(current,"revision");
            if(rev>=previous){
                if(family!="button"&&J.N(current,"width")!=J.N(next,"width"))throw new HostError("INVALID_SPEC","toolbar width cannot change after show");
                declarations[id]=next;ApplyDeclaration(id,next);Revision++;
            }
        }
        return Task.FromResult<JsonNode?>(Readback(id));
    }
    protected override void Release(){tips.Dispose();foreach(var peer in peers.Values)peer.Dispose();}
    private sealed record Choice(string Value,string Label){public override string ToString()=>Label;}
}

internal sealed class IconButton : Button
{
    private readonly Func<JsonObject> spec;
    private readonly System.Windows.Forms.Timer animation=new(){Interval=80};
    private Image? image;
    private string imageKey="";
    internal IconButton(Func<JsonObject> spec){this.spec=spec;FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;DoubleBuffered=true;animation.Tick+=(_,_)=>Invalidate();}
    internal void Changed(){var d=spec();if(J.B(J.O(d,"state"),"busy"))animation.Start();else animation.Stop();Invalidate();}
    protected override void OnPaint(PaintEventArgs e)
    {
        var d=spec();var state=J.O(d,"state");bool active=J.B(state,"active"),busy=J.B(state,"busy");
        e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;e.Graphics.Clear(active?Color.FromArgb(55,95,135):Color.FromArgb(35,35,39));
        float scale=DeviceDpi/96f;Color foreground=Enabled?Color.White:Color.Gray;
        if(busy){using var pen=new Pen(Color.LightSkyBlue,2*scale);e.Graphics.DrawArc(pen,10*scale,10*scale,20*scale,20*scale,(float)(Stopwatch.GetTimestamp()/(double)Stopwatch.Frequency*240%360),260);}
        else if(d["iconImage"] is JsonObject raster){
            string key=J.S(raster,"dataBase64");
            if(key!=imageKey){image?.Dispose();using var bytes=new MemoryStream(Convert.FromBase64String(key));using var decoded=Image.FromStream(bytes);image=new Bitmap(decoded);imageKey=key;}
            if(image!=null){float size=24*scale,factor=Math.Min(size/image.Width,size/image.Height);var r=new RectangleF((Width-image.Width*factor)/2,(Height-image.Height*factor)/2,image.Width*factor,image.Height*factor);
                if(J.S(raster,"renderingMode")=="template"){
                    using var attributes=new System.Drawing.Imaging.ImageAttributes();
                    var matrix=new System.Drawing.Imaging.ColorMatrix(new float[][]{new[]{0f,0,0,0,0},new[]{0f,0,0,0,0},new[]{0f,0,0,0,0},new[]{0f,0,0,1,0},new[]{foreground.R/255f,foreground.G/255f,foreground.B/255f,0,1}});
                    attributes.SetColorMatrix(matrix);e.Graphics.DrawImage(image,Rectangle.Round(r),0,0,image.Width,image.Height,GraphicsUnit.Pixel,attributes);
                }else e.Graphics.DrawImage(image,r);
            }
        }else{
            using var font=new Font("Segoe UI Symbol",16,FontStyle.Regular);TextRenderer.DrawText(e.Graphics,Icons.Glyph(J.S(d,"icon")),font,ClientRectangle,foreground,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPrefix);
        }
        string badge=J.S(d,"badge");if(badge.Length>0){using var font=new Font("Segoe UI",7,FontStyle.Bold);TextRenderer.DrawText(e.Graphics,badge,font,new Rectangle(0,0,Width,Height/2),Color.White,TextFormatFlags.Right|TextFormatFlags.Top|TextFormatFlags.NoPrefix);}
        if(J.S(state,"error").Length>0){using var pen=new Pen(Color.OrangeRed,2*scale);e.Graphics.DrawRectangle(pen,1,1,Width-3,Height-3);}
    }
    protected override void Dispose(bool disposing){if(disposing){animation.Dispose();image?.Dispose();}base.Dispose(disposing);}
}

internal static class Icons
{
    private static readonly Dictionary<string,JsonObject> registry=Load();
    private static Dictionary<string,JsonObject> Load(){using var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("OpenDesk.UIHost.icons.json")??throw new InvalidDataException("Windows icon registry missing");var root=JsonNode.Parse(stream)!.AsObject();return root.ToDictionary(p=>p.Key,p=>p.Value!.AsObject());}
    internal static string Glyph(string name)=>registry.TryGetValue(name,out var v)?J.S(v,"glyph"):throw new HostError("INVALID_SPEC","unknown toolbar icon");
    internal static JsonObject Presentation(JsonObject d){
        if(d["iconImage"] is JsonObject image)return new JsonObject { ["kind"]="image",["mediaType"]=J.S(image,"mediaType"),["pixelWidth"]=J.I(image,"pixelWidth"),["pixelHeight"]=J.I(image,"pixelHeight"),["renderingMode"]=J.S(image,"renderingMode") };
        var icon=registry[J.S(d,"icon")];return new JsonObject { ["kind"]="windowsGlyph",["systemSymbol"]="",["scale"]=1,["offsetX"]=0,["offsetY"]=0,["glyph"]=J.S(icon,"glyph"),["fontFamily"]="Segoe UI Symbol" };
    }
}
