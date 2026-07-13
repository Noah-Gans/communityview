#!/usr/bin/env bash
# Remove dev-only / oversized assets from CRA build output before gh-pages deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"

if [[ ! -d "$BUILD" ]]; then
  echo "prune-build-for-deploy: no build/ directory, skipping"
  exit 0
fi

# Source recordings used only by scripts/marketing/export-tour-frames.sh
rm -rf "$BUILD/marketing/source"

# Legacy .mov files in public/ (superseded by marketing/*.mp4 and tour-frames)
rm -f "$BUILD"/*.mov

echo "prune-build-for-deploy: removed dev-only assets from build/"
