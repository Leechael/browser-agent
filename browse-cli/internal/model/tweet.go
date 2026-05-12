package model

// Tweet represents a single tweet.
type Tweet struct {
	ID              string `json:"id"`
	Text            string `json:"text"`
	ScreenName      string `json:"screen_name"`
	Name            string `json:"name,omitempty"`
	CreatedAt       string `json:"created_at,omitempty"`
	RetweetCount    int    `json:"retweet_count,omitempty"`
	FavoriteCount   int    `json:"favorite_count,omitempty"`
	ReplyCount      int    `json:"reply_count,omitempty"`
	ArticleMarkdown string `json:"article_markdown,omitempty"`
	ArticleTitle    string `json:"article_title,omitempty"`
	ArticleCover    string `json:"article_cover,omitempty"`
}

// ThreadResult represents the response from /thread.
type ThreadResult struct {
	MainTweet  Tweet   `json:"mainTweet"`
	Replies    []Tweet `json:"replies"`
	TotalCount int     `json:"totalCount"`
	HasMore    bool    `json:"hasMore"`
}
