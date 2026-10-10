//go:build darwin || linux

package browserbridge

import (
 "bufio"
 "encoding/json"
 "io"
 "net"
 "testing"
 "time"
)

func TestGoProjectProviderOverOriginalV1WithNodePriority(t *testing.T){
 _,sourcePath:=projectFixture(t)
 grant,err:=ProjectAdd(sourcePath,"controller","async-main","https://example.test")
 if err!=nil{t.Fatal(err)}
 cfg,err:=Load();if err!=nil{t.Fatal(err)}
 chromeInput,chromeWriter:=io.Pipe()
 chromeReader,chromeOutput:=io.Pipe()
 host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",chromeInput,chromeOutput)
 if err!=nil{t.Fatal(err)}
 finished:=make(chan error,1)
 go func(){finished<-host.Run()}()
 t.Cleanup(func(){
  host.Close();chromeWriter.Close();chromeReader.Close();chromeOutput.Close()
  select{case <-finished:case <-time.After(time.Second):t.Error("Go Host did not stop")}
 })
 read:=func(label string)Fields{
  t.Helper()
  type frameResult struct{fields Fields;err error}
  done:=make(chan frameResult,1)
  go func(){raw,err:=ReadFrame(chromeReader);if err!=nil{done<-frameResult{err:err};return}
   fields,err:=Decode(raw);done<-frameResult{fields:fields,err:err}}()
  select{
  case x:=<-done:
   if x.err!=nil{t.Fatalf("%s: %v",label,x.err)}
   return x.fields
  case <-time.After(3*time.Second):t.Fatalf("%s timed out",label);return nil
  }
 }
 if kind:=String(read("hello"),"kind");kind!="hello"{t.Fatalf("initial %s",kind)}
 if err=WriteFrame(chromeWriter,MustEncode(map[string]any{
 "v":1,"kind":"welcome","extensionId":testExtensionID,
 "extensionVersion":"0.1.0","localDevVersion":1,
 }));err!=nil{t.Fatal(err)}
 state:=read("native Go provider state")
 if String(state,"kind")!="dev.state" || !Bool(state,"connected"){
  t.Fatalf("Go project provider not enabled: %v",state)
 }
 epoch:=String(state,"providerEpoch")
 if !RequestIDValid(epoch){t.Fatalf("provider epoch invalid: %q",epoch)}
 if err=WriteFrame(chromeWriter,MustEncode(map[string]any{
  "v":1,"kind":"dev.request","requestId":"go-native-list",
  "providerEpoch":epoch,"method":"projects.list","params":map[string]any{},
 }));err!=nil{t.Fatal(err)}
 response:=read("Go projects.list")
 if String(response,"kind")!="dev.response" || String(response,"requestId")!="go-native-list" ||
  !Has(response,"result"){t.Fatalf("list response: %v",response)}
 var list struct{Projects []struct{BindingID string}}
 if err=json.Unmarshal(response["result"],&list);err!=nil{t.Fatal(err)}
 if len(list.Projects)!=1||list.Projects[0].BindingID!=grant["bindingId"]{
  t.Fatalf("unexpected Go project list: %+v",list)
 }
 if err=WriteFrame(chromeWriter,MustEncode(map[string]any{
  "v":1,"kind":"dev.request","requestId":"go-native-resolve",
  "providerEpoch":epoch,"method":"project.resolve","params":map[string]any{
  "bindingId":grant["bindingId"]},
 }));err!=nil{t.Fatal(err)}
 resolved:=read("Go project.resolve")
 if String(resolved,"kind")!="dev.response"||!Has(resolved,"result"){
  t.Fatalf("resolved response: %v",resolved)
 }
 var project struct{SourceUtf8 string;SourceHash string;SiteOrigins []string}
 if err=json.Unmarshal(resolved["result"],&project);err!=nil{t.Fatal(err)}
 if project.SourceUtf8==""||project.SourceHash==""||len(project.SiteOrigins)!=1||
  project.SiteOrigins[0]!="https://example.test"{
  t.Fatalf("untrusted source response: %+v",project)
 }
 // The legacy Node process connects to the SAME Go socket. Explicit
 // advanced Node Provider supersedes the builtin Go project epoch.
 socket,err:=net.DialUnix("unix",nil,&net.UnixAddr{Name:cfg.SocketPath,Net:"unix"})
 if err!=nil{t.Fatal(err)}
 defer socket.Close()
 _ = socket.SetDeadline(time.Now().Add(3*time.Second))
 local:=bufio.NewReaderSize(socket,MaxBytes+2)
 if err=WriteLine(socket,MustEncode(map[string]any{
 "v":1,"kind":"auth","credential":cfg.ClientCredential,
 }));err!=nil{t.Fatal(err)}
 authRaw,err:=ReadLine(local)
 if err!=nil{t.Fatal(err)}
 auth,_:=Decode(authRaw)
 if String(auth,"kind")!="authenticated"||!Bool(auth,"browserReady"){
  t.Fatalf("Node provider was not authenticated: %v",auth)
 }
 if err=WriteLine(socket,MustEncode(map[string]any{
  "v":1,"kind":"provider.register","providerId":"legacy-node-provider",
 }));err!=nil{t.Fatal(err)}
 registration,err:=ReadLine(local)
 if err!=nil{t.Fatal(err)}
 registered,_:=Decode(registration)
 if String(registered,"kind")!="provider.registered"{t.Fatalf("registration: %v",registered)}
 nodeState:=read("legacy provider override")
 if String(nodeState,"providerEpoch")==epoch||!Bool(nodeState,"connected"){
  t.Fatalf("Node did not override builtin Go provider: %v",nodeState)
 }
 socket.Close()
 back:=read("builtin restore on Node exit")
 if String(back,"providerEpoch")!=epoch || !Bool(back,"connected"){
  t.Fatalf("Native Go fallback lost after Node disconnect: %v",back)
 }
}
