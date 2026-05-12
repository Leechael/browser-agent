package model

// FetchResult represents the response from /fetch endpoints.
type FetchResult struct {
	URL         string `json:"url"`
	Source      string `json:"source"`
	Title       string `json:"title"`
	Author      string `json:"author,omitempty"`
	Description string `json:"description,omitempty"`
	Domain      string `json:"domain"`
	Published   string `json:"published,omitempty"`
	Content     string `json:"content"`
	WordCount   int    `json:"wordCount"`
}
