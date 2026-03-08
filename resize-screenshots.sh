#!/bin/bash
# Resize screenshots to App Store accepted dimensions.
# Source screenshots must be portrait at 1290x2796 (or similar).
# Targets:
#   6.5" — 1242 x 2688  (iPhone Xs Max / 11 Pro Max)
#   6.7" — 1284 x 2778  (iPhone 12/13 Pro Max)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/screenshots"
OUT_65="$SCRIPT_DIR/screenshots/6.5in"
OUT_67="$SCRIPT_DIR/screenshots/6.7in"

mkdir -p "$OUT_65" "$OUT_67"

for img in "$SRC_DIR"/*.png; do
  filename="$(basename "$img")"

  # 6.5" — 1242 x 2688
  cp "$img" "$OUT_65/$filename"
  sips --resampleHeightWidth 2688 1242 "$OUT_65/$filename" --out "$OUT_65/$filename" > /dev/null

  # 6.7" — 1284 x 2778
  cp "$img" "$OUT_67/$filename"
  sips --resampleHeightWidth 2778 1284 "$OUT_67/$filename" --out "$OUT_67/$filename" > /dev/null

  echo "Resized: $filename"
done

echo ""
echo "Done. Output:"
echo "  6.5\" (1242x2688): $OUT_65"
echo "  6.7\" (1284x2778): $OUT_67"
