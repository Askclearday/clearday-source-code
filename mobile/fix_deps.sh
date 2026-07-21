#!/usr/bin/env bash
# fix_deps.sh
# Fixes all three dependency issues found by the audit + EAS build log:
#   1. React 19 peer-range conflicts (lucide-react-native, @ai-sdk/react, etc.)
#   2. Duplicate expo-location versions
#   3. @react-native-community/datetimepicker version mismatch vs Expo SDK
#
# Writes changes to .npmrc and package.json, regenerates the lockfile, and
# re-runs expo-doctor to confirm. IMPORTANT: commit .npmrc, package.json,
# and package-lock.json afterward — EAS Build only sees what's committed.

set -uo pipefail
PROJECT_ROOT="$(pwd)"

echo "=================================================================="
echo " DEPENDENCY FIX — $PROJECT_ROOT"
echo "=================================================================="

# --- Backups -----------------------------------------------------------
for f in package.json package-lock.json .npmrc; do
  [ -f "$f" ] && cp "$f" "$f.bak"
done
echo "Backed up package.json, package-lock.json, .npmrc (where present) with .bak suffix."

# --- 1. .npmrc: legacy-peer-deps everywhere, including EAS -------------
# This is what actually fixes the EAS build failure — EAS runs `npm ci`
# straight from the committed repo, so a flag typed locally never reaches
# it. A committed .npmrc does.
if [ -f .npmrc ]; then
  if grep -q "^legacy-peer-deps" .npmrc; then
    sed -i.tmp 's/^legacy-peer-deps.*/legacy-peer-deps=true/' .npmrc
    rm -f .npmrc.tmp
  else
    echo "legacy-peer-deps=true" >> .npmrc
  fi
else
  echo "legacy-peer-deps=true" > .npmrc
fi
echo "Set legacy-peer-deps=true in .npmrc"

# --- 2. package.json: pin expo-location via "overrides" so the nested --
#        @teovilla/react-native-web-maps copy collapses to one version.
node -e '
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

const topLevelLocationVersion = (pkg.dependencies && pkg.dependencies["expo-location"]) || "^19.0.8";

pkg.overrides = pkg.overrides || {};
pkg.overrides["expo-location"] = topLevelLocationVersion;

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("Added overrides.expo-location =", topLevelLocationVersion, "to package.json");
'

# --- 3. Clean reinstall so the lockfile actually reflects the fixes ----
echo
echo "Removing node_modules + package-lock.json for a clean, consistent reinstall..."
rm -rf node_modules package-lock.json

echo "Running npm install (legacy-peer-deps now applies automatically via .npmrc)..."
npm install
INSTALL_EXIT=$?
if [ $INSTALL_EXIT -ne 0 ]; then
  echo "ERROR: npm install still failed after the fixes. Stopping — check output above."
  exit 1
fi

# --- 4. Align package versions with what this Expo SDK expects ---------
#        (fixes the datetimepicker mismatch, and anything else expo-doctor
#        flagged the same way).
echo
echo "Running npx expo install --fix to align package versions with the Expo SDK..."
npx expo install --fix

# --- 5. Re-verify with expo-doctor --------------------------------------
echo
echo "Re-running expo-doctor to confirm..."
npx expo-doctor

echo
echo "=================================================================="
echo " DONE"
echo "=================================================================="
echo "If expo-doctor now shows all checks passed, commit these three files"
echo "so the fix reaches EAS Build too (it only sees committed files):"
echo "  git add .npmrc package.json package-lock.json"
echo "  git commit -m 'fix: resolve dependency conflicts (react19 peers, expo-location dupe, datetimepicker version)'"
echo "  git push"
