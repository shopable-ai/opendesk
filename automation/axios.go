package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/dop251/goja"
)

type Axios struct {
	runtime *goja.Runtime
	client  *http.Client
}

func NewAxios(runtime *goja.Runtime) *Axios {
	return &Axios{
		runtime: runtime,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (a *Axios) RegisterInRuntime() {
	obj := a.runtime.NewObject()
	must(obj.Set("get", a.get))
	must(obj.Set("post", a.post))
	must(obj.Set("put", a.put))
	must(obj.Set("delete", a.delete))
	must(obj.Set("patch", a.patch))
	a.runtime.Set("axios", obj)
}

// 固定使用 Chrome 的 User-Agent
const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

func (a *Axios) makeRequest(method, urlStr string, data interface{}, config map[string]interface{}) (goja.Value, error) {
	var body io.Reader
	headers := make(http.Header)
	// 使用随机浏览器 User-Agent
	headers.Set("User-Agent", defaultUserAgent)

	if data != nil {
		switch v := data.(type) {
		case string:
			if strings.Contains(v, "=") && !strings.Contains(v, "{") {
				headers.Set("Content-Type", "application/x-www-form-urlencoded")
			} else {
				headers.Set("Content-Type", "text/plain")
			}
			body = strings.NewReader(v)
		default:
			jsonData, err := json.Marshal(v)
			if err != nil {
				return nil, err
			}
			headers.Set("Content-Type", "application/json")
			body = bytes.NewReader(jsonData)
		}
	}

	if method == http.MethodGet && config != nil {
		if params, ok := config["params"].(map[string]interface{}); ok {
			u, err := url.Parse(urlStr)
			if err == nil {
				q := u.Query()
				for k, v := range params {
					q.Set(k, fmt.Sprint(v))
				}
				u.RawQuery = q.Encode()
				urlStr = u.String()
			}
		}
	}

	req, err := http.NewRequestWithContext(context.Background(), method, urlStr, body)
	if err != nil {
		return nil, err
	}

	req.Header = headers
	if config != nil {
		if customHeaders, ok := config["headers"].(map[string]interface{}); ok {
			for k, v := range customHeaders {
				req.Header.Set(k, fmt.Sprint(v))
			}
		}
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var responseData interface{}
	if err := json.Unmarshal(bodyBytes, &responseData); err != nil {
		responseData = string(bodyBytes)
	}

	response := a.runtime.NewObject()
	must(response.Set("data", responseData))
	must(response.Set("status", resp.StatusCode))
	must(response.Set("statusText", resp.Status))
	must(response.Set("headers", resp.Header))
	must(response.Set("config", config))

	return response, nil
}

func (a *Axios) httpMethod(method string, call goja.FunctionCall) goja.Value {
	url := call.Argument(0).String()
	var data interface{}
	var config map[string]interface{}

	if method != http.MethodGet && method != http.MethodDelete && len(call.Arguments) > 1 {
		data = call.Argument(1).Export()
	}

	configIndex := 1
	if method != http.MethodGet && method != http.MethodDelete {
		configIndex = 2
	}
	if len(call.Arguments) > configIndex {
		if configArg := call.Argument(configIndex).ToObject(a.runtime); configArg != nil {
			config = configArg.Export().(map[string]interface{})
		}
	}

	executor := func(call goja.FunctionCall) goja.Value {
		resolve := call.Argument(0)
		reject := call.Argument(1)

		go func() {
			response, err := a.makeRequest(method, url, data, config)
			if err != nil {
				errValue := a.runtime.ToValue(map[string]interface{}{
					"message": err.Error(),
				})
				a.runtime.Set("_tempError", errValue)
				a.runtime.Set("_tempReject", reject)
				_, _ = a.runtime.RunString("_tempReject(_tempError)")
				return
			}
			a.runtime.Set("_tempResponse", response)
			a.runtime.Set("_tempResolve", resolve)
			_, _ = a.runtime.RunString("_tempResolve(_tempResponse)")
		}()

		return goja.Undefined()
	}

	promiseConstructor := a.runtime.Get("Promise")
	promise, _ := a.runtime.New(promiseConstructor, a.runtime.ToValue(executor))
	return promise
}

func (a *Axios) get(call goja.FunctionCall) goja.Value {
	return a.httpMethod(http.MethodGet, call)
}

func (a *Axios) post(call goja.FunctionCall) goja.Value {
	return a.httpMethod(http.MethodPost, call)
}

func (a *Axios) put(call goja.FunctionCall) goja.Value {
	return a.httpMethod(http.MethodPut, call)
}

func (a *Axios) delete(call goja.FunctionCall) goja.Value {
	return a.httpMethod(http.MethodDelete, call)
}

func (a *Axios) patch(call goja.FunctionCall) goja.Value {
	return a.httpMethod(http.MethodPatch, call)
}

// func must(err error) {
// 	if err != nil {
// 		panic(err)
// 	}
// }
