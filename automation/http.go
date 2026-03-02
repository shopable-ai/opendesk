package automation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dop251/goja"
)

type HTTPClient struct {
	runtime *goja.Runtime
	client  *http.Client
}

func NewHTTPClient(runtime *goja.Runtime) *HTTPClient {
	return &HTTPClient{
		runtime: runtime,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Request 导出方法，供 AutoMapObject 使用
func (h *HTTPClient) Request(options *goja.Object) (goja.Value, error) {
	// 参数验证
	if options == nil {
		return nil, fmt.Errorf("options is required")
	}

	// 提取请求参数
	method := toStringHttp(options.Get("method"), "GET")
	url := toStringHttp(options.Get("url"), "")
	if url == "" {
		return nil, fmt.Errorf("url is required")
	}

	// 处理请求体
	var body io.Reader
	headers := make(http.Header)
	headers.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	if data := options.Get("data"); data != nil && !goja.IsUndefined(data) && !goja.IsNull(data) {
		switch v := data.Export().(type) {
		case string:
			body = strings.NewReader(v)
			if strings.Contains(v, "=") && !strings.Contains(v, "{") {
				headers.Set("Content-Type", "application/x-www-form-urlencoded")
			} else {
				headers.Set("Content-Type", "text/plain")
			}
		default:
			jsonData, err := json.Marshal(v)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal request data: %v", err)
			}
			body = bytes.NewReader(jsonData)
			headers.Set("Content-Type", "application/json")
		}
	}

	// 创建请求
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	// 设置请求头
	req.Header = headers
	if headerObj := options.Get("headers"); headerObj != nil && !goja.IsUndefined(headerObj) {
		if headers := headerObj.ToObject(h.runtime); headers != nil {
			for _, key := range headers.Keys() {
				req.Header.Set(key, headers.Get(key).String())
			}
		}
	}

	// 发送请求
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}

	// 解析响应数据
	var responseData interface{}
	if err := json.Unmarshal(bodyBytes, &responseData); err != nil {
		responseData = string(bodyBytes)
	}

	// 创建响应对象
	response := h.runtime.NewObject()
	must(response.Set("data", responseData))
	must(response.Set("status", resp.StatusCode))
	must(response.Set("statusText", resp.Status))
	must(response.Set("headers", resp.Header))

	return response, nil
}

// Get 方法
func (h *HTTPClient) Get(url string, options *goja.Object) (goja.Value, error) {
	if options == nil {
		options = h.runtime.NewObject()
	}
	must(options.Set("method", "GET"))
	must(options.Set("url", url))
	return h.Request(options)
}

// Post 方法
func (h *HTTPClient) Post(url string, data interface{}, options *goja.Object) (goja.Value, error) {
	if options == nil {
		options = h.runtime.NewObject()
	}
	must(options.Set("method", "POST"))
	must(options.Set("url", url))
	must(options.Set("data", data))
	return h.Request(options)
}

// 辅助函数
func toStringHttp(v goja.Value, def string) string {
	if goja.IsUndefined(v) || goja.IsNull(v) {
		return def
	}
	return v.String()
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
