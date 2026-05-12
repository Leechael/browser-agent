package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"

	"github.com/itchyny/gojq"
)

// Formatter controls output rendering based on --json, --plain, --jq flags.
type Formatter struct {
	jsonOut bool
	plain   bool
	jqQuery *gojq.Query
}

// New creates a Formatter.
func New(jsonOut, plain bool, jqExpr string) (*Formatter, error) {
	f := &Formatter{jsonOut: jsonOut, plain: plain}
	if jqExpr != "" {
		q, err := gojq.Parse(jqExpr)
		if err != nil {
			return nil, fmt.Errorf("invalid jq expression: %w", err)
		}
		f.jqQuery = q
	}
	return f, nil
}

// Print writes data to w.
func (f *Formatter) Print(w io.Writer, data interface{}) error {
	if f.jsonOut {
		return f.printJSON(w, data)
	}
	if f.plain {
		return f.printPlain(w, data)
	}
	return f.printHuman(w, data)
}

// Hint writes a message to stderr.
func (f *Formatter) Hint(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

// PrintMessage writes a simple message.
func (f *Formatter) PrintMessage(w io.Writer, msg string) error {
	if f.jsonOut {
		return json.NewEncoder(w).Encode(map[string]string{"message": msg})
	}
	_, err := fmt.Fprintln(w, msg)
	return err
}

func (f *Formatter) printJSON(w io.Writer, data interface{}) error {
	if f.jqQuery != nil {
		return f.applyJQ(w, data)
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(data)
}

func (f *Formatter) applyJQ(w io.Writer, data interface{}) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	var input interface{}
	if err := json.Unmarshal(raw, &input); err != nil {
		return err
	}

	iter := f.jqQuery.Run(input)
	for {
		v, ok := iter.Next()
		if !ok {
			break
		}
		if err, isErr := v.(error); isErr {
			return fmt.Errorf("jq error: %w", err)
		}
		out, err := json.MarshalIndent(v, "", "  ")
		if err != nil {
			return err
		}
		fmt.Fprintln(w, string(out))
	}
	return nil
}

func (f *Formatter) printPlain(w io.Writer, data interface{}) error {
	enc := json.NewEncoder(w)
	return enc.Encode(data)
}

func (f *Formatter) printHuman(w io.Writer, data interface{}) error {
	if data == nil {
		return nil
	}

	switch v := data.(type) {
	case string:
		_, err := fmt.Fprintln(w, v)
		return err
	case map[string]interface{}:
		return f.printHumanMap(w, v)
	case []interface{}:
		return f.printHumanSlice(w, v)
	default:
		// Use reflection for typed slices from models.
		val := reflect.ValueOf(data)
		if val.Kind() == reflect.Slice {
			return f.printHumanReflectSlice(w, val)
		}
		// Fallback: pretty JSON (structured data we don't know how to render).
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(data)
	}
}

func (f *Formatter) printHumanMap(w io.Writer, m map[string]interface{}) error {
	// If this looks like a fetch result, render the article content.
	if content, ok := getString(m, "content"); ok && content != "" {
		if title, ok := getString(m, "title"); ok && title != "" {
			fmt.Fprintf(w, "# %s\n\n", title)
		}
		if author, ok := getString(m, "author"); ok && author != "" {
			fmt.Fprintf(w, "**Author:** %s  \n", author)
		}
		if domain, ok := getString(m, "domain"); ok && domain != "" {
			fmt.Fprintf(w, "**Domain:** %s  \n", domain)
		}
		if url, ok := getString(m, "url"); ok && url != "" {
			fmt.Fprintf(w, "**URL:** %s  \n", url)
		}
		if wordCount, ok := getFloat(m, "wordCount"); ok {
			fmt.Fprintf(w, "**Word count:** %.0f  \n", wordCount)
		}
		fmt.Fprintln(w)
		fmt.Fprintln(w, content)
		return nil
	}

	// If this looks like a thread result (mainTweet + replies).
	if mainTweet, ok := m["mainTweet"].(map[string]interface{}); ok {
		if text, ok := getString(mainTweet, "text"); ok {
			if err := f.printHumanTweet(w, mainTweet, text); err != nil {
				return err
			}
		}
		if replies, ok := m["replies"].([]interface{}); ok && len(replies) > 0 {
			fmt.Fprintf(w, "\n%d replies\n", len(replies))
			if total, ok := getFloat(m, "totalCount"); ok {
				fmt.Fprintf(w, "(total: %.0f)\n", total)
			}
			fmt.Fprintln(w)
			for _, r := range replies {
				if replyMap, ok := r.(map[string]interface{}); ok {
					if text, ok := getString(replyMap, "text"); ok {
						if err := f.printHumanTweet(w, replyMap, text); err != nil {
							return err
						}
					}
				}
			}
		}
		return nil
	}

	// If this looks like a tweet.
	if text, ok := getString(m, "text"); ok {
		return f.printHumanTweet(w, m, text)
	}
	if text, ok := getString(m, "article_markdown"); ok {
		fmt.Fprintln(w, text)
		return nil
	}

	// Generic map: key-value lines.
	for k, val := range m {
		fmt.Fprintf(w, "%s\t%s\n", k, fmt.Sprint(val))
	}
	return nil
}

func (f *Formatter) printHumanTweet(w io.Writer, m map[string]interface{}, text string) error {
	author := m["author"]
	name, username := "", ""
	if authorMap, ok := author.(map[string]interface{}); ok {
		name = getStringDefault(authorMap, "name", "")
		username = getStringDefault(authorMap, "username", "")
	}
	if username == "" {
		username = getStringDefault(m, "screen_name", "")
	}

	// Header line: Name (@username)
	if name != "" && username != "" {
		fmt.Fprintf(w, "%s (@%s)\n", name, username)
	} else if username != "" {
		fmt.Fprintf(w, "@%s\n", username)
	} else if name != "" {
		fmt.Fprintf(w, "%s\n", name)
	}

	fmt.Fprintln(w, text)

	// Stats line
	parts := []string{}
	if created, ok := getString(m, "created_at"); ok && created != "" {
		parts = append(parts, created)
	}
	if v, ok := getFloat(m, "reply_count"); ok {
		parts = append(parts, fmt.Sprintf("%.0f replies", v))
	}
	if v, ok := getFloat(m, "retweet_count"); ok {
		parts = append(parts, fmt.Sprintf("%.0f retweets", v))
	}
	if v, ok := getFloat(m, "like_count"); ok {
		parts = append(parts, fmt.Sprintf("%.0f likes", v))
	}
	if v, ok := getString(m, "view_count"); ok && v != "" {
		parts = append(parts, fmt.Sprintf("%s views", v))
	}
	if len(parts) > 0 {
		fmt.Fprintf(w, "%s\n", joinParts(parts, " · "))
	}

	// URL
	if url, ok := getString(m, "url"); ok && url != "" {
		fmt.Fprintf(w, "%s\n", url)
	}

	// Quoted tweet
	if quote, ok := m["quote_for"].(map[string]interface{}); ok {
		fmt.Fprintln(w)
		fmt.Fprintln(w, "┌ Quoted tweet:")
		quoteText := getStringDefault(quote, "text", "")
		quoteAuthor := quote["author"]
		qName, qUser := "", ""
		if qm, ok := quoteAuthor.(map[string]interface{}); ok {
			qName = getStringDefault(qm, "name", "")
			qUser = getStringDefault(qm, "username", "")
		}
		if qName != "" && qUser != "" {
			fmt.Fprintf(w, "│ %s (@%s)\n", qName, qUser)
		} else if qUser != "" {
			fmt.Fprintf(w, "│ @%s\n", qUser)
		}
		for _, line := range splitLines(quoteText) {
			fmt.Fprintf(w, "│ %s\n", line)
		}
		qParts := []string{}
		if created, ok := getString(quote, "created_at"); ok && created != "" {
			qParts = append(qParts, created)
		}
		if v, ok := getFloat(quote, "like_count"); ok {
			qParts = append(qParts, fmt.Sprintf("%.0f likes", v))
		}
		if len(qParts) > 0 {
			fmt.Fprintf(w, "│ %s\n", joinParts(qParts, " · "))
		}
		fmt.Fprintln(w, "└")
	}

	fmt.Fprintln(w)
	return nil
}

func (f *Formatter) printHumanSlice(w io.Writer, items []interface{}) error {
	for i, item := range items {
		if i > 0 {
			fmt.Fprintln(w, "---")
		}
		switch v := item.(type) {
		case map[string]interface{}:
			if err := f.printHumanMap(w, v); err != nil {
				return err
			}
		default:
			fmt.Fprintln(w, fmt.Sprint(v))
		}
	}
	return nil
}

func (f *Formatter) printHumanReflectSlice(w io.Writer, val reflect.Value) error {
	for i := 0; i < val.Len(); i++ {
		if i > 0 {
			fmt.Fprintln(w, "---")
		}
		item := val.Index(i).Interface()
		if err := f.printHuman(w, item); err != nil {
			return err
		}
	}
	return nil
}

func getString(m map[string]interface{}, key string) (string, bool) {
	v, ok := m[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func getStringDefault(m map[string]interface{}, key, def string) string {
	if s, ok := getString(m, key); ok {
		return s
	}
	return def
}

func getFloat(m map[string]interface{}, key string) (float64, bool) {
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	return 0, false
}

func joinParts(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	result := parts[0]
	for i := 1; i < len(parts); i++ {
		result += sep + parts[i]
	}
	return result
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
