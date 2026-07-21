#!/usr/bin/env python3
"""
Patch: fixes the expo-file-system import in app/capture.tsx.

Recent expo-file-system versions moved the old static API (cacheDirectory,
documentDirectory, makeDirectoryAsync, copyAsync, deleteAsync, getInfoAsync,
etc.) -- which is exactly what capture.tsx uses -- to the "expo-file-system/legacy"
subpath. The default "expo-file-system" import no longer exposes them, which is
the cause of the TS2339 "Property 'cacheDirectory' does not exist" error.

This is a single, exact one-line import swap. Nothing else in the file is touched.

Usage:
    python3 patch_capture_filesystem_import.py /path/to/app/capture.tsx
"""
import sys
import pathlib

OLD_IMPORT = 'import * as FileSystem from "expo-file-system";'
NEW_IMPORT = 'import * as FileSystem from "expo-file-system/legacy";'


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 patch_capture_filesystem_import.py /path/to/app/capture.tsx")
        sys.exit(1)

    target = pathlib.Path(sys.argv[1])
    if not target.exists():
        print(f"ERROR: file not found: {target}")
        sys.exit(1)

    original = target.read_text(encoding="utf-8")

    if NEW_IMPORT in original:
        print("Already patched — import is already pointing at expo-file-system/legacy. No changes made.")
        sys.exit(0)

    count = original.count(OLD_IMPORT)
    if count == 0:
        print("ERROR: expected import line not found. Aborting — no changes made.")
        print(f"Looked for: {OLD_IMPORT!r}")
        sys.exit(1)
    if count > 1:
        print(f"ERROR: import line found {count} times (must be unique). Aborting — no changes made.")
        sys.exit(1)

    patched = original.replace(OLD_IMPORT, NEW_IMPORT, 1)

    backup = target.with_suffix(target.suffix + ".bak")
    backup.write_text(original, encoding="utf-8")
    target.write_text(patched, encoding="utf-8")

    print(f"Patched: {target}")
    print(f"Backup saved: {backup}")
    print('Changed: import * as FileSystem from "expo-file-system" -> "expo-file-system/legacy"')


if __name__ == "__main__":
    main()