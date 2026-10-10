//go:build darwin || linux

package browserbridge

import (
    "errors"
    "io"
    "os"
    "path/filepath"
    "strings"
    "sync"
    "testing"
    "time"
)

// A pipe/read implementation can ignore Close, just as blocked native stdio
// reads may remain blocked after a SIGTERM cleanup attempt on some platforms.
type uninterruptibleReader struct{
    started chan struct{}
    release chan struct{}
    first sync.Once
}
func (r *uninterruptibleReader) Read(p []byte)(int,error){
    r.first.Do(func(){close(r.started)})
    <-r.release
    return 0,io.EOF
}
func TestCloseReleasesHostEvenWithBlockedNativeStdin(t *testing.T){
    root,err:=os.MkdirTemp("/tmp","od-closed-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(root)})
    if err=os.Chmod(root,0700);err!=nil{t.Fatal(err)}
    cfg:=Installation{Name:HostName,ExtensionID:testExtensionID,
        ClientCredential:strings.Repeat("a",64),InstallRoot:root,
        SocketPath:filepath.Join(root,"agent.sock"),Provider:"opendesk"}
    source:=&uninterruptibleReader{started:make(chan struct{}),release:make(chan struct{})}
    t.Cleanup(func(){close(source.release)})
    host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",source,io.Discard)
    if err!=nil{t.Fatal(err)}
    finished:=make(chan error,1)
    go func(){finished<-host.Run()}()
    select {
    case <-source.started:
    case <-time.After(time.Second):t.Fatal("native stdin reader did not start")
    }
    // Caller receives cancellation without waiting for the blocked reader
    // or leaving its socket behind for the next Chrome Native process.
    host.Close()
    select{
    case err:=<-finished:
        if err!=nil&&!errors.Is(err,ErrClosed){t.Fatalf("closing the Native Host returned: %v",err)}
    case <-time.After(time.Second):
        t.Fatal("Host.Run blocked on native stdin after Close")
    }
    if _,err:=os.Lstat(cfg.SocketPath);!os.IsNotExist(err){
        t.Fatalf("owned socket remains after Close: %v",err)
    }
}

func TestClosedHostNeverRecreatesSocketOnDelayedStart(t *testing.T) {
    root,err:=os.MkdirTemp("/tmp","od-early-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(root)})
    if err=os.Chmod(root,0700);err!=nil{t.Fatal(err)}
    cfg:=Installation{Name:HostName,ExtensionID:testExtensionID,
        ClientCredential:strings.Repeat("a",64),InstallRoot:root,
        SocketPath:filepath.Join(root,"agent.sock"),Provider:"opendesk"}
    host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",strings.NewReader(""),io.Discard)
    if err!=nil{t.Fatal(err)}
    host.Close() // SIGTERM before Chrome Host has reached ListenUnix.
    if err=host.Run();!errors.Is(err,ErrClosed){
        t.Fatalf("closed native Host must not re-open a socket: %v",err)
    }
    if _,err=os.Lstat(cfg.SocketPath);!os.IsNotExist(err){
        t.Fatalf("closed Host recreated a private socket: %v",err)
    }
}
