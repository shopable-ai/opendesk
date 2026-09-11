using System.Text;
using System.Text.Json.Nodes;

namespace OpenDesk.UIHost;

internal static class Program
{
    internal const string Protocol = "1.9.0";
    private static readonly object OutputLock = new();
    private static StreamWriter? output;
    [STAThread]
    private static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using var input = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8, false, 65536);
        output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        using var dispatcher = new Control();
        _ = dispatcher.Handle;
        using var context = new ApplicationContext();
        using var host = new Host();
        Emit(new JsonObject { ["version"] = Protocol, ["kind"] = "hello" });
        // One request at a time, all GUI/COM operations on the STA owner. Native
        // callbacks may still run while an awaited WebView2 operation completes.
        var reader = Task.Run(async () => {
            try {
                while (true) {
                    var line = await input.ReadLineAsync();
                    if (line is null) break;
                    if (Encoding.UTF8.GetByteCount(line) > 8 * 1024 * 1024) throw new InvalidDataException("UI protocol frame exceeds 8 MiB");
                    var request = JsonNode.Parse(line) as JsonObject ?? throw new InvalidDataException("UI request must be an object");
                    var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                    dispatcher.BeginInvoke(new Action(async () => {
                        try {
                            await host.Handle(request);
                            done.TrySetResult();
                        } catch (Exception e) { done.TrySetException(e); }
                    }));
                    await done.Task;
                    if (J.S(request, "operation") == "shutdown") break;
                }
            } catch (Exception e) { Console.Error.WriteLine("native UI transport: " + e.Message); }
            finally { if (!dispatcher.IsDisposed) dispatcher.BeginInvoke(new Action(() => { host.Dispose(); context.ExitThread(); })); }
        });
        Application.Run(context);
        host.Dispose();
        output.Dispose();
    }
    internal static void Emit(JsonObject value)
    {
        lock (OutputLock) output?.WriteLine(value.ToJsonString());
    }
}

internal static class J
{
    internal static string S(JsonNode? o, string key, string fallback = "") => o?[key]?.GetValue<string>() ?? fallback;
    internal static bool B(JsonNode? o, string key, bool fallback = false) => o?[key]?.GetValue<bool>() ?? fallback;
    internal static double N(JsonNode? o, string key, double fallback = 0) {
        if(o?[key] is not JsonValue value)return fallback;
        if(value.TryGetValue<double>(out var d))return d;
        if(value.TryGetValue<int>(out var i))return i;
        if(value.TryGetValue<long>(out var l))return l;
        if(value.TryGetValue<float>(out var f))return f;
        throw new HostError("INVALID_SPEC",key+" must be a number");
    }
    internal static int I(JsonNode? o, string key, int fallback = 0) => (int)N(o, key, fallback);
    internal static JsonObject O(JsonNode? o, string key) => o?[key] as JsonObject ?? new JsonObject();
    internal static JsonArray A(JsonNode? o, string key) => o?[key] as JsonArray ?? new JsonArray();
    internal static JsonObject Copy(JsonObject o) => (JsonObject)o.DeepClone();
    internal static JsonObject Rect(Rectangle r) => new() { ["x"] = r.X, ["y"] = r.Y, ["width"] = r.Width, ["height"] = r.Height };
    internal static Rectangle Rect(JsonNode? o) => new(I(o,"x"), I(o,"y"), I(o,"width"), I(o,"height"));
}

internal sealed class HostError : Exception
{
    internal readonly string Code;
    internal HostError(string code, string message) : base(message) { Code = code; }
}
