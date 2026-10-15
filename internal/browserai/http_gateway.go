package browserai

// Limited, opt-in loopback Responses compatibility for the existing Native
// Host's Manager. This handler never starts Codex or owns browser execution.
// It deliberately does not implement the full OpenAI Responses API.

import (
    "context"
    "crypto/subtle"
    "encoding/json"
    "errors"
    "io"
    "net"
    "net/http"
    "regexp"
    "strings"
    "time"
)

var gatewayNamePattern = regexp.MustCompile("^[a-zA-Z0-9_-]{1,64}$")

type HTTPGateway struct {
    manager *Manager
    token string
    host string
    ready func() bool
    scope Scope
    slots chan struct{}
}

// NewHTTPGateway must be mounted ONLY on an explicitly bound loopback
// listener. The Native Host handshake, separate bearer pairing credential,
// origin/host restrictions and per-request scope all remain mandatory.
func NewHTTPGateway(manager *Manager, token, host string, ready func() bool) (*HTTPGateway,error) {
    address,port,err:=net.SplitHostPort(host)
    if err!=nil || net.ParseIP(address)==nil || !net.ParseIP(address).IsLoopback() ||
       port=="" || manager==nil || ready==nil || len(token)<32 || len(token)>256 ||
       strings.ContainsAny(token," \t\r\n") {
        return nil,errors.New("E_GATEWAY_CONFIG")
    }
    registration:=newID()
    if registration=="" {return nil,errors.New("E_GATEWAY_CONFIG")}
    return &HTTPGateway{manager:manager,token:token,host:host,ready:ready,
        scope:Scope{OwnerID:"http-loopback",RegistrationID:registration,Generation:1},
        slots:make(chan struct{},2)},nil
}

func (g *HTTPGateway) writeError(w http.ResponseWriter,status int,code string) {
    w.Header().Set("Content-Type","application/json")
    w.Header().Set("Cache-Control","no-store")
    w.WriteHeader(status)
    _=json.NewEncoder(w).Encode(map[string]any{"error":map[string]string{
        "type":"invalid_request_error","code":code,"message":code}})
}
func (g *HTTPGateway) writeJSON(w http.ResponseWriter,status int,payload any) {
    w.Header().Set("Content-Type","application/json")
    w.Header().Set("Cache-Control","no-store")
    w.WriteHeader(status)
    _=json.NewEncoder(w).Encode(payload)
}
func (g *HTTPGateway) ServeHTTP(w http.ResponseWriter,r *http.Request) {
    // No CORS or OPTIONS support: browsers and untrusted origins cannot use
    // this local bearer service. Remote IP and Host are BOTH constrained.
    addr,_,err:=net.SplitHostPort(r.RemoteAddr)
    if err!=nil || net.ParseIP(addr)==nil || !net.ParseIP(addr).IsLoopback() ||
       r.Host!=g.host || r.URL.RawQuery!="" || r.URL.Fragment!="" ||
       r.Header.Get("Origin")!="" || r.Header.Get("Referer")!="" ||
       !g.ready() {
        g.writeError(w,http.StatusForbidden,"E_GATEWAY_FORBIDDEN");return
    }
    authorization:=r.Header.Get("Authorization")
    if len(authorization)!=len("Bearer ")+len(g.token) ||
       subtle.ConstantTimeCompare([]byte(authorization),[]byte("Bearer "+g.token))!=1 {
        w.Header().Set("WWW-Authenticate","Bearer")
        g.writeError(w,http.StatusUnauthorized,"E_GATEWAY_AUTH");return
    }
    switch {
    case r.URL.Path=="/opendesk/v1/capabilities" && r.Method==http.MethodGet:
        g.writeJSON(w,http.StatusOK,map[string]any{
            "version":1,"provider":"local_codex","transport":"codex-app-server-stdio",
            "modelAvailability":"NOT_PROBED","responseCompatibility":"limited-v1",
            "capabilities":map[string]bool{
                "streaming":false,"structuredOutput":true,"observation":false,
                "toolCalls":false,"activeConversation":false,"coldResume":false,
                "cancel":false,"localAbort":true,"usage":false,"background":false,
                "store":false,
            },
            "supportedRoutes":[]string{"POST /v1/responses","GET /opendesk/v1/capabilities"},
        });return
    case r.URL.Path=="/v1/responses" && r.Method==http.MethodPost:
        if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")),"application/json") {
            g.writeError(w,http.StatusUnsupportedMediaType,"E_GATEWAY_CONTENT_TYPE");return
        }
        select {
        case g.slots<-struct{}{}:defer func(){<-g.slots}()
        default:g.writeError(w,http.StatusTooManyRequests,"E_BUSY");return
        }
        g.response(w,r);return
    case r.URL.Path=="/v1/responses" || r.URL.Path=="/opendesk/v1/capabilities":
        g.writeError(w,http.StatusMethodNotAllowed,"E_UNSUPPORTED_METHOD");return
    default:g.writeError(w,http.StatusNotFound,"E_UNSUPPORTED_ROUTE");return
    }
}

type gatewayRequest struct {
    Model string `json:"model"`
    Input json.RawMessage `json:"input"`
    Instructions string `json:"instructions,omitempty"`
    Stream *bool `json:"stream,omitempty"`
    Store *bool `json:"store,omitempty"`
    Background *bool `json:"background,omitempty"`
    PreviousResponseID string `json:"previous_response_id,omitempty"`
    Text struct {
        Format struct {
            Type string `json:"type"`
            Name string `json:"name"`
            Strict *bool `json:"strict"`
            Schema json.RawMessage `json:"schema"`
        } `json:"format"`
    } `json:"text"`
}

func decodeGatewayRequest(raw []byte) (gatewayRequest,string,error) {
    var req gatewayRequest
    if strict(raw,&req)!=nil{return req,"",errors.New("E_GATEWAY_SCHEMA")}
    if req.Stream!=nil&&*req.Stream || req.Background!=nil&&*req.Background ||
       req.Store==nil || *req.Store || req.PreviousResponseID!="" {
        return req,"",errors.New("E_UNSUPPORTED")
    }
    // The compatibility subset requires a caller-supplied strict, closed
    // Workflow JSON Schema. Other Responses input types are not simulated.
    format:=req.Text.Format
    if format.Type!="json_schema" || !gatewayNamePattern.MatchString(format.Name) ||
       format.Strict==nil || !*format.Strict || len(format.Schema)<2 ||
       len(format.Schema)>MaxSchemaBytes {
        return req,"",errors.New("E_UNSUPPORTED_FORMAT")
    }
    var shape struct {
        Type string `json:"type"`
        AdditionalProperties *bool `json:"additionalProperties"`
    }
    if json.Unmarshal(format.Schema,&shape)!=nil || shape.Type!="object" ||
       shape.AdditionalProperties==nil || *shape.AdditionalProperties {
        return req,"",errors.New("E_UNSUPPORTED_FORMAT")
    }
    if !identifier.MatchString(req.Model) || len(req.Instructions)>4096 {
        return req,"",errors.New("E_GATEWAY_SCHEMA")
    }
    var input string
    if json.Unmarshal(req.Input,&input)!=nil || strings.TrimSpace(input)=="" ||
       len(input)>MaxInputBytes-4096 {
        return req,"",errors.New("E_UNSUPPORTED_INPUT")
    }
    return req,input,nil
}

func (g *HTTPGateway) call(ctx context.Context,method,sessionID string,params any) (json.RawMessage,error) {
    raw,err:=json.Marshal(params)
    if err!=nil{return nil,errors.New("E_GATEWAY_SCHEMA")}
    reply:=g.manager.Handle(ctx,Request{V:1,Kind:"ai.request",Protocol:Protocol,
        RequestID:newID(),Scope:g.scope,SessionID:sessionID,Method:method,Params:raw})
    if reply.Error!=nil{return nil,reply.Error}
    value,err:=json.Marshal(reply.Result)
    if err!=nil{return nil,errors.New("E_GATEWAY_PROTOCOL")}
    return value,nil
}

func gatewayProviderError(err error) (int,string) {
    if err==nil{return http.StatusBadGateway,"E_PROVIDER"}
    var e *Error
    if errors.As(err,&e) {
        switch e.Code {
        case "E_CODEX_MISSING","E_CODEX_LOGIN_REQUIRED","E_MODEL_UNAVAILABLE","E_CODEX_UNSUPPORTED",
             "E_CODEX_POLICY","E_RATE_LIMITED","E_BUSY":
            return http.StatusServiceUnavailable,e.Code
        case "E_TIMEOUT","E_OUTCOME_UNKNOWN","E_DISCONNECTED":
            return http.StatusGatewayTimeout,"E_OUTCOME_UNKNOWN"
        }
    }
    return http.StatusBadGateway,"E_PROVIDER"
}

func (g *HTTPGateway) response(w http.ResponseWriter,r *http.Request) {
    raw,err:=io.ReadAll(http.MaxBytesReader(w,r.Body,MaxMessageBytes))
    if err!=nil{g.writeError(w,http.StatusRequestEntityTooLarge,"E_GATEWAY_LIMIT");return}
    req,input,err:=decodeGatewayRequest(raw)
    if err!=nil{g.writeError(w,http.StatusUnprocessableEntity,err.Error());return}
    ctx,cancel:=context.WithTimeout(r.Context(),120*time.Second)
    defer cancel()
    opened,err:=g.call(ctx,"ai.session.open","",map[string]any{
        "consent":Consent{Model:true,Workflow:true,Observation:false},
        "model":req.Model})
    if err!=nil{status,code:=gatewayProviderError(err);g.writeError(w,status,code);return}
    var session struct{
        SessionID string `json:"sessionId"`
        ThreadID string `json:"threadId"`
    }
    if json.Unmarshal(opened,&session)!=nil || !identifier.MatchString(session.SessionID) ||
       !identifier.MatchString(session.ThreadID) {
        g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
    }
    running:=false
    defer func(){
        cleanup,stop:=context.WithTimeout(context.Background(),8*time.Second)
        defer stop()
        if running {
            // Calls the REAL turn/interrupt in Manager; acknowledgement alone
            // is not advertised as a successful terminal cancellation.
            _,_=g.call(cleanup,"ai.plan.cancel",session.SessionID,map[string]any{})
        }
        _,_=g.call(cleanup,"ai.session.close",session.SessionID,map[string]any{})
    }()
    payload:=map[string]any{"input":input,"consent":Consent{Model:true,Workflow:true,Observation:false},
        "outputSchema":json.RawMessage(req.Text.Format.Schema)}
    if req.Instructions!="" {
        // Caller instructions are data, not a new privileged system prompt.
        payload["input"]=req.Instructions+"\n\n"+input
    }
    started,err:=g.call(ctx,"ai.plan.start",session.SessionID,payload)
    if err!=nil{status,code:=gatewayProviderError(err);g.writeError(w,status,code);return}
    var turn struct {
        SessionID string `json:"sessionId"`
        ThreadID string `json:"threadId"`
        TurnID string `json:"turnId"`
    }
    if json.Unmarshal(started,&turn)!=nil || turn.SessionID!=session.SessionID ||
       turn.ThreadID!=session.ThreadID || !identifier.MatchString(turn.TurnID) {
        g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
    }
    running=true
    var cursor uint64
    var finalText string
    terminal:=false
    ticker:=time.NewTicker(250*time.Millisecond)
    defer ticker.Stop()
    for !terminal {
        if ctx.Err()!=nil{g.writeError(w,http.StatusGatewayTimeout,"E_OUTCOME_UNKNOWN");return}
        batchRaw,readErr:=g.call(ctx,"ai.events.read",session.SessionID,
            map[string]any{"cursor":cursor,"limit":24})
        if readErr!=nil{status,code:=gatewayProviderError(readErr);g.writeError(w,status,code);return}
        var batch struct {
            Cursor uint64 `json:"cursor"`
            State string `json:"state"`
            InferenceVerified bool `json:"inferenceVerified"`
            Events []Event `json:"events"`
        }
        if json.Unmarshal(batchRaw,&batch)!=nil || batch.Cursor<cursor ||
           len(batch.Events)>24 {
            g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
        }
        next:=cursor
        for _,event:=range batch.Events {
            if event.Sequence!=next+1 || event.SessionID!=session.SessionID ||
               (event.ThreadID!=""&&event.ThreadID!=session.ThreadID) ||
               (event.TurnID!=""&&event.TurnID!=turn.TurnID) {
                g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
            }
            next=event.Sequence
            if event.Type=="tool.request" || event.Type=="approval.required" {
                g.writeError(w,http.StatusBadGateway,"E_UNSUPPORTED");return
            }
            if event.Type=="message.completed"&&event.Text!="" {
                if len(event.Text)>45000 {g.writeError(w,http.StatusBadGateway,"E_GATEWAY_LIMIT");return}
                finalText=event.Text
            }
            if event.Type=="turn.completed" {
                if event.Status!="completed" {
                    status,code:=gatewayProviderError(event.Error)
                    g.writeError(w,status,code);return
                }
                terminal=true
            }
        }
        if next!=batch.Cursor{g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return}
        cursor=batch.Cursor
        if terminal {
            if !batch.InferenceVerified || batch.State!="COMPLETED" ||
               len(finalText)==0 || !json.Valid([]byte(finalText)) {
                g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
            }
            var object map[string]any
            if json.Unmarshal([]byte(finalText),&object)!=nil || object==nil {
                g.writeError(w,http.StatusBadGateway,"E_GATEWAY_PROTOCOL");return
            }
            running=false
            now:=time.Now().Unix()
            responseID:="resp_"+newID()
            g.writeJSON(w,http.StatusOK,map[string]any{
                "id":responseID,"object":"response","created_at":now,
                "status":"completed","model":req.Model,
                "store":false,"background":false,
                "output":[]any{map[string]any{
                    "id":"msg_"+newID(),"type":"message","role":"assistant",
                    "status":"completed","content":[]any{map[string]any{
                        "type":"output_text","text":finalText,
                    }},
                }},
            })
            return
        }
        select {
        case <-ctx.Done():g.writeError(w,http.StatusGatewayTimeout,"E_OUTCOME_UNKNOWN");return
        case <-ticker.C:
        }
    }
}
