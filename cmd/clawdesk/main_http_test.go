package main

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"testing"
)

func TestParseVisionRequestPayloadJSON(t *testing.T) {
	body := bytes.NewBufferString(`{"provider":"paddle","imagePath":".runtime/temp/a.png"}`)
	req := httptest.NewRequest("POST", "/v1/vision/ocr", body)
	req.Header.Set("Content-Type", "application/json")

	payload, cleanup, err := parseVisionRequestPayload(req)
	if err != nil {
		t.Fatalf("parseVisionRequestPayload returned error: %v", err)
	}
	if cleanup != nil {
		t.Fatalf("expected no cleanup for json payload")
	}
	if payload["provider"] != "paddle" {
		t.Fatalf("unexpected provider: %v", payload["provider"])
	}
	if payload["imagePath"] != ".runtime/temp/a.png" {
		t.Fatalf("unexpected imagePath: %v", payload["imagePath"])
	}
}

func TestParseVisionRequestPayloadMultipart(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("provider", "paddle"); err != nil {
		t.Fatalf("failed to write provider field: %v", err)
	}
	fileWriter, err := writer.CreateFormFile("imageFile", "shot.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := io.WriteString(fileWriter, "fake-image-bytes"); err != nil {
		t.Fatalf("failed to write file content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest("POST", "/v1/vision/ocr", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	payload, cleanup, err := parseVisionRequestPayload(req)
	if err != nil {
		t.Fatalf("parseVisionRequestPayload returned error: %v", err)
	}
	if cleanup == nil {
		t.Fatalf("expected cleanup for multipart upload")
	}
	if payload["provider"] != "paddle" {
		t.Fatalf("unexpected provider: %v", payload["provider"])
	}

	imagePath, ok := payload["imagePath"].(string)
	if !ok || imagePath == "" {
		t.Fatalf("expected imagePath from upload, got %#v", payload["imagePath"])
	}
	content, err := os.ReadFile(imagePath)
	if err != nil {
		t.Fatalf("failed to read temp upload: %v", err)
	}
	if string(content) != "fake-image-bytes" {
		t.Fatalf("unexpected temp upload content: %q", string(content))
	}

	cleanup()
	if _, err := os.Stat(imagePath); !os.IsNotExist(err) {
		t.Fatalf("expected temp upload to be removed, stat err=%v", err)
	}
}

func TestParseVisionRequestPayloadFormURLEncoded(t *testing.T) {
	req := httptest.NewRequest("POST", "/v1/vision/ocr", bytes.NewBufferString("provider=paddle&image=aGVsbG8%3D"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	payload, cleanup, err := parseVisionRequestPayload(req)
	if err != nil {
		t.Fatalf("parseVisionRequestPayload returned error: %v", err)
	}
	if cleanup != nil {
		t.Fatalf("expected no cleanup for json payload")
	}
	if payload["image"] != "aGVsbG8=" {
		t.Fatalf("unexpected image: %v", payload["image"])
	}
}

func TestParseVisionRequestPayloadBinaryBody(t *testing.T) {
	req := httptest.NewRequest("POST", "/v1/vision/ocr?provider=paddle&lang=ch", bytes.NewBufferString("fake-image-bytes"))
	req.Header.Set("Content-Type", "application/octet-stream")

	payload, cleanup, err := parseVisionRequestPayload(req)
	if err != nil {
		t.Fatalf("parseVisionRequestPayload returned error: %v", err)
	}
	if cleanup != nil {
		t.Fatalf("expected no cleanup for raw binary body")
	}
	if payload["provider"] != "paddle" || payload["lang"] != "ch" {
		t.Fatalf("unexpected query payload: %#v", payload)
	}
	imageBytes, ok := payload["imageBytes"].([]byte)
	if !ok {
		t.Fatalf("expected []byte imageBytes, got %T", payload["imageBytes"])
	}
	if string(imageBytes) != "fake-image-bytes" {
		t.Fatalf("unexpected imageBytes: %q", string(imageBytes))
	}
}
