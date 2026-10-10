package browsercli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"opendesk/internal/browserbridge"
)

func IsCommand(args []string) bool {return len(args)>0 && args[0]=="browser"}
func writeJSON(w io.Writer,v any) {
	encoder:=json.NewEncoder(w)
	encoder.SetIndent("","  ")
	_ = encoder.Encode(v)
}
func errCode(err error) string {
	if err==nil{return ""}
	var call *browserbridge.CallError
	if errors.As(err,&call){return call.Code}
	s:=err.Error()
	if strings.HasPrefix(s,"E_"){return strings.SplitN(s,":",2)[0]}
	return "E_NATIVE_ERROR"
}
func exitError(out io.Writer,err error) int {
	v:=map[string]any{"code":errCode(err),"message":err.Error()}
	var call *browserbridge.CallError
	if errors.As(err,&call) && call.Outcome!=""{v["outcome"]=call.Outcome}
	writeJSON(out,v)
	return 1
}
func parseOptions(args []string,allowed map[string]bool) (map[string]string,error) {
	opts:=make(map[string]string)
	for i:=0;i<len(args);i+=2 {
		if !strings.HasPrefix(args[i],"--") || !allowed[args[i]] || i+1>=len(args) || strings.HasPrefix(args[i+1],"--"){
			return nil,errors.New("E_SCHEMA: unsupported or incomplete option")
		}
		if _,exists:=opts[args[i]];exists{return nil,errors.New("E_SCHEMA: duplicate option")}
		opts[args[i]]=args[i+1]
	}
	return opts,nil
}
func asJSON(raw []byte) (map[string]json.RawMessage,error) {
	var m map[string]json.RawMessage
	if err:=json.Unmarshal(raw,&m);err!=nil || m==nil{return nil,browserbridge.ErrSchema}
	return m,nil
}
func doCall(method string,opts map[string]string,timeout time.Duration) (json.RawMessage,error) {
	params:=map[string]json.RawMessage{}
	if file:=opts["--file"];file!=""{
		body,err:=os.ReadFile(file);if err!=nil{return nil,err}
		if len(body)>browserbridge.MaxBytes{return nil,browserbridge.ErrLimit}
		params,err=asJSON(body)
		if err!=nil{return nil,err}
	}
	requestID:=opts["--request-id"]
	if requestID=="" && len(params["requestId"])>0{
		if err:=json.Unmarshal(params["requestId"],&requestID);err!=nil{return nil,browserbridge.ErrSchema}
	}
	delete(params,"requestId")
	if requestID==""{var err error;requestID,err=browserbridge.NewID();if err!=nil{return nil,err}}
	if !browserbridge.RequestIDValid(requestID){return nil,browserbridge.ErrSchema}
	payload,err:=json.Marshal(params);if err!=nil{return nil,err}
	reply,err:=browserbridge.Call(context.Background(),method,payload,requestID,timeout)
	if err!=nil{return nil,err}
	return json.RawMessage(reply),nil
}
func Execute(args []string,stdout,stderr io.Writer) int {
	if !IsCommand(args) || len(args)<2{
		return exitError(stderr,errors.New("E_CAPABILITY: browser [setup|update|doctor|cleanup|native-host|bridge.status|target.current|script.save|run.start|run.get|run.stop|page.preview|page.get|page.dispose|request.get]"))
	}
	command,rest:=args[1],args[2:]
	if command=="native-host"{
		// Chrome passes the caller origin as the first argv element. On Windows
		// it may also append --parent-window; Windows is not yet enabled.
		if len(rest)!=1{return exitError(stderr,browserbridge.ErrSchema)}
		cfg,err:=browserbridge.Load()
		if err!=nil{return exitError(stderr,err)}
		host,err:=browserbridge.NewHost(cfg,rest[0],os.Stdin,stdout)
		if err!=nil{return exitError(stderr,err)}
		// Chrome normally closes stdin when its Port is destroyed. OS shutdown
		// and an explicit SIGTERM instead require an owned socket cleanup;
		// Go's default signal disposition would skip Host.Run's defer.
		signals:=make(chan os.Signal,1)
		signal.Notify(signals,os.Interrupt,syscall.SIGTERM)
		finished:=make(chan struct{})
		defer signal.Stop(signals)
		go func(){
			select {
			case <-signals:host.Close()
			case <-finished:
			}
		}()
		err=host.Run()
		close(finished)
		if err!=nil{return exitError(stderr,err)}
		return 0
	}
	if command=="setup" || command=="update"{
		opts,err:=parseOptions(rest,map[string]bool{"--extension-id":true,"--browser":true,"--user-data-dir":true})
		if err!=nil{return exitError(stderr,err)}
		// Ordinary repeat setup/update needs no ID/profile arguments: use the
		// existing verified binding. Fresh official installs require a
		// release-pinned ID; unpublished builds fail closed with an explicit
		// diagnostic instead of inventing one.
		result,err:=browserbridge.SetupAutomatic(opts["--extension-id"],opts["--browser"],opts["--user-data-dir"],"")
		if err!=nil{return exitError(stderr,err)}
		writeJSON(stdout,result);return 0
	}
	if command=="project" {
		if len(rest)==0{return exitError(stderr,errors.New("E_CAPABILITY: project [add|list|revoke]"))}
		action,fields:=rest[0],rest[1:]
		switch action {
		case "list":
			if len(fields)!=0{return exitError(stderr,browserbridge.ErrSchema)}
			result,err:=browserbridge.ProjectList()
			if err!=nil{return exitError(stderr,err)}
			writeJSON(stdout,result);return 0
		case "add":
			opts,err:=parseOptions(fields,map[string]bool{
				"--path":true,"--runtime-kind":true,"--entry-format":true,"--site-origin":true})
			if err!=nil{return exitError(stderr,err)}
			entry:=opts["--entry-format"]
			if entry==""{entry="async-main"}
			result,err:=browserbridge.ProjectAdd(opts["--path"],opts["--runtime-kind"],entry,opts["--site-origin"])
			if err!=nil{return exitError(stderr,err)}
			writeJSON(stdout,result);return 0
		case "revoke":
			opts,err:=parseOptions(fields,map[string]bool{"--binding-id":true})
			if err!=nil{return exitError(stderr,err)}
			result,err:=browserbridge.ProjectRevoke(opts["--binding-id"])
			if err!=nil{return exitError(stderr,err)}
			writeJSON(stdout,result);return 0
		default:return exitError(stderr,errors.New("E_CAPABILITY: project [add|list|revoke]"))
		}
	}
	if command=="cleanup" || command=="uninstall"{
		if len(rest)!=0{return exitError(stderr,browserbridge.ErrSchema)}
		result,err:=browserbridge.Cleanup()
		if err!=nil{return exitError(stderr,err)}
		writeJSON(stdout,result);return 0
	}
	if command=="doctor"{
		if len(rest)!=0{return exitError(stderr,browserbridge.ErrSchema)}
		local:=browserbridge.Doctor()
		result:=map[string]any{"local":local,"connected":false}
		if local["installed"]==true && local["socketExists"]==true{
			reply,err:=doCall("bridge.status",map[string]string{},3*time.Second)
			if err==nil{
				var resp map[string]json.RawMessage
				if json.Unmarshal(reply,&resp)==nil && len(resp["error"])==0{
					result["connected"]=true
					result["response"]=json.RawMessage(reply)
				}
			}else {result["error"]=map[string]string{"code":errCode(err)}}
		}
		writeJSON(stdout,result)
		if result["connected"]!=true{return 1}
		return 0
	}
	methods:=map[string]bool{"bridge.status":true,"target.current":true,"script.save":true,
		"run.start":true,"run.get":true,"run.stop":true,"page.preview":true,
		"page.get":true,"page.dispose":true,"request.get":true}
	if !methods[command]{return exitError(stderr,errors.New("E_CAPABILITY: unsupported browser command"))}
	opts,err:=parseOptions(rest,map[string]bool{"--file":true,"--request-id":true})
	if err!=nil{return exitError(stderr,err)}
	reply,err:=doCall(command,opts,145*time.Second)
	if err!=nil{return exitError(stderr,err)}
	if _,err=fmt.Fprintln(stdout,string(reply));err!=nil{return 1}
	var body map[string]json.RawMessage
	if json.Unmarshal(reply,&body)!=nil || len(body["error"])>0{return 1}
	return 0
}
