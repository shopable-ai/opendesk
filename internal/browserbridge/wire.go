// Package browserbridge implements Chrome Native Messaging transport for the
// existing OpenDesk Browser extension. It does NOT run browser scripts.
package browserbridge

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
)

const (
	HostName = "com.shopable.opendesk_browser.agent"
	Version = 1
	MaxBytes = 60 * 1024
	MaxInflight = 12
	MaxClients = 8
)
var (
	ErrLimit = errors.New("E_LIMIT")
	ErrSchema = errors.New("E_SCHEMA")
	ErrClosed = errors.New("E_NATIVE_NOT_READY")
	idPattern = regexp.MustCompile("^[a-zA-Z0-9._:-]{1,100}$")
	extensionPattern = regexp.MustCompile("^[a-p]{32}$")
	credentialPattern = regexp.MustCompile("^[a-f0-9]{64}$")
	supportedMethods = map[string]bool{
		"bridge.status":true, "target.current":true, "script.save":true,
		"run.start":true, "run.get":true, "run.stop":true,
		"page.preview":true, "page.get":true, "page.dispose":true,
		"request.get":true,
	}
)

type Fields map[string]json.RawMessage

func Decode(payload []byte) (Fields,error) {
	if len(payload)==0 || len(payload)>MaxBytes || !json.Valid(payload) {
		return nil,ErrSchema
	}
	var v Fields
	if err:=json.Unmarshal(payload,&v);err!=nil || v==nil {
		return nil,ErrSchema
	}
	return v,nil
}
func String(f Fields,key string) string {
	var s string
	if err:=json.Unmarshal(f[key],&s);err!=nil{return ""}
	return s
}
func Int(f Fields,key string) int {
	var n int
	if err:=json.Unmarshal(f[key],&n);err!=nil{return -1}
	return n
}
func Bool(f Fields,key string) bool {
	var b bool
	return json.Unmarshal(f[key],&b)==nil && b
}
func Has(f Fields,key string) bool { _,ok:=f[key];return ok }
func Object(f Fields,key string) bool {
	if !Has(f,key){return false}
	_,err:=Decode(f[key]);return err==nil
}
func RequestIDValid(id string) bool { return idPattern.MatchString(id) }
func ExtensionIDValid(id string) bool { return extensionPattern.MatchString(id) }
func CredentialValid(s string) bool { return credentialPattern.MatchString(s) }
func ValidateRequest(f Fields) error {
	if Int(f,"v")!=Version || String(f,"kind")!="request" ||
		!RequestIDValid(String(f,"requestId")) ||
		!supportedMethods[String(f,"method")] || !Object(f,"params"){
		return ErrSchema
	}
	return nil
}
func ValidateResponse(f Fields) error {
	if Int(f,"v")!=Version || String(f,"kind")!="response" ||
		!RequestIDValid(String(f,"requestId")) || Has(f,"result")==Has(f,"error") {
		return ErrSchema
	}
	return nil
}
func ValidateDevRequest(f Fields) error {
	if Int(f,"v")!=Version || String(f,"kind")!="dev.request" ||
		!RequestIDValid(String(f,"requestId")) ||
		!RequestIDValid(String(f,"providerEpoch")) || !Object(f,"params"){
		return ErrSchema
	}
	method:=String(f,"method")
	if method!="projects.list" && method!="project.resolve" {return ErrSchema}
	var params map[string]json.RawMessage
	if err:=json.Unmarshal(f["params"],&params);err!=nil{return ErrSchema}
	for key:=range params {if key!="bindingId"{return ErrSchema}}
	if method=="project.resolve" && String(params,"bindingId")==""{return ErrSchema}
	return nil
}
func Encode(value any) ([]byte,error) {
	data,err:=json.Marshal(value)
	if err!=nil{return nil,err}
	if len(data)>MaxBytes{return nil,ErrLimit}
	return data,nil
}
func writeAll(w io.Writer,data []byte) error {
	for len(data)>0 {
		n,err:=w.Write(data)
		if err!=nil{return err}
		if n<=0{return io.ErrShortWrite}
		data=data[n:]
	}
	return nil
}
func ReadFrame(r io.Reader) ([]byte,error) {
	var header [4]byte
	if _,err:=io.ReadFull(r,header[:]);err!=nil{return nil,err}
	n:=binary.LittleEndian.Uint32(header[:])
	if n==0 || n>MaxBytes{return nil,ErrLimit}
	body:=make([]byte,n)
	_,err:=io.ReadFull(r,body)
	if err!=nil{return nil,err}
	if _,err:=Decode(body);err!=nil{return nil,err}
	return body,nil
}
func WriteFrame(w io.Writer,payload []byte) error {
	if _,err:=Decode(payload);err!=nil{return err}
	var hdr [4]byte
	binary.LittleEndian.PutUint32(hdr[:],uint32(len(payload)))
	if err:=writeAll(w,hdr[:]);err!=nil{return err}
	return writeAll(w,payload)
}
func ReadLine(r *bufio.Reader) ([]byte,error) {
	// ReadSlice is bounded by the reader buffer; never allocate on untrusted
	// newline-less input. Callers must construct a >=MaxBytes+2 buffer.
	line,err:=r.ReadSlice('\n')
	if err!=nil{return nil,err}
	if len(line)<2 || len(line)-1>MaxBytes{return nil,ErrLimit}
	payload:=bytes.TrimSuffix(line,[]byte{'\n'})
	_,err=Decode(payload)
	return payload,err
}
func WriteLine(w io.Writer,payload []byte) error {
	if _,err:=Decode(payload);err!=nil{return err}
	if err:=writeAll(w,payload);err!=nil{return err}
	return writeAll(w,[]byte{'\n'})
}
func MustEncode(value any) []byte {
	data,err:=Encode(value);if err!=nil{panic(fmt.Sprintf("internal native message: %v",err))}
	return data
}
func ErrorResponse(id,code,outcome string) []byte {
	return MustEncode(map[string]any{
		"v":Version,"kind":"response","requestId":id,
		"error":map[string]any{"code":code,"message":code,"outcome":outcome},
	})
}
