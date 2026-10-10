//go:build darwin || linux

package browserbridge

import (
 "bufio"
 "net"
 "time"
)

// notifyProjectChanged is an OPTIONAL same-user/private IPC announcement.
// Absence of Chrome/Native must never turn a successfully committed local file
// permission into a failed grant. It never sends source or execution requests.
func notifyProjectChanged(cfg Installation) bool {
 dial:=net.Dialer{Timeout:500*time.Millisecond}
 conn,err:=dial.Dial("unix",cfg.SocketPath)
 if err!=nil{return false}
 defer conn.Close()
 if err=conn.SetDeadline(time.Now().Add(2*time.Second));err!=nil{return false}
 if err=WriteLine(conn,MustEncode(map[string]any{
  "v":1,"kind":"auth","credential":cfg.ClientCredential,
 }));err!=nil{return false}
 reader:=bufio.NewReaderSize(conn,MaxBytes+2)
 ack,err:=ReadLine(reader)
 if err!=nil{return false}
 authorized,err:=Decode(ack)
 if err!=nil || String(authorized,"kind")!="authenticated" ||
  !Bool(authorized,"browserReady") {return false}
 if err=WriteLine(conn,MustEncode(map[string]any{"v":1,"kind":"project.changed"}));err!=nil{
  return false
 }
 reply,err:=ReadLine(reader)
 if err!=nil{return false}
 frame,err:=Decode(reply)
 return err==nil && String(frame,"kind")=="project.changed" && Bool(frame,"ok")
}
