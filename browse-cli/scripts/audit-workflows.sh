#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"
workflows_dir="$root/.github/workflows"

if [[ ! -d "$workflows_dir" ]]; then
  echo "missing workflows dir: $workflows_dir" >&2
  exit 1
fi

echo "Auditing workflows in $workflows_dir"

if rg -n "version:\s*latest" "$workflows_dir" >/dev/null; then
  echo "found floating version 'latest' in workflows" >&2
  rg -n "version:\s*latest" "$workflows_dir" >&2
  exit 1
fi

missing=0
while IFS= read -r f; do
  if ! rg -n "^permissions:" "$f" >/dev/null; then
    echo "missing permissions block: $f" >&2
    missing=1
  fi
done < <(find "$workflows_dir" -type f \( -name "*.yml" -o -name "*.yaml" \))

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "workflow audit passed"
