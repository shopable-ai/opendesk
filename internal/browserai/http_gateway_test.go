package browserai

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestHTTPGatewayStartsDisabledWithoutAnOwner(t *testing.T) {
    manager:=NewManager(Options{})
    defer manager.Close()
    if _,err:=NewHTTPGateway(manager,strings.Repeat("x",48),"0.0.0.0:45111",func()bool{return true});err==nil {
        t.Fatal("non-loopback gateway binding accepted")
    }
    if _,err:=NewHTTPGateway(manager,"short","127.0.0.1:45111",func()bool{return true});err==nil {
        t.Fatal("short pairing credential accepted")
    }
}
func TestHTTPGatewayRejectsWebOriginsAndUnauthenticatedRequests(t *testing.T) {
    manager:=NewManager(Options{})
    defer manager.Close()
    token:=strings.Repeat("Q",48)
    gateway,err:=NewHTTPGateway(manager,token,"127.0.0.1:45111",func()bool{return true})
    if err!=nil{t.Fatal(err)}
    send:=func(origin,auth string) *httptest.ResponseRecorder {
        request:=httptest.NewRequest(http.MethodGet,"http://127.0.0.1:45111/opendesk/v1/capabilities",nil)
        request.Host="127.0.0.1:45111"
        request.RemoteAddr="127.0.0.1:33333"
        if origin!=""{request.Header.Set("Origin",origin)}
        if auth!=""{request.Header.Set("Authorization",auth)}
        rec:=httptest.NewRecorder()
        gateway.ServeHTTP(rec,request)
        return rec
    }
    if got:=send("http://evil.example","Bearer "+token);got.Code!=http.StatusForbidden {
        t.Fatalf("arbitrary browser origin: %d",got.Code)
    }
    if got:=send("","");got.Code!=http.StatusUnauthorized {
        t.Fatalf("missing credential: %d",got.Code)
    }
    if got:=send("","Bearer "+token);got.Code!=http.StatusOK {
        t.Fatalf("paired loopback capability request: %d",got.Code)
    }
}
func TestHTTPGatewayRejectsUnsupportedResponsesWithoutOpeningCodex(t *testing.T) {
    manager:=NewManager(Options{})
    defer manager.Close()
    token:=strings.Repeat("Q",48)
    gateway,err:=NewHTTPGateway(manager,token,"127.0.0.1:45111",func()bool{return true})
    if err!=nil{t.Fatal(err)}
    body:=`{"model":"gpt-4o-mini","input":"hello","store":false,"stream":true,"text":{"format":{"type":"json_schema","name":"workflow","strict":true,"schema":{"type":"object","properties":{},"required":[],"additionalProperties":false}}}}`
    request:=httptest.NewRequest(http.MethodPost,"http://127.0.0.1:45111/v1/responses",strings.NewReader(body))
    request.Host="127.0.0.1:45111"
    request.RemoteAddr="127.0.0.1:33333"
    request.Header.Set("Content-Type","application/json")
    request.Header.Set("Authorization","Bearer "+token)
    rec:=httptest.NewRecorder()
    gateway.ServeHTTP(rec,request)
    if rec.Code!=http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(),"E_UNSUPPORTED") {
        t.Fatalf("streaming was not rejected before launching Codex: %d %s",rec.Code,rec.Body.String())
    }
}

func TestHTTPGatewayTypedInputAndJSONModes(t *testing.T) {
    typed := `{"model":"gpt-4o-mini","input":[{"role":"user","content":[{"type":"input_text","text":"Plan a bounded form"}]}],"store":false,"stream":false,"text":{"format":{"type":"json_object"}}}`
    request,input,err:=decodeGatewayRequest([]byte(typed))
    if err!=nil || input!="Plan a bounded form" || request.Text.Format.Type!="json_object" {
        t.Fatalf("compatible typed input rejected: %q %v",input,err)
    }
    for name,broken :=range map[string]string{
        "tool-calls":`{"model":"gpt-4o-mini","input":[{"role":"user","content":[{"type":"tool_call","text":"execute shell"}]}],"store":false,"text":{"format":{"type":"json_object"}}}`,
        "unknown-body":`{"model":"gpt-4o-mini","input":"hello","store":false,"tools":[],"text":{"format":{"type":"json_object"}}}`,
        "missing-store":`{"model":"gpt-4o-mini","input":"hello","text":{"format":{"type":"json_object"}}}`,
        "history":`{"model":"gpt-4o-mini","input":"hello","store":false,"previous_response_id":"resp_x","text":{"format":{"type":"json_object"}}}`,
        "background":`{"model":"gpt-4o-mini","input":"hello","store":false,"background":true,"text":{"format":{"type":"json_object"}}}`,
    } {
        t.Run(name,func(t *testing.T){
            if _,_,err:=decodeGatewayRequest([]byte(broken));err==nil {
                t.Fatal("unsupported Responses feature silently accepted")
            }
        })
    }
}
