#!/usr/bin/env bash
# find_toisostring.sh
# Scans the project for every occurrence of `toISOString()`, and writes each
# hit — with file path, line number, and surrounding context — into one
# consolidated report file. Hand that report back for review/patching.
#
# Usage:
#   ./find_toisostring.sh [project_root]
# Defaults to /home/mac/dailybrief if no path is given.

set -euo pipefail

PROJECT_ROOT="${1:-/home/mac/dailybrief}"
OUTFILE="toISOString_audit.txt"
CONTEXT_LINES=3

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "ERROR: directory not found: $PROJECT_ROOT"
  exit 1
fi

# Extensions worth scanning for this project (TS/TSX/JS/JSX).
EXTENSIONS=("*.ts" "*.tsx" "*.js" "*.jsx")

# Directories to skip entirely.
PRUNE_DIRS=("node_modules" ".git" ".expo" ".expo-shared" "dist" "build" "ios" "android" ".turbo")

echo "Scanning $PROJECT_ROOT for toISOString() usages..."

{
  echo "=================================================================="
  echo " toISOString() AUDIT"
  echo " Project root: $PROJECT_ROOT"
  echo " Generated:    $(date)"
  echo "=================================================================="
  echo
  echo "NOTE: toISOString() itself is not automatically a bug — only"
  echo "toISOString().slice(0, 10) (or similar date-only truncation) is,"
  echo "since it reads the date in UTC instead of local time. Full-"
  echo "timestamp uses (created_at, delivered_at, snoozed_until, etc.)"
  echo "are fine as-is. Every hit below is included so it can be checked."
  echo
} > "$OUTFILE"

# Build the find command's name-matching args.
FIND_NAME_ARGS=()
for ext in "${EXTENSIONS[@]}"; do
  FIND_NAME_ARGS+=(-o -name "$ext")
done
# drop the leading -o
FIND_NAME_ARGS=("${FIND_NAME_ARGS[@]:1}")

# Build the find command's prune args.
FIND_PRUNE_ARGS=()
for d in "${PRUNE_DIRS[@]}"; do
  FIND_PRUNE_ARGS+=(-o -path "*/$d/*")
done
FIND_PRUNE_ARGS=("${FIND_PRUNE_ARGS[@]:1}")

MATCH_COUNT=0
FILE_COUNT=0

while IFS= read -r -d '' file; do
  if grep -q "toISOString()" "$file" 2>/dev/null; then
    FILE_COUNT=$((FILE_COUNT + 1))
    {
      echo "------------------------------------------------------------------"
      echo "FILE: $file"
      echo "------------------------------------------------------------------"
    } >> "$OUTFILE"

    # -n line numbers, -C context lines around each match
    grep -n -C "$CONTEXT_LINES" "toISOString()" "$file" >> "$OUTFILE" || true
    echo >> "$OUTFILE"

    hits=$(grep -c "toISOString()" "$file" || true)
    MATCH_COUNT=$((MATCH_COUNT + hits))
  fi
done < <(find "$PROJECT_ROOT" \( "${FIND_PRUNE_ARGS[@]}" \) -prune -o \( "${FIND_NAME_ARGS[@]}" \) -type f -print0)

{
  echo "=================================================================="
  echo " SUMMARY: $MATCH_COUNT occurrence(s) across $FILE_COUNT file(s)"
  echo "=================================================================="
} >> "$OUTFILE"

echo "Done. $MATCH_COUNT occurrence(s) across $FILE_COUNT file(s)."
echo "Report saved to: $(pwd)/$OUTFILE"
echo
echo "---- Preview ----"
cat "$OUTFILE"
