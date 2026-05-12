package client_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/leechael/browser-agent/browse-cli/internal/client"
)

func TestGetStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("missing or wrong auth header: %s", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := client.NewWithBaseURL("test-token", srv.URL)
	resp, err := c.GetStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok, _ := resp["ok"].(bool); !ok {
		t.Error("expected ok to be true")
	}
}

func TestGetStatusAuthError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`unauthorized`))
	}))
	defer srv.Close()

	c := client.NewWithBaseURL("bad-token", srv.URL)
	_, err := c.GetStatus()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var apiErr *client.APIError
	if ok := err.(*client.APIError); ok == nil {
		t.Fatalf("expected *APIError, got %T", err)
	}
	_ = apiErr
}

func TestFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/fetch/example.com/article" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"url":"https://example.com/article","content":"# Hello"}`))
	}))
	defer srv.Close()

	c := client.NewWithBaseURL("token", srv.URL)
	resp, err := c.Fetch(client.FetchParams{URL: "example.com/article"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp["content"] != "# Hello" {
		t.Errorf("unexpected content: %v", resp["content"])
	}
}
