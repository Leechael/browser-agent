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
	if name, ok := getString(m, "name"); ok && name != "" {
		fmt.Fprintf(w, "@%s (%s)\n", getStringDefault(m, "screen_name", ""), name)
	} else if sn, ok := getString(m, "screen_name"); ok {
		fmt.Fprintf(w, "@%s\n", sn)
	}
	fmt.Fprintln(w, text)
	if created, ok := getString(m, "created_at"); ok {
		fmt.Fprintf(w, "  %s\n", created)
	}
	if url, ok := getString(m, "url"); ok && url != "" {
		fmt.Fprintf(w, "  %s\n", url)
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
