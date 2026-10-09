package browserbridge

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestFrameSplitUTF8AndByteLimit(t *testing.T) {
	original:=MustEncode(map[string]any{"v":1,"kind":"response","requestId":"a","result":map[string]any{"text":"日本語 🚀"}})
	var b bytes.Buffer
	if err:=WriteFrame(&b,original);err!=nil{t.Fatal(err)}
	wire:=b.Bytes()
	if got:=binary.LittleEndian.Uint32(wire[:4]);int(got)!=len(original){t.Fatalf("header %d != %d",got,len(original))}
	read,err:=ReadFrame(&b)
	if err!=nil || !bytes.Equal(read,original){t.Fatalf("roundtrip: %v",err)}
	oversize:=make([]byte,4)
	binary.LittleEndian.PutUint32(oversize,uint32(MaxBytes+1))
	if _,err=ReadFrame(bytes.NewReader(oversize));!errors.Is(err,ErrLimit){t.Fatalf("oversize: %v",err)}
	if _,err=ReadFrame(bytes.NewReader(wire[:6]));!errors.Is(err,io.ErrUnexpectedEOF){t.Fatalf("truncated: %v",err)}
}
func TestBoundedLineAndRequestSchema(t *testing.T) {
	id:="abcdef-123"
	request:=MustEncode(map[string]any{"v":1,"kind":"request","requestId":id,"method":"run.start","params":map[string]any{}})
	reader:=bufio.NewReaderSize(bytes.NewReader(append(append([]byte(nil),request...),'\n')),MaxBytes+2)
	line,err:=ReadLine(reader)
	if err!=nil{t.Fatal(err)}
	f,err:=Decode(line);if err!=nil || ValidateRequest(f)!=nil{t.Fatalf("request: %v",err)}
	reader=bufio.NewReaderSize(strings.NewReader(strings.Repeat("x",MaxBytes+3)),MaxBytes+2)
	if _,err=ReadLine(reader);err==nil{t.Fatal("unbounded newline-less input accepted")}
	for _,bad:=range []string{
		"[]","null",
		"{\"v\":1,\"kind\":\"request\",\"requestId\":\"a\",\"method\":\"evil\",\"params\":{}}",
		"{\"v\":1,\"kind\":\"request\",\"requestId\":\"a\",\"method\":\"run.start\",\"params\":[]}",
	}{
		fields,err:=Decode([]byte(bad))
		if err==nil && ValidateRequest(fields)==nil{t.Fatalf("bad request accepted: %s",bad)}
	}
}
