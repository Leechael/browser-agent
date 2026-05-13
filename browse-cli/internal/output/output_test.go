package output_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/leechael/browser-agent/browse-cli/internal/output"
)

func TestNewInvalidJQ(t *testing.T) {
	_, err := output.New(true, false, "!!!")
	if err == nil {
		t.Fatal("expected error for invalid jq expression")
	}
}

func TestPrintJSON(t *testing.T) {
	f, err := output.New(true, false, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var buf bytes.Buffer
	data := map[string]string{"key": "value"}
	if err := f.Print(&buf, data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var decoded map[string]string
	if err := json.Unmarshal(buf.Bytes(), &decoded); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}
	if decoded["key"] != "value" {
		t.Errorf("unexpected value: %v", decoded["key"])
	}
}

func TestPrintJQ(t *testing.T) {
	f, err := output.New(true, false, ".key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var buf bytes.Buffer
	data := map[string]string{"key": "value"}
	if err := f.Print(&buf, data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.TrimSpace(buf.String()) != `"value"` {
		t.Errorf("unexpected jq output: %s", buf.String())
	}
}

func TestPrintPlain(t *testing.T) {
	f, err := output.New(false, true, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var buf bytes.Buffer
	data := map[string]string{"key": "value"}
	if err := f.Print(&buf, data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if buf.Len() == 0 {
		t.Error("expected non-empty plain output")
	}
}
