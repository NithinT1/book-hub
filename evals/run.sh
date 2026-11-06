#!/bin/bash
# Behaviour tests: fresh local database → local hub → promptfoo (Claude Code, Pro) → upload summary to the live hub.
# Uses Pro usage (each test is a real Claude request with web search). Takes ~15–30 minutes.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .dev.vars ] || { echo "Missing .dev.vars (needs DEV_NO_AUTH=1 plus dummy secrets)"; exit 1; }
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply book-hub --local >/dev/null
npx wrangler d1 execute book-hub --local --file evals/seed.sql >/dev/null
npx wrangler dev --port 8788 >/tmp/book-hub-dev.log 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:8788/mcp-dev -X POST -d '{}' && break; sleep 1; done
mkdir -p evals/.claude/skills && cp -R skills/* evals/.claude/skills/
(cd evals && npx -y promptfoo@latest eval -c promptfooconfig.yaml -o results.json --no-cache "$@") || true
node -e '
const r = require("./evals/results.json").results;
const rows = (r.results || []).map((t) => ({ name: t.testCase?.description, pass: t.success, reason: t.gradingResult?.reason || t.error }));
const summary = { passed: rows.filter((x) => x.pass).length, failed: rows.filter((x) => !x.pass).length, results: rows };
require("fs").writeFileSync("evals/summary.json", JSON.stringify(summary, null, 1));
console.log(`${summary.passed} passed, ${summary.failed} failed`);'
# Optional: upload the summary to your hub (Settings → Test results). Uses HUB_URL and TOKEN_FILE from ~/.config/book-hub/backup.conf.
CONF="${BOOK_HUB_CONF:-$HOME/.config/book-hub/backup.conf}"
if [ -f "$CONF" ]; then
  # shellcheck source=/dev/null
  source "$CONF"
  curl -sf -X POST -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H "Content-Type: application/json" \
    --data @evals/summary.json "${HUB_URL%/}/api/test-runs" >/dev/null && echo "Uploaded to the hub (Settings → Test results)."
fi
