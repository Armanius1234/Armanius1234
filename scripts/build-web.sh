#!/usr/bin/env bash
# Builds the web version of PL8 into dist-web/ (HTML, JavaScript, images).
# Upload everything in dist-web/ (including the hidden .htaccess) to the root
# of your web space, then fill in pl8-config.js. See docs/WEB-VERSION.md.
#
#   npm run build:web
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist-web
npx expo export --platform web --output-dir dist-web

for f in index.html pl8-config.js .htaccess; do
  [ -f "dist-web/$f" ] || { echo "Missing dist-web/$f" >&2; exit 1; }
done

# The finished files are public: make sure no privileged key ended up in them.
# (Same pattern as the CI check.)
if grep -rqE 'sb_secret_[A-Za-z0-9_-]{10,}|service_role"?\s*[:=]\s*"?eyJ' dist-web; then
  echo "A privileged Supabase key was found in dist-web. Remove it from .env and rotate the key." >&2
  exit 1
fi

echo
echo "Web version ready in dist-web/ ($(find dist-web -type f | wc -l | tr -d ' ') files, $(du -sh dist-web | cut -f1))."
echo "Next: fill in dist-web/pl8-config.js (unless .env was used) and upload the folder's contents."
