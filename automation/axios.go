package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
	axios := a.runtime.NewObject()

	// Register methods
	must(axios.Set("get", a.get))
	must(axios.Set("post", a.post))
	must(axios.Set("put", a.put))
	must(axios.Set("delete", a.delete))

	a.runtime.Set("axios", axios)

	// 注册基础的异步支持
	_, err := a.runtime.RunString(`
        // Promise polyfill
        if (typeof Promise === 'undefined') {
            Promise = function(executor) {
                var chain = [], thenFn, catchFn;
                var state = 'pending';
                var value;
                
                function resolve(val) {
                    state = 'resolved';
                    value = val;
                    if (thenFn) thenFn(val);
                }
                
                function reject(val) {
                    state = 'rejected';
                    value = val;
                    if (catchFn) catchFn(val);
                }
                
                this.then = function(fn) {
                    thenFn = fn;
                    if (state === 'resolved') thenFn(value);
                    return this;
                };
                
                this.catch = function(fn) {
                    catchFn = fn;
                    if (state === 'rejected') catchFn(value);
                    return this;
                };
                
                executor(resolve, reject);
            };
        }
    `)
	if err != nil {
		panic(err)
	}
}

func (a *Axios) get(call goja.FunctionCall) goja.Value {
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
			resp, err := a.makeRequest("GET", url, nil, config)
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

func (a *Axios) makeRequest(method, url string, data interface{}, config map[string]interface{}) (*AxiosResponse, error) {
	ctx := context.Background()

	var bodyReader *bytes.Reader
	if data != nil {
		body, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	// Add default headers
	req.Header.Set("Content-Type", "application/json")

	// Add headers from config
	if headers, ok := config["headers"].(map[string]interface{}); ok {
		for key, value := range headers {
			req.Header.Set(key, fmt.Sprint(value))
		}
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var responseData interface{}
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&responseData); err != nil {
		return nil, err
	}

	return &AxiosResponse{
		Data:    responseData,
		Status:  resp.StatusCode,
		Headers: resp.Header,
		Config:  config,
	}, nil
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
