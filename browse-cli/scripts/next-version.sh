#!/usr/bin/env bash
set -euo pipefail

# Simple semver bump script.
# Usage: next-version.sh [patch|minor|major]

LEVEL="${1:-patch}"

LATEST=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
LATEST="${LATEST#v}"

IFS='.' read -r MAJOR MINOR PATCH <<< "$LATEST"

case "$LEVEL" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Unknown level: $LEVEL (use patch, minor, major)" >&2
    exit 1
    ;;
esac

echo "v${MAJOR}.${MINOR}.${PATCH}"
