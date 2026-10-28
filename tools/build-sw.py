#!/usr/bin/env python3
"""Regenerate sw.js: lists every app file to cache offline and sets a new
version from their contents. Run it after changing any file:

    python3 tools/build-sw.py
"""
import hashlib, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = (".html", ".css", ".js", ".woff2", ".png", ".svg", ".webmanifest")
SKIP = {"sw.js"}

def app_files():
    out = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "tools"]
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), ROOT).replace(os.sep, "/")
            if rel.endswith(EXTS) and rel not in SKIP:
                out.append(rel)
    return sorted(out)

def main():
    files = app_files()
    h = hashlib.sha256()
    for rel in files:
        with open(os.path.join(ROOT, rel), "rb") as fh:
            h.update(rel.encode())
            h.update(fh.read())
    path = os.path.join(ROOT, "sw.js")
    src = open(path).read()
    # The worker's own code counts too (minus the lines this script rewrites).
    h.update(re.sub(r'const VERSION = "[^"]*";|const FILES = \[.*?\];', "", src, flags=re.S).encode())
    version = h.hexdigest()[:10]
    listing = "const FILES = [\n  \"./\",\n" + ",\n".join('  "./' + f + '"' for f in files) + "\n];"
    src = re.sub(r"const FILES = \[.*?\];", lambda m: listing, src, count=1, flags=re.S)
    src = re.sub(r'const VERSION = "[^"]*";', 'const VERSION = "' + version + '";', src, count=1)
    open(path, "w").write(src)
    print("sw.js updated: version", version, "with", len(files), "files")

if __name__ == "__main__":
    main()
