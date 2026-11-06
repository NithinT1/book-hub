#!/bin/bash
# Optional: save a Markdown copy of your whole library to a folder on your computer — a local backup that also
# works as a note in Obsidian or any other notes app. Run it by hand, or weekly (see scripts/book-hub-backup.plist.example).
#
# Settings live outside the project, in ~/.config/book-hub/backup.conf:
#   HUB_URL="https://book-hub.<your-subdomain>.workers.dev"
#   DEST="$HOME/Documents/Book Hub Library Export.md"
#   TOKEN_FILE="$HOME/.config/book-hub/export-token"   # holds your EXPORT_TOKEN secret (chmod 600)
set -euo pipefail
CONF="${BOOK_HUB_CONF:-$HOME/.config/book-hub/backup.conf}"
[ -f "$CONF" ] || { echo "Missing $CONF — see the comments at the top of this script."; exit 1; }
# shellcheck source=/dev/null
source "$CONF"
: "${HUB_URL:?set HUB_URL in $CONF}" "${DEST:?set DEST in $CONF}" "${TOKEN_FILE:?set TOKEN_FILE in $CONF}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl -sf --max-time 60 -H "Authorization: Bearer $(cat "$TOKEN_FILE")" "${HUB_URL%/}/api/export.md" -o "$TMP"
grep -q "^# Book Hub Library Export" "$TMP"   # never overwrite a good copy with an error page
cp "$TMP" "$DEST" && chmod 644 "$DEST"
echo "$(date '+%Y-%m-%d %H:%M') exported $(wc -l < "$DEST") lines"
