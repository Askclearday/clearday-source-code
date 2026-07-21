#!/usr/bin/env bash
# audit_deps.sh
# Full dependency audit for the project. Doesn't change any files except
# node_modules (package.json/package-lock.json are backed up first) —
# this is read-only diagnostics, not a fix. Produces one consolidated
# report: dependency_audit.txt

set -uo pipefail  # no -e: we want to keep going even if a step reports errors

PROJECT_ROOT="$(pwd)"
OUTFILE="dependency_audit.txt"

echo "=================================================================="
echo " DEPENDENCY AUDIT — $PROJECT_ROOT"
echo " $(date)"
echo "=================================================================="
{
  echo "=================================================================="
  echo " DEPENDENCY AUDIT"
  echo " Project root: $PROJECT_ROOT"
  echo " Generated:    $(date)"
  echo "=================================================================="
  echo
} > "$OUTFILE"

# --- 0. Versions -----------------------------------------------------
{
  echo "---- Environment ----"
  echo "node: $(node -v 2>/dev/null || echo 'not found')"
  echo "npm:  $(npm -v 2>/dev/null || echo 'not found')"
  echo
} >> "$OUTFILE"

# --- 1. Backup package.json / lockfile before touching anything ------
cp package.json package.json.bak 2>/dev/null || true
if [ -f package-lock.json ]; then
  cp package-lock.json package-lock.json.bak
fi
echo "Backed up package.json (and package-lock.json if present) with .bak suffix."
echo

# --- 2. Install with --legacy-peer-deps so npm doesn't stop at the ---
#        first conflict — we want ALL of them, not just the first.
echo "Installing with --legacy-peer-deps to get past the first blocker..."
npm install --legacy-peer-deps > /tmp/npm_install_output.txt 2>&1
INSTALL_EXIT=$?
{
  echo "---- npm install --legacy-peer-deps (exit code $INSTALL_EXIT) ----"
  tail -n 60 /tmp/npm_install_output.txt
  echo
} >> "$OUTFILE"

if [ $INSTALL_EXIT -ne 0 ]; then
  echo "WARNING: install with --legacy-peer-deps still failed. See report for details."
fi

# --- 3. Enumerate every remaining peer-dependency problem across the -
#        ENTIRE tree in one pass, instead of one-at-a-time.
echo "Scanning full dependency tree for peer conflicts..."
{
  echo "---- npm ls --all (filtered to problems only) ----"
  echo "(UNMET PEER DEPENDENCY / invalid / extraneous entries below)"
  echo
} >> "$OUTFILE"
npm ls --all > /tmp/npm_ls_output.txt 2>&1
grep -iE "unmet|invalid|extraneous|peer dep" /tmp/npm_ls_output.txt >> "$OUTFILE" || echo "  (none found)" >> "$OUTFILE"
echo >> "$OUTFILE"

# --- 4. Expo-specific compatibility check -----------------------------
# For an Expo project, the SDK pins an expected version for every
# Expo-managed + React/React Native package — that's a more authoritative
# source of truth than raw npm peer ranges, which lag behind for many
# third-party libs (e.g. lucide-react-native's peer range not yet
# bumped for React 19, even though it works fine in practice).
if command -v npx >/dev/null 2>&1; then
  echo "Running Expo compatibility checks..."
  {
    echo "---- npx expo install --check ----"
    echo "(lists installed packages whose version doesn't match what this Expo SDK expects)"
    echo
  } >> "$OUTFILE"
  npx expo install --check >> "$OUTFILE" 2>&1 || echo "  (expo install --check not available or failed — see above)" >> "$OUTFILE"
  echo >> "$OUTFILE"

  {
    echo "---- npx expo-doctor ----"
    echo "(Expo's broader project health check — config, native deps, etc.)"
    echo
  } >> "$OUTFILE"
  npx expo-doctor >> "$OUTFILE" 2>&1 || echo "  (expo-doctor not available or failed — see above)" >> "$OUTFILE"
  echo >> "$OUTFILE"
fi

# --- 5. Outdated packages, for context on how far behind things are --
{
  echo "---- npm outdated ----"
  echo
} >> "$OUTFILE"
npm outdated >> "$OUTFILE" 2>&1 || echo "  (none outdated, or npm outdated exited non-zero as usual when it finds results)" >> "$OUTFILE"
echo >> "$OUTFILE"

# --- 6. Dump package.json dependency list for reference ---------------
{
  echo "---- package.json dependencies ----"
  echo
} >> "$OUTFILE"
node -e "
const pkg = require('./package.json');
const deps = { ...(pkg.dependencies||{}), ...(pkg.devDependencies||{}) };
for (const [name, ver] of Object.entries(deps).sort()) {
  console.log(name + '@' + ver);
}
" >> "$OUTFILE" 2>&1

echo
echo "Done. Full report saved to: $PROJECT_ROOT/$OUTFILE"
echo "package.json restored to its original state (only .bak files and node_modules were touched)."
cp package.json.bak package.json 2>/dev/null || true
if [ -f package-lock.json.bak ]; then
  cp package-lock.json.bak package-lock.json
fi
echo
echo "---- Report preview ----"
cat "$OUTFILE"
