package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/leechael/browser-agent/browse-cli/internal/config"
)

// APIError represents an HTTP error response from the API.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("API error %d: %s", e.StatusCode, e.Message)
}

// Client wraps HTTP calls to the browser-agent API.
type Client struct {
	cfg  *config.Config
	http *http.Client
}

// New creates a Client from config.
func New(cfg *config.Config) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{},
	}
}

// NewWithBaseURL creates a Client for testing with a custom base URL.
func NewWithBaseURL(token, baseURL string) *Client {
	return &Client{
		cfg:  &config.Config{URL: baseURL, Token: token},
		http: &http.Client{},
	}
}

func (c *Client) baseURL() string {
	return c.cfg.URL
}

func (c *Client) authHeader() string {
	return "Bearer " + c.cfg.Token
}

func (c *Client) get(path string, out interface{}) error {
	u := c.baseURL() + path
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return &APIError{StatusCode: resp.StatusCode, Message: string(body)}
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) post(path string, body interface{}, out interface{}) error {
	u := c.baseURL() + path
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest("POST", u, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return &APIError{StatusCode: resp.StatusCode, Message: string(bodyBytes)}
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func (c *Client) delete(path string) error {
	u := c.baseURL() + path
	req, err := http.NewRequest("DELETE", u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return &APIError{StatusCode: resp.StatusCode, Message: string(body)}
	}
	return nil
}

// --- Status ---

// GetStatus checks API connectivity.
func (c *Client) GetStatus() (map[string]interface{}, error) {
	var result map[string]interface{}
	if err := c.get("/health", &result); err != nil {
		return nil, err
	}
	return result, nil
}

// --- Fetch ---

// FetchParams holds optional parameters for fetch.
type FetchParams struct {
	URL    string
	InPage bool
}

// Fetch fetches a web page and returns markdown content.
func (c *Client) Fetch(params FetchParams) (map[string]interface{}, error) {
	// Complex URLs with query/fragment need POST fallback so the
	// query string does not collide with ?inPage.
	if strings.ContainsAny(params.URL, "?#") {
		return c.FetchPost(params.URL, params.InPage)
	}
	u := "/fetch/" + params.URL
	v := url.Values{}
	if params.InPage {
		v.Set("inPage", "true")
	}
	if len(v) > 0 {
		u += "?" + v.Encode()
	}
	var result map[string]interface{}
	if err := c.get(u, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// FetchPost fetches a page via POST for complex URLs.
func (c *Client) FetchPost(urlStr string, inPage bool) (map[string]interface{}, error) {
	body := map[string]interface{}{"url": urlStr}
	if inPage {
		body["inPage"] = true
	}
	var result map[string]interface{}
	if err := c.post("/fetch", body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// --- Page ---

// PageParams holds optional parameters for page extraction.
type PageParams struct {
	URL      string
	Selector string
}

// Page fetches a web page with optional CSS selector.
func (c *Client) Page(params PageParams) (map[string]interface{}, error) {
	u := "/page/" + params.URL
	v := url.Values{}
	if params.Selector != "" {
		v.Set("__selector__", params.Selector)
	}
	if len(v) > 0 {
		u += "?" + v.Encode()
	}
	var result map[string]interface{}
	if err := c.get(u, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// --- Twitter/X ---

// HomeTimeline retrieves the home timeline.
func (c *Client) HomeTimeline() ([]interface{}, error) {
	var result []interface{}
	if err := c.get("/home_timeline", &result); err != nil {
		return nil, err
	}
	return result, nil
}

// Mentions retrieves mentions.
func (c *Client) Mentions() ([]interface{}, error) {
	var result []interface{}
	if err := c.get("/mentions", &result); err != nil {
		return nil, err
	}
	return result, nil
}

// UserTimelineParams holds optional filters.
type UserTimelineParams struct {
	ScreenName string
	Tab        string // tweets, replies, media
}

// UserTimeline retrieves a user's timeline.
func (c *Client) UserTimeline(params UserTimelineParams) ([]interface{}, error) {
	u := "/user/" + url.PathEscape(params.ScreenName)
	v := url.Values{}
	if params.Tab != "" {
		v.Set("tab", params.Tab)
	}
	if len(v) > 0 {
		u += "?" + v.Encode()
	}
	var result []interface{}
	if err := c.get(u, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTweet retrieves a specific tweet.
func (c *Client) GetTweet(screenName, tweetID string) (map[string]interface{}, error) {
	var result map[string]interface{}
	if err := c.get("/user/"+url.PathEscape(screenName)+"/"+url.PathEscape(tweetID), &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetThread retrieves a tweet thread.
type ThreadParams struct {
	ScreenName string
	TweetID    string
	Max        int
}

// GetThread retrieves a tweet thread with replies.
func (c *Client) GetThread(params ThreadParams) (map[string]interface{}, error) {
	u := "/thread/" + url.PathEscape(params.ScreenName) + "/" + url.PathEscape(params.TweetID)
	v := url.Values{}
	if params.Max > 0 {
		v.Set("max", strconv.Itoa(params.Max))
	}
	if len(v) > 0 {
		u += "?" + v.Encode()
	}
	var result map[string]interface{}
	if err := c.get(u, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// SearchParams holds search filters.
type SearchParams struct {
	Q           string
	SearchType  string
	From        string
	To          string
	Since       string
	Until       string
	Filter      string
	MinRetweets int
	MinFaves    int
	MinReplies  int
	Lang        string
}

// Search searches tweets.
func (c *Client) Search(params SearchParams) ([]interface{}, error) {
	v := url.Values{}
	v.Set("q", params.Q)
	if params.SearchType != "" {
		v.Set("searchType", params.SearchType)
	}
	if params.From != "" {
		v.Set("from", params.From)
	}
	if params.To != "" {
		v.Set("to", params.To)
	}
	if params.Since != "" {
		v.Set("since", params.Since)
	}
	if params.Until != "" {
		v.Set("until", params.Until)
	}
	if params.Filter != "" {
		v.Set("filter", params.Filter)
	}
	if params.MinRetweets > 0 {
		v.Set("minRetweets", strconv.Itoa(params.MinRetweets))
	}
	if params.MinFaves > 0 {
		v.Set("minFaves", strconv.Itoa(params.MinFaves))
	}
	if params.MinReplies > 0 {
		v.Set("minReplies", strconv.Itoa(params.MinReplies))
	}
	if params.Lang != "" {
		v.Set("lang", params.Lang)
	}
	var result []interface{}
	if err := c.get("/search?"+v.Encode(), &result); err != nil {
		return nil, err
	}
	return result, nil
}

// PostTweet posts a new tweet.
func (c *Client) PostTweet(text string) (map[string]interface{}, error) {
	var result map[string]interface{}
	if err := c.post("/tweets", map[string]string{"text": text}, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// --- Cookies ---

// GetCookies retrieves cookies for a domain.
func (c *Client) GetCookies(domain string, urls []string) ([]interface{}, error) {
	u := "/cookies/" + url.PathEscape(domain)
	v := url.Values{}
	if len(urls) > 0 {
		for _, urlStr := range urls {
			v.Add("urls", urlStr)
		}
	}
	if len(v) > 0 {
		u += "?" + v.Encode()
	}
	var result []interface{}
	if err := c.get(u, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// SetCookies sets cookies for a domain.
func (c *Client) SetCookies(domain string, cookies []map[string]interface{}) error {
	return c.post("/cookies/"+url.PathEscape(domain), map[string]interface{}{"cookies": cookies}, nil)
}

// SetCookiesRaw sets cookies from a raw string.
func (c *Client) SetCookiesRaw(domain, raw string) error {
	u := c.baseURL() + "/cookies/" + url.PathEscape(domain)
	req, err := http.NewRequest("POST", u, bytes.NewReader([]byte(raw)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Content-Type", "text/plain")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return &APIError{StatusCode: resp.StatusCode, Message: string(body)}
	}
	return nil
}

// --- Clear ---

// ClearParams holds clear options.
type ClearParams struct {
	Domain         string
	Cookies        *bool
	LocalStorage   *bool
	SessionStorage *bool
	IndexedDB      *bool
	Cache          *bool
	All            *bool
}

// Clear clears browser data.
func (c *Client) Clear(params ClearParams) error {
	path := "/clear"
	if params.Domain != "" {
		path += "/" + url.PathEscape(params.Domain)
	}
	v := url.Values{}
	if params.Cookies != nil {
		v.Set("cookies", strconv.FormatBool(*params.Cookies))
	}
	if params.LocalStorage != nil {
		v.Set("localStorage", strconv.FormatBool(*params.LocalStorage))
	}
	if params.SessionStorage != nil {
		v.Set("sessionStorage", strconv.FormatBool(*params.SessionStorage))
	}
	if params.IndexedDB != nil {
		v.Set("indexedDB", strconv.FormatBool(*params.IndexedDB))
	}
	if params.Cache != nil {
		v.Set("cache", strconv.FormatBool(*params.Cache))
	}
	if params.All != nil {
		v.Set("all", strconv.FormatBool(*params.All))
	}
	if len(v) > 0 {
		path += "?" + v.Encode()
	}
	return c.delete(path)
}

// Reset resets the browser.
func (c *Client) Reset() error {
	return c.get("/reset", nil)
}
