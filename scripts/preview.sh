#!/bin/bash
# Visual check: sample data → local hub → screenshots of every main page at laptop (1280px) and phone (390px).
# Output: /tmp/bh-preview/<page>-laptop.png and <page>-phone.png. Run after any UI change, and look at all of them.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=/tmp/bh-preview; mkdir -p "$OUT"; rm -f "$OUT"/*.png
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
/usr/bin/pkill -f "wrangler dev --port 8788" 2>/dev/null || true
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply book-hub --local >/dev/null 2>&1
npx wrangler d1 execute book-hub --local --file scripts/preview-seed.sql >/dev/null 2>&1
npx wrangler dev --port 8788 >/tmp/bh-dev.log 2>&1 &
DEV=$!; trap 'kill $DEV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:8788/signed-out && break; sleep 1; done
KEY=$(grep COOKIE_ENCRYPTION_KEY .dev.vars | cut -d= -f2); OWNER=$(grep OWNER_GITHUB_LOGIN .dev.vars | cut -d= -f2)
COOKIE=$(node -e 'const c=require("crypto");const [k,l]=process.argv.slice(1);const p=Buffer.from(JSON.stringify({login:l,exp:Date.now()+86400000})).toString("base64");console.log(p+"."+c.createHmac("sha256",k).update(p).digest("hex"))' "$KEY" "$OWNER")
for pair in "home:" "buy:buy" "shelf:shelf" "discover:discover" "notes:notes" "more:more" "settings:settings" "rules:rules" "profile-nf:rules/nonfiction-profile" "rule-quality:rules/quality-nonfiction" "rule-verdict:rules/verdict" "rule-system:rules/honesty?view=text" "notes-pick:notes/pick?for=note" "book-reading:book/3" "book-buy:book/1" "book-scores:book/2" "book-quiz:book/7" "search-both:search?q=the" "search-aside:search?q=deep" "book-finished:book/6"; do
  name=${pair%%:*}; route=${pair#*:}
  curl -s -H "Cookie: __Host-hub_session=$COOKIE" "http://localhost:8788/$route" > "$OUT/$name.html"
  printf '<html><body style="margin:0;background:#999"><iframe src="%s.html" style="width:390px;height:1300px;border:0;background:#fff"></iframe></body></html>' "$name" > "$OUT/frame-$name.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1100 --screenshot="$OUT/$name-laptop.png" "file://$OUT/$name.html" >/dev/null 2>&1
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=600,1300 --screenshot="$OUT/$name-phone.png" "file://$OUT/frame-$name.html" >/dev/null 2>&1
done
ls "$OUT"/*.png | wc -l | xargs echo "screenshots:"
