package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const maxHelperQueue = 16

type helperConfig struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Source  string            `json:"source"`
}

type delivery struct {
	DeliveryID string          `json:"deliveryId"`
	Body       json.RawMessage `json:"body"`
}

type helperResult struct {
	Kind       string          `json:"kind"`
	DeliveryID string          `json:"deliveryId,omitempty"`
	Status     int             `json:"status,omitempty"`
	Body       json.RawMessage `json:"body,omitempty"`
	Error      string          `json:"error,omitempty"`
}

func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "local webhook helper failed:", err)
		os.Exit(1)
	}
}

func run(input io.Reader, output io.Writer) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 0, 64*1024), 2<<20)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return err
		}
		return errors.New("missing connection config on stdin")
	}
	var config helperConfig
	if err := json.Unmarshal(scanner.Bytes(), &config); err != nil {
		return fmt.Errorf("decode connection config: %w", err)
	}
	if err := validateConfig(config); err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	if err := encoder.Encode(helperResult{Kind: "ready"}); err != nil {
		return err
	}

	jobs := make(chan delivery, maxHelperQueue)
	producerErr := make(chan error, 1)
	go func() {
		defer close(jobs)
		for scanner.Scan() {
			line := append([]byte(nil), scanner.Bytes()...)
			if len(bytes.TrimSpace(line)) == 0 {
				continue
			}
			var job delivery
			if err := json.Unmarshal(line, &job); err != nil {
				producerErr <- fmt.Errorf("decode delivery: %w", err)
				return
			}
			if strings.TrimSpace(job.DeliveryID) == "" || len(job.Body) == 0 || !json.Valid(job.Body) {
				producerErr <- errors.New("delivery requires deliveryId and valid JSON body")
				return
			}
			select {
			case jobs <- job:
			default:
				producerErr <- fmt.Errorf("delivery queue is full (capacity %d)", maxHelperQueue)
				return
			}
		}
		producerErr <- scanner.Err()
	}()

	client := &http.Client{
		Timeout: 45 * time.Second,
		Transport: &http.Transport{
			// Never route the OpenDesk callback through an observed proxy. This
			// prevents proxy self-capture loops and keeps the callback local.
			Proxy: nil,
		},
	}
	for job := range jobs {
		result := send(client, config, job)
		if err := encoder.Encode(result); err != nil {
			return err
		}
	}
	if err := <-producerErr; err != nil {
		return err
	}
	return nil
}

func validateConfig(config helperConfig) error {
	parsed, err := url.Parse(config.URL)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" || parsed.Path == "" {
		return errors.New("config.url must be an absolute local http URL")
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return errors.New("config.url must target loopback")
	}
	if strings.TrimSpace(config.Headers["Authorization"]) == "" {
		return errors.New("config.headers must contain Authorization")
	}
	if !strings.EqualFold(config.Headers["Content-Type"], "application/json") {
		return errors.New("config.headers Content-Type must be application/json")
	}
	return nil
}

func send(client *http.Client, config helperConfig, job delivery) helperResult {
	request, err := http.NewRequest(http.MethodPost, config.URL, bytes.NewReader(job.Body))
	if err != nil {
		return helperResult{Kind: "result", DeliveryID: job.DeliveryID, Error: "request_build_failed"}
	}
	for key, value := range config.Headers {
		request.Header.Set(key, value)
	}
	source := strings.TrimSpace(config.Source)
	if source == "" {
		source = "order-query-helper"
	}
	request.Header.Set("X-OpenDesk-Source", source)
	request.Header.Set("X-OpenDesk-Delivery-Id", job.DeliveryID)

	response, err := client.Do(request)
	if err != nil {
		return helperResult{Kind: "result", DeliveryID: job.DeliveryID, Error: "request_failed"}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return helperResult{Kind: "result", DeliveryID: job.DeliveryID, Status: response.StatusCode, Error: "response_read_failed"}
	}
	if !json.Valid(body) {
		return helperResult{Kind: "result", DeliveryID: job.DeliveryID, Status: response.StatusCode, Error: "response_not_json"}
	}
	return helperResult{Kind: "result", DeliveryID: job.DeliveryID, Status: response.StatusCode, Body: json.RawMessage(body)}
}
