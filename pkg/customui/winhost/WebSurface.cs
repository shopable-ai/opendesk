using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OpenDesk.UIHost;

internal sealed class WebSurface : Surface
{
    private readonly WebView2 web=new() { Dock=DockStyle.Fill };
    private readonly HashSet<string> ids;
    private readonly string root;
    private readonly string profile;
    private CoreWebView2Environment? environment;
    internal WebSurface(Host host,string session,string id,JsonObject spec) : base(host,session,id,spec)
    {
        ids=J.A(spec,"controls").OfType<JsonObject>().Select(c=>J.S(c,"id")).ToHashSet();
        root=Path.GetFullPath(J.S(J.O(spec,"content"),"basePath"));
        profile=Path.Combine(Path.GetTempPath(),"opendesk-ui",Environment.ProcessId+"-"+Guid.NewGuid().ToString("N"));
        Form.FormBorderStyle=J.B(spec,"centerOnActiveDisplay")?FormBorderStyle.FixedDialog:FormBorderStyle.SizableToolWindow;
        Form.MaximizeBox=!J.B(spec,"centerOnActiveDisplay");Form.MinimizeBox=false;
        Form.Controls.Add(web);
    }
    internal override async Task Initialize()
    {
        InitializeFrame();
        try { _=CoreWebView2Environment.GetAvailableBrowserVersionString(); }
        catch(WebView2RuntimeNotFoundException) { throw new HostError("UNSUPPORTED_CAPABILITY","HTML Custom UI and Dialog require Microsoft Edge WebView2 Runtime; FloatingWindow and ui.notify do not"); }
        environment=await CoreWebView2Environment.CreateAsync(null,profile,new CoreWebView2EnvironmentOptions());
        environment.BrowserProcessExited+=(_,_)=>DeleteProfile();
        await web.EnsureCoreWebView2Async(environment).WaitAsync(TimeSpan.FromSeconds(15));
        var core=web.CoreWebView2;
        core.Settings.IsScriptEnabled=false; // document code off; only fixed host ExecuteScript runs
        core.Settings.AreHostObjectsAllowed=false;
        core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
        core.Settings.IsStatusBarEnabled=false;core.Settings.AreBrowserAcceleratorKeysEnabled=false;
        core.Settings.IsZoomControlEnabled=false;core.Settings.IsWebMessageEnabled=true;
        core.Settings.IsPasswordAutosaveEnabled=false;core.Settings.IsGeneralAutofillEnabled=false;
        core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
        core.NewWindowRequested+=(_,e)=>e.Handled=true;
        core.DownloadStarting+=(_,e)=>e.Cancel=true;
        ulong documentNavigationId=0;
        bool documentNavigationPending=false;
        core.NavigationStarting+=(_,e)=>{
            if(documentNavigationPending && e.Uri=="about:blank") {
                if(documentNavigationId==0)documentNavigationId=e.NavigationId;
                if(e.NavigationId==documentNavigationId)return;
            }
            e.Cancel=true;
        };
        core.FrameNavigationStarting+=(_,e)=>e.Cancel=true;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=ResourceRequested;
        core.WebMessageReceived+=MessageReceived;
        var navigation=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        EventHandler<CoreWebView2NavigationCompletedEventArgs>? complete=null;
        complete=(_,e)=>{
            // NavigateToString may replace WebView2's still-finishing initial
            // about:blank navigation. Ignore that cancelled completion and
            // resolve only the navigation started for our fixed document.
            if(documentNavigationId==0 || e.NavigationId!=documentNavigationId)return;
            core.NavigationCompleted-=complete;documentNavigationPending=false;
            if(e.IsSuccess)navigation.TrySetResult();else navigation.TrySetException(new HostError("UI_DRIVER_FAILURE","Custom UI navigation failed: "+e.WebErrorStatus));
        };
        core.NavigationCompleted+=complete;
        var content=J.O(Spec,"content");
        string document="<!doctype html><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https://opendesk.invalid; base-uri https://opendesk.invalid; form-action 'none'; frame-src 'none'\"><base href='https://opendesk.invalid/'>"+J.S(content,"html");
        documentNavigationPending=true;
        core.NavigateToString(document);
        await navigation.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var types=new JsonObject();var array=new JsonArray();
        foreach(var c in J.A(Spec,"controls").OfType<JsonObject>()){string id=J.S(c,"id");array.Add(id);types[id]=J.S(c,"type");}
        var config=new JsonObject { ["ids"]=array,["types"]=types,["css"]=J.S(content,"css"),["draggable"]=Form.BackgroundDraggable };
        using var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("OpenDesk.UIHost.bridge.js") ?? throw new HostError("UI_DRIVER_FAILURE","fixed WebView bridge is missing");
        string source=await new StreamReader(resource).ReadToEndAsync();
        await Eval(source.Replace("__CONFIG__",config.ToJsonString()));
        if(J.B(Spec,"centerOnActiveDisplay")) {
            var layout=await Eval("(()=>{const r=document.getElementById('dialogRoot');return r?Math.ceil(Math.max(r.scrollHeight,r.getBoundingClientRect().height)):0;})()");
            double height=layout?.GetValue<double>()??0;
            if(height>0){
                var area=Screen.FromHandle(Form.Handle).WorkingArea;int scaleHeight=(int)Math.Ceiling(height*Form.DeviceDpi/96.0);
                Form.ClientSize=new Size(Form.ClientSize.Width,Math.Min(area.Height-80,Math.Max(Form.ClientSize.Height,scaleHeight)));
                Native.Place(Form,new Rectangle(area.X+(area.Width-Form.Width)/2,area.Y+(area.Height-Form.Height)/2,Form.Width,Form.Height));
            }
        }
    }
    private async Task<JsonNode?> Eval(string source)
    {
        string expression=source.Trim().TrimEnd(';');
        string wrapper="(()=>{try{return {ok:true,value:("+expression+")};}catch(e){return {ok:false,error:String(e)};}})()";
        string raw=await web.CoreWebView2.ExecuteScriptAsync(wrapper).WaitAsync(TimeSpan.FromSeconds(10));
        var result=JsonNode.Parse(raw) as JsonObject ?? throw new HostError("UI_DRIVER_FAILURE","invalid WebView response");
        if(!J.B(result,"ok"))throw new HostError("UI_DRIVER_FAILURE",J.S(result,"error"));
        return result["value"]?.DeepClone();
    }
    private void ResourceRequested(object? sender,CoreWebView2WebResourceRequestedEventArgs e)
    {
        if(environment is null)return;
        try {
            var uri=new Uri(e.Request.Uri);
            if(uri.Scheme!="https"||uri.Host!="opendesk.invalid"||e.ResourceContext!=CoreWebView2WebResourceContext.Image)throw new UnauthorizedAccessException();
            string relative=Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/').Replace('/',Path.DirectorySeparatorChar);
            string path=Path.GetFullPath(Path.Combine(root,relative));
            string prefix=root.TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
            if(!path.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new UnauthorizedAccessException();
            string extension=Path.GetExtension(path).ToLowerInvariant();
            string mime=extension switch{".png"=>"image/png",".jpg" or ".jpeg"=>"image/jpeg",".gif"=>"image/gif",".webp"=>"image/webp",".bmp"=>"image/bmp",".ico"=>"image/x-icon",_=>throw new UnauthorizedAccessException()};
            // Never follow junctions/symlinks introduced after the Go validator.
            string current=root;
            if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new UnauthorizedAccessException();
            foreach(string part in Path.GetRelativePath(root,path).Split(Path.DirectorySeparatorChar)) {current=Path.Combine(current,part);if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new UnauthorizedAccessException();}
            if(new FileInfo(path).Length>8*1024*1024)throw new UnauthorizedAccessException();
            var bytes=File.ReadAllBytes(path);
            e.Response=environment.CreateWebResourceResponse(new MemoryStream(bytes),200,"OK","Content-Type: "+mime+"\r\nCache-Control: no-store");
        } catch {e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Forbidden","Content-Type: text/plain");}
    }
    private void MessageReceived(object? sender,CoreWebView2WebMessageReceivedEventArgs e)
    {
        if(Closed)return;
        try {
            var message=JsonNode.Parse(e.WebMessageAsJson) as JsonObject;
            if(message is null)return;string type=J.S(message,"type"),target=J.S(message,"targetId");
            if(type=="drag"&&Form.BackgroundDraggable){Native.Drag(Form);return;}
            if(type=="dialogCancel"&&J.B(Spec,"centerOnActiveDisplay")){Close("user");return;}
            if(type is not("click" or "input" or "change")||!ids.Contains(target))return;
            JsonObject? bounds=null;
            if(message["bounds"] is JsonObject && type=="click") {
                // Event screen coordinates from a browser are not native truth.
                // Fixed bridge includes localBounds in click messages below.
                if(message["localBounds"] is JsonObject local)bounds=MapLocal(local);
            }
            Emit(type,target,message["value"],message["checked"]?.GetValue<bool>(),bounds);
        } catch(Exception error){Console.Error.WriteLine("ignored invalid UI bridge event: "+error.Message);}
    }
    private JsonObject MapLocal(JsonObject local)
    {
        double scale=web.DeviceDpi/96.0;
        var p=web.PointToScreen(new Point((int)Math.Round(J.N(local,"x")*scale),(int)Math.Round(J.N(local,"y")*scale)));
        return J.Rect(new Rectangle(p.X,p.Y,(int)Math.Round(J.N(local,"width")*scale),(int)Math.Round(J.N(local,"height")*scale)));
    }
    protected override async Task<JsonNode?> ApplyControl(string operation,JsonObject payload)
    {
        if(operation is not("getControlState" or "updateControl"))return await base.ApplyControl(operation,payload);
        string id=J.S(payload,"id");if(!ids.Contains(id))throw new HostError("NOT_FOUND","control was not found");
        string expression=operation=="getControlState"?"window.__opendesk.state("+JsonSerializer.Serialize(id)+")"
            :"window.__opendesk.update("+JsonSerializer.Serialize(id)+","+J.O(payload,"patch").ToJsonString()+")";
        var result=await Eval(expression) as JsonObject ?? throw new HostError("UI_DRIVER_FAILURE","control readback was not an object");
        if(result["localBounds"] is JsonObject local)result["screenBounds"]=MapLocal(local);
        return result;
    }
    internal override async Task<JsonNode?> Apply(string operation,JsonObject payload)
    {
        var state=await base.Apply(operation,payload);
        if(operation=="setDraggable")await Eval("window.__opendesk.setDraggable("+(Form.BackgroundDraggable?"true":"false")+")");
        if(operation=="show"&&!Form.NonActivating){web.Focus();await Eval("(()=>{const e=document.querySelector('[data-opendesk-dialog-focus]');if(e)e.focus();})()");}
        return state;
    }
    private void DeleteProfile(){try{if(Directory.Exists(profile))Directory.Delete(profile,true);}catch(IOException){}catch(UnauthorizedAccessException){}}
    protected override void Release(){web.Dispose();DeleteProfile();}
}
