#!/usr/bin/env bash
# Export 1080p WebP frames for scroll-scrub.
# Usage: ./scripts/marketing/export-tour-frames.sh [input.mov] [fps]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT="${1:-$ROOT/public/marketing/source/clip_to_b_converted.mov}"
FPS="${2:-20}"
OUT="$ROOT/public/marketing/tour-frames"
TMP="/tmp/tour-export-$$"
W=1920
H=1080

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install with: brew install ffmpeg"
  exit 1
fi

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp not found. Install with: brew install webp"
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Input not found: $INPUT"
  exit 1
fi

mkdir -p "$OUT" "$TMP"
rm -f "$OUT"/frame-*.webp "$TMP"/*.png

echo "Extracting ${W}x${H} PNGs at ${FPS}fps..."
ffmpeg -y -i "$INPUT" \
  -vf "fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black" \
  "$TMP/frame-%04d.png" 2>&1 | tail -3

echo "Converting to WebP..."
i=1
for f in "$TMP"/frame-*.png; do
  cwebp -q 80 -m 4 "$f" -o "$OUT/frame-$(printf '%03d' "$i").webp" >/dev/null
  i=$((i + 1))
done

COUNT=$((i - 1))
rm -rf "$TMP"

echo ""
echo "Exported $COUNT frames (${W}x${H} @ ${FPS}fps) to $OUT"
echo "Update TOUR_SCRUB.frameCount in src/pages/landingPages/content/tourScrub.js to $COUNT"
