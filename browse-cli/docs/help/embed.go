package help

import (
	"embed"
)

//go:embed topics/*.md
var TopicsFS embed.FS
