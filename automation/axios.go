package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/dop251/goja"
)

// AxiosResponse represents the response structure similar to JavaScript axios
type AxiosResponse struct {
	Data    interface{}            `json:"data"`
	Status  int                    `json:"status"`
	Headers map[string][]string    `json:"headers"`
	Config  map[string]interface{} `json:"config"`
}

type requestResult struct {
	response *AxiosResponse
	err      error
}

// Axios represents the axios instance
type Axios struct {
	runtime *goja.Runtime
	client  *http.Client
}

// NewAxios creates a new Axios instance
func NewAxios(runtime *goja.Runtime) *Axios {
	return &Axios{
		runtime: runtime,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// RegisterInRuntime registers axios in the Goja runtime

func (a *Axios) RegisterInRuntime() {
	obj := a.runtime.NewObject()
	obj.Set("get", a.get)
	a.runtime.Set("axios", obj)
}

func (a *Axios) get(call goja.FunctionCall) goja.Value {
	url := call.Argument(0).String()

	jsPromise := a.runtime.Get("Promise")
	promise, _ := a.runtime.New(jsPromise, a.runtime.ToValue(func(resolve, reject goja.Value) {
		// 将 resolve 和 reject 存储为临时变量
		a.runtime.Set("_tempResolve", resolve)
		a.runtime.Set("_tempReject", reject)

		// 执行 HTTP 请求
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			a.runtime.Set("_tempErr", err.Error())
			a.runtime.RunString("_tempReject(_tempErr)")
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "Axios/1.0")

		resp, err := a.client.Do(req)
		if err != nil {
			a.runtime.Set("_tempErr", err.Error())
			a.runtime.RunString("_tempReject(_tempErr)")
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			a.runtime.Set("_tempErr", err.Error())
			a.runtime.RunString("_tempReject(_tempErr)")
			return
		}

		var data interface{}
		if err := json.Unmarshal(body, &data); err != nil {
			data = string(body)
		}

		response := map[string]interface{}{
			"data":    data,
			"status":  resp.StatusCode,
			"headers": resp.Header,
		}

		a.runtime.Set("_tempResponse", response)
		a.runtime.RunString("_tempResolve(_tempResponse)")
	}))

	return promise
}

func (a *Axios) makeRequest(method, url string, data interface{}, config map[string]interface{}) (*AxiosResponse, error) {
	var req *http.Request
	var err error

	ctx := context.Background()

	if data != nil {
		body, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		req, err = http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	} else {
		req, err = http.NewRequestWithContext(ctx, method, url, nil)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add default headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Axios/1.0")

	// Add headers from config
	if headers, ok := config["headers"].(map[string]interface{}); ok {
		for key, value := range headers {
			req.Header.Set(key, fmt.Sprint(value))
		}
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var responseData interface{}
	if err := json.Unmarshal(bodyBytes, &responseData); err != nil {
		// 如果不是 JSON，使用原始字符串
		responseData = string(bodyBytes)
	}

	return &AxiosResponse{
		Data:    responseData,
		Status:  resp.StatusCode,
		Headers: resp.Header,
		Config:  config,
	}, nil
}

func (a *Axios) post(call goja.FunctionCall) goja.Value {
	url := call.Argument(0).String()
	var data interface{}
	if len(call.Arguments) > 1 {
		data = call.Argument(1).Export()
	}

	config := make(map[string]interface{})
	if len(call.Arguments) > 2 {
		if configArg := call.Argument(2).ToObject(a.runtime); configArg != nil {
			config = configArg.Export().(map[string]interface{})
		}
	}

	promiseConstructor := a.runtime.Get("Promise")
	promise, _ := a.runtime.New(promiseConstructor, a.runtime.ToValue(func(resolve, reject goja.Value) {
		go func() {
			resp, err := a.makeRequest("POST", url, data, config)
			a.runtime.Set("_axiosResolve", resolve)
			a.runtime.Set("_axiosReject", reject)
			a.runtime.Set("_axiosResponse", resp)
			if err != nil {
				errObj := a.runtime.NewObject()
				must(errObj.Set("message", err.Error()))
				a.runtime.Set("_axiosError", errObj)
				a.runtime.RunString("_axiosReject(_axiosError)")
			} else {
				a.runtime.RunString("_axiosResolve(_axiosResponse)")
			}
		}()
	}))

	return promise
}

func (a *Axios) put(call goja.FunctionCall) goja.Value {
	url := call.Argument(0).String()
	var data interface{}
	if len(call.Arguments) > 1 {
		data = call.Argument(1).Export()
	}

	config := make(map[string]interface{})
	if len(call.Arguments) > 2 {
		if configArg := call.Argument(2).ToObject(a.runtime); configArg != nil {
			config = configArg.Export().(map[string]interface{})
		}
	}

	promiseConstructor := a.runtime.Get("Promise")
	promise, _ := a.runtime.New(promiseConstructor, a.runtime.ToValue(func(resolve, reject goja.Value) {
		go func() {
			resp, err := a.makeRequest("PUT", url, data, config)
			a.runtime.Set("_axiosResolve", resolve)
			a.runtime.Set("_axiosReject", reject)
			a.runtime.Set("_axiosResponse", resp)
			if err != nil {
				errObj := a.runtime.NewObject()
				must(errObj.Set("message", err.Error()))
				a.runtime.Set("_axiosError", errObj)
				a.runtime.RunString("_axiosReject(_axiosError)")
			} else {
				a.runtime.RunString("_axiosResolve(_axiosResponse)")
			}
		}()
	}))

	return promise
}

func (a *Axios) delete(call goja.FunctionCall) goja.Value {
	url := call.Argument(0).String()
	config := make(map[string]interface{})
	if len(call.Arguments) > 1 {
		if configArg := call.Argument(1).ToObject(a.runtime); configArg != nil {
			config = configArg.Export().(map[string]interface{})
		}
	}

	promiseConstructor := a.runtime.Get("Promise")
	promise, _ := a.runtime.New(promiseConstructor, a.runtime.ToValue(func(resolve, reject goja.Value) {
		go func() {
			resp, err := a.makeRequest("DELETE", url, nil, config)
			a.runtime.Set("_axiosResolve", resolve)
			a.runtime.Set("_axiosReject", reject)
			a.runtime.Set("_axiosResponse", resp)
			if err != nil {
				errObj := a.runtime.NewObject()
				must(errObj.Set("message", err.Error()))
				a.runtime.Set("_axiosError", errObj)
				a.runtime.RunString("_axiosReject(_axiosError)")
			} else {
				a.runtime.RunString("_axiosResolve(_axiosResponse)")
			}
		}()
	}))

	return promise
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
