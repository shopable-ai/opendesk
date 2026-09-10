using System.Runtime.InteropServices;

namespace OpenDesk.UIHost;

internal static class Native
{
    private delegate bool EnumWindow(nint handle,nint state);
    [DllImport("user32.dll")] private static extern bool EnumThreadWindows(uint thread,EnumWindow callback,nint state);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassNameW(nint handle,System.Text.StringBuilder name,int size);
    internal static bool VisibleTooltip(){
        bool found=false;
        EnumThreadWindows(GetCurrentThreadId(),(handle,_)=>{var name=new System.Text.StringBuilder(128);GetClassNameW(handle,name,128);if(name.ToString()=="tooltips_class32"&&IsWindowVisible(handle)){found=true;return false;}return true;},0);
        return found;
    }

    [StructLayout(LayoutKind.Sequential)] internal struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(nint hwnd, out RECT rect);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] internal static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(nint hwnd);
    [DllImport("user32.dll", SetLastError=true)] internal static extern bool SetWindowPos(nint hwnd,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] internal static extern nint GetWindowLongPtrW(nint hwnd,int index);
    [DllImport("user32.dll", SetLastError=true)] internal static extern nint SetWindowLongPtrW(nint hwnd,int index,nint value);
    [DllImport("user32.dll")] internal static extern bool ReleaseCapture();
    [DllImport("user32.dll")] internal static extern nint SendMessageW(nint hwnd,uint msg,nint wparam,nint lparam);
    [DllImport("dwmapi.dll")] internal static extern int DwmFlush();
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(nint hwnd,int attr,out int value,int size);
    internal static Rectangle Bounds(nint handle) => GetWindowRect(handle,out var r) ? Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom) : Rectangle.Empty;
    internal static bool OnScreen(nint handle) => IsWindow(handle) && IsWindowVisible(handle) &&
        (DwmGetWindowAttribute(handle,14,out int cloaked,4) != 0 || cloaked == 0);
    internal static void Place(Form window, Rectangle r)
    {
        if (r.Width<=0 || r.Height<=0) throw new HostError("INVALID_SPEC","window dimensions must be positive");
        // Public bounds use the native desktop coordinate space. Under PMv2,
        // Win32 logical screen coordinates and physical pixels coincide.
        if (!SetWindowPos(window.Handle,0,r.X,r.Y,r.Width,r.Height,0x0004|0x0010|0x0200))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    internal static void PassThrough(Form window,bool pass)
    {
        long style=GetWindowLongPtrW(window.Handle,-20).ToInt64();
        // A layered non-activating notification is wholly mouse-transparent in
        // passive mode. Interactive mode deliberately removes WS_EX_TRANSPARENT.
        style=pass ? style|0x20|0x80000 : style&~0x20;
        SetWindowLongPtrW(window.Handle,-20,(nint)style);
    }
    internal static void Drag(Form window) { ReleaseCapture(); SendMessageW(window.Handle,0xA1,2,0); }
}

internal sealed class NativeForm : Form
{
    internal bool NonActivating;
    internal bool Passive;
    internal bool BackgroundDraggable;
    internal NativeForm()
    {
        StartPosition=FormStartPosition.Manual; ShowInTaskbar=false;
        AutoScaleMode=AutoScaleMode.None; DoubleBuffered=true;
        Font=new Font("Segoe UI",10,FontStyle.Regular,GraphicsUnit.Point);
    }
    protected override bool ShowWithoutActivation => NonActivating;
    internal void AllowActivation(Control target)
    {
        if (NonActivating) {
            NonActivating=false;
            long style=Native.GetWindowLongPtrW(Handle,-20).ToInt64()&~0x08000000L;
            Native.SetWindowLongPtrW(Handle,-20,(nint)style);
            Native.SetWindowPos(Handle,0,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0020);
        }
        Activate();target.Focus();
    }
    internal void RearmNonActivating()
    {
        if (NonActivating)return;
        NonActivating=true;
        long style=Native.GetWindowLongPtrW(Handle,-20).ToInt64()|0x08000000L;
        Native.SetWindowLongPtrW(Handle,-20,(nint)style);
        Native.SetWindowPos(Handle,0,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0020);
    }
    protected override CreateParams CreateParams {
        get { var p=base.CreateParams; p.ExStyle |= 0x80; if(NonActivating) p.ExStyle|=0x08000000; if(Passive) p.ExStyle|=0x20|0x80000; return p; }
    }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg==0x21 && NonActivating) { m.Result=3; return; } // MA_NOACTIVATE
        if (m.Msg==0x84 && BackgroundDraggable) {
            base.WndProc(ref m);
            if(m.Result==1) m.Result=2; // only unoccupied form background
            return;
        }
        base.WndProc(ref m);
    }
}
