//go:build darwin || linux

package browserbridge

import (
 "io"
 "os"
 "testing"
 "time"
)

func TestGoFileGrantPublishesNativeProviderEpochWithoutChromeRestart(t *testing.T){
 _,sourcePath:=projectFixture(t)
 cfg,err:=Load();if err!=nil{t.Fatal(err)}
 in,writer:=io.Pipe()
 reader,out:=io.Pipe()
 host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",in,out)
 if err!=nil{t.Fatal(err)}
 finished:=make(chan error,1)
 go func(){finished<-host.Run()}()
 t.Cleanup(func(){
  host.Close();writer.Close();reader.Close();out.Close()
  select{case <-finished:case <-time.After(time.Second):t.Error("Host did not exit")}
 })
 frame:=func()Fields{
  t.Helper()
  type result struct {f Fields;err error}
  done:=make(chan result,1)
  go func(){raw,err:=ReadFrame(reader);if err!=nil{done<-result{err:err};return}
   f,err:=Decode(raw);done<-result{f:f,err:err}}()
  select{
  case value:=<-done:
   if value.err!=nil{t.Fatal(value.err)}
   return value.f
  case <-time.After(3*time.Second):
   t.Fatal("Go Host did not publish provider state")
   return nil
  }
 }
 if String(frame(),"kind")!="hello"{t.Fatal("missing Native hello")}
 if err=WriteFrame(writer,MustEncode(map[string]any{
  "v":1,"kind":"welcome","extensionId":testExtensionID,
  "extensionVersion":"0.1.0","localDevVersion":1,
 }));err!=nil{t.Fatal(err)}
 grant,err:=ProjectAdd(sourcePath,"controller","async-main","https://example.test")
 if err!=nil{t.Fatal(err)}
 if grant["providerNotified"]!=true{
  t.Fatalf("running Go Host did not authenticate local grant notification: %+v",grant)
 }
 announced:=frame()
 if !Bool(announced,"connected")||String(announced,"kind")!="dev.state"{
  t.Fatalf("new native Go file provider not published: %+v",announced)
 }
 firstEpoch:=String(announced,"providerEpoch")
 revoked,err:=ProjectRevoke(grant["bindingId"].(string))
 if err!=nil{t.Fatal(err)}
 if revoked["providerNotified"]!=true{t.Fatalf("revoke not announced: %+v",revoked)}
 gone:=frame()
 if String(gone,"kind")!="dev.state"||Bool(gone,"connected"){
  t.Fatalf("revoked Go file provider not retired: %+v",gone)
 }
 restored,err:=ProjectAdd(sourcePath,"controller","async-main","https://example.test")
 if err!=nil||restored["providerNotified"]!=true{t.Fatalf("regrant failed: %v %+v",err,restored)}
 renewed:=frame()
 if !Bool(renewed,"connected")||String(renewed,"providerEpoch")==firstEpoch{
  t.Fatalf("grant was reused without fresh source epoch: %+v",renewed)
 }
 if _,err=os.Lstat(cfg.SocketPath);err!=nil{t.Fatalf("host unexpectedly stopped: %v",err)}
}
